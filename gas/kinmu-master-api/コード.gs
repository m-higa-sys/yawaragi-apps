// ===== 職員マスタ 読み取りAPI (kinmu-master-api) =====
// 勤務形態一覧表＋サ体加算判定システムの土台。第1弾＝読み取りのみ。
// 書き込みAPIは作らない（doPost なし）。シートの編集は人が直接行う。
//
// 対象スプレッドシート: 「職員マスタ」
//   https://docs.google.com/spreadsheets/d/1XSO23GeHaZUykYhgorzw9_y1ZFiOBEFH397hao9q68w/edit
//
// ★ 初回セットアップ手順（Windows で実施）:
//   1. script.google.com で新規プロジェクトを作成（スタンドアロン）
//   2. このファイルの内容を貼り付けて保存
//   3. エディタで setupSheets() を実行 → 承認 → 実行ログにトークンとシート情報が出る
//        - 「設定」シートが作られる
//        - 「職員マスタ」に入力規則（職種プルダウン／区分A-D）が張られる
//        - KINMU_MASTER_TOKEN が未発行なら自動発行される
//   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
//        - 次のユーザーとして実行: 自分
//        - アクセスできるユーザー: 全員
//   5. 実行ログの token を控える。呼び出しは必ず ?token=... を付ける
//
// ★ 呼び出し例:
//   GET  {webAppUrl}?token=XXXX                 … 全職員（退職者含む）
//   GET  {webAppUrl}?token=XXXX&activeOnly=1    … 在籍者のみ
//   GET  {webAppUrl}?token=XXXX&callback=cb     … JSONP
//
// 秘密はコードに直書きしない（CLAUDE.md 秘密情報ハードルール）。トークンは Script Properties。

var SPREADSHEET_ID = '1XSO23GeHaZUykYhgorzw9_y1ZFiOBEFH397hao9q68w';
var SHEET_STAFF    = '職員マスタ';
var SHEET_SETTINGS = '設定';
var PROP_TOKEN     = 'KINMU_MASTER_TOKEN';

// 2026-08-05 社長判断3: 職種③の3列を右端に追加。既存14列の並びは動かさない。
var STAFF_HEADERS = [
  '氏名', 'カナ', '入職日', '退職日',
  '職種①', '勤務形態区分①', '比率①',
  '職種②', '勤務形態区分②', '比率②',
  '日次ルールタグ', '保有資格', 'シフト用役割', '備考',
  '職種③', '勤務形態区分③', '比率③',
  // 2026-08-06 追加。常勤/非常勤の判定入力。出典＝有給管理簿（syncFromYukyu() が書く）
  '週所定時間',
  // 2026-08-07 追加。打刻しない職員（役員など）の勤務をこの値で計上する。
  // 形式: 「40h / 08:30-17:30 × 週5日」
  '固定勤務パターン'
];
// doGet が必須とするのは元の14列だけ。③列が未追加のシートでも読めるようにする。
var STAFF_HEADERS_REQUIRED = STAFF_HEADERS.slice(0, 14);

// 職種は入力規則でこの6つに固定する
var SHOKUSHU_LIST = ['管理者', '生活相談員', '看護職員', '介護職員', '機能訓練指導員', '送迎(基準外)'];
// 勤務形態区分（標準様式1 (7)欄）。定義は「設定」シートの 区分A〜D_定義 に置く。
var KUBUN_LIST = ['A', 'B', 'C', 'D'];

// 「設定」シートの初期値。すべて後から変更可能。
// 状態: 確定 / 暫定（裏取り待ち） / 未確定（値そのものが決まっていない）
var SETTINGS_HEADERS = ['設定キー', '値', '単位・形式', '状態', '備考'];
var SETTINGS_ROWS = [
  ['AM時間窓_開始',      '09:00',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['AM時間窓_終了',      '12:30',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['PM時間窓_開始',      '13:30',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],
  ['PM時間窓_終了',      '17:00',  'HH:MM',              '確定',
    '[確定] 指示書。中島さん版JSONの実値とも一致'],

  // 2026-08-07 決着①: 集計期間は暦月。参考様式1(2020-21)の4週固定は旧様式。
  // 厚労省の全国統一様式化で 4週間 → 1か月(暦月) に変更された。中島さん版テンプレが正しい。
  ['集計期間', '暦月', '暦月/4週', '確定',
    '[確定2026-08-07] 全国統一様式で 4週間→1か月(暦月) に変更済み。' +
    '過去提出物(参考様式1・2020-21年)は旧様式の4週固定なので期間仕様はそちらに寄せない'],

  // 2026-08-07 決着②: 分母は月ごとに変動する。40h固定でも160h固定でもない。
  // 設定は「週所定時間=40」だけを持ち、月の分母は計算で出す。
  ['常勤所定_週時間', 40, '時間/週', '確定',
    '[確定] 常勤職員が週に勤務すべき時間数。常勤/非常勤の判定と、月の分母の算出に使う。' +
    '過去提出物の記入済み26行が「週平均÷40」で完全一致したことと合致'],
  ['月分母_算出方法', '週所定時間 × 当月日数 ÷ 7', '式', '確定',
    '[確定2026-08-07] 常勤職員の当該月における勤務すべき時間数。月ごとに変動する。' +
    '例: 31日の月=177.1h / 30日の月=171.4h / 28日の月=160.0h。' +
    '旧様式の160hは「4週=28日ぶん」の数字であって月の固定値ではない'],

  // 2026-08-07 決着③: 端数処理を確定（新旧共通）。
  ['端数処理_方式', '切り捨て', '切上/切捨/四捨五入', '確定',
    '[確定2026-08-07] 様式注記5「算出にあたっては、小数点以下第２位を切り捨ててください。」' +
    'かつ実物26行が切り捨てで一致（15/4=3.7、3/4=0.7。四捨五入では説明できない）'],
  ['端数処理_桁数', '小数第1位', '小数第N位', '確定',
    '[確定2026-08-07] 小数点以下第2位を切り捨て＝小数第1位まで残す。週平均・常勤換算の両方に掛かる'],

  // 2026-08-05 社長判断2: A/B/C/D の定義を確定。人の頭に置かずここに書く。
  ['区分A_定義', '常勤・専従',   '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄'],
  ['区分B_定義', '常勤・兼務',   '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄。比嘉さんはこれ'],
  ['区分C_定義', '非常勤・専従', '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄'],
  ['区分D_定義', '非常勤・兼務', '凡例', '確定', '[確定] 標準様式1(7)勤務形態欄'],

  ['AM_サービス提供時間', '要確認', 'HH:MM-HH:MM', '未確定',
    '★AMフォーマット.xlsx AU14-AY14 は 09:00-12:00（勤務時間窓 09:00-12:30 とは別物）'],
  ['PM_サービス提供時間', '要確認', 'HH:MM-HH:MM', '未確定',
    '★PMフォーマット.xlsx AU14-AY14 は 13:30-16:30（勤務時間窓 13:30-17:00 とは別物）']
];

// 日次ルールタグのうち「職種そのものが日ごとに切り替わる」もの。
// これを持つ行は比率をマスタで固定しない（第2弾エンジンが日ごとに決める）。
//   相談員条件 … 下浦・喜多のいずれか出勤→介護職員／両名不在→生活相談員（勝又・星野）
// ※「看護2名条件」（比嘉）は職種を切り替えないのでここには入れない。
var TAGS_SWITCHING_SHOKUSHU = ['相談員条件'];

/* ------------------------------------------------------------
   勤務形態区分の機械導出（2026-08-06）
   区分は2軸に分解できる。手入力項目ではない。
     A=常勤かつ専従 / B=常勤かつ兼務 / C=非常勤かつ専従 / D=非常勤かつ兼務
   常勤の判定 … 埼玉県の基準。「当該事業所で定められた常勤の所定労働時間
     （週32時間を下回る場合は32時間を基本）に達しているか」。雇用形態の名前では決まらない。
   専従/兼務   … 職種が2つ以上なら兼務。
   ------------------------------------------------------------ */

// 設定から常勤の週所定時間を引く。旧キー名のシートでも読めるようにしておく。
function shoteiWeekHours_(settingsFlat) {
  var f = settingsFlat || {};
  var v = f['常勤所定_週時間'];
  if (v === undefined || v === '') v = f['常勤所定_週時間_一覧表用'];
  var n = Number(v);
  return isNaN(n) ? null : n;
}

// YYYY-MM の当月日数
function daysInMonth_(ym) {
  var m = String(ym || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return new Date(y, mo, 0).getDate();
}

// 2026-08-07 決着②: 常勤職員の当該月における勤務すべき時間数（＝月の分母）。
// 40h固定でも160h固定でもなく、月ごとに変動する。
//   40 × 31 ÷ 7 = 177.14…  /  40 × 30 ÷ 7 = 171.42…  /  40 × 28 ÷ 7 = 160.0
// 旧様式の160hは「4週=28日ぶん」の数字。
function monthlyDenominator_(weekHours, days) {
  var w = Number(weekHours), d = Number(days);
  if (!weekHours || !days || isNaN(w) || isNaN(d)) return null;
  return w * d / 7;
}

// 固定勤務パターン「40h / 08:30-17:30 × 週5日」を構造化する。
// 読めない部分は null にして raw は必ず残す（黙って捨てない）。
function parseFixedPattern_(v) {
  var raw = cell_(v);
  if (!raw || raw === '要確認') return null;
  var h = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*h/i);
  var t = raw.match(/([0-9]{1,2}:[0-9]{2})\s*[-~〜～]\s*([0-9]{1,2}:[0-9]{2})/);
  var d = raw.match(/週\s*([0-9]+(?:\.[0-9]+)?)\s*日/);
  return {
    raw: raw,
    週時間: h ? Number(h[1]) : null,
    開始: t ? t[1] : null,
    終了: t ? t[2] : null,
    週日数: d ? Number(d[1]) : null
  };
}

// 常勤とみなす週所定時間のしきい値。事業所の所定が32hを下回るなら32hを基本にする。
function fulltimeThreshold_(shoteiWeekHours) {
  var n = Number(shoteiWeekHours);
  if (!n || isNaN(n)) return 32;
  return n < 32 ? 32 : n;
}

// 週所定時間が不明なら '' を返す（＝導出できない）
function deriveKubun_(weeklyHours, shokushuCount, threshold) {
  if (weeklyHours === '' || weeklyHours === null || weeklyHours === undefined) return '';
  var h = Number(weeklyHours);
  if (isNaN(h)) return '';
  var isFulltime = h >= Number(threshold);
  var isKenmu = Number(shokushuCount) >= 2;
  if (isFulltime) return isKenmu ? 'B' : 'A';
  return isKenmu ? 'D' : 'C';
}

// 小数点以下第2位を切り捨て（＝小数第1位まで残す）。
// 参考様式1 の注記「算出にあたっては、小数点以下第２位を切り捨ててください。」に対応。
// 実物（令和3年4月・鳩山町 計画）の全26行がこの挙動で一致した。四捨五入ではない。
function truncate1_(x) {
  var n = Number(x);
  if (isNaN(n)) return 0;
  return Math.floor(Math.round(n * 1e6) / 1e6 * 10) / 10;
}

/* ------------------------------------------------------------
   有給管理簿（自社運用GAS・別スプレッドシート）
   職員マスタ: staff_id | 氏名 | 入社日 | 雇用形態 | 週所定労働日数 | 週所定時間 | 適用開始日 | 状態 | 備考
   ※週所定の変更は行追加で履歴化される（適用開始日が新しい行が有効）
   ------------------------------------------------------------ */
var YUKYU_SPREADSHEET_ID = '1KaWfk1cNKgTit09s8UGbA72QKD2y44bnpglvwam2ps4';
var YUKYU_SHEET_STAFF = '職員マスタ';

// 2026-08-06 に読んだ内容の記録。syncFromYukyu() はライブで読むが、
// 読めた値がこの記録と食い違ったらログに出す（silent drift を防ぐ）。
var YUKYU_SNAPSHOT_20260806 = {
  '下浦理絵':   { 入社日: '2024-09-03', 週所定時間: 20.25 },
  '髙山奈緒美': { 入社日: '2022-09-01', 週所定時間: 15 },
  '小野重次郎': { 入社日: '2023-07-19', 週所定時間: 13 },
  '春山忍':     { 入社日: '2025-04-07', 週所定時間: 15 },
  '勝又裕子':   { 入社日: '2025-11-03', 週所定時間: 40 },
  '工藤経子':   { 入社日: '2026-02-06', 週所定時間: 21 },
  '林秀明':     { 入社日: '2026-01-30', 週所定時間: 6 },
  '星野友太':   { 入社日: '2026-02-13', 週所定時間: 40 },
  '大久保好美': { 入社日: '2026-03-02', 週所定時間: 8 },
  '石井祐子':   { 入社日: '2026-04-01', 週所定時間: 15 }
};

// 2026-08-07 社長判断。applyDecisions20260807() が書く。
// 比嘉さんは代表取締役で雇用契約上の所定時間の定めが無いが、介護保険上の常勤判定は
// 「当該事業所で常勤者が勤務すべき時間数に達しているか」なので、実態の週40h以上をもって常勤。
// 比率20:80 は過去提出物の田村てるみ氏の実績（管理者25h / 生活相談員131.8h ≒ 16:84）に整合。
// 管理者は常勤換算の対象外なので、管理業務の実時間だけを小さく計上する自社の従来運用。
var DECISIONS_20260807 = {
  '比嘉学': {
    '週所定時間': 40,
    '職種①': '管理者',            '比率①': 20,
    '職種②': '機能訓練指導員',    '比率②': 80,
    '固定勤務パターン': '40h / 08:30-17:30 × 週5日'
  }
};

// 2026-08-06 にクロコ側で確定した値（社長判断不要）。applyDecisions20260806() が書く。
var DECISIONS_20260806 = {
  // 喜多さんのシフト用役割 ＝ 下浦さんと同値（同じ生活相談員）
  '喜多美咲': { 'シフト用役割': '介福,相談' },
  // 退職者の比率 ＝ 職種数で均等割。過去月の在籍判定用の概算で、請求額には影響しない。
  '石丸美幸':   { '比率①': 100 },
  '田中美奈子': { '比率①': 34, '比率②': 33, '比率③': 33 },
  '伊得たか子': { '比率①': 34, '比率②': 33, '比率③': 33 }
};

// 職種スロット。①は必須、②③は空でよい。
var SHOKUSHU_SLOTS = [
  ['職種①', '勤務形態区分①', '比率①'],
  ['職種②', '勤務形態区分②', '比率②'],
  ['職種③', '勤務形態区分③', '比率③']
];

// 2026-08-05 社長判断1・3 のシート反映内容。applyDecisions20260805() が書き込む。
// 勝又・星野の日次ルール（下浦・喜多のいずれか出勤→介護職員／両名不在→生活相談員）は
// エンジン側（第2弾）で実装する。マスタは職種2枠＋タグだけを持つ。
var DECISIONS_20260805 = {
  '勝又裕子':   { '職種①': '介護職員',   '職種②': '生活相談員' },
  '星野友太':   { '職種①': '介護職員',   '職種②': '生活相談員' },
  '石丸美幸':   { '職種①': '生活相談員' },
  '田中美奈子': { '職種①': '看護職員', '職種②': '機能訓練指導員', '職種③': '介護職員' },
  '伊得たか子': { '職種①': '看護職員', '職種②': '機能訓練指導員', '職種③': '介護職員' }
};

/* ============================================================
   読み取りAPI
   ============================================================ */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var callback = p.callback || null;

  try {
    var expected = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
    if (!expected) {
      return respond({ ok: false, error: 'トークン未発行です。エディタで setupSheets() を実行してください' }, callback);
    }
    if (String(p.token || '') !== expected) {
      return respond({ ok: false, error: 'unauthorized' }, callback);
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var sh = ss.getSheetByName(SHEET_STAFF);
    if (!sh) return respond({ ok: false, error: 'シート「' + SHEET_STAFF + '」が見つかりません' }, callback);

    var data = sh.getDataRange().getValues();
    if (data.length < 2) return respond({ ok: true, staff: [], counts: zeroCounts_() }, callback);

    var headers = data[0].map(function (h) { return String(h).trim(); });
    var idx = {};
    for (var h = 0; h < headers.length; h++) idx[headers[h]] = h;

    var missing = STAFF_HEADERS_REQUIRED.filter(function (name) { return !(name in idx); });
    if (missing.length) {
      return respond({ ok: false, error: '想定の列が見つかりません: ' + missing.join(', '), headers: headers }, callback);
    }

    var activeOnly = String(p.activeOnly || '') === '1';
    var stPre = readSettings_(ss);
    var shoteiWeek = shoteiWeekHours_(stPre.flat);
    var threshold = fulltimeThreshold_(shoteiWeek);

    var staff = [];
    var yokakuninTotal = 0;
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var name = String(row[idx['氏名']] || '').trim();
      if (!name) continue;

      // 退職判定は「退職日セルが空でないこと」。日付が未確定（"要確認"）でも退職者として扱う。
      // normDate_ は "要確認" に '' を返すため、これで判定すると退職者が在籍に混ざる。
      var taishokuRaw = cell_(row[idx['退職日']]);
      var taishokubi = normDate_(row[idx['退職日']]);
      var isRetired = taishokuRaw !== '';
      if (activeOnly && isRetired) continue;

      var rec = {
        氏名: name,
        カナ: cell_(row[idx['カナ']]),
        入職日: normDate_(row[idx['入職日']]),
        退職日: taishokubi,           // 日付として読めたときだけ入る。未確定なら ''
        退職: isRetired,              // 退職日セルが空でなければ true
        退職日未確定: isRetired && taishokubi === '',
        職種: [],
        日次ルールタグ: splitList_(row[idx['日次ルールタグ']]),
        // 「資格名:取得日」形式 → [{ name, acquiredOn }]。取得日が未確定なら acquiredOn は ''
        // ★第2弾: 資格判定は必ず「対象月時点で acquiredOn を過ぎているか」で行う。
        //   マスタの現在値を全期間に適用しないこと（バックログが過大になる）。
        保有資格: parseQualifications_(row[idx['保有資格']]),
        シフト用役割: splitList_(row[idx['シフト用役割']]),
        備考: cell_(row[idx['備考']])
      };

      // 職種①②③を配列に畳む。職種名が空のスロット、シートに無い③列は落とす。
      SHOKUSHU_SLOTS.forEach(function (trio) {
        if (!(trio[0] in idx)) return;              // ③列が未追加のシート
        var nm = cell_(row[idx[trio[0]]]);
        if (!nm || nm === '要確認') return;
        rec.職種.push({
          職種: nm,
          比率: (trio[2] in idx) ? numOrNull_(row[idx[trio[2]]]) : null
        });
      });

      // 勤務形態区分は導出値。シートの手入力値は使わない（誤入力に引きずられないため）。
      var wh = ('週所定時間' in idx) ? numOrNull_(row[idx['週所定時間']]) : null;
      var kubun = deriveKubun_(wh === null ? '' : wh, rec.職種.length, threshold);
      rec.週所定時間 = wh;
      rec.常勤 = (wh === null) ? null : (wh >= threshold);
      rec.勤務形態区分 = kubun;
      rec.職種.forEach(function (s) { s.勤務形態区分 = kubun; });

      // 打刻しない職員（役員など）。★第2弾: 打刻データを優先し、
      // 打刻が1件も無い職員だけこのパターンで計上する。両方あれば打刻を採る。
      rec.固定勤務パターン = ('固定勤務パターン' in idx)
        ? parseFixedPattern_(row[idx['固定勤務パターン']]) : null;
      rec.打刻対象外 = !!rec.固定勤務パターン;

      // 未確定の項目を機械的に拾う（要確認一覧の単一の正）
      rec.要確認 = collectYokakunin_(row, idx);
      yokakuninTotal += rec.要確認.length;

      staff.push(rec);
    }

    var st = readSettings_(ss);
    var out = {
      ok: true,
      generatedAt: new Date().toISOString(),
      spreadsheetId: SPREADSHEET_ID,
      settings: st.flat,
      settingsMeta: st.meta,
      常勤基準_週時間: threshold,
      // 月の分母は月ごとに変わる。?ym=YYYY-MM を渡すとその月ぶんを計算して返す。
      対象月: cell_(p.ym) || null,
      月分母: monthlyDenominator_(shoteiWeek, daysInMonth_(cell_(p.ym))),
      staff: staff,
      counts: {
        total: staff.length,
        active: staff.filter(function (s) { return !s.退職; }).length,
        retired: staff.filter(function (s) { return s.退職; }).length,
        要確認項目: yokakuninTotal
      }
    };
    return respond(out, callback);

  } catch (err) {
    return respond({ ok: false, error: String(err && err.message ? err.message : err) }, callback);
  }
}

// 「設定」シートを読む。
//   flat: { キー: 値 }                         … 従来どおり
//   meta: { キー: {値,単位,状態,備考} }        … 状態(確定/暫定/未確定)まで含む
// 無ければどちらも空オブジェクト。
function readSettings_(ss) {
  var out = { flat: {}, meta: {} };
  var sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) return out;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (!k) continue;
    out.flat[k] = cell_(rows[i][1]);
    out.meta[k] = {
      値: cell_(rows[i][1]),
      単位: cell_(rows[i][2]),
      状態: cell_(rows[i][3]),
      備考: cell_(rows[i][4])
    };
  }
  return out;
}

// 空欄／"要確認" の項目名を返す。プルダウン列は空欄＝未確定として扱う。
function collectYokakunin_(row, idx) {
  var out = [];
  var at = function (k) { return (k in idx) ? cell_(row[idx[k]]) : ''; };

  // 自由入力列: "要確認" という文字列が入っていたら未確定
  ['カナ', '入職日', '保有資格', 'シフト用役割'].forEach(function (k) {
    if (at(k) === '要確認') out.push(k);
  });
  // 退職日は「空欄＝在籍中」が正常。"要確認" のときだけ未確定
  if (at('退職日') === '要確認') out.push('退職日');

  // 資格名は確定していても取得日が未確定なら別項目として立てる。
  // ★第2弾で「対象月時点で取得済みか」を判定するのに取得日が要る。
  var quals = parseQualifications_(at('保有資格'));
  if (quals.length && quals.some(function (q) { return !q.acquiredOn; })) out.push('資格取得日');

  // 2026-08-05 社長判断1: 「職種そのものが日ごとに切り替わる」タグを持つ行は、
  // 比率をマスタで固定しないのが正（第2弾エンジンが日ごとに決める）。比率の空欄を未確定に数えない。
  // タグを持つだけでは免除しない。例: 比嘉さんの「看護2名条件」は職種を切り替えないので、
  // 管理者と機能訓練指導員の配分（比率①）は未確定のまま残す必要がある。
  var tags = splitList_(at('日次ルールタグ'));
  var hasDailyRule = tags.some(function (t) { return TAGS_SWITCHING_SHOKUSHU.indexOf(t) >= 0; });

  // 2026-08-06: 勤務形態区分は導出値になったので手入力の未確定として数えない。
  // 代わりに導出の入力である「週所定時間」が無い人だけを立てる。
  if ('週所定時間' in idx && at('週所定時間') === '') out.push('週所定時間');

  // 職種①は必須。②③は「職種名が入っているのに比率が空」のときだけ未確定。
  SHOKUSHU_SLOTS.forEach(function (trio, i) {
    var isFirst = (i === 0);
    if (!isFirst && !(trio[0] in idx)) return;        // ③列が未追加のシート
    if (!isFirst && at(trio[0]) === '') return;       // 職種名が空のスロットは問わない
    if (isFirst && at(trio[0]) === '') out.push(trio[0]);
    if (!hasDailyRule && at(trio[2]) === '') out.push(trio[2]);
  });
  return out;
}

/* ============================================================
   セットアップ（Windows のGASエディタで1回だけ実行）
   ============================================================ */

function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // --- 職員マスタ: 体裁と入力規則 ---
  var sh = ss.getSheetByName(SHEET_STAFF);
  if (!sh) throw new Error('シート「' + SHEET_STAFF + '」がありません。CSV取込のシート名を確認してください');

  var lastRow = Math.max(sh.getLastRow(), 2);
  var dvEnd = lastRow + 20; // 新入職の追加ぶんも先回りで規則を張る

  // --- 2026-08-05 社長判断3: 職種③の3列を右端に追加（既存列は動かさない・冪等）---
  var headerNow = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var added = [];
  ['職種③', '勤務形態区分③', '比率③', '週所定時間', '固定勤務パターン'].forEach(function (h) {
    if (headerNow.indexOf(h) >= 0) return;          // 既にあるなら何もしない
    var col = sh.getLastColumn() + 1;
    if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
    sh.getRange(1, col).setValue(h);
    headerNow.push(h);
    added.push(h);
  });

  // 追加後のヘッダで列位置を引く（位置決め打ちにしない）
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var colOf = function (name) { return hdr.indexOf(name) + 1; }; // 見つからなければ 0

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, hdr.length)
    .setFontWeight('bold').setBackground('#2C5F7D').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  var widths = {
    '氏名': 110, 'カナ': 140, '入職日': 100, '退職日': 100,
    '職種①': 130, '勤務形態区分①': 120, '比率①': 60,
    '職種②': 130, '勤務形態区分②': 120, '比率②': 60,
    '日次ルールタグ': 130, '保有資格': 240, 'シフト用役割': 170, '備考': 520,
    '職種③': 130, '勤務形態区分③': 120, '比率③': 60, '週所定時間': 100,
    '固定勤務パターン': 220
  };
  Object.keys(widths).forEach(function (name) {
    var c = colOf(name);
    if (c > 0) sh.setColumnWidth(c, widths[name]);
  });

  // 職種①②③のプルダウン
  var dvShokushu = SpreadsheetApp.newDataValidation()
    .requireValueInList(SHOKUSHU_LIST, true)
    .setAllowInvalid(false)
    .setHelpText('職種は ' + SHOKUSHU_LIST.join(' / ') + ' から選んでください')
    .build();
  // 勤務形態区分①②③。2026-08-06 以降は syncDerived() が書く自動計算値で、手入力しない。
  var dvKubun = SpreadsheetApp.newDataValidation()
    .requireValueInList(KUBUN_LIST, true)
    .setAllowInvalid(false)
    .setHelpText('【自動計算】週所定時間と職種数から導出される（A=常勤専従/B=常勤兼務/C=非常勤専従/D=非常勤兼務）。' +
      '直したいときは「週所定時間」列を直すこと。手入力してもAPIは導出値を返す')
    .build();
  SHOKUSHU_SLOTS.forEach(function (trio) {
    var cs = colOf(trio[0]);
    var ck = colOf(trio[1]);
    if (cs > 0) sh.getRange(2, cs, dvEnd - 1, 1).setDataValidation(dvShokushu);
    if (ck > 0) sh.getRange(2, ck, dvEnd - 1, 1).setDataValidation(dvKubun);
  });

  // "要確認" を含むセルを黄色で目立たせる（"介護福祉士:要確認" のような部分一致も拾う）
  var range = sh.getRange(2, 1, dvEnd - 1, hdr.length);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('要確認')
    .setBackground('#FFF3CD')
    .setRanges([range])
    .build();
  sh.setConditionalFormatRules([rule]);

  // --- 設定シート ---
  var st = ss.getSheetByName(SHEET_SETTINGS);
  if (!st) st = ss.insertSheet(SHEET_SETTINGS);
  st.clear();
  st.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
  st.getRange(2, 1, SETTINGS_ROWS.length, SETTINGS_HEADERS.length).setValues(SETTINGS_ROWS);
  st.setFrozenRows(1);
  st.getRange(1, 1, 1, SETTINGS_HEADERS.length)
    .setFontWeight('bold').setBackground('#2C5F7D').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  st.setColumnWidth(1, 210);
  st.setColumnWidth(2, 110);
  st.setColumnWidth(3, 170);
  st.setColumnWidth(4, 80);
  st.setColumnWidth(5, 520);

  var stRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('要確認')
    .setBackground('#FFF3CD')
    .setRanges([st.getRange(2, 1, SETTINGS_ROWS.length, SETTINGS_HEADERS.length)])
    .build();
  st.setConditionalFormatRules([stRule]);

  // 取込時にできた既定の空シートを畳む
  ['シート1', 'Sheet1'].forEach(function (n) {
    var d = ss.getSheetByName(n);
    if (d && ss.getSheets().length > 2) ss.deleteSheet(d);
  });

  // --- トークン（未発行なら発行）---
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(PROP_TOKEN);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty(PROP_TOKEN, token);
  }

  var info = {
    追加した列: added.length ? added : '（なし・既に追加済み）',
    sheetUrl: ss.getUrl(),
    spreadsheetId: ss.getId(),
    sheets: ss.getSheets().map(function (s) {
      return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() };
    }),
    token: token,
    次にやること: 'applyDecisions20260805() を実行して 2026-08-05 の判断をデータへ反映する'
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

/* ============================================================
   2026-08-05 社長判断のデータ反映（setupSheets() の後に1回実行）
   ------------------------------------------------------------
   構造（列・書式・入力規則）は setupSheets()、データは本関数。分けてある。
   何度実行しても同じ結果になる（冪等）。人が手で直した値は上書きしない。
   ============================================================ */

function applyDecisions20260805() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_STAFF);
  if (!sh) throw new Error('シート「' + SHEET_STAFF + '」がありません');

  var data = sh.getDataRange().getValues();
  var hdr = data[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  hdr.forEach(function (h, i) { idx[h] = i; });

  ['職種③', '勤務形態区分③', '比率③'].forEach(function (h) {
    if (!(h in idx)) throw new Error('列「' + h + '」がありません。先に setupSheets() を実行してください');
  });

  var changed = [];
  var skipped = [];

  for (var r = 1; r < data.length; r++) {
    var name = String(data[r][idx['氏名']] || '').trim();
    if (!name) continue;

    // --- 判断1・3: 職種の確定 ---
    var dec = DECISIONS_20260805[name];
    if (dec) {
      Object.keys(dec).forEach(function (col) {
        var cur = cell_(data[r][idx[col]]);
        if (cur === dec[col]) return;                       // 既に反映済み
        if (cur !== '' && cur !== '要確認') {                // 人が別の値を入れている
          skipped.push(name + ' ' + col + ': 既存値「' + cur + '」を尊重（判断値は「' + dec[col] + '」）');
          return;
        }
        sh.getRange(r + 1, idx[col] + 1).setValue(dec[col]);
        changed.push(name + ' ' + col + ' → ' + dec[col]);
      });
    }

    // --- 保有資格を「資格名:取得日」形式へ移行 ---
    var qCur = cell_(data[r][idx['保有資格']]);
    var qNew = migrateQualCell_(name, qCur);
    if (qNew !== null && qNew !== qCur) {
      sh.getRange(r + 1, idx['保有資格'] + 1).setValue(qNew);
      changed.push(name + ' 保有資格 → ' + qNew);
    }
  }

  var info = {
    反映: changed.length ? changed : '（なし・既に反映済み）',
    見送り: skipped.length ? skipped : '（なし）',
    件数: { 反映: changed.length, 見送り: skipped.length }
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

/* ============================================================
   2026-08-06 分（setupSheets() のあと、この順で実行）
     ① syncFromYukyu()          有給管理簿から 入社日・週所定時間 を取り込む
     ② applyDecisions20260806() 喜多さんの役割・退職者の比率を入れる
     ③ syncDerived()            週所定時間と職種数から勤務形態区分を導出して書く
   いずれも冪等。
   ============================================================ */

// ① 有給管理簿（別スプレッドシート）から 入社日・週所定時間 を取り込む。
//    週所定は行追加で履歴化されるので、適用開始日が今日以前で最新の行を採る。
function syncFromYukyu() {
  var ys = SpreadsheetApp.openById(YUKYU_SPREADSHEET_ID);
  var ysh = ys.getSheetByName(YUKYU_SHEET_STAFF);
  if (!ysh) throw new Error('有給管理簿に「' + YUKYU_SHEET_STAFF + '」シートがありません');

  var yv = ysh.getDataRange().getValues();
  var yh = yv[0].map(function (h) { return String(h).trim(); });
  var yi = {};
  yh.forEach(function (h, i) { yi[h] = i; });
  ['氏名', '入社日', '週所定時間', '適用開始日'].forEach(function (h) {
    if (!(h in yi)) throw new Error('有給管理簿に列「' + h + '」がありません（実際: ' + yh.join(',') + '）');
  });

  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var eff = {};   // 氏名 → {入社日, 週所定時間, from}
  for (var i = 1; i < yv.length; i++) {
    var nm = cell_(yv[i][yi['氏名']]);
    if (!nm) continue;
    var from = normDate_(yv[i][yi['適用開始日']]);
    if (from && from > today) continue;                       // 未来の適用行は使わない
    if (eff[nm] && eff[nm].from && from && from <= eff[nm].from) continue;
    eff[nm] = {
      入社日: normDate_(yv[i][yi['入社日']]),
      週所定時間: numOrNull_(yv[i][yi['週所定時間']]),
      from: from
    };
  }

  // 2026-08-06 に読んだ内容とズレていたら黙って通さずログに出す
  var drift = [];
  Object.keys(YUKYU_SNAPSHOT_20260806).forEach(function (nm) {
    var snap = YUKYU_SNAPSHOT_20260806[nm];
    var now = eff[nm];
    if (!now) { drift.push(nm + ': 有給管理簿から消えた'); return; }
    if (now.入社日 !== snap.入社日) drift.push(nm + ' 入社日: ' + snap.入社日 + ' → ' + now.入社日);
    if (Number(now.週所定時間) !== Number(snap.週所定時間)) {
      drift.push(nm + ' 週所定時間: ' + snap.週所定時間 + ' → ' + now.週所定時間);
    }
  });

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_STAFF);
  var data = sh.getDataRange().getValues();
  var hdr = data[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  hdr.forEach(function (h, i) { idx[h] = i; });
  if (!('週所定時間' in idx)) throw new Error('「週所定時間」列がありません。先に setupSheets() を実行してください');

  var changed = [], unmatched = [];
  for (var r = 1; r < data.length; r++) {
    var name = cell_(data[r][idx['氏名']]);
    if (!name) continue;
    var e = eff[name];
    if (!e) { unmatched.push(name); continue; }

    if (e.週所定時間 !== null && numOrNull_(data[r][idx['週所定時間']]) !== e.週所定時間) {
      sh.getRange(r + 1, idx['週所定時間'] + 1).setValue(e.週所定時間);
      changed.push(name + ' 週所定時間 → ' + e.週所定時間);
    }
    var curJoin = cell_(data[r][idx['入職日']]);
    if (e.入社日 && (curJoin === '' || curJoin === '要確認')) {
      sh.getRange(r + 1, idx['入職日'] + 1).setValue(e.入社日);
      changed.push(name + ' 入職日 → ' + e.入社日);
    }
  }

  var info = {
    反映: changed.length ? changed : '（なし・既に反映済み）',
    '有給管理簿に居ない人': unmatched,
    '2026-08-06の記録とのズレ': drift.length ? drift : '（なし）'
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

// ② 2026-08-06 にクロコ側で確定した値を書く（社長判断不要ぶん）
function applyDecisions20260806() {
  return applyDecisionTable_(DECISIONS_20260806, '2026-08-06');
}

// ②' 2026-08-07 の社長判断（比嘉さんの確定値）を書く
function applyDecisions20260807() {
  return applyDecisionTable_(DECISIONS_20260807, '2026-08-07');
}

// 確定値テーブルをシートへ書く共通処理。冪等。人が手で入れた別の値は上書きしない。
function applyDecisionTable_(table, label) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_STAFF);
  var data = sh.getDataRange().getValues();
  var hdr = data[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  hdr.forEach(function (h, i) { idx[h] = i; });

  var changed = [], skipped = [];
  for (var r = 1; r < data.length; r++) {
    var name = cell_(data[r][idx['氏名']]);
    var dec = table[name];
    if (!dec) continue;
    Object.keys(dec).forEach(function (col) {
      if (!(col in idx)) { skipped.push(name + ' ' + col + ': 列が無い'); return; }
      var cur = cell_(data[r][idx[col]]);
      if (cur === String(dec[col])) return;
      if (cur !== '' && cur !== '要確認') {
        skipped.push(name + ' ' + col + ': 既存値「' + cur + '」を尊重（確定値は「' + dec[col] + '」）');
        return;
      }
      sh.getRange(r + 1, idx[col] + 1).setValue(dec[col]);
      changed.push(name + ' ' + col + ' → ' + dec[col]);
    });
  }
  var info = {
    対象: label,
    反映: changed.length ? changed : '（なし・既に反映済み）',
    見送り: skipped.length ? skipped : '（なし）'
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

// ③ 勤務形態区分①②③をシートへ書き戻す（APIは常に導出値を返すので、これは人が見る用）
function syncDerived() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_STAFF);
  var threshold = fulltimeThreshold_(shoteiWeekHours_(readSettings_(ss).flat));

  var data = sh.getDataRange().getValues();
  var hdr = data[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  hdr.forEach(function (h, i) { idx[h] = i; });

  var changed = [], undecidable = [];
  for (var r = 1; r < data.length; r++) {
    var name = cell_(data[r][idx['氏名']]);
    if (!name) continue;

    var n = 0;
    SHOKUSHU_SLOTS.forEach(function (trio) {
      if (!(trio[0] in idx)) return;
      var v = cell_(data[r][idx[trio[0]]]);
      if (v && v !== '要確認') n++;
    });

    var wh = numOrNull_(data[r][idx['週所定時間']]);
    var kubun = deriveKubun_(wh === null ? '' : wh, n, threshold);
    if (!kubun) undecidable.push(name + '（週所定時間が未登録）');

    SHOKUSHU_SLOTS.forEach(function (trio, i) {
      if (!(trio[1] in idx)) return;
      // 職種が入っているスロットにだけ区分を書く
      var hasJob = (trio[0] in idx) && cell_(data[r][idx[trio[0]]]) !== '' &&
        cell_(data[r][idx[trio[0]]]) !== '要確認';
      var want = hasJob ? kubun : '';
      var cur = cell_(data[r][idx[trio[1]]]);
      if (cur === want) return;
      sh.getRange(r + 1, idx[trio[1]] + 1).setValue(want);
      changed.push(name + ' ' + trio[1] + ': ' + (cur || '空') + ' → ' + (want || '空'));
    });
  }

  var info = {
    常勤基準: threshold + ' 時間/週',
    反映: changed.length ? changed : '（なし・既に反映済み）',
    '導出できなかった人': undecidable.length ? undecidable : '（なし）'
  };
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

// 「資格名」→「資格名:取得日」への移行。既に ":" を含むなら触らない（冪等）。
// 変更不要なら null を返す。
function migrateQualCell_(name, cur) {
  // 比嘉さんは 2026-08-05 判断で両資格保持が確定。取得日つきで確定値を書く。
  if (name === '比嘉学') {
    var fixed = '柔道整復師:要確認,介護福祉士:2026-03-26';
    if (cur.indexOf('介護福祉士:2026-03-26') >= 0 && cur.indexOf('柔道整復師') >= 0) return null;
    return fixed;
  }
  if (cur === '' || cur === '要確認') return null;   // 資格名そのものが未確定。触らない
  if (cur.indexOf(':') >= 0) return null;            // 移行済み
  return cur.split(/[,、，]/)
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; })
    .map(function (x) { return x + ':要確認'; })
    .join(',');
}

// 現在のトークン確認用
function showToken() {
  var t = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  Logger.log('TOKEN = ' + t);
  return t;
}

// 実測の行数・列数・要確認件数を出す（完了報告の根拠用）
function verify() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_STAFF);
  var data = sh.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  headers.forEach(function (h, i) { idx[h] = i; });

  var active = 0, retired = 0, yokakunin = 0;
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][idx['氏名']] || '').trim()) continue;
    if (cell_(data[i][idx['退職日']]) !== '') retired++;
    else active++;
    for (var c = 0; c < headers.length; c++) if (cell_(data[i][c]) === '要確認') yokakunin++;
  }

  var st = ss.getSheetByName(SHEET_SETTINGS);
  var out = {
    sheetUrl: ss.getUrl(),
    職員マスタ: { rows: sh.getLastRow(), cols: sh.getLastColumn(), headers: headers },
    在籍: active,
    退職: retired,
    '要確認セル数(職員マスタ)': yokakunin,
    設定: st ? { rows: st.getLastRow(), cols: st.getLastColumn() } : '未作成（setupSheets() を実行してください）'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   ヘルパ
   ============================================================ */

function respond(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// 日付セルは Date で返ることも文字列で返ることもある。YYYY-MM-DD に正規化する。
// "要確認" のような未確定文字列は日付ではないので '' を返す（退職判定を汚さないため）。
function normDate_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (!m) return '';
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function numOrNull_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

// 保有資格セル「資格名:取得日,資格名:取得日」を [{name, acquiredOn}] にする。
//   '介護福祉士:2026-03-26'  → [{name:'介護福祉士', acquiredOn:'2026-03-26'}]
//   '柔道整復師:要確認'      → [{name:'柔道整復師', acquiredOn:''}]
//   '介護福祉士'（旧形式）   → [{name:'介護福祉士', acquiredOn:''}]
//   '要確認'                 → []  ※資格名そのものが未確定
function parseQualifications_(v) {
  var s = cell_(v);
  if (!s || s === '要確認') return [];
  return s.split(/[,、，]/).map(function (chunk) {
    var parts = chunk.split(/[:：]/);
    var nm = (parts[0] || '').trim();
    var on = normDate_((parts[1] || '').trim());
    return nm ? { name: nm, acquiredOn: on } : null;
  }).filter(function (x) { return x; });
}

// カンマ区切り（全角読点・全角カンマも許容）を配列にする。"要確認" は空配列にせず残す。
function splitList_(v) {
  var s = cell_(v);
  if (!s) return [];
  return s.split(/[,、，]/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

function zeroCounts_() {
  return { total: 0, active: 0, retired: 0, 要確認項目: 0 };
}
