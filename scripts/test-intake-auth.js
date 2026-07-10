// intake adminKey 認証 純コアテスト
// 対象: gas/yawaragi-board/intake-auth-core.js（intakeAuthOk_ / INTAKE_ADMIN_KEY_PROP）
// 実行: node scripts/test-intake-auth.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'intake-auth-core.js'));
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

console.log('[intakeAuthOk_] 一致時のみ true（fail-closed）');
ok(core.intakeAuthOk_('key-abc', 'key-abc') === true,  '両方非空で一致→true');
ok(core.intakeAuthOk_('key-abc', 'key-xyz') === false, '不一致→false');
ok(core.intakeAuthOk_('', 'key-abc')       === false, '提供キー空→false');
ok(core.intakeAuthOk_('key-abc', '')       === false, '★設定キー未設定(空)→false（fail-closed）');
ok(core.intakeAuthOk_('key-abc', null)     === false, '設定キーnull→false');
ok(core.intakeAuthOk_('key-abc', undefined) === false,'設定キーundefined→false');
ok(core.intakeAuthOk_(null, 'key-abc')     === false, '提供キーnull→false');
ok(core.intakeAuthOk_(undefined, undefined) === false,'両方undefined→false');
ok(core.intakeAuthOk_('', '')              === false, '両方空→false');
ok(core.intakeAuthOk_(' key-abc', 'key-abc') === false, '前後空白は不一致扱い→false（厳密一致）');
ok(core.intakeAuthOk_('KEY-ABC', 'key-abc') === false, '大文字小文字差→false');

console.log('\n[INTAKE_ADMIN_KEY_PROP]');
ok(core.INTAKE_ADMIN_KEY_PROP === 'INTAKE_ADMIN_KEY', 'プロパティ名=INTAKE_ADMIN_KEY');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
