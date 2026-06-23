// Phase 1 試運転＋制約充足テスト
// working版 shift-create.html を vm で評価し、USE_WEEKLY_ASSIGN を ON にして
// 指定月の initShiftData を実行。週N回/連勤上限/希望休/契約 を検証し、
// flag OFF(従来) と ON(weekly) の checkAlerts 🔴/⚠️ 件数も比較する。
// 使い方: node scripts/test-workrules-phase1.js <working.html> <YYYY-MM>

const fs = require("fs");
const vm = require("vm");
const FILE = process.argv[2] || "shift-create.html";
const YM = process.argv[3] || "2026-07";

const html = fs.readFileSync(FILE, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let captured = { alerts: "" };
function makeFakeEl() {
  const f = function () { return f; };
  return new Proxy(f, {
    get(_t, k) {
      if (k === "length") return 0;
      if (k === "style") return makeFakeEl();
      if (k === "classList") return { add(){}, remove(){}, toggle(){} };
      return f;
    },
    set() { return true; }, apply() { return f; }
  });
}
const alertsRecorder = {
  set innerHTML(v){ captured.alerts = String(v); },
  get innerHTML(){ return captured.alerts; },
  style: {}, classList:{add(){},remove(){}}, addEventListener(){}, appendChild(){}, querySelector(){return makeFakeEl();}
};
function makeCtx() {
  const document = {
    getElementById: (id) => {
      if (id === "monthSel") return { value: YM, addEventListener(){}, style:{}, disabled:false };
      if (id === "alerts") return alertsRecorder;
      return makeFakeEl();
    },
    createElement: () => makeFakeEl(),
    querySelector: () => makeFakeEl(), querySelectorAll: () => [],
    head: makeFakeEl(), body: makeFakeEl(), addEventListener(){}
  };
  const ctx = {
    document, console,
    localStorage: { length:0, getItem:()=>null, setItem(){}, removeItem(){}, key:()=>null },
    location: { pathname:"", href:"", search:"" },
    setTimeout:()=>0, clearTimeout:()=>{}, setInterval:()=>0, clearInterval:()=>{},
    alert:()=>{}, confirm:()=>true, prompt:()=>null, fetch:()=>new Promise(()=>{}),
    Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

const ctx = makeCtx();
try { vm.runInContext(script, ctx, { timeout: 15000 }); } catch (e) {}

// flag ON で initShiftData 実行 → data 取得
vm.runInContext("USE_WEEKLY_ASSIGN = true;", ctx);
const dataOn = JSON.parse(vm.runInContext(`JSON.stringify(initShiftData(${JSON.stringify(YM)}, false).data)`, ctx));
const cal = JSON.parse(vm.runInContext(`JSON.stringify(initShiftData(${JSON.stringify(YM)}, false).calendar)`, ctx));
const WEEKLY = JSON.parse(vm.runInContext("JSON.stringify(WEEKLY_RULES)", ctx));
const WISH = JSON.parse(vm.runInContext(`JSON.stringify(WISH_DATA[${JSON.stringify(YM)}] || {wishes:[],absences:[]})`, ctx));
const PAT = JSON.parse(vm.runInContext("JSON.stringify(PATTERNS)", ctx));

const dnum = (ds) => new Date(ds).getDay();
const isWorking = (v) => { const c = PAT[v] && PAT[v].category; return c==="full"||c==="short"||c==="escort"; };

// 希望休セット
const wishSet = {};
(WISH.wishes||[]).forEach(w => { const ds=YM+"-"+String(w.day).padStart(2,"0"); (wishSet[w.staff]=wishSet[w.staff]||{})[ds]=true; });

// 週分割(日曜始まり)
const weeks=[]; let cur=[];
cal.forEach(c=>{ const d=dnum(c.date); if(d===0&&cur.length){weeks.push(cur);cur=[];} cur.push(c); });
if(cur.length) weeks.push(cur);

let fails=[];
const summary=[];
Object.keys(WEEKLY).forEach(name=>{
  const r=WEEKLY[name];
  const cells=dataOn[name]||{};
  // 全出勤日
  const workDates=Object.keys(cells).filter(ds=>isWorking(cells[ds])).sort();
  // C1 週N回(按分)・C2 連勤上限・C5 平日のみ
  let weekCounts=[];
  weeks.forEach(week=>{
    const weekdays=week.filter(c=>{const d=dnum(c.date);return d>=1&&d<=5;});
    const exp=Math.round(r.count*weekdays.length/5);
    const got=week.filter(c=>isWorking(cells[c.date])).length;
    weekCounts.push(got+"/"+exp);
    // 候補数(希望休/祝日除外後)で按分がクランプされ得るため、got<=exp かつ (got==expまたは候補不足) を許容
    if(got>exp) fails.push(`C1 ${name}: 週 ${week[0].date}〜 出勤${got} > 上限${exp}`);
  });
  // C2 連勤上限(週内・暦日連続)
  if(r.maxConsec!=null){
    weeks.forEach(week=>{
      const ds=week.filter(c=>isWorking(cells[c.date])).map(c=>c.day).sort((a,b)=>a-b);
      let run=1;
      for(let i=1;i<ds.length;i++){ run = (ds[i]===ds[i-1]+1)?run+1:1; if(run>r.maxConsec) fails.push(`C2 ${name}: ${week[0].date}週 連勤${run}>上限${r.maxConsec}`); }
    });
  }
  // C3 希望休尊重
  workDates.forEach(ds=>{ if(wishSet[name]&&wishSet[name][ds]) fails.push(`C3 ${name}: 希望休${ds}に出勤`); });
  // C4 髙山:祝日/土日に出勤しない
  if(name==="髙山"){ workDates.forEach(ds=>{ const d=dnum(ds); if(d===0||d===6) fails.push(`C4 髙山: 土日${ds}出勤`); }); }
  // C5 平日のみ
  workDates.forEach(ds=>{ const d=dnum(ds); if(d<1||d>5) fails.push(`C5 ${name}: 平日外${ds}出勤`); });
  summary.push(`  ${name}: 月${workDates.length}日 / 週ごと[${weekCounts.join(" ")}] / 連勤上限=${r.maxConsec==null?"なし":r.maxConsec}`);
});

// 役割充足アラート(🔴件数)を flag OFF / ON で取得
function alertCounts(flag){
  vm.runInContext("USE_WEEKLY_ASSIGN = "+(flag?"true":"false")+";", ctx);
  captured.alerts="";
  try {
    vm.runInContext(`
      (function(){
        var r = initShiftData(${JSON.stringify(YM)}, false);
        shiftData = r.data; calendar = r.calendar;
        if (typeof checkAlerts === "function") checkAlerts();
      })();
    `, ctx);
  } catch(e){ return {err:e.message}; }
  const html=captured.alerts||"";
  const err=(html.match(/要対応 \((\d+)件\)/)||[])[1];
  const warn=(html.match(/注意 \((\d+)件\)/)||[])[1];
  return { err: err!==undefined?Number(err):(html.includes("警告なし")?0:"?"), warn: warn!==undefined?Number(warn):0, raw: html.slice(0,0) };
}
const before=alertCounts(false);
const after=alertCounts(true);

console.log("==== Phase1 試運転: "+YM+" ====");
console.log("【weekly各人の割当】");
summary.forEach(s=>console.log(s));
console.log("【制約検証】 違反 "+fails.length+" 件");
fails.slice(0,40).forEach(f=>console.log("  ✗ "+f));
console.log("【役割アラート(checkAlerts)】");
console.log("  従来(flag OFF): 🔴要対応 "+JSON.stringify(before.err)+" / ⚠️注意 "+JSON.stringify(before.warn));
console.log("  weekly(flag ON): 🔴要対応 "+JSON.stringify(after.err)+" / ⚠️注意 "+JSON.stringify(after.warn));
console.log(fails.length===0 ? "RESULT: 制約PASS" : "RESULT: 制約FAIL("+fails.length+")");
process.exit(fails.length===0?0:1);
