// access_log の保持期間トリムと、既存シートの列移行計画の純関数検証。
// ★実物ロード方式: gas/yawaragi-board/access-log-core.js を require して本物を呼ぶ。
//   純関数をテスト側へ写すと、本体を直さなくても緑になり事故を見逃すため。
// 実行: node scripts/test-access-log-retention.js
var path = require('path');
var core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'access-log-core.js'));

var pass = 0, fail = 0;
function eq(actual, expected, msg) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n         期待: ' + b + '\n         実際: ' + a); }
}
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}

['computeAccessLogAgeTrim_', 'planAccessLogHeaderMigration_'].forEach(function (fn) {
  if (typeof core[fn] !== 'function') {
    console.log('!! ' + fn + ' が本物からロードできない。テストが無意味なので中断する。');
    process.exit(1);
  }
});

// テスト内で時刻を固定するため、基準日はすべて引数で渡す（Date.now は使わない）。
var NOW = new Date('2026-07-19T03:00:00+09:00');
function daysAgo(n) { return new Date(NOW.getTime() - n * 86400000); }

console.log('[1] 保持期間トリム（30日より古い行を削除）');
// timestamps は access_log の timestamp 列（ヘッダ除く・古い順）。
eq(core.computeAccessLogAgeTrim_([daysAgo(40), daysAgo(35), daysAgo(10), daysAgo(1)], NOW, { retentionDays: 30, headerRows: 1 }),
  { deleteStartRow: 2, deleteCount: 2 }, '★先頭2行が30日超 → 2行削除');
eq(core.computeAccessLogAgeTrim_([daysAgo(10), daysAgo(1)], NOW, { retentionDays: 30, headerRows: 1 }),
  null, '全部新しい → 削除なし');
eq(core.computeAccessLogAgeTrim_([], NOW, { retentionDays: 30, headerRows: 1 }),
  null, '空 → 削除なし');
eq(core.computeAccessLogAgeTrim_(null, NOW, { retentionDays: 30, headerRows: 1 }),
  null, 'null → 削除なし（落ちない）');
eq(core.computeAccessLogAgeTrim_([daysAgo(40), daysAgo(35)], NOW, { retentionDays: 30, headerRows: 1 }),
  { deleteStartRow: 2, deleteCount: 2 }, '全部古い → 全行削除（ヘッダは残す）');

console.log('[1-2] 境界（ちょうど30日）');
eq(core.computeAccessLogAgeTrim_([daysAgo(30)], NOW, { retentionDays: 30, headerRows: 1 }),
  null, '★30日ちょうどは残す（「より古い」が条件）');
eq(core.computeAccessLogAgeTrim_([new Date(NOW.getTime() - 30 * 86400000 - 1)], NOW, { retentionDays: 30, headerRows: 1 }),
  { deleteStartRow: 2, deleteCount: 1 }, '★30日+1ミリ秒は削除');

console.log('[1-3] 異常値でも安全側（消しすぎない）');
eq(core.computeAccessLogAgeTrim_(['', daysAgo(40), daysAgo(1)], NOW, { retentionDays: 30, headerRows: 1 }),
  null, '★先頭が日付でない → 何も消さない（並び順が壊れている可能性）');
eq(core.computeAccessLogAgeTrim_([daysAgo(40), 'こわれた行', daysAgo(1)], NOW, { retentionDays: 30, headerRows: 1 }),
  { deleteStartRow: 2, deleteCount: 1 }, '途中が壊れていたらそこで止める');
eq(core.computeAccessLogAgeTrim_([new Date('invalid'), daysAgo(1)], NOW, { retentionDays: 30, headerRows: 1 }),
  null, '不正なDate → 何も消さない');

console.log('[2] 既存シートの列移行計画（7列→8列・既存データ非破壊）');
var H8 = core.ACCESS_LOG_HEADER;
eq(core.planAccessLogHeaderMigration_(H8), { action: 'none' }, '★8列で一致 → 移行不要');
eq(core.planAccessLogHeaderMigration_(null), { action: 'create' }, 'シートなし → 新規作成');
eq(core.planAccessLogHeaderMigration_([]), { action: 'create' }, '空ヘッダ → 新規作成');
// origin だけが欠けている旧7列（2026-07-12 以前のデプロイで作られた形）
var H7 = ['timestamp', 'method', 'action', 'token_status', 'enforce', 'result', 'note'];
eq(core.planAccessLogHeaderMigration_(H7),
  { action: 'insertColumn', insertAt: 4, columnName: 'origin' },
  '★旧7列 → origin を4列目に挿入（既存値は右へずれるだけで消えない）');
ok(H8[3] === 'origin', '★挿入位置4は現行ヘッダの origin の位置と一致');

console.log('[2-2] 想定外のヘッダは自動でいじらない');
eq(core.planAccessLogHeaderMigration_(['なにか', 'べつの', 'シート']),
  { action: 'manual', reason: 'unexpected_header' },
  '★見知らぬヘッダ → 自動移行せず手動判断へ回す（他人のシートを壊さない）');
eq(core.planAccessLogHeaderMigration_(['timestamp', 'method']),
  { action: 'manual', reason: 'unexpected_header' },
  '短すぎるヘッダ → 手動判断へ');

console.log('');
console.log('=========================================');
console.log('  pass: ' + pass + ' / fail: ' + fail);
console.log('=========================================');
process.exit(fail === 0 ? 0 : 1);
