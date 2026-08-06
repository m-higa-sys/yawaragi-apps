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

// 名前の形: _BAK_<種別>_<原本名>_<YYYY-MM-DD_HHmm>
//   末尾を日時で固定するのは、人が名前を書き換えたものを「対象外」に落とすため。
//   （「大事・消さないで」と付け足された瞬間にパースが外れ、削除候補から外れる）
var BK_NAME_RE = /^_BAK_(手動|週次)_(.+)_(\d{4}-\d{2}-\d{2}_\d{4})$/;

/**
 * ★バックアップ対象（失うと業務が止まるものを優先して選ぶ・網羅は狙わない）
 *   priority A … 失うと業務が止まる
 *   priority B … 止まりはしないが、復元に人手が要る
 * 実測日 2026-08-06。IDは Drive メタデータで確認済み。
 */
var BACKUP_TARGETS = [
  { id: '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0', label: '利用者台帳', priority: 'A',
    note: '板GASの統合シート。利用者台帳／提出送付台帳／口腔・通所・個訓の設定と記録／出欠変更／伝達ボード／タスクボード等が全部この1ファイル。失うと全アプリが止まる' },
  { id: '1sj4B5-g96_lg3uuLmml9edWiC5YlPsrJeUmVfDd810A', label: 'シフト希望', priority: 'A',
    note: 'シフト希望の収集＋スタッフ＋配置データ。失うとシフトが組めず人員配置が崩れる' },
  { id: '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw', label: '送迎日誌データ', priority: 'A',
    note: '出勤送迎表データ／送迎時間。失うと当日の送迎が回らない' },
  { id: '1KaWfk1cNKgTit09s8UGbA72QKD2y44bnpglvwam2ps4', label: '有給管理簿', priority: 'B',
    note: '有給の付与・消化。失うと残日数の再計算が必要（労務リスク）' },
  { id: '1sFrr5ScSoAcOzvxEs1QtV2qdM_v4OdXe3W5bJJm25G0', label: '清掃・準備チェック表データ', priority: 'B',
    note: '日々の業務チェックの記録' },
  { id: '1tGASO3e42Ty8votGyYkRlY1fiG-KiEmAa7VBq3KQuRo', label: 'アプリ台帳（管理用）', priority: 'B',
    note: 'ランチャーのアプリ一覧。失うと現場がアプリに辿り着けない' }
];

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
 * @param {{backupFolderId:string, keep:number, sourceIds:Array<string>, maxDelete:number}} opts
 * @return {{targets:Array, kept:number, aborted:boolean, reason:string, skipped:Object}}
 *
 * 削除候補になるのは、以下を **すべて** 満たすものだけ:
 *   ①親にバックアップフォルダを含む ②スプレッドシートである ③名前が _BAK_ 形式で読める
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

  var isSource = {};
  sourceIds.forEach(function (id) { isSource[String(id)] = true; });

  var skipped = {
    otherFolder: 0,      // 保存先フォルダの外にあった
    notSpreadsheet: 0,   // スプレッドシートではない
    notBackupName: 0,    // _BAK_ 形式ではない（原本・手作業のバックアップ・無関係ファイル）
    renamed: 0,          // _BAK_ で始まるが形が崩れている＝人が名前を触った
    manual: 0,           // 手動バックアップ
    isSource: 0          // ★原本そのもの
  };

  var groups = {};   // 原本名 → [{id, name, stamp}]
  (files || []).forEach(function (file) {
    var parents = file.parentIds || [];
    if (parents.indexOf(folderId) < 0) { skipped.otherFolder++; return; }
    if (String(file.mimeType) !== BK_SS_MIME) { skipped.notSpreadsheet++; return; }

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
    BACKUP_TARGETS: BACKUP_TARGETS,
    bkBuildBackupName_: bkBuildBackupName_,
    bkParseBackupName_: bkParseBackupName_,
    bkSelectStale_: bkSelectStale_
  };
}
