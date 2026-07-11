// furikae ③連絡記録 GAS純コアテスト
// 対象: furikae-contact-core.js（furikaeContactValid_ / furikaeContactRow_ / ヘッダ）
// 実行: node scripts/test-furikae-contact.js

const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'furikae-contact-core.js'));

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n    expected ' + e + '\n    actual   ' + a); }
}
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

console.log('[furikaeContactValid_]');
ok(core.furikaeContactValid_({ customerId: '149' }) === true, '顧客番号あり→有効');
ok(core.furikaeContactValid_({ name: 'ﾑﾗﾀｷﾐｴ' }) === true, '氏名あり→有効');
ok(core.furikaeContactValid_({ customerId: '', name: '' }) === false, '両方空→無効');
ok(core.furikaeContactValid_({}) === false, '空→無効');
ok(core.furikaeContactValid_(null) === false, 'null→無効(落ちない)');

console.log('\n[furikaeContactRow_]');
const now = '2026-07-10T09:00:00Z'; // now は呼び出し側が渡す（純関数・テスト可能）
const row = core.furikaeContactRow_(now, { customerId: '149', name: 'ﾑﾗﾀｷﾐｴ', month: '2026-06', method: '電話', operator: '下浦', note: '家族に連絡' });
eq(row, [now, '149', 'ﾑﾗﾀｷﾐｴ', '2026-06', '電話', '下浦', '家族に連絡'], '列順=[日時,顧客番号,氏名,対象月,手段,連絡者,メモ]');
const row2 = core.furikaeContactRow_(now, { customerId: '151' });
eq(row2, [now, '151', '', '', '', '', ''], '欠損は空文字で埋める（落ちない）');

console.log('\n[FNK_CONTACT_HEADER]');
eq(core.FNK_CONTACT_HEADER, ['記録日時', '顧客番号', '氏名', '対象月', '連絡手段', '連絡者', 'メモ'], 'ヘッダ7列');
ok(core.FNK_CONTACT_SHEET === 'furikae連絡履歴', 'シート名=furikae連絡履歴');
ok(core.FNK_CONTACT_HEADER.length === core.furikaeContactRow_(now, {}).length, 'ヘッダ列数=行列数（整合）');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
