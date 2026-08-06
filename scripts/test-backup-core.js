// スプレッドシート・バックアップ機構 純関数テスト（2026-08-06）
//
// 何を守るか:
//  ★最優先: 「バックアップの仕組みがデータを消す」を絶対に起こさないこと。
//    世代削除の選定関数が、対象外のファイル（原本／手動バックアップ／無関係ファイル／
//    別フォルダのファイル／人が名前を書き換えたもの）を1件も選ばないことを実証する。
//    削除は呼び出し側で「ゴミ箱へ入れる」だけだが、それでも原本が入れば業務は止まる。
//  ②手動分と自動分がファイル名で区別できること（要件）。
//  ③世代管理が「同じ原本ごとに」独立して数えられること。
//
// 実行: node scripts/test-backup-core.js
const path = require('path');
const GAS = path.join(__dirname, '..', 'gas', 'yawaragi-board');
const core = require(path.join(GAS, 'backup-core.js'));

const buildName = core.bkBuildBackupName_;
const parseName = core.bkParseBackupName_;
const selectStale = core.bkSelectStale_;
const TARGETS = core.BACKUP_TARGETS;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}

const SS_MIME = 'application/vnd.google-apps.spreadsheet';
const BK_FOLDER = 'FOLDER_BACKUP';
const GENBA_SS = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';  // 原本（利用者台帳）

// バックアップフォルダ直下にある普通のスプレッドシートのひな形
function f(over) {
  return Object.assign({
    id: 'id-' + Math.random().toString(36).slice(2, 8),
    name: '_BAK_週次_利用者台帳_2026-08-01_0400',
    mimeType: SS_MIME,
    parentIds: [BK_FOLDER]
  }, over || {});
}
const opts = (over) => Object.assign({
  backupFolderId: BK_FOLDER, keep: 2, sourceIds: [GENBA_SS], maxDelete: 20
}, over || {});
const idsOf = (r) => r.targets.map(t => t.id).sort();

console.log('\n[A) 命名 — 手動分と自動分がファイル名で区別できる]');
{
  ok('A1 手動分の名前', buildName('manual', '利用者台帳', '2026-08-06_1830')
     === '_BAK_手動_利用者台帳_2026-08-06_1830');
  ok('A2 週次分の名前', buildName('auto', '利用者台帳', '2026-08-06_0400')
     === '_BAK_週次_利用者台帳_2026-08-06_0400');

  const p = parseName('_BAK_週次_利用者台帳_2026-08-06_0400');
  ok('A3 往復して同じ値に戻る',
     p && p.kind === 'auto' && p.title === '利用者台帳' && p.stamp === '2026-08-06_0400',
     JSON.stringify(p));

  ok('A4 プレフィックスが無い名前は「バックアップではない」', parseName('利用者台帳') === null);
  ok('A5 原本と紛らわしい名前も弾く', parseName('利用者台帳_backup_20260803') === null);
  ok('A6 種別が未知なら弾く', parseName('_BAK_月次_利用者台帳_2026-08-06_0400') === null);
  ok('A7 日時の形が違えば弾く', parseName('_BAK_週次_利用者台帳_20260806') === null);
  ok('A8 後ろに文字が付いたら弾く（人が「のコピー」を付けた等）',
     parseName('_BAK_週次_利用者台帳_2026-08-06_0400 のコピー') === null);

  const q = parseName(buildName('auto', '清掃・準備チェック表_データ', '2026-08-06_0400'));
  ok('A9 原本名に「_」が含まれても往復する',
     q && q.title === '清掃・準備チェック表_データ' && q.stamp === '2026-08-06_0400', JSON.stringify(q));
  ok('A10 空の名前は弾く', parseName('') === null && parseName(null) === null);
}

console.log('\n[B) 世代管理 — 原本ごとに独立して数え、古いものから外す]');
{
  const files = [
    f({ id: 'a1', name: '_BAK_週次_利用者台帳_2026-08-01_0400' }),
    f({ id: 'a2', name: '_BAK_週次_利用者台帳_2026-08-08_0400' }),
    f({ id: 'a3', name: '_BAK_週次_利用者台帳_2026-08-15_0400' }),
    f({ id: 'a4', name: '_BAK_週次_利用者台帳_2026-08-22_0400' })
  ];
  const r = selectStale(files, opts({ keep: 2 }));
  ok('B1 keep=2 なら古い2件だけが対象', idsOf(r).join(',') === 'a1,a2', JSON.stringify(idsOf(r)));
  ok('B2 残す世代の情報も返す（報告に使う）', r.kept === 2, JSON.stringify(r));

  const r2 = selectStale(files.slice(0, 2), opts({ keep: 2 }));
  ok('B3 keep 以内なら0件', r2.targets.length === 0, JSON.stringify(idsOf(r2)));

  const mixed = files.concat([
    f({ id: 'b1', name: '_BAK_週次_シフト希望_2026-08-01_0400' }),
    f({ id: 'b2', name: '_BAK_週次_シフト希望_2026-08-08_0400' })
  ]);
  const r3 = selectStale(mixed, opts({ keep: 2 }));
  ok('B4 原本ごとに独立して数える（シフト希望は2件so残る）',
     idsOf(r3).join(',') === 'a1,a2', JSON.stringify(idsOf(r3)));

  ok('B5 keep=0 は許さない（全滅を防ぐ・設定ミスで消えないように）', (() => {
    try { selectStale(files, opts({ keep: 0 })); return false; } catch (e) { return true; }
  })());
}

console.log('\n[C) ★削除ガード — 対象外のファイルには絶対に及ばない]');
{
  const many = [
    f({ id: 'm1', name: '_BAK_手動_利用者台帳_2026-08-01_1000' }),
    f({ id: 'm2', name: '_BAK_手動_利用者台帳_2026-08-02_1000' }),
    f({ id: 'm3', name: '_BAK_手動_利用者台帳_2026-08-03_1000' }),
    f({ id: 'm4', name: '_BAK_手動_利用者台帳_2026-08-04_1000' })
  ];
  ok('C1 手動バックアップは何世代あっても対象にしない（作業前の復元点を機械が消さない）',
     selectStale(many, opts({ keep: 1 })).targets.length === 0);

  const withOriginals = [
    f({ id: 'a1', name: '_BAK_週次_利用者台帳_2026-08-01_0400' }),
    f({ id: 'a2', name: '_BAK_週次_利用者台帳_2026-08-08_0400' }),
    f({ id: 'a3', name: '_BAK_週次_利用者台帳_2026-08-15_0400' }),
    f({ id: 'x1', name: '利用者台帳' }),                       // 原本と同名の何か
    f({ id: 'x2', name: '利用者台帳_backup_20260803' }),        // 手作業の旧バックアップ
    f({ id: 'x3', name: 'メモ' })
  ];
  const rc2 = selectStale(withOriginals, opts({ keep: 1 }));
  ok('C2 プレフィックスが無いファイルは対象にしない',
     idsOf(rc2).join(',') === 'a1,a2', JSON.stringify(idsOf(rc2)));

  const otherFolder = [
    f({ id: 'a1', name: '_BAK_週次_利用者台帳_2026-08-01_0400' }),
    f({ id: 'a2', name: '_BAK_週次_利用者台帳_2026-08-08_0400' }),
    f({ id: 'o1', name: '_BAK_週次_利用者台帳_2026-07-01_0400', parentIds: ['ほかのフォルダ'] }),
    f({ id: 'o2', name: '_BAK_週次_利用者台帳_2026-07-08_0400', parentIds: [] })
  ];
  const rc3 = selectStale(otherFolder, opts({ keep: 1 }));
  ok('C3 バックアップフォルダの外にあるものは対象にしない（名前が合っていても）',
     idsOf(rc3).join(',') === 'a1', JSON.stringify(idsOf(rc3)));

  const notSheets = [
    f({ id: 'a1', name: '_BAK_週次_利用者台帳_2026-08-01_0400' }),
    f({ id: 'a2', name: '_BAK_週次_利用者台帳_2026-08-08_0400' }),
    f({ id: 'd1', name: '_BAK_週次_利用者台帳_2026-07-01_0400', mimeType: 'application/vnd.google-apps.folder' }),
    f({ id: 'd2', name: '_BAK_週次_利用者台帳_2026-07-08_0400', mimeType: 'application/pdf' })
  ];
  const rc4 = selectStale(notSheets, opts({ keep: 1 }));
  ok('C4 スプレッドシート以外は対象にしない',
     idsOf(rc4).join(',') === 'a1', JSON.stringify(idsOf(rc4)));

  const withSource = [
    f({ id: GENBA_SS, name: '_BAK_週次_利用者台帳_2026-01-01_0400' }),  // 原本がなぜかここに居る
    f({ id: 'a1', name: '_BAK_週次_利用者台帳_2026-08-01_0400' }),
    f({ id: 'a2', name: '_BAK_週次_利用者台帳_2026-08-08_0400' })
  ];
  const rc5 = selectStale(withSource, opts({ keep: 1 }));
  ok('C5 ★原本IDと一致するものは、名前が何であっても対象にしない',
     idsOf(rc5).join(',') === 'a1', JSON.stringify(idsOf(rc5)));

  const renamed = [
    f({ id: 'a1', name: '_BAK_週次_利用者台帳_2026-08-01_0400' }),
    f({ id: 'a2', name: '_BAK_週次_利用者台帳_2026-08-08_0400' }),
    f({ id: 'r1', name: '_BAK_週次_利用者台帳_2026-07-01_0400（大事・消さないで）' })
  ];
  const rc6 = selectStale(renamed, opts({ keep: 1 }));
  ok('C6 人が名前を書き換えたものは対象にしない（＝「残したい」の意思表示を尊重）',
     idsOf(rc6).join(',') === 'a1', JSON.stringify(idsOf(rc6)));

  const tooMany = [];
  for (let i = 1; i <= 12; i++) {
    tooMany.push(f({ id: 't' + i, name: '_BAK_週次_利用者台帳_2026-0' + (i < 10 ? '1-0' + i : '2-0' + (i - 9)) + '_0400' }));
  }
  const rc7 = selectStale(tooMany, opts({ keep: 2, maxDelete: 3 }));
  ok('C7 ★上限を超えたら1件も選ばずに中断する（暴走時に全部消えない）',
     rc7.aborted === true && rc7.targets.length === 0, JSON.stringify(rc7));
  ok('C8 中断の理由を返す（ログに出して人が気づけるように）',
     typeof rc7.reason === 'string' && rc7.reason.length > 0, JSON.stringify(rc7.reason));

  ok('C9 保存先フォルダIDが空なら実行させない（全ファイルが「親一致」扱いになる事故を防ぐ）', (() => {
    try { selectStale([f({})], opts({ backupFolderId: '' })); return false; } catch (e) { return true; }
  })());

  // 全部入り: 対象になるのは a1 だけ
  const soup = [
    f({ id: 'a1', name: '_BAK_週次_利用者台帳_2026-08-01_0400' }),   // ← 唯一の対象
    f({ id: 'a2', name: '_BAK_週次_利用者台帳_2026-08-08_0400' }),   // 最新so残す
    f({ id: 'm1', name: '_BAK_手動_利用者台帳_2026-08-02_1000' }),   // 手動
    f({ id: 'x1', name: '利用者台帳' }),                             // 原本と同名
    f({ id: GENBA_SS, name: '_BAK_週次_利用者台帳_2026-01-01_0400' }),// 原本そのもの
    f({ id: 'o1', name: '_BAK_週次_利用者台帳_2026-07-01_0400', parentIds: ['よそ'] }),
    f({ id: 'd1', name: '_BAK_週次_利用者台帳_2026-07-02_0400', mimeType: 'application/pdf' }),
    f({ id: 'r1', name: '_BAK_週次_利用者台帳_2026-07-03_0400 のコピー' }),
    f({ id: 'b1', name: '_BAK_週次_シフト希望_2026-08-01_0400' })    // 別原本・1世代so残す
  ];
  const rc10 = selectStale(soup, opts({ keep: 1 }));
  ok('C10 ★全部混ぜても選ばれるのは想定の1件だけ',
     idsOf(rc10).join(',') === 'a1', JSON.stringify(idsOf(rc10)));
  ok('C11 除外の内訳を返す（何を守ったかをログで見せる）',
     rc10.skipped && rc10.skipped.notBackupName === 1 && rc10.skipped.manual === 1
     && rc10.skipped.otherFolder === 1 && rc10.skipped.notSpreadsheet === 1
     && rc10.skipped.isSource === 1 && rc10.skipped.renamed === 1,
     JSON.stringify(rc10.skipped));
}

console.log('\n[D) 対象シートの定義]');
{
  ok('D1 対象が定義されている', Array.isArray(TARGETS) && TARGETS.length > 0);
  ok('D2 各対象に id / label / priority がある',
     TARGETS.every(t => t.id && t.label && t.priority));
  const ids = TARGETS.map(t => t.id);
  ok('D3 IDに重複が無い（同じシートを二重にコピーしない）', new Set(ids).size === ids.length);
  ok('D4 IDはスプレッドシートIDの形をしている', ids.every(id => /^[-\w]{25,60}$/.test(id)));
  ok('D5 利用者台帳（板の統合シート）が含まれている', ids.indexOf(GENBA_SS) >= 0);
  ok('D6 最優先(A)が1件以上ある', TARGETS.some(t => t.priority === 'A'));
}

console.log('\n===== PASS ' + pass + ' / FAIL ' + fail + ' =====');
process.exit(fail ? 1 : 0);
