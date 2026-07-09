// 本日の欠席連絡ボックス: コア判定 + genba構造証明
// 実行: node scripts/test-genba-kesseki-box.js
const path = require('path');
const fs = require('fs');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'kesseki-box-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// ===== A. kbIsAlreadyNotified_（済み判定＝二重送信ガードの心臓） =====
ok(core.kbIsAlreadyNotified_('送信済') === true,  'A1: 送信済 → 済み');
ok(core.kbIsAlreadyNotified_('電話連絡済') === true, 'A2: 電話連絡済 → 済み');
ok(core.kbIsAlreadyNotified_('手動メール送信済') === true, 'A3: 手動メール送信済 → 済み');
ok(core.kbIsAlreadyNotified_('ケアマネ把握済') === true, 'A4: ケアマネ把握済 → 済み');
ok(core.kbIsAlreadyNotified_('下書き保存') === true, 'A5: 下書き保存 → 済み扱い(再送不可)');
ok(core.kbIsAlreadyNotified_('メール未送信') === false, 'A6: メール未送信 → 未対応');
ok(core.kbIsAlreadyNotified_('要電話連絡') === false, 'A7: 要電話連絡 → 未対応');
ok(core.kbIsAlreadyNotified_('メールなし') === false, 'A8: メールなし → 未対応(電話派として扱う)');
ok(core.kbIsAlreadyNotified_('') === false, 'A9: 空 → 未対応');
ok(core.kbIsAlreadyNotified_(null) === false, 'A10: null → 未対応(落ちない)');

// ===== B. kbFilterTodayTargets_（本日の通常欠席のみ） =====
const abs = [
  { date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-07', name: '明日花子', unit: '午後', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-06', name: '長期次郎', unit: '終日', isLongTerm: true,  cmNotified: '' },
];
const targets = core.kbFilterTodayTargets_(abs, '2026-07-06');
ok(targets.length === 1 && targets[0].name === '当日太郎', 'B1: 当日+通常欠席のみ（明日と長期休みは除外）');
ok(core.kbFilterTodayTargets_(null, '2026-07-06').length === 0, 'B2: null入力で空配列(落ちない)');

// ===== C. kbClassifyCard_（カード分類・初期チェック） =====
const mail = core.kbClassifyCard_({ method: 'メール', email: 'a@b.jp', cmNotified: '' });
ok(mail.kind === 'mail' && mail.done === false && mail.defaultChecked === true, 'C1: メール派未対応 → mail/チェックON');
const mailDone = core.kbClassifyCard_({ method: 'メール', email: 'a@b.jp', cmNotified: '送信済' });
ok(mailDone.kind === 'mail' && mailDone.done === true && mailDone.defaultChecked === false, 'C2: 送信済 → done/チェック不可');
const tel = core.kbClassifyCard_({ method: '電話', email: '', cmNotified: '' });
ok(tel.kind === 'phone' && tel.done === false, 'C3: 電話派 → phone(一括送信対象外)');
const telDone = core.kbClassifyCard_({ method: '電話', email: '', cmNotified: '電話連絡済' });
ok(telDone.done === true, 'C4: 電話連絡済 → done');
const noAddr = core.kbClassifyCard_({ method: 'メール', email: '', cmNotified: '' });
ok(noAddr.kind === 'phone', 'C5: メール派だがメアド無し → 電話フローに倒す(誤送信防止)');
const empty = core.kbClassifyCard_({ method: '', email: 'a@b.jp', cmNotified: '' });
ok(empty.kind === 'phone', 'C6: 連絡手段未設定 → 電話フローに倒す(勝手にメールしない)');

// ===== F. kbAddDaysYMD_（JST安全±日・月/年境界） =====
ok(core.kbAddDaysYMD_('2026-07-31', 1) === '2026-08-01', 'F1: +1 月跨ぎ');
ok(core.kbAddDaysYMD_('2026-07-01', -1) === '2026-06-30', 'F2: -1 月跨ぎ');
ok(core.kbAddDaysYMD_('2026-07-06', 0) === '2026-07-06', 'F3: 0 同日');
ok(core.kbAddDaysYMD_('2025-12-31', 1) === '2026-01-01', 'F4: +1 年跨ぎ');
ok(core.kbAddDaysYMD_('2026-01-01', -1) === '2025-12-31', 'F5: -1 年跨ぎ');

// ===== G. kbJstYmdFromEpoch_（JST当日・深夜/早朝境界＝始業4:30事故の回帰） =====
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 14, 30)) === '2026-07-06', 'G1: 23:30 JST → 当日(07-06)');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 19, 30)) === '2026-07-07', 'G2: 4:30 JST → 当日(07-07)・前日化しない');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6,  3,  0)) === '2026-07-06', 'G3: 12:00 JST → 07-06');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 15,  0)) === '2026-07-07', 'G4: 0:00 JST翌日 → 07-07');
// JST日付繰り上がりの1秒境界（オフバイワンの丸め方向を殺す）
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 14, 59, 59)) === '2026-07-06', 'G5: JST23:59:59 → 07-06');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 15,  0,  0)) === '2026-07-07', 'G6: JST00:00:00 → 07-07');

// ===== H. kbUpcomingAbsenceDates_（機能B: 今日以降の欠席日distinct昇順） =====
const _hAbs = [
  { date: '2026-07-08', name: 'a', isLongTerm: false },
  { date: '2026-07-06', name: 'b', isLongTerm: false },   // 当日は含む
  { date: '2026-07-05', name: 'c', isLongTerm: false },   // 過去は除外
  { date: '2026-07-08', name: 'd', isLongTerm: false },   // 同日重複 → 1つに
  { date: '2026-07-15', name: 'e', isLongTerm: true  },   // 長期休みは除外
  { date: '2026-07-10', name: 'f', isLongTerm: false },
];
const _hOut = core.kbUpcomingAbsenceDates_(_hAbs, '2026-07-06');
ok(JSON.stringify(_hOut) === JSON.stringify(['2026-07-06','2026-07-08','2026-07-10']), 'H1: distinct昇順・過去/長期除外・当日含む');
ok(core.kbUpcomingAbsenceDates_(null, '2026-07-06').length === 0, 'H2: null入力で空配列(落ちない)');
// H3: spec要件「未来方向のみ」を単独で明示（H1の間接証明に頼らない）
const _h3 = core.kbUpcomingAbsenceDates_([
  { date: '2026-07-01', name: 'p', isLongTerm: false },
  { date: '2026-07-05', name: 'q', isLongTerm: false },
], '2026-07-06');
ok(_h3.length === 0, 'H3: 基準日より前の日付は結果に含まれない(未来方向のみ)');
// H4: 長期除外を単独で明示（H1依存にしない）
const _h4 = core.kbUpcomingAbsenceDates_([
  { date: '2026-07-08', name: 'r', isLongTerm: true },
  { date: '2026-07-10', name: 's', isLongTerm: true },
], '2026-07-06');
ok(_h4.length === 0, 'H4: isLongTerm のみ入力 → 空配列(長期除外)');

// ===== I. kbMergeDedupAbs_（④継ぎ目: primary=前進窓GET正本, secondary=月キャッシュ補完） =====
const _iPrimary = [
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '送信済' },   // 正本(最新)
];
const _iSecondary = [
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '' },          // 同一key → 捨てる(primary優先)
  { name: '花子', date: '2026-07-04', unit: '午後', cmNotified: '電話連絡済' }, // primaryに無い → 補完
];
const _iOut = core.kbMergeDedupAbs_(_iPrimary, _iSecondary);
ok(_iOut.length === 2, 'I1: overlapは1つ・非重複は補完で計2件');
const _iTaro = _iOut.filter(function (x) { return x.name === '太郎'; });
ok(_iTaro.length === 1 && _iTaro[0].cmNotified === '送信済', 'I2: overlap日はprimary(前進窓GET)が正本');
ok(_iOut.some(function (x) { return x.name === '花子'; }), 'I3: primaryに無いsecondaryは補完される');
ok(core.kbMergeDedupAbs_(null, null).length === 0, 'I4: 両方null/空で落ちない');
// I5: dedupキーが(name,date,unit)三点である証明。同一人・同一日でも午前/午後は別スロット→畳まない
const _i5 = core.kbMergeDedupAbs_([
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '送信済' },
  { name: '太郎', date: '2026-07-06', unit: '午後', cmNotified: '' },
], []);
ok(_i5.length === 2, 'I5: 太郎/07-06/午前 と 太郎/07-06/午後 は畳まれず2件(unitを鍵に含む)');

// ===== J. kbIsViewToday_（機能Cガード判定・両者JST yyyy-mm-dd前提） =====
ok(core.kbIsViewToday_('2026-07-06', '2026-07-06') === true,  'J1: 一致 → true');
ok(core.kbIsViewToday_('2026-07-08', '2026-07-06') === false, 'J2: 未来 → false');
ok(core.kbIsViewToday_('2026-07-04', '2026-07-06') === false, 'J3: 過去 → false');
ok(core.kbIsViewToday_('', '2026-07-06') === false, 'J4: 空 → false(落ちない)');
// 型頑健性（例外を投げずfalse・jstTodayStr()が想定外を返した時の保険）
ok(core.kbIsViewToday_(null, '2026-07-06') === false, 'J5: null片方 → false');
ok(core.kbIsViewToday_('2026-07-06', undefined) === false, 'J6: undefined片方 → false');

// O. kbUnitGroup_（AM/PM分類・終日/空はPMへ害なきフォールバック）
ok(core.kbUnitGroup_('午前') === 'am', 'O1: 午前 → am');
ok(core.kbUnitGroup_('午後') === 'pm', 'O2: 午後 → pm');
ok(core.kbUnitGroup_('終日') === 'pm', 'O3: 終日 → pm(害なきフォールバック・実運用では発生しない)');
ok(core.kbUnitGroup_('') === 'pm', 'O4: 空 → pm(消さない)');
ok(core.kbUnitGroup_(null) === 'pm', 'O5: null → pm(落ちない)');

// V. kbIsOkResponse_ / kbDecideLoad_（3状態判定・点滅封じの心臓）
ok(core.kbIsOkResponse_({ absences: { absences: [] } }) === true,  'V1: 構造整った成功0件 → ok');
ok(core.kbIsOkResponse_({ absences: { absences: [{}] } }) === true, 'V2: 成功N件 → ok');
ok(core.kbIsOkResponse_(null) === false,  'V3: null(失敗/timeout) → not ok');
ok(core.kbIsOkResponse_({}) === false,    'V4: 空応答(構造欠落) → not ok');
ok(core.kbIsOkResponse_({ absences: {} }) === false, 'V5: absences.absencesが配列でない → not ok');
const _r = core.kbDecideLoad_;
ok(_r(null, '2026-07-06', true).outcome === 'errored',   'V6: 失敗×初回 → errored');
ok(_r(null, '2026-07-06', false).outcome === 'preserve', 'V7: 失敗×既存あり → preserve(触らない)');
ok(_r({ absences: { absences: [] } }, '2026-07-06', false).outcome === 'empty', 'V8: 成功0件 → empty(欠席なしOK)');
ok(_r({ absences: { absences: [{ date: '2026-07-06', name: 'A', isLongTerm: false }] } }, '2026-07-06', false).outcome === 'list', 'V9: 成功N件 → list');
ok(_r({ absences: { absences: [{ date: '2026-07-07', name: 'B', isLongTerm: false }] } }, '2026-07-06', false).outcome === 'empty', 'V10: 成功だが当日0(明日のみ) → empty');

console.log(`kesseki-box core: ${pass} PASS / ${fail} FAIL`);

// ===== D/E. genba.html 構造証明（Task3/3.5で緑化。ファイル未変更なら赤） =====
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');
function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}
function tryOk(fn, label) { try { fn(); } catch (e) { fail++; console.error('  [FAIL] ' + label + ' :: ' + e.message); } }

let pass2 = 0, fail2 = 0;
function ok2(cond, label) { if (cond) pass2++; else { fail2++; console.error('  [FAIL] ' + label); } }

// D. ボックスUI + originガード構造
tryOk(() => {
  ok2(html.indexOf('id="kbox-section"') >= 0, 'D1: kboxセクションが存在');
  const kbInitSrc = extractFn('kbInit');
  ok2(/if\s*\(!\w+\)\s*return/.test(kbInitSrc), 'D2: kbInitに要素不在ガード（f774228型の回避）');
  const kbSendSrc = extractFn('kbExecuteSend');
  ok2(kbSendSrc.indexOf('gnbGuardProdWrite') >= 0 &&
      kbSendSrc.indexOf('gnbGuardProdWrite') < kbSendSrc.indexOf('fetch'),
      'D3: 一括送信はfetch前にoriginガード');
  // D4更新(2026-07-08): confirm→担当者選択モーダルへ置換so二段構え。fetchは kbConfirmPhoneDone_ 側へ移動。
  // 「開く側」はPOSTしない＝fetch不在が正。originガードは両関数の先頭に存在すること。
  const kbTelSrc = extractFn('kbMarkPhoneDone');
  ok2(kbTelSrc.indexOf('gnbGuardProdWrite') >= 0 && kbTelSrc.indexOf('fetch(') < 0,
      'D4(★更新): 電話済みは開くだけ(fetch不在)・先頭にoriginガード');
  const kbTelConfirmSrc = extractFn('kbConfirmPhoneDone_');
  ok2(kbTelConfirmSrc.indexOf('gnbGuardProdWrite') >= 0 &&
      kbTelConfirmSrc.indexOf('gnbGuardProdWrite') < kbTelConfirmSrc.indexOf('fetch('),
      'D4b(★): 確定 kbConfirmPhoneDone_ はfetch前にoriginガード（ガード再掲）');
  ok2(html.indexOf('id="kbox-summary-modal"') >= 0, 'D5: 送信は最終サマリーモーダル経由');
}, 'D群(ボックスUI)');

// K. 過去+未来ビュー DOM（月グリッド無し・3要素のみ）
tryOk(() => {
  ok2(html.indexOf('id="kbox-datenav"') >= 0, 'K1: 日付送り帯が存在');
  ok2(html.indexOf('id="kbox-prev"') >= 0 && html.indexOf('kbGoDate(-1)') >= 0, 'K2: ◀=kbGoDate(-1)');
  ok2(html.indexOf('id="kbox-next"') >= 0 && html.indexOf('kbGoDate(1)') >= 0, 'K3: ▶=kbGoDate(1)');
  ok2(html.indexOf('id="kbox-datelabel"') >= 0, 'K4: 中央日付ラベルが存在');
  ok2(html.indexOf('id="kbox-viewonly-banner"') >= 0, 'K5: 過去日帯が存在');
  // K5b(2026-07-09 範囲拡大-38後): 過去日でも「連絡済みの記録」はできるので「閲覧のみ」は誤解を生む。
  //   帯の表示文言だけを実態に合わせる（当日ガードのロジック/トースト「閲覧のみです」は非接触）。
  {
    const bs = html.indexOf('id="kbox-viewonly-banner"');
    const be = html.indexOf('</div>', bs);
    const banner = html.slice(bs, be);
    ok2(banner.indexOf('連絡済みの記録はできます') >= 0, 'K5b(★実態一致): 帯に「連絡済みの記録はできます」を明記（過去日=何もできない、の誤解を解く）');
    ok2(banner.indexOf('👀 閲覧のみ（') < 0, 'K5c(★誤解排除): 帯の旧文言「👀 閲覧のみ（」を残さない（トースト「閲覧のみです」は別物で非接触）');
  }
  // K6反転(2026-07-08): 日付ピッカー導入でチップは役目を終えたso削除。消し忘れをテストで固定する。
  ok2(html.indexOf('id="kbox-jumpchips"') < 0, 'K6(★削除保証): ジャンプチップ行が存在しない');
  // ★日付移動手段(ピッカー/◀▶)は残る＝kbJumpToはピッカーが使うso削除不可
  ok2(html.indexOf('id="kbox-datepicker"') >= 0 && html.indexOf('kbJumpTo(this.value)') >= 0, 'K7(★): 日付ピッカーがkbJumpToを使い続ける');
  ok2(html.indexOf('function kbJumpTo') >= 0, 'K8(★誤削除防止): kbJumpTo本体は残っている');
}, 'K群(日付ビューDOM)');

// L. kbState.viewDate と インライン純関数の存在
tryOk(() => {
  const kbStateSrc = html.slice(html.indexOf('let kbState ='), html.indexOf('let kbState =') + 200);
  ok2(/viewDate\s*:/.test(kbStateSrc), 'L1: kbStateにviewDate');
  ok2(html.indexOf('function kbAddDaysYMD_') >= 0, 'L2: インラインkbAddDaysYMD_');
  // L3反転(2026-07-08): チップ削除に伴いgenba.htmlのインライン版も撤去（呼び出しはチップ1箇所のみだった）。
  // ★gas/yawaragi-board/kesseki-box-core.js 側は非接触so H群は引き続きPASSする。
  ok2(html.indexOf('function kbUpcomingAbsenceDates_') < 0, 'L3(★削除保証): インラインkbUpcomingAbsenceDates_が存在しない');
  // ★kbFmtChip_ は欠席なし表示(7829)・日付ラベル(7921)が使う共通関数so削除不可
  ok2(html.indexOf('function kbFmtChip_') >= 0, 'L3b(★誤削除防止): kbFmtChip_は共通関数so残っている');
  ok2(html.indexOf('function kbMergeDedupAbs_') >= 0, 'L4: インラインkbMergeDedupAbs_');
  ok2(html.indexOf('function kbIsViewToday_') >= 0, 'L5: インラインkbIsViewToday_');
  ok2(html.indexOf('function kbFilterTodayTargets_') >= 0, 'L6: インラインkbFilterTodayTargets_(日付引数版)');
  ok2(html.indexOf('function kbUnitGroup_') >= 0, 'L7: インラインkbUnitGroup_');
}, 'L群(状態+インライン純関数)');

// M. kbRender の chrome描画（datelabel/banner/chips）とUIガード
tryOk(() => {
  const kbRenderSrc = extractFn('kbRender()');   // 'kbRender'だとkbRenderForDate等に前置衝突するため厳密化
  ok2(kbRenderSrc.indexOf('kbRenderChrome_') >= 0, 'M1: kbRenderがchrome描画を呼ぶ');
  ok2(kbRenderSrc.indexOf('kbIsViewToday_') >= 0, 'M2: kbRenderが当日判定を持つ');
  ok2(/viewIsToday/.test(kbRenderSrc), 'M3: viewIsTodayでUI活性を分岐');
  ok2(html.indexOf('function kbRenderChrome_') >= 0, 'M4: kbRenderChrome_定義');
  const chromeSrc = extractFn('kbRenderChrome_');
  // M5反転(2026-07-08): chromeはチップを描かない。日付帯ラベル/閲覧のみ帯/ピッカー同期は維持。
  ok2(chromeSrc.indexOf('kbUpcomingAbsenceDates_') < 0 && chromeSrc.indexOf('kbox-jumpchips') < 0, 'M5(★削除保証): chromeがチップを描かない');
  ok2(chromeSrc.indexOf('kbox-datepicker') >= 0, 'M5b(★): chromeは日付ピッカーの表示同期を維持');
  ok2(chromeSrc.indexOf('kbox-viewonly-banner') >= 0, 'M6: chromeが閲覧のみ帯を制御');
}, 'M群(chrome+UIガード)');

// N. 関数レベル当日ガード（UIすり抜け不能・前倒し送信の構造的封じ）
tryOk(() => {
  const sendSrc = extractFn('kbExecuteSend');
  ok2(sendSrc.indexOf('kbIsViewToday_') >= 0, 'N1: kbExecuteSendに当日ガード');
  // 実際の fetch( 呼び出しで判定（コメント中の「fetch前」等の単語に誤マッチしないため）
  ok2(sendSrc.indexOf('kbIsViewToday_') < sendSrc.indexOf('fetch('), 'N2: 当日ガードはfetch(呼び出しより前');
  ok2(sendSrc.indexOf('gnbGuardProdWrite') >= 0, 'N3: 既存originガードも維持');
  const telSrc = extractFn('kbMarkPhoneDone');
  ok2(telSrc.indexOf('kbIsViewToday_') >= 0, 'N4: kbMarkPhoneDoneに当日ガード');
  // N5更新(2026-07-08): 二段構え化でfetchは確定側へ。開く側は「fetch不在＋モーダル表示より前にガード」が正。
  ok2(telSrc.indexOf('fetch(') < 0 && telSrc.indexOf('kbIsViewToday_') < telSrc.indexOf('kbShowModal_'),
      'N5(★更新): kbMarkPhoneDoneはfetch不在・当日ガードはモーダル表示より前');
  ok2(telSrc.indexOf('gnbGuardProdWrite') >= 0, 'N6: 既存originガードも維持');
  // N5b/N5c: 確定側（実POST）にもガードを再掲＝モーダル表示中に日付が変わる極端ケースを封じる。
  const telConfSrc = extractFn('kbConfirmPhoneDone_');
  ok2(telConfSrc.indexOf('kbIsViewToday_') >= 0 && telConfSrc.indexOf('kbIsViewToday_') < telConfSrc.indexOf('fetch('),
      'N5b(★): kbConfirmPhoneDone_の当日ガードはfetch(より前');
  ok2(telConfSrc.indexOf('gnbGuardProdWrite') >= 0, 'N5c(★): kbConfirmPhoneDone_にもoriginガード');
  // N7/N8: ガードは「あらゆる状態変更より前」。ガードより前に副作用(UI送信済化/チェック書換/二重送信フラグ/確認ダイアログ/fetch)が一切無い。
  // 実コード構文(.disabled= / .checked= / fetch( / confirm( )でマッチ＝コメント語に誤反応しない。
  const sendBefore = sendSrc.slice(0, sendSrc.indexOf('kbIsViewToday_'));
  ok2(sendSrc.indexOf('kbIsViewToday_') > 0 && !/\.disabled\s*=|送信中|\.textContent\s*=|\.checked\s*=|fetch\(/.test(sendBefore),
      'N7: kbExecuteSendのガードより前に副作用ゼロ(全状態変更に先行)');
  // N8更新(2026-07-08): モーダル表示(kbShowModal_)・対象保持も副作用soガードより後であること。
  const telBefore = telSrc.slice(0, telSrc.indexOf('kbIsViewToday_'));
  ok2(telSrc.indexOf('kbIsViewToday_') > 0 && !/\.disabled\s*=|\.checked\s*=|confirm\(|fetch\(|kbShowModal_|kbPhoneTarget\s*=|innerHTML\s*=/.test(telBefore),
      'N8(★更新): kbMarkPhoneDoneのガードより前に副作用ゼロ(モーダル表示/対象保持/fetchに先行)');
  // N8b: 確定側もガードより前に副作用ゼロ（二度押し防止のUI変更はガードの後）
  const telConfBefore = telConfSrc.slice(0, telConfSrc.indexOf('kbIsViewToday_'));
  ok2(telConfSrc.indexOf('kbIsViewToday_') > 0 && !/\.disabled\s*=|\.textContent\s*=|fetch\(/.test(telConfBefore),
      'N8b(★): kbConfirmPhoneDone_のガードより前に副作用ゼロ');
  // N9: 送信対象集合は viewDate当日のkbState.itemsのみ(前進窓forward/月キャッシュを混ぜない)＝"何を送るか"の別防御線。
  const collectSrc = extractFn('kbCollectSendTargets_');
  ok2(collectSrc.indexOf('kbState.items') >= 0 && collectSrc.indexOf('kbState.forward') < 0 && collectSrc.indexOf('attMonthAbsCache') < 0,
      'N9: 送信対象はviewDate当日のkbState.itemsのみ(forward/月キャッシュ非参照)');
}, 'N群(関数レベル当日ガード)');

// P. リネーム（本日→欠席box）
tryOk(() => {
  ok2(html.indexOf('📮 欠席box') >= 0, 'P1: タイトルが「欠席box」');
  ok2(html.indexOf('📮 本日の欠席連絡</strong>') < 0, 'P2: 旧タイトル「本日の欠席連絡」見出しが消えている');
  ok2(html.indexOf('📮 欠席box の使い方') >= 0, 'P3: ヘルプ見出しも「欠席box の使い方」');
}, 'P群(リネーム)');

// Q. 日付ラベル拡大
tryOk(() => {
  const idx = html.indexOf('id="kbox-datelabel"');
  ok2(idx >= 0, 'Q0: datelabel存在');
  const tag = html.slice(idx, html.indexOf('>', idx));
  ok2(/font-size\s*:\s*1\.35rem/.test(tag), 'Q1: datelabelに font-size:1.35rem');
}, 'Q群(日付ラベル拡大)');

// R. AM/PM群描画（四角バッジ・各カード1群に1回）
tryOk(() => {
  const src = extractFn('kbRender()');
  ok2(src.indexOf('kbUnitGroup_') >= 0, 'R1: kbRenderがkbUnitGroup_で群分け');
  ok2(/kb-ampm-badge/.test(src), 'R2: AM/PM四角バッジのマーカー(kb-ampm-badge)がある');
  ok2(src.indexOf("'AM'") >= 0 && src.indexOf("'PM'") >= 0, 'R3: AM/PMラベルを描画');
  ok2(/groups\.am|groups\['am'\]/.test(src) && /groups\.pm|groups\['pm'\]/.test(src), 'R4: am/pmバケットに振り分け');
  // #2: 空群は"消す"のでなく"欠席者なし"を明示（午前/午後ラベルは群配列・文言はテンプレで合成）
  ok2(src.indexOf('欠席者なし') >= 0 && /'午前'/.test(src) && /'午後'/.test(src), 'R5: 空群は「午前/午後 欠席者なし」を明示（消さない）');
  ok2(/if\s*\(!groups\[key\]\.length\)/.test(src), 'R6: 群0件でも見出しを描き欠席者なしを表示（早期returnで消さない）');
}, 'R群(AM/PM群描画)');

// S. 日付ピッカー（type=date・kbJumpTo経路・chromeで値同期）
tryOk(() => {
  const idx = html.indexOf('id="kbox-datepicker"');
  ok2(idx >= 0, 'S1: #kbox-datepickerが存在');
  const line = html.slice(html.lastIndexOf('<', idx), html.indexOf('>', idx) + 1);
  ok2(/type="date"/.test(line), 'S2: type=date');
  ok2(/onchange="kbJumpTo\(this\.value\)"/.test(line), 'S3: onchangeがkbJumpTo(this.value)');
  const chrome = extractFn('kbRenderChrome_');
  ok2(chrome.indexOf('kbox-datepicker') >= 0, 'S4: chromeがpicker値を現在viewDateへ同期');
}, 'S群(日付ピッカー)');

// T. box内操作者行 → 2026-07-08 削除（全ての記録操作がモーダル内で担当者を選ぶso不要）。
// 「前の人の名前が残ったまま記録される」経路を構造的にゼロにする。存在テスト→削除保証テストへ反転。
tryOk(() => {
  ok2(html.indexOf('id="kbox-operator-select"') < 0, 'T1(★削除保証): box内 操作者コンテナが存在しない');
  ok2(html.indexOf('id="kbox-operator-note"') < 0, 'T2(★削除保証): box内 操作者ノートが存在しない');
  ok2(html.indexOf('function kbRenderOperatorRow_') < 0, 'T3(★削除保証): kbRenderOperatorRow_が存在しない');
  const rsrc = extractFn('kbRender()');
  ok2(rsrc.indexOf('kbRenderOperatorRow_') < 0, 'T4(★削除保証): kbRenderが操作者行を描かない');
  // コメント文中の語に誤反応しないよう、実コード構文（宣言/参照）で判定する
  ok2(!/const\s+opDisabled|opDisabled\s*\|\||\$\{\s*\(?opDisabled/.test(rsrc), 'T5(★削除保証): opDisabled(受付者未選択で無効化)が消えている');
  // ★★誤削除防止: 欠席登録タブの受付者セレクタ・登録フォームは別物so絶対に壊さない。
  //   absReceptionist は欠席登録の実データ(canceller/reporter/registeredBy)に使われている。
  ok2(html.indexOf('id="abs-receptionist-card"') >= 0, 'T6(★★誤削除防止): 欠席登録タブの受付者カードが生存');
  ok2(html.indexOf('id="abs-receptionist-btns"') >= 0, 'T7(★★誤削除防止): 欠席登録タブの受付者ボタン行が生存');
  ok2(html.indexOf('function absInitReceptionist') >= 0, 'T8(★★誤削除防止): absInitReceptionistが生存');
  ok2(html.indexOf('function absSelectReceptionist') >= 0, 'T9(★★誤削除防止): absSelectReceptionistが生存');
  ok2(html.indexOf('let absReceptionist') >= 0, 'T10(★★誤削除防止): グローバルabsReceptionistが生存');
  ok2(/reporter:\s*absReceptionist/.test(html), 'T11(★★誤削除防止): 欠席登録のreporterがabsReceptionistを使い続ける');
  ok2(/registeredBy:\s*absReceptionist/.test(html), 'T12(★★誤削除防止): 欠席登録のregisteredByが生存');
  ok2(/canceller:\s*absReceptionist/.test(html), 'T13(★★誤削除防止): 欠席取消のcancellerが生存');
  // ★box側の記録/送信経路は absReceptionist を読まない（全経路が各モーダルの選択値）
  ok2(extractFn('kbMarkPhoneDone').indexOf('absReceptionist') < 0, 'T14(★): 電話済みがabsReceptionistを読まない');
  ok2(extractFn('kbExecuteSend').indexOf('absReceptionist') < 0, 'T15(★): 一括送信がabsReceptionistを読まない');
  ok2(extractFn('kbSubmitPastContact_').indexOf('absReceptionist') < 0, 'T16(★): 過去日記録がabsReceptionistを読まない');
  ok2(extractFn('kbOpenSummary').indexOf('absReceptionist') < 0, 'T17(★初期値なし): サマリーがabsReceptionistを初期値にしない');
  ok2(extractFn('kbMarkContactedPast_').indexOf('absReceptionist') < 0, 'T18(★初期値なし): 記録モーダルがabsReceptionistを初期値にしない');
  ok2(extractFn('kbRender()').indexOf('absReceptionist') < 0, 'T19(★): kbRenderがabsReceptionistを読まない');
  // ★absSelectReceptionist は欠席登録側の関数so残すが、box再描画(kbRender)の呼び出しは切る
  // 実際の呼び出し構文（typeof kbRender === 'function' ... kbRender()）で判定＝コメント語に誤反応しない
  ok2(!/try\s*\{\s*kbRender\(\)|typeof\s+kbRender\s*===/.test(extractFn('absSelectReceptionist')), 'T20(★分離): absSelectReceptionistがkbRenderを呼ばない(box非依存)');
}, 'T群(受付者バー削除＋欠席登録の誤削除防止)');

// U. 移設（出席予定タブ単独・欠席登録タブ非依存・二重fetchなし）
tryOk(() => {
  const iAtt = html.indexOf('id="tab-attendance"');
  const iRemind = html.indexOf('id="tab-remind"');   // attendanceの次タブ
  const iAbs = html.indexOf('id="tab-absence"');
  const iBox = html.indexOf('id="kbox-section"');
  ok2(iBox > iAtt && iBox < iRemind, 'U1: kbox-sectionは出席予定タブ内(tab-attendance〜tab-remindの間)');
  ok2(!(iBox > iAbs), 'U2: kbox-sectionは欠席登録タブ(tab-absence)より前=欠席登録タブ内に無い');
  // 配線: attendance分岐にkbInit・absence分岐にkbInit無し
  const attBranch = html.slice(html.indexOf("dataset.tab === 'attendance'"), html.indexOf("dataset.tab === 'remind'"));
  ok2(attBranch.indexOf('kbInit(') >= 0, 'U3: attendance分岐にkbInit()を独立追記');
  const absBranch = html.slice(html.indexOf("dataset.tab === 'absence'"), html.indexOf("dataset.tab === 'jisseki'"));
  ok2(absBranch.indexOf('kbInit(') < 0, 'U4: absence分岐からkbInit()撤去');
  // f774228回避: kbInitは要素不在ガードを保持（既存D2の再確認）
  ok2(/if\s*\(!\w+\)\s*return/.test(extractFn('kbInit')), 'U5: kbInitの要素不在ガード維持');
  // 二重fetchなし: 冪等early-return と _ensuringYm ガード両方が生存
  ok2(html.indexOf('if (attMonthAbsCache[ym]) { cb(); return; }') >= 0, 'U6: attEnsureMonthAbsencesの月命中early-return生存(冪等)');
  ok2(html.indexOf('kbState._ensuringYm !== ym') >= 0, 'U7: kbox側_ensuringYm二重ensureガード生存');
}, 'U群(移設)');

// W. 3状態ちらつき封じ インライン関数
tryOk(() => {
  ok2(html.indexOf('function kbIsOkResponseInline_') >= 0, 'W1: kbIsOkResponseInline_ 定義');
  ok2(html.indexOf('function kbViewLoadedInline_') >= 0, 'W2: kbViewLoadedInline_ 定義');
  ok2(html.indexOf('function kbJsonpRetry_') >= 0, 'W3: kbJsonpRetry_ 定義');
  const okSrc = extractFn('kbIsOkResponseInline_');
  ok2(/Array\.isArray/.test(okSrc) && okSrc.indexOf('absences') >= 0, 'W4: okは absences.absences の配列判定');
  const vlSrc = extractFn('kbViewLoadedInline_');
  ok2(vlSrc.indexOf('forwardOk') >= 0 && vlSrc.indexOf('monthLoaded') >= 0, 'W5: 当日=forwardOk/非当日=monthLoaded で分岐');
  const rtSrc = extractFn('kbJsonpRetry_');
  ok2(rtSrc.indexOf('kbIsOkResponseInline_') >= 0 && rtSrc.indexOf('setTimeout') >= 0, 'W6: retryはok判定+バックオフ');
}, 'W群(3状態インライン)');

// X. kbStateのロード状態フラグ
tryOk(() => {
  const s = html.slice(html.indexOf('let kbState ='), html.indexOf('let kbState =') + 260);
  ok2(/loadedOnce\s*:/.test(s), 'X1: kbStateにloadedOnce');
  ok2(/forwardOk\s*:/.test(s), 'X2: kbStateにforwardOk');
}, 'X群(ロード状態)');

// Y. kbLoad 3状態化
tryOk(() => {
  const src = extractFn('kbLoad');
  ok2(src.indexOf('kbJsonpRetry_') >= 0, 'Y1: forward取得はretry版');
  ok2(src.indexOf('kbIsOkResponseInline_') >= 0, 'Y2: ok判定を持つ');
  ok2(/if\s*\(!kbState\.loadedOnce\)/.test(src), 'Y3: 「読み込み中」は初回のみ');
  ok2(src.indexOf('forwardOk = true') >= 0 && src.indexOf('forwardOk = false') >= 0, 'Y4: forwardOkを成功/失敗で更新');
  const okIdx = src.indexOf('kbState.forward = aj');
  const failReturn = src.indexOf('loadedOnce || kbState.items.length');
  ok2(failReturn >= 0 && failReturn < okIdx, 'Y5: 失敗時preserve分岐がforward上書きより前');
}, 'Y群(kbLoad3状態)');

// Z. kbRender "欠席なし" ゲート（描画出口一箇所での封じ）
tryOk(() => {
  const src = extractFn('kbRender()');
  ok2(src.indexOf('kbViewLoadedInline_') >= 0, 'Z1: 空分岐がkbViewLoadedInline_でゲート');
  const emptyIdx = src.indexOf('if (!kbState.items.length)');
  const seg = src.slice(emptyIdx, emptyIdx + 600);
  ok2(seg.indexOf('kbViewLoadedInline_') >= 0, 'Z2: 空分岐内でロード確定を判定');
  ok2(seg.indexOf('読み込み中') >= 0, 'Z3: 未確定は「読み込み中」（欠席なしを出さない）');
  ok2(seg.indexOf('の欠席はありません') >= 0, 'Z4: 確定0件のときは従来文言');
}, 'Z群(欠席なしゲート)');

// E. 登録折衷案（急ぎトグル）
tryOk(() => {
  ok2(html.indexOf('id="abs-urgent-send"') >= 0, 'E1: 急ぎトグルが存在');
  ok2(/id="abs-urgent-send"[^>]*type="checkbox"|type="checkbox"[^>]*id="abs-urgent-send"/.test(html.replace(/\n/g, ' ')), 'E2: チェックボックス型');
  const submitSrc = extractFn('absSubmit');
  ok2(submitSrc.indexOf('abs-urgent-send') >= 0, 'E3: absSubmitが急ぎトグルを参照');
  const urgentIdx = submitSrc.indexOf('abs-urgent-send');
  const previewIdx = submitSrc.indexOf('absOpenPreview');
  ok2(urgentIdx >= 0 && previewIdx >= 0 && urgentIdx < previewIdx, 'E4: トグル判定がabsOpenPreviewより前');
}, 'E群(急ぎトグル)');

// F. 使い方ヘルプモーダル（指示書④・表示専用）
tryOk(() => {
  ok2(html.indexOf('id="kbox-help-modal"') >= 0, 'F1: 使い方ヘルプモーダルが存在');
  ok2(html.indexOf('kbShowHelp()') >= 0, 'F2: ❓使い方ボタンがkbShowHelpを呼ぶ');
  const helpSrc = extractFn('kbShowHelp');
  // 要素不在ガードは kbShowModal_ に集約（モーダルをbody直下へ退避してから表示・display:none祖先での不可視封じ）。
  // kbShowHelp はそれ経由で表示するため、ガードは kbShowModal_ 側で担保される（f774228型回避は維持）。
  const showModalSrc = extractFn('kbShowModal_');
  ok2(/kbShowModal_\s*\(/.test(helpSrc) && /if\s*\(!\w+\)\s*return/.test(showModalSrc), 'F3: 使い方の表示経路に要素不在ガード（kbShowModal_に集約・f774228型回避）');
  // 表示専用＝送信/POST/registerを一切呼ばない
  ok2(helpSrc.indexOf('fetch') < 0 && helpSrc.indexOf('POST') < 0 && helpSrc.indexOf('absDoRegister') < 0,
      'F4: kbShowHelpは表示専用（fetch/POST/登録を呼ばない）');
  // 手順テキストの主要見出しが含まれる（静的テキスト埋め込み確認）
  ok2(html.indexOf('欠席box の使い方') >= 0, 'F5: 手順テキスト本文（ヘルプ見出し）が埋め込まれている');
}, 'F群(使い方ヘルプ)');

console.log(`genba構造証明: ${pass2} PASS / ${fail2} FAIL`);

if (fail > 0 || fail2 > 0) process.exit(1);
