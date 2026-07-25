// 純関数テスト（実物ロード方式）: oralNextCreation が「今日以降の次の作成月（節目）」を返すこと。
// 再実装せず oral-plan.html の実関数 oralCycleAt / nextSetsumeMonths / oralNextCreation を vm で抽出実行する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'oral-plan.html'), 'utf8');

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

const code = ['oralCycleAt', 'nextSetsumeMonths', 'oralNextCreation'].map(n => extractFunction(src, n)).join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.oralNextCreation=oralNextCreation; this.nextSetsumeMonths=nextSetsumeMonths;', ctx);
const oralNextCreation = ctx.oralNextCreation;

// 二重定義防止の実測: oralNextCreation 本体が nextSetsumeMonths を呼び、独自ループ(oralCycleAt直呼び)を持たないこと
const oncBody = extractFunction(src, 'oralNextCreation');
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, '\n    got ', g, '\n    want', w); }
};
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

// 完了条件の判定値（planStart=2026-05・3ヶ月ごと前進）
eq('curYM=2026-07 → 当月true', oralNextCreation('2026-05', '', '2026-07'), { ym: '2026-07', isThisMonth: true });
eq('curYM=2026-08 → 2026-10', oralNextCreation('2026-05', '', '2026-08'), { ym: '2026-10', isThisMonth: false });
eq('curYM=2026-11 → 2027-01', oralNextCreation('2026-05', '', '2026-11'), { ym: '2027-01', isThisMonth: false });
eq('curYM=2027-02 → 2027-04', oralNextCreation('2026-05', '', '2027-02'), { ym: '2027-04', isThisMonth: false });
// 節目当月ちょうど（10月）→ 当月true
eq('curYM=2026-10 → 当月true', oralNextCreation('2026-05', '', '2026-10'), { ym: '2026-10', isThisMonth: true });
// 非表示ケース
eq('planStart 空 → ""', oralNextCreation('', '', '2026-07'), '');
eq('planEnd=2026-07 到達後 → ""', oralNextCreation('2026-05', '2026-07', '2026-08'), '');
eq('形式不正 → ""', oralNextCreation('2026-5', '', '2026-07'), '');

// nextSetsumeMonths を再利用（同ロジック二重定義なし）を実測
ok('nextSetsumeMonths を再利用している', /nextSetsumeMonths\s*\(/.test(oncBody));
ok('oralNextCreation に oralCycleAt 直呼びの独自ループが無い', !/oralCycleAt\s*\(/.test(oncBody));

console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILED') + '  (pass=' + pass + ')');
process.exit(fail === 0 ? 0 : 1);
