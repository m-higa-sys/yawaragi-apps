// setupLineToken() の誤実行ガード（純関数 isValidLineTokenValue_）のテスト
// 実行: node scripts/test-shift-kibou-line-token-guard.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'gas', 'shift-kibou', 'コード.js');
const src = fs.readFileSync(SRC, 'utf8');

// GAS本体はブラウザAPI前提なので、対象の純関数だけを抜き出して評価する
const m = src.match(/function isValidLineTokenValue_\([\s\S]*?\n\}/);
assert.ok(m, 'isValidLineTokenValue_ が コード.js に見つからない');
const isValidLineTokenValue_ = new Function(m[0] + '; return isValidLineTokenValue_;')();

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' → ' + e.message); }
}

console.log('isValidLineTokenValue_');
// 誤実行で通知を壊す入力は、すべて拒否されなければならない
t('引数なし（undefined）は拒否', () => assert.strictEqual(isValidLineTokenValue_(undefined), false));
t('null は拒否', () => assert.strictEqual(isValidLineTokenValue_(null), false));
t('空文字は拒否', () => assert.strictEqual(isValidLineTokenValue_(''), false));
t('空白のみは拒否', () => assert.strictEqual(isValidLineTokenValue_('   '), false));
t('短すぎる文字列は拒否', () => assert.strictEqual(isValidLineTokenValue_('abc123'), false));
t('文字列以外（数値）は拒否', () => assert.strictEqual(isValidLineTokenValue_(12345), false));
t('文字列以外（オブジェクト）は拒否', () => assert.strictEqual(isValidLineTokenValue_({}), false));
// 実トークン相当（172文字）は受理する
t('172文字のトークン相当は受理', () => assert.strictEqual(isValidLineTokenValue_('A'.repeat(172)), true));
t('前後に空白があっても受理', () => assert.strictEqual(isValidLineTokenValue_('  ' + 'A'.repeat(172) + '  '), true));
t('境界: 99文字は拒否', () => assert.strictEqual(isValidLineTokenValue_('A'.repeat(99)), false));
t('境界: 100文字は受理', () => assert.strictEqual(isValidLineTokenValue_('A'.repeat(100)), true));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
