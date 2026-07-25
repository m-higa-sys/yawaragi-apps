// 純関数テスト（実物ロード方式）: _digestYarinokoshi_ が月次ボード出力から
// 「今月のやり残し」を氏名付きで抽出すること。再実装せず gas/yawaragi-board/コード.js の実関数を vm 抽出。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');

function extractFunction(s, name) {
  const start = s.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  const open = s.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractFunction(src, '_digestYarinokoshi_') + '\nthis._digestYarinokoshi_=_digestYarinokoshi_;', ctx);
const digest = ctx._digestYarinokoshi_;

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, '\n    got ', g, '\n    want', w); }
};
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

// 未あり／未0／空セクション混在
const board = {
  month: '2026-07',
  sections: [
    { key: 'oralPlan', label: '口腔計画書', targets: [
      { userId: 'u1', name: 'アイウ', done: false },
      { userId: 'u2', name: 'カキク', done: true }
    ] },
    { key: 'kunPlan', label: '個訓計画書', targets: [
      { userId: 'u3', name: 'サシス', done: true }        // 全済 → 出ない
    ] },
    { key: 'sokuteiShien', label: '測定(要支援等)', targets: [
      { userId: 'u4', name: 'タチツ', done: false }
    ] },
    { key: 'tsushoPlan', label: '通所介護計画書', targets: [] }  // 空 → 出ない
  ],
  warnings: [
    { type: 'neverMeasured', userId: 'u4', name: 'タチツ' },
    { type: 'noDueDate', userId: 'u5', name: 'ナニヌ' },
    { type: 'other', userId: 'u6', name: 'ハヒフ' }          // 無視
  ]
};
const r = digest(board);

eq('month 透過', r.month, '2026-07');
eq('totalUndone = 全未合計', r.totalUndone, 2);
ok('domains は未のある2分野のみ（未0/空は除外）', r.domains.length === 2);
eq('domains keys', r.domains.map(d => d.key), ['oralPlan', 'sokuteiShien']);
eq('oralPlan の未氏名', r.domains[0].undone, [{ userId: 'u1', name: 'アイウ' }]);
eq('oralPlan count', r.domains[0].count, 1);
eq('warnings.neverMeasured 振り分け', r.warnings.neverMeasured, [{ userId: 'u4', name: 'タチツ' }]);
eq('warnings.noDueDate 振り分け', r.warnings.noDueDate, [{ userId: 'u5', name: 'ナニヌ' }]);
ok('未知type warning は含めない', !JSON.stringify(r.warnings).includes('ハヒフ'));

// 全済 → domains 空・totalUndone 0
const allDone = { month: '2026-07', sections: [
  { key: 'oralPlan', label: '口腔計画書', targets: [{ userId: 'a', name: 'X', done: true }] },
  { key: 'kunEval', label: '個訓評価', targets: [{ userId: 'b', name: 'Y', done: true }] }
], warnings: [] };
const r2 = digest(allDone);
eq('全済 → domains 空', r2.domains, []);
eq('全済 → totalUndone 0', r2.totalUndone, 0);
eq('全済 → warnings 空2種', r2.warnings, { neverMeasured: [], noDueDate: [] });

// 防御: 空/欠損入力
eq('空board → 安全既定', digest({}), { month: undefined, totalUndone: 0, domains: [], warnings: { neverMeasured: [], noDueDate: [] } });

console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILED') + '  (pass=' + pass + ')');
process.exit(fail === 0 ? 0 : 1);
