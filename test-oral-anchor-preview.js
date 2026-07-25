// 純関数テスト（実物ロード方式）: nextSetsumeMonths が元期(planStart)/終了(planEnd) から
// fromYM 以降の setsume 月を正しく返すこと。再実装せず _oral-plan-body.html の実関数を vm で読み込む。
// oralCycleAt も実物を読み込んで依存させる（byte一致の正本ロジックで判定）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '_oral-plan-body.html'), 'utf8');

// function <name>( ... ) { ... } を波括弧バランスで抽出
function extractFunction(s, name) {
  const start = s.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  const bodyOpen = s.indexOf('{', start);
  let depth = 0;
  for (let i = bodyOpen; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const code = extractFunction(src, 'oralCycleAt') + '\n' + extractFunction(src, 'nextSetsumeMonths');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.oralCycleAt=oralCycleAt; this.nextSetsumeMonths=nextSetsumeMonths;', ctx);
const nextSetsumeMonths = ctx.nextSetsumeMonths;

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, '\n    got ', g, '\n    want', w); }
};

// 1) 通常サイクル(2026-05起点)=毎3ヶ月の節目
eq('anchor 2026-05 → 直近4節目', nextSetsumeMonths('2026-05', '', '2026-05', 4),
   ['2026-07', '2026-10', '2027-01', '2027-04']);
// 2) 8月起点=初節目10月
eq('anchor 2026-08 → 直近3節目', nextSetsumeMonths('2026-08', '', '2026-08', 3),
   ['2026-10', '2027-01', '2027-04']);
// 3) planEnd で打ち切り（2026-07で終了）→ 節目1回のみ
eq('planEnd=2026-07 で打ち切り', nextSetsumeMonths('2026-05', '2026-07', '2026-05', 4),
   ['2026-07']);
// 4) fromYM が途中月（開始前月は節目にならない・以降のみ）
eq('fromYM=2026-08 以降のみ', nextSetsumeMonths('2026-05', '', '2026-08', 2),
   ['2026-10', '2027-01']);
// 5) 不正な元期（形式不一致）→ 空。月レンジ(01-12)検証はUIの type=month と oralCycleAt に委譲し、
//    ここでは正本 oralCycleAt と同じ /^\d{4}-\d{2}$/ 形式一致のみを契約とする。
eq('invalid planStart 空 → []', nextSetsumeMonths('', '', '2026-05', 4), []);
eq('planStart=2026-5(桁不足) → []', nextSetsumeMonths('2026-5', '', '2026-05', 4), []);
eq('planStart=abc → []', nextSetsumeMonths('abc', '', '2026-05', 4), []);
// 6) fromYM 省略時は planStart 起点
eq('fromYM 空 → planStart起点', nextSetsumeMonths('2026-05', '', '', 2), ['2026-07', '2026-10']);

console.log('\n' + (fail === 0 ? 'ALL GREEN' : fail + ' FAILED') + '  (pass=' + pass + ')');
process.exit(fail === 0 ? 0 : 1);
