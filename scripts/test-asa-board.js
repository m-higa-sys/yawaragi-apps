// 朝ボード判定 純関数テスト
// 実行: node scripts/test-asa-board.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'asa-board-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }

// ===== A. abNormalizeName_（名寄せ正規化＝全突合キーの唯一の正） =====
eq(core.abNormalizeName_('山田 太郎'), '山田太郎', 'A1: 半角スペース除去');
eq(core.abNormalizeName_('山田　太郎'), '山田太郎', 'A2: 全角スペース除去');
eq(core.abNormalizeName_('山田太郎 様'), '山田太郎', 'A3: 末尾「様」除去');
eq(core.abNormalizeName_('ﾔﾏﾀﾞ'), 'ヤマダ', 'A4: NFKC半角カナ→全角');
eq(core.abNormalizeName_(null), '', 'A5: null→空文字(落ちない)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
