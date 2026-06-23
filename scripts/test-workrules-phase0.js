// Phase 0 回帰テスト: 出力不変の実証
// 変更前(baseline=DEFAULT_PATTERNS版)と変更後(WORK_RULES版)の shift-create.html を
// それぞれ vm 上で実行し、initShiftData の出力を 2026-05/06/07 × blankMode(false/true) で
// 全セル比較する。全セル diff=0 で合格(exit 0)、1セルでも差異があれば不合格(exit 1)。
//
// 使い方: node scripts/test-workrules-phase0.js <baseline.html> <working.html>
//   baseline は通常 `git show HEAD:shift-create.html > /c/tmp/base.html` で用意。

const fs = require("fs");
const vm = require("vm");

const baselinePath = process.argv[2];
const workingPath  = process.argv[3];
if (!baselinePath || !workingPath) {
  console.error("usage: node test-workrules-phase0.js <baseline.html> <working.html>");
  process.exit(2);
}

const MONTHS = ["2026-05", "2026-06", "2026-07"];
const MODES = [false, true];

// HTMLから<script>本体を取り出す（このファイルは単一のメイン<script>）
function extractScript(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no <script> block");
  return m[1];
}

// DOM等を最小モック。startup実行が落ちても、その前に定義済みのconst/functionは
// 同一コンテキスト内で参照できる（initShiftDataはクロージャ越しに定数を見る）。
function makeFakeEl() {
  const f = function () { return f; };
  return new Proxy(f, {
    get(_t, k) {
      if (k === "length") return 0;
      if (k === "style") return makeFakeEl();
      if (k === "value") return "2026-06";
      if (k === "classList") return { add(){}, remove(){}, toggle(){} };
      return f;
    },
    set() { return true; },
    apply() { return f; }
  });
}
function makeContext() {
  const localStorage = { length: 0, getItem: () => null, setItem(){}, removeItem(){}, key: () => null };
  const document = {
    getElementById: () => makeFakeEl(),
    createElement: () => makeFakeEl(),
    querySelector: () => makeFakeEl(),
    querySelectorAll: () => [],
    head: makeFakeEl(), body: makeFakeEl(),
    addEventListener(){}
  };
  const ctx = {
    document, localStorage, console,
    location: { pathname: "", href: "", search: "" },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    alert: () => {}, confirm: () => true, prompt: () => null,
    fetch: () => new Promise(() => {}),
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

// 1つのHTMLからinitShiftData出力(全月×全モード)を収集
function harvest(htmlPath, label) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const script = extractScript(html);
  const ctx = makeContext();
  // 起動コード(reload/render等)で落ちても、定義済みの関数・定数は残る
  try { vm.runInContext(script, ctx, { timeout: 15000 }); }
  catch (e) { /* startupのDOM操作で例外が出るのは想定内 */ }
  // 同一コンテキストでinitShiftDataを回して結果をJSON化
  const harvester = `(function(){
    if (typeof initShiftData !== "function") throw new Error("initShiftData未定義");
    var months = ${JSON.stringify(MONTHS)};
    var modes = ${JSON.stringify(MODES)};
    var res = {};
    for (var i=0;i<months.length;i++){
      for (var j=0;j<modes.length;j++){
        var r = initShiftData(months[i], modes[j]);
        res[months[i]+"|"+modes[j]] = r.data;
      }
    }
    return JSON.stringify(res);
  })()`;
  let json;
  try { json = vm.runInContext(harvester, ctx, { timeout: 15000 }); }
  catch (e) { throw new Error(label + " のinitShiftData実行に失敗: " + e.message); }
  return JSON.parse(json);
}

const base = harvest(baselinePath, "baseline");
const work = harvest(workingPath, "working");

// 全セル比較
let diffs = [];
const keys = new Set([...Object.keys(base), ...Object.keys(work)]);
for (const key of keys) {
  const b = base[key] || {};
  const w = work[key] || {};
  const staffs = new Set([...Object.keys(b), ...Object.keys(w)]);
  for (const s of staffs) {
    const bd = b[s] || {};
    const wd = w[s] || {};
    const dates = new Set([...Object.keys(bd), ...Object.keys(wd)]);
    for (const d of dates) {
      const bv = bd[d], wv = wd[d];
      if (bv !== wv) diffs.push({ key, staff: s, date: d, baseline: bv, working: wv });
    }
  }
}

const totalCells = Object.keys(base).reduce((acc, k) => {
  const m = base[k]; return acc + Object.keys(m).reduce((a, s) => a + Object.keys(m[s]).length, 0);
}, 0);

console.log("比較条件: 月=" + MONTHS.join(",") + " × blankMode=" + MODES.join(","));
console.log("比較セル総数(baseline基準):", totalCells);
console.log("差異セル数:", diffs.length);
if (diffs.length === 0) {
  console.log("RESULT: PASS (diff=0 / 出力完全一致)");
  process.exit(0);
} else {
  console.log("RESULT: FAIL");
  diffs.slice(0, 30).forEach(d =>
    console.log("  差異 ["+d.key+"] "+d.staff+" "+d.date+": baseline=" + JSON.stringify(d.baseline) + " / working=" + JSON.stringify(d.working)));
  if (diffs.length > 30) console.log("  ...他 " + (diffs.length - 30) + " 件");
  process.exit(1);
}
