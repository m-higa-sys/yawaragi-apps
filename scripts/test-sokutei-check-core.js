// セッションボード測定チェック 純関数テスト（要支援・重複ガード/取消判定）— 素node
// 実行: node scripts/test-sokutei-check-core.js
// 対象: gas/yawaragi-board/sokutei-check-core.js（GAS/Node両対応の純関数）
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'sokutei-check-core.js'));

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + name); } }
function eq(name, a, b) { ok(name + ' (got ' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b)); }

const M = core.shienAlreadyMeasuredThisMonth_;
const F = core.findCancelableShienRow_;

// 行形: [name, care, sokutei_date, sokutei_by, source, note, createdAt]
function row(name, date, by, source) { return [name, '事業対象', date, by || '比嘉', source || 'app', '', '2026-07-13 10:00:00']; }

// ===== A. shienAlreadyMeasuredThisMonth_（記録の重複ガード・source横断） =====
ok('A1 空記録は未実施', M([], '田中 太郎', '2026-07') === false);
ok('A2 同月同人(別日)は実施済み', M([row('田中 太郎', '2026-07-05')], '田中 太郎', '2026-07') === true);
ok('A3 別月は未実施', M([row('田中 太郎', '2026-06-30')], '田中 太郎', '2026-07') === false);
ok('A4 別人は未実施', M([row('鈴木 花子', '2026-07-05')], '田中 太郎', '2026-07') === false);
ok('A5 名寄せ(様/空白)一致で実施済み', M([row('田中太郎', '2026-07-05')], '田中 太郎 様', '2026-07') === true);
ok('A6 source=appでも横断で弾く', M([row('田中 太郎', '2026-07-05', '林', 'app')], '田中 太郎', '2026-07') === true);
ok('A7 source=セッションボードでも弾く', M([row('田中 太郎', '2026-07-05', '林', 'セッションボード')], '田中 太郎', '2026-07') === true);
ok('A8 当月内の複数行でも実施済み', M([row('田中 太郎', '2026-07-01'), row('田中 太郎', '2026-07-20')], '田中 太郎', '2026-07') === true);

// ===== B. findCancelableShienRow_（取消=セッションボード発・当日のみ） =====
const today = '2026-07-13';
ok('B1 該当なしは-1', F([], '田中 太郎', today) === -1);
ok('B2 セッションボード発・当日はindex返す', F([row('田中 太郎', today, '比嘉', 'セッションボード')], '田中 太郎', today) === 0);
ok('B3 app発は取消不可(-1)', F([row('田中 太郎', today, '比嘉', 'app')], '田中 太郎', today) === -1);
ok('B4 別日(昨日)のセッションボード発は取消不可', F([row('田中 太郎', '2026-07-12', '比嘉', 'セッションボード')], '田中 太郎', today) === -1);
ok('B5 別人のセッションボード発は取消不可', F([row('鈴木 花子', today, '比嘉', 'セッションボード')], '田中 太郎', today) === -1);
ok('B6 複数該当は最後(最新)のindex', F([row('田中 太郎', today, '比嘉', 'セッションボード'), row('別人', today, '林', 'app'), row('田中 太郎', today, '林', 'セッションボード')], '田中 太郎', today) === 2);
ok('B7 名寄せ一致で取消可', F([row('田中太郎', today, '比嘉', 'セッションボード')], '田中 太郎 様', today) === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
