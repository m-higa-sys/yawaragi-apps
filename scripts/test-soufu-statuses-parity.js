// SOUFU_STATUSES の二重定義ドリフト検知（2026-08-05）
//
// コード.js の SOUFU_STATUSES（upsert のバリデーション）と
// soufu-status-core.js の SOUFU_STATUSES_（状態遷移の純関数）は同じ内容でなければならない。
// ズレると「画面からは送れるのに upsert が弾く」「その逆」が起きる。
// GAS のグローバル var は宣言順の都合で片方から片方を参照できないため、
// 実体は2つ持ったまま、この一致テストで見張る。
//
// 実行: node scripts/test-soufu-statuses-parity.js
const fs = require('fs');
const path = require('path');

const GAS = path.join(__dirname, '..', 'gas', 'yawaragi-board');
const codeJs = fs.readFileSync(path.join(GAS, 'コード.js'), 'utf8');
const core = require(path.join(GAS, 'soufu-status-core.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
};

const m = codeJs.match(/var SOUFU_STATUSES = (\[[^\]]*\]);/);
ok('コード.js に SOUFU_STATUSES の定義が1つある', !!m);

if (m) {
  const fromCode = JSON.parse(m[1].replace(/'/g, '"'));
  const fromCore = core.SOUFU_STATUSES_;
  console.log('    コード.js : ' + JSON.stringify(fromCode));
  console.log('    core      : ' + JSON.stringify(fromCore));
  ok('2つの定義が完全一致', JSON.stringify(fromCode) === JSON.stringify(fromCore));
  ok("'保留' が含まれている", fromCode.indexOf('保留') >= 0);
  ok("既存の '揃った' が消えていない", fromCode.indexOf('揃った') >= 0);
  ok("既存の '送付済' が消えていない", fromCode.indexOf('送付済') >= 0);
}

// 旧実装の地雷（else で送付済決め打ち）がコード.js に残っていないこと
ok('コード.js の upsert が純関数 soufuNextRow_ を呼んでいる', /var usNext = soufuNextRow_\(/.test(codeJs));
ok("旧 else 決め打ち（usNext.status = '送付済'）が残っていない",
   !/\}\s*else\s*\{\s*\n\s*usNext\.status = '送付済';/.test(codeJs));

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
