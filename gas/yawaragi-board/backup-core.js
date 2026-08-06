/* スプレッドシート・バックアップ機構 コア（純関数・2026-08-06）
 *
 * 何のためにあるか:
 *   危ない作業の前に確実な復元点を作り、日常的にも数世代前と比較できるようにする。
 *   2026-08-03 に「利用者台帳から53名が消えた」と数時間の犯人探しをした（実際は Drive 読み取りの
 *   打ち切りでデータは無事）。手元にコピーがあれば5分で終わっていた。
 *
 * ★このファイルの最重要責務は「消してよいものだけを選ぶ」こと。
 *   バックアップの仕組みがデータを消すのが最悪のパターン。so 削除の判定はすべてここに集め、
 *   Drive を触らない純関数にしてテストで固定する（scripts/test-backup-core.js）。
 *   Drive I/O（コピー・ゴミ箱へ移動）は コード.js 側。判定はここ以外に書かない。
 */

// バックアップ名の印。これが先頭に無いファイルは、どれだけ紛らわしくても削除候補にしない。
var BK_PREFIX = '_BAK_';

// 種別ラベル。ファイル名を見ただけで手動／自動が分かるようにする（要件）。
//   手動 … 社長が作業前に自分で取ったもの。★機械は絶対に消さない（世代管理の対象外）。
//   週次 … 時間トリガーが取ったもの。世代管理の対象。
var BK_KIND_LABEL = { manual: '手動', auto: '週次' };

var BK_SS_MIME = 'application/vnd.google-apps.spreadsheet';
// 口腔実施記録の実体は Drive 上の JSON ファイル（oral_data.json）で、Drive 上の種類は text/plain。
// 2026-08-07 実測。スプレッドシートではないので、種類を1つだけ増やして扱えるようにする。
var BK_JSON_MIME = 'text/plain';

// 名前の形: _BAK_<種別>_<原本名>_<YYYY-MM-DD_HHmm>
//   末尾を日時で固定するのは、人が名前を書き換えたものを「対象外」に落とすため。
//   （「大事・消さないで」と付け足された瞬間にパースが外れ、削除候補から外れる）
var BK_NAME_RE = /^_BAK_(手動|週次)_(.+)_(\d{4}-\d{2}-\d{2}_\d{4})$/;

/**
 * ★バックアップ対象（失うと業務が止まるものを優先して選ぶ・網羅は狙わない）
 *   priority A … 失うと業務が止まる
 *   priority B … 止まりはしないが、復元に人手が要る
 * 実測日 2026-08-06。IDは Drive メタデータで確認済み。
 * mimeType は「その原本が何であるか」の宣言。ここに書いた種類だけが世代管理の網に入る（bkAllowedMimeTypes_）。
 */
var BACKUP_TARGETS = [
  { id: '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0', label: '利用者台帳', priority: 'A', mimeType: BK_SS_MIME,
    note: '板GASの統合シート。利用者台帳／提出送付台帳／口腔・通所・個訓の設定と記録／出欠変更／伝達ボード／タスクボード等が全部この1ファイル。失うと全アプリが止まる' },
  { id: '1sj4B5-g96_lg3uuLmml9edWiC5YlPsrJeUmVfDd810A', label: 'シフト希望', priority: 'A', mimeType: BK_SS_MIME,
    note: 'シフト希望の収集＋スタッフ＋配置データ。失うとシフトが組めず人員配置が崩れる' },
  { id: '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw', label: '送迎日誌データ', priority: 'A', mimeType: BK_SS_MIME,
    note: '出勤送迎表データ／送迎時間。失うと当日の送迎が回らない' },
  { id: '1KaWfk1cNKgTit09s8UGbA72QKD2y44bnpglvwam2ps4', label: '有給管理簿', priority: 'B', mimeType: BK_SS_MIME,
    note: '有給の付与・消化。失うと残日数の再計算が必要（労務リスク）' },
  { id: '1sFrr5ScSoAcOzvxEs1QtV2qdM_v4OdXe3W5bJJm25G0', label: '清掃・準備チェック表データ', priority: 'B', mimeType: BK_SS_MIME,
    note: '日々の業務チェックの記録' },
  { id: '1tGASO3e42Ty8votGyYkRlY1fiG-KiEmAa7VBq3KQuRo', label: 'アプリ台帳（管理用）', priority: 'B', mimeType: BK_SS_MIME,
    note: 'ランチャーのアプリ一覧。失うと現場がアプリに辿り着けない' },
  // 2026-08-07 追加。板の外にある唯一の対象。
  //   旧GAS「健康チェック同期」(scriptId 1241B5RFqOXYEbmFZ_gBRIQahZ4np3c4hdUFZsxkm4h-r5FC7tT5VUvqV) が
  //   フォルダ「健康チェック同期データ」に書いている JSON。iPad6台から30秒間隔で「丸ごと上書き」される
  //   構造なので、1台が古い状態でPOSTすれば全員分が巻き戻る。世代が無いと巻き戻りに気づけない。
  { id: '1Vjz5K9VBoXjWTXLtCto_T1dxaoxG6R1I', label: '口腔実施記録', priority: 'A', mimeType: BK_JSON_MIME,
    note: '口腔体操（月2回）の実施記録 oral_data.json。口腔機能向上加算の根拠。失うと運営指導で加算の裏付けを示せない' }
];

/** 世代管理で触ってよい種類（＝対象として宣言済みの種類だけ）。手で二重管理しないよう定義から導く。 */
function bkAllowedMimeTypes_() {
  var seen = {}, out = [];
  BACKUP_TARGETS.forEach(function (t) {
    var m = String(t.mimeType || '');
    if (!m || seen[m]) return;
    seen[m] = true;
    out.push(m);
  });
  return out;
}

/** バックアップ名を組み立てる。 kind: 'manual' | 'auto' */
function bkBuildBackupName_(kind, title, stamp) {
  var label = BK_KIND_LABEL[kind];
  if (!label) throw new Error('種別は manual か auto: ' + kind);
  return BK_PREFIX + label + '_' + String(title) + '_' + String(stamp);
}

/** バックアップ名を読む。バックアップでなければ null（＝削除候補にしない側へ倒す） */
function bkParseBackupName_(name) {
  var s = String(name == null ? '' : name);
  var m = s.match(BK_NAME_RE);
  if (!m) return null;
  return {
    kind: (m[1] === '手動') ? 'manual' : 'auto',
    title: m[2],
    stamp: m[3]
  };
}

/**
 * ★世代削除の対象を選ぶ（Drive は触らない）。
 *
 * @param {Array<{id:string,name:string,mimeType:string,parentIds:Array<string>}>} files
 *        バックアップフォルダから読んだファイル一覧（呼び出し側で絞らずに全部渡してよい）
 * @param {{backupFolderId:string, keep:number, sourceIds:Array<string>, maxDelete:number,
 *          allowedMimeTypes:Array<string>}} opts
 *        allowedMimeTypes … 触ってよい種類。省略時はスプレッドシートのみ（＝2026-08-06 までの挙動）。
 * @return {{targets:Array, kept:number, aborted:boolean, reason:string, skipped:Object}}
 *
 * 削除候補になるのは、以下を **すべて** 満たすものだけ:
 *   ①親にバックアップフォルダを含む ②許可された種類である ③名前が _BAK_ 形式で読める
 *   ④種別が「週次」 ⑤IDが原本のどれとも一致しない ⑥同じ原本名の中で新しい方から keep 件より後
 * 1つでも欠けたら残す（迷ったら残す）。
 */
function bkSelectStale_(files, opts) {
  var o = opts || {};
  var folderId = String(o.backupFolderId || '');
  var keep = Number(o.keep);
  var maxDelete = Number(o.maxDelete);
  var sourceIds = o.sourceIds || [];

  // 設定ミスで全滅させないための入口ガード。
  if (!folderId) throw new Error('backupFolderId が未指定（保存先が空だと全ファイルが対象になりうる）');
  if (!isFinite(keep) || keep < 1) throw new Error('keep は1以上（0世代＝全部消すは許さない）');
  if (!isFinite(maxDelete) || maxDelete < 1) throw new Error('maxDelete は1以上');

  // 触ってよい種類。渡されなければスプレッドシートのみ＝呼び出し側が忘れても網は緩まない側へ倒す。
  var allowedList = (o.allowedMimeTypes && o.allowedMimeTypes.length) ? o.allowedMimeTypes : [BK_SS_MIME];
  var isAllowedMime = {};
  allowedList.forEach(function (m) { isAllowedMime[String(m)] = true; });

  var isSource = {};
  sourceIds.forEach(function (id) { isSource[String(id)] = true; });

  var skipped = {
    otherFolder: 0,      // 保存先フォルダの外にあった
    notSpreadsheet: 0,   // 許可されていない種類だった（キー名は 2026-08-06 の互換のため据え置き）
    notBackupName: 0,    // _BAK_ 形式ではない（原本・手作業のバックアップ・無関係ファイル）
    renamed: 0,          // _BAK_ で始まるが形が崩れている＝人が名前を触った
    manual: 0,           // 手動バックアップ
    isSource: 0          // ★原本そのもの
  };

  var groups = {};   // 原本名 → [{id, name, stamp}]
  (files || []).forEach(function (file) {
    var parents = file.parentIds || [];
    if (parents.indexOf(folderId) < 0) { skipped.otherFolder++; return; }
    if (!isAllowedMime[String(file.mimeType)]) { skipped.notSpreadsheet++; return; }

    var parsed = bkParseBackupName_(file.name);
    if (!parsed) {
      // _BAK_ で始まるのに読めない＝人が書き換えた可能性。内訳を分けて可視化する。
      if (String(file.name || '').indexOf(BK_PREFIX) === 0) skipped.renamed++;
      else skipped.notBackupName++;
      return;
    }
    if (parsed.kind !== 'auto') { skipped.manual++; return; }
    // ★最後の砦: 原本IDと一致するものは、名前が何であっても触らない。
    if (isSource[String(file.id)]) { skipped.isSource++; return; }

    (groups[parsed.title] = groups[parsed.title] || []).push({
      id: file.id, name: file.name, title: parsed.title, stamp: parsed.stamp
    });
  });

  var targets = [], kept = 0;
  Object.keys(groups).forEach(function (title) {
    var list = groups[title].sort(function (a, b) {
      // 'YYYY-MM-DD_HHmm' は辞書順＝時系列順。新しい順に並べる。
      return a.stamp < b.stamp ? 1 : (a.stamp > b.stamp ? -1 : 0);
    });
    kept += Math.min(keep, list.length);
    targets = targets.concat(list.slice(keep));
  });

  // ★暴走ガード: 想定以上の件数が選ばれたら1件も消さずに止める。
  //   「少し多い」ときに黙って消すより、止まって人に見せる方が安全。
  if (targets.length > maxDelete) {
    return {
      targets: [], kept: kept, aborted: true,
      reason: '削除候補が上限を超えました（候補 ' + targets.length + ' 件 / 上限 ' + maxDelete
            + ' 件）。1件も削除せず中断しました。中身を確認してください。',
      skipped: skipped
    };
  }

  return { targets: targets, kept: kept, aborted: false, reason: '', skipped: skipped };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BK_PREFIX: BK_PREFIX,
    BK_SS_MIME: BK_SS_MIME,
    BK_JSON_MIME: BK_JSON_MIME,
    BACKUP_TARGETS: BACKUP_TARGETS,
    bkAllowedMimeTypes_: bkAllowedMimeTypes_,
    bkBuildBackupName_: bkBuildBackupName_,
    bkParseBackupName_: bkParseBackupName_,
    bkSelectStale_: bkSelectStale_
  };
}
