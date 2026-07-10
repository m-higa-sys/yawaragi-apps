// intakeフェーズ遷移履歴 GAS純コアテスト
// 対象: gas/yawaragi-board/intake-phase-history-core.js
//   （parsePhaseHistory_ / appendPhaseHistory_ / INTAKE_PHASE_HISTORY_HEADER）
// 実行: node scripts/test-intake-phase-history.js

const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'intake-phase-history-core.js'));

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n    expected ' + e + '\n    actual   ' + a); }
}
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

console.log('[parsePhaseHistory_] 壊れていても落ちず配列を返す');
eq(core.parsePhaseHistory_(''), [], '空文字→[]');
eq(core.parsePhaseHistory_(null), [], 'null→[]');
eq(core.parsePhaseHistory_(undefined), [], 'undefined→[]');
eq(core.parsePhaseHistory_('[{"to":"受付","at":"t"}]'), [{ to: '受付', at: 't' }], '正常JSON配列→パース');
eq(core.parsePhaseHistory_('こわれ'), [], '不正JSON→[]（落ちない）');
eq(core.parsePhaseHistory_('5'), [], '非配列JSON(数値)→[]');
eq(core.parsePhaseHistory_('{"a":1}'), [], '非配列JSON(オブジェクト)→[]');
eq(core.parsePhaseHistory_([{ to: '受付' }]), [{ to: '受付' }], '既に配列→そのまま配列');
const srcArr = [{ to: '受付' }];
ok(core.parsePhaseHistory_(srcArr) !== srcArr, '配列入力はコピーを返す（参照非共有）');

console.log('\n[appendPhaseHistory_] 追記型でJSON文字列を返す');
const created = core.appendPhaseHistory_('', { to: '受付', at: '2026-07-10T00:00:00Z' });
eq(JSON.parse(created), [{ to: '受付', at: '2026-07-10T00:00:00Z' }], '空→初期履歴[{to:受付,at}]');
const adv1 = core.appendPhaseHistory_(created, { from: '受付', to: '見学', at: 't2', by: '比嘉' });
eq(JSON.parse(adv1), [
  { to: '受付', at: '2026-07-10T00:00:00Z' },
  { from: '受付', to: '見学', at: 't2', by: '比嘉' }
], 'advance追記で2件・順序保持');
const broken = core.appendPhaseHistory_('こわれ', { to: 'X', at: 't' });
eq(JSON.parse(broken), [{ to: 'X', at: 't' }], '既存が壊れていても新規1件から開始（落ちない）');
ok(typeof created === 'string', '返り値はJSON文字列（シート保存用）');

console.log('\n[統合シナリオ] create→advance×2→drop で4エントリ');
let h = core.appendPhaseHistory_('', { to: '受付', at: 't0' });
h = core.appendPhaseHistory_(h, { from: '受付', to: '見学', at: 't1', by: '登録者A' });
h = core.appendPhaseHistory_(h, { from: '見学', to: '体験', at: 't2', by: '登録者A' });
h = core.appendPhaseHistory_(h, { from: '体験', to: 'ドロップ', at: 't3', by: '登録者A', reason: '他事業所へ' });
const parsed = JSON.parse(h);
ok(parsed.length === 4, '4エントリ積まれる');
eq(parsed[0], { to: '受付', at: 't0' }, '[0]=create初期履歴（from/byなし）');
eq(parsed[3], { from: '体験', to: 'ドロップ', at: 't3', by: '登録者A', reason: '他事業所へ' }, '[3]=drop（reason含む）');

console.log('\n[INTAKE_PHASE_HISTORY_HEADER]');
ok(core.INTAKE_PHASE_HISTORY_HEADER === 'フェーズ遷移履歴', 'ヘッダ名=フェーズ遷移履歴');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
