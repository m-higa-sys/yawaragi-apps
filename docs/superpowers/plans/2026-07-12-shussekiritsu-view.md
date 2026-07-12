# 出席率・利用頻度ビュー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 週1回・要介護・高出席率の利用者を増回提案するための常設ビューを、dailyOps実来館を正本に構築する。

**Architecture:** board GAS に新action `attendance_view` を追加（既存action非改変）。純関数 `attendance-view-core.js` が全計算（TDD）、GASは取得と組立のみ、`出席率.html` は描画と並べ替えのみ。空き枠は `intake.html` の canonical `slotSet_/attendsCell_`（曜日別ampmパース＝宮さん幽霊対策）をverbatim移植。

**Tech Stack:** Google Apps Script (ES5 var・SpreadsheetApp・UrlFetch)、素node テスト（`ok/eq` ハーネス）、バニラJS フロント（版ゲートself-contained）。

**設計書:** `docs/superpowers/specs/2026-07-12-shussekiritsu-view-design.md`（矛盾したらspec優先）

---

## ファイル構成

- Create: `gas/yawaragi-board/attendance-view-core.js` — 純関数（`av`プレフィクス・末尾module.exports・require無し）
- Create: `scripts/test-attendance-view-core.js` — 素node テスト
- Modify: `gas/yawaragi-board/コード.js` — `attendance_view(e)` 関数＋doGet分岐1行を追加（既存非改変）
- Create: `出席率.html` — 描画専用フロント（版ゲート・github.io）
- Modify: `version.txt` ＋ `出席率.html` の `?v=`（最終・bump script経由）
- portal登録: app registry へ1行追加（Task 12で確認して実施）

## 定数・データ契約（全タスク共通）

- 定員 `CAP = 18`（AM/PM各）／営業曜日 `DAYS = ['月','火','水','木','金']`／`SLOT_OF = { am:'午前', pm:'午後' }`
- 台帳 patterns 行 = `{ name, days, unit, care, cancelled, startDate }`（unitは"午前"/"午後"/"午前午後"または複合"月午前、木午後"）
- monthlyCounts = `{ 'YYYY-MM': { scheduled, attended } }`（稼働日ベース）
- displayState ∈ `normal|sanko|hanteichu|chouki`／label = `''|'参考値（率が不正確）'|'判定中（データ蓄積中）'|'算出不可'`
- board GAS URL（フロントのfetch先・DAICHO/API）: `https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec`

---

## Task 1: coreファイル雛形とテストハーネス

**Files:**
- Create: `gas/yawaragi-board/attendance-view-core.js`
- Create: `scripts/test-attendance-view-core.js`

- [ ] **Step 1: coreの雛形を作成（定数＋module.exports骨組み）**

```javascript
// 出席率・利用頻度ビュー 純関数（2026-07-12）
// テスト: scripts/test-attendance-view-core.js ／ 呼び出し元: コード.js attendance_view(e)
// ※require()は持たない（GAS本番でロード時停止しない・他 *-core.js と同方式）。
// ※グローバルは av プレフィクス徹底（コード.js 全域scope衝突回避）。
var AV_CAP = 18;
var AV_DAYS = ['月', '火', '水', '木', '金'];
var AV_SLOT_OF = { am: '午前', pm: '午後' };
var AV_WEEKDAY_CHARS = ['月', '火', '水', '木', '金', '土', '日'];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AV_CAP: AV_CAP, AV_DAYS: AV_DAYS, AV_SLOT_OF: AV_SLOT_OF
  };
}
```

- [ ] **Step 2: テストハーネス雛形を作成**

```javascript
// 出席率・利用頻度ビュー 純関数テスト
// 実行: node scripts/test-attendance-view-core.js
const path = require('path');
const c = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'attendance-view-core.js'));
let pass = 0, fail = 0;
function eq(a, e, m){ const A=JSON.stringify(a),E=JSON.stringify(e); if(A===E){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m+'\n    exp '+E+'\n    act '+A);} }
function ok(cnd, m){ if(cnd){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m);} }

console.log('[定数]');
ok(c.AV_CAP === 18, 'AV_CAP=18');

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: テスト実行してPASS確認**

Run: `node scripts/test-attendance-view-core.js`
Expected: `1 passed / 0 failed`

- [ ] **Step 4: コミット**

```bash
git add gas/yawaragi-board/attendance-view-core.js scripts/test-attendance-view-core.js
git commit -m "test(attendance-view): core雛形とテストハーネス"
```

---

## Task 2: avSlotSet_ / avAttendsCell_（曜日別ampmパース・宮さん幽霊対策のverbatim移植）

`intake.html:1975` の `KD_slotSet_/KD_attendsCell_` と同一ロジック（naive indexOfは複合ampm幽霊を再発させるので禁止）。

**Files:**
- Modify: `gas/yawaragi-board/attendance-view-core.js`
- Test: `scripts/test-attendance-view-core.js`

- [ ] **Step 1: 失敗するテストを書く（テストハーネスの定数ブロックの後に追記）**

```javascript
console.log('\n[avSlotSet_] 曜日別ampmパース（複合ampm幽霊なし）');
eq(c.avSlotSet_('火木', '午前'), {'火|午前':true,'木|午前':true}, '単純 午前→両日AM');
eq(c.avSlotSet_('火', '午前午後'), {'火|午前':true,'火|午後':true}, '午前午後→AM+PM両方');
eq(c.avSlotSet_('月木', '月午前、木午後'), {'月|午前':true,'木|午後':true}, '★複合→曜日ごとに正しく振る（幽霊なし）');
eq(c.avSlotSet_('', ''), {}, '空→空');

console.log('\n[avAttendsCell_] セル判定');
ok(c.avAttendsCell_('火木','午前','火','am')===true, '火AM在籍→true');
ok(c.avAttendsCell_('火木','午前','火','pm')===false, '火PMは不在→false');
ok(c.avAttendsCell_('月木','月午前、木午後','木','pm')===true, '複合 木PM→true');
```

- [ ] **Step 2: テスト実行して失敗確認**

Run: `node scripts/test-attendance-view-core.js`
Expected: FAIL（`c.avSlotSet_ is not a function`）

- [ ] **Step 3: 実装（coreに追加・module.exportsにも追記）**

```javascript
// 曜日別ampmパース（複合"月午前、木午後"を曜日ごとに正しい時間帯へ）。intake.html KD_slotSet_ と同一。
function avSlotSet_(days, ampm) {
  var daysStr = String(days || '');
  var dayList = AV_WEEKDAY_CHARS.filter(function (d) { return daysStr.indexOf(d) >= 0; });
  var set = {};
  String(ampm || '').split(/[、，,]/).forEach(function (seg) {
    seg = String(seg).trim(); if (!seg) return;
    var slots = [];
    if (seg.indexOf('午前') >= 0) slots.push('午前');
    if (seg.indexOf('午後') >= 0) slots.push('午後');
    if (!slots.length) return;
    var segDays = AV_WEEKDAY_CHARS.filter(function (d) { return seg.indexOf(d) >= 0; });
    if (segDays.length) {
      segDays.forEach(function (d) { if (dayList.indexOf(d) >= 0) slots.forEach(function (s) { set[d + '|' + s] = true; }); });
    } else {
      dayList.forEach(function (d) { slots.forEach(function (s) { set[d + '|' + s] = true; }); });
    }
  });
  return set;
}
function avAttendsCell_(days, ampm, day, sess) { return !!avSlotSet_(days, ampm)[day + '|' + AV_SLOT_OF[sess]]; }
```

module.exports に `avSlotSet_: avSlotSet_, avAttendsCell_: avAttendsCell_` を追加。

- [ ] **Step 4: テスト実行してPASS確認**

Run: `node scripts/test-attendance-view-core.js`
Expected: 全PASS

- [ ] **Step 5: コミット**

```bash
git add -A && git commit -m "feat(attendance-view): avSlotSet_/avAttendsCell_ 曜日別ampmパース移植"
```

---

## Task 3: avContractN_（契約週N＝曜日数）

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avContractN_] 契約週N=曜日数（午前午後は足さない）');
ok(c.avContractN_('火木')===2, '火木→2');
ok(c.avContractN_('月水金')===3, '月水金→3');
ok(c.avContractN_('木')===1, '木→1');
ok(c.avContractN_('')===0, '空→0');
```

- [ ] **Step 2: 失敗確認** — Run: `node scripts/test-attendance-view-core.js` → FAIL

- [ ] **Step 3: 実装**

```javascript
function avContractN_(days) {
  var s = String(days || '');
  return AV_WEEKDAY_CHARS.filter(function (d) { return s.indexOf(d) >= 0; }).length;
}
```
module.exports に `avContractN_` 追加。

- [ ] **Step 4: PASS確認** — Run: `node scripts/test-attendance-view-core.js` → 全PASS

- [ ] **Step 5: コミット** — `git add -A && git commit -m "feat(attendance-view): avContractN_"`

---

## Task 4: avOccupancy_ / avSlotsFree_（台帳ベース占有と空き枠）

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avOccupancy_] 全在籍から占有[曜日]{am,pm}を集計');
const occ = c.avOccupancy_([
  { days:'火木', unit:'午前' },   // 火AM 木AM
  { days:'火', unit:'午前午後' }, // 火AM 火PM
  { days:'月木', unit:'月午前、木午後' } // 月AM 木PM
]);
ok(occ['火'].am===2, '火AM=2（1人目+2人目）');
ok(occ['火'].pm===1, '火PM=1（2人目のみ）');
ok(occ['木'].am===1 && occ['木'].pm===1, '木AM=1(1人目) 木PM=1(3人目)');
ok(occ['月'].am===1 && occ['月'].pm===0, '月AM=1(3人目) 月PM=0');

console.log('\n[avSlotsFree_] 空き=CAP-占有');
const free = c.avSlotsFree_({ '火':{am:16,pm:18}, '月':{am:0,pm:0} }, 18);
ok(free['火'].am===2, '火AM空き=18-16=2');
ok(free['火'].pm===0, '火PM空き=0');
ok(free['月'].am===18, '月AM空き=18');
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

```javascript
// 全在籍(非中止・要介護+要支援すべて)から占有[曜日]{am,pm}を集計。椅子は共有so全員数える。
function avOccupancy_(patternsAll) {
  var occ = {};
  AV_DAYS.forEach(function (d) { occ[d] = { am: 0, pm: 0 }; });
  (patternsAll || []).forEach(function (u) {
    AV_DAYS.forEach(function (d) {
      if (avAttendsCell_(u.days, u.unit, d, 'am')) occ[d].am++;
      if (avAttendsCell_(u.days, u.unit, d, 'pm')) occ[d].pm++;
    });
  });
  return occ;
}
function avSlotsFree_(occupancy, capacity) {
  var free = {};
  AV_DAYS.forEach(function (d) {
    var o = occupancy[d] || { am: 0, pm: 0 };
    free[d] = { am: Math.max(0, capacity - o.am), pm: Math.max(0, capacity - o.pm) };
  });
  return free;
}
```
module.exports に `avOccupancy_, avSlotsFree_` 追加。

- [ ] **Step 4: PASS確認**

- [ ] **Step 5: コミット** — `git commit -am "feat(attendance-view): avOccupancy_/avSlotsFree_ 台帳ベース空き枠"`

---

## Task 5: avLast3CompletedMonths_ / avDateMinusMonths_（月ウィンドウ・日付ヘルパ）

Date()のTZ罠を避けるため文字列で月計算する。

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avLast3CompletedMonths_] 直近完了3ヶ月');
eq(c.avLast3CompletedMonths_('2026-07-12'), ['2026-04','2026-05','2026-06'], '7月→4/5/6');
eq(c.avLast3CompletedMonths_('2026-01-05'), ['2025-10','2025-11','2025-12'], '年跨ぎ');

console.log('\n[avDateMinusMonths_] 3ヶ月前（判定中の閾値用）');
eq(c.avDateMinusMonths_('2026-07-12', 3), '2026-04-12', '7/12-3ヶ月=4/12');
eq(c.avDateMinusMonths_('2026-01-31', 3), '2025-10-31', '年跨ぎ');
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

```javascript
// 'YYYY-MM-DD' の n ヶ月前を返す（日は保持・末日補正は簡易＝そのまま）。
function avDateMinusMonths_(ymd, n) {
  var p = String(ymd).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = p[2] || '01';
  m -= n;
  while (m <= 0) { m += 12; y -= 1; }
  return y + '-' + ('0' + m).slice(-2) + '-' + d;
}
// today('YYYY-MM-DD')基準の直近完了3ヶ月 ['YYYY-MM',...]（昇順）
function avLast3CompletedMonths_(today) {
  var p = String(today).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  var out = [];
  for (var k = 3; k >= 1; k--) {
    var yy = y, mm = m - k;
    while (mm <= 0) { mm += 12; yy -= 1; }
    out.push(yy + '-' + ('0' + mm).slice(-2));
  }
  return out;
}
```
module.exports に `avDateMinusMonths_, avLast3CompletedMonths_` 追加。

- [ ] **Step 4: PASS確認**

- [ ] **Step 5: コミット** — `git commit -am "feat(attendance-view): 月ウィンドウ/日付ヘルパ"`

---

## Task 6: avUserOpsRate_（dailyOps出席率・月別）

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avUserOpsRate_] 窓内出席率＋月別（—=null・推測で埋めない）');
const r = c.avUserOpsRate_(
  { '2026-05': {scheduled:5, attended:5}, '2026-06': {scheduled:8, attended:6} },
  ['2026-05','2026-06'],                 // window（率計算対象）
  ['2026-04','2026-05','2026-06']        // displayMonths（月別列）
);
ok(r.rate===84.6, '率=(5+6)/(5+8)=11/13=84.6%');
ok(r.windowAttended===11 && r.windowScheduled===13, '窓合計を保持（基準線用）');
ok(r.monthly['2026-04']===null, '4月=null（opsなし）');
ok(r.monthly['2026-05']===100, '5月=100%');
ok(r.monthly['2026-06']===75, '6月=6/8=75%');

const z = c.avUserOpsRate_({}, ['2026-05'], ['2026-05']);
ok(z.rate===null && z.windowScheduled===0, '窓に予定0→率null');
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

```javascript
// monthlyCounts={ym:{scheduled,attended}}, window=率計算対象月[], displayMonths=月別列[]
// 返り値: { rate(%|null), windowAttended, windowScheduled, monthly:{ym:%|null} }
function avUserOpsRate_(monthlyCounts, windowMonths, displayMonths) {
  monthlyCounts = monthlyCounts || {};
  var wa = 0, ws = 0;
  (windowMonths || []).forEach(function (ym) {
    var mc = monthlyCounts[ym];
    if (mc) { wa += mc.attended; ws += mc.scheduled; }
  });
  var rate = ws > 0 ? Math.round((1000 * wa) / ws) / 10 : null;
  var monthly = {};
  (displayMonths || []).forEach(function (ym) {
    var mc = monthlyCounts[ym];
    monthly[ym] = (mc && mc.scheduled > 0) ? Math.round((1000 * mc.attended) / mc.scheduled) / 10 : null;
  });
  return { rate: rate, windowAttended: wa, windowScheduled: ws, monthly: monthly };
}
```
module.exports に `avUserOpsRate_` 追加。

- [ ] **Step 4: PASS確認**

- [ ] **Step 5: コミット** — `git commit -am "feat(attendance-view): avUserOpsRate_ dailyOps出席率/月別"`

---

## Task 7: avActualPerWeek_（実績週N.N・乖離）

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avActualPerWeek_] 実績週N.N=契約N×率, 乖離=契約N−実績');
const a = c.avActualPerWeek_(3, 84.6);
ok(a.actualPerWeek===2.54, '3×0.846=2.54');
ok(a.diverge===0.46, '3-2.54=0.46');
const n = c.avActualPerWeek_(2, null);
ok(n.actualPerWeek===null && n.diverge===null, '率null→実績/乖離null');
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

```javascript
function avActualPerWeek_(contractN, rate) {
  if (rate == null) return { actualPerWeek: null, diverge: null };
  var apw = Math.round((contractN * rate) ) / 100; // contractN×(rate/100)を小数2桁
  var diverge = Math.round((contractN - apw) * 100) / 100;
  return { actualPerWeek: apw, diverge: diverge };
}
```

- [ ] **Step 4: PASS確認**（`3×84.6/100=2.538→四捨五入2.54`・要 `Math.round(contractN*rate)/100`）

- [ ] **Step 5: コミット** — `git commit -am "feat(attendance-view): avActualPerWeek_ 実績/乖離"`

---

## Task 8: avDisplayState_（状態マシン4分離・approxとno-data分離）

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avDisplayState_] 優先: 長期休み>判定中(新規)>参考値(曜日変更)>normal');
eq(c.avDisplayState_({isLongLeave:true, isWeekdayChange:true, startDate:'2026-07-01', today:'2026-07-12'}),
   {state:'chouki', label:'算出不可'}, '長期休みが最優先');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:true, startDate:'2026-07-01', today:'2026-07-12'}),
   {state:'hanteichu', label:'判定中（データ蓄積中）'}, '新規(開始<3ヶ月)が曜日変更より優先');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:false, startDate:'2026-03-01', today:'2026-07-12'}),
   {state:'normal', label:''}, '開始>3ヶ月前→通常復帰');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:true, startDate:'2026-01-01', today:'2026-07-12'}),
   {state:'sanko', label:'参考値（率が不正確）'}, '曜日変更のみ→参考値');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:false, startDate:'', today:'2026-07-12'}),
   {state:'normal', label:''}, '開始日空→normal（判定中にしない）');
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

```javascript
// 状態＋ラベル。hanteichu = 利用開始日が today の3ヶ月前より新しい（3ヶ月経過で自動normal復帰）。
function avDisplayState_(opt) {
  opt = opt || {};
  if (opt.isLongLeave) return { state: 'chouki', label: '算出不可' };
  var sd = String(opt.startDate || '').trim();
  if (sd && sd > avDateMinusMonths_(opt.today, 3)) return { state: 'hanteichu', label: '判定中（データ蓄積中）' };
  if (opt.isWeekdayChange) return { state: 'sanko', label: '参考値（率が不正確）' };
  return { state: 'normal', label: '' };
}
```
module.exports に `avDisplayState_` 追加。

- [ ] **Step 4: PASS確認**

- [ ] **Step 5: コミット** — `git commit -am "feat(attendance-view): avDisplayState_ 状態マシン4分離"`

---

## Task 9: avAddableSlots_ / avIsUpsizeCandidate_（増回候補と追加空き枠）

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avAddableSlots_] 同ampm保持・現曜日除外・空き>0の枠');
const sf = { '月':{am:1,pm:0}, '火':{am:1,pm:2}, '水':{am:0,pm:0}, '木':{am:0,pm:0}, '金':{am:1,pm:1} };
eq(c.avAddableSlots_('水','午前', sf), ['月AM','火AM','金AM'], '水AMのみ→月/火/金AM（水除外・空きある枠）');
eq(c.avAddableSlots_('火','午後', sf), ['金PM'], '火PMのみ→金PM（火除外・月木水はPM空きなし）');
eq(c.avAddableSlots_('月','午前午後', sf), ['火AM','金AM','火PM','金PM'], '午前午後→AM/PM両面の空き（月除外）');

console.log('\n[avIsUpsizeCandidate_] normal かつ 週1回');
ok(c.avIsUpsizeCandidate_('normal',1)===true, 'normal週1→候補');
ok(c.avIsUpsizeCandidate_('normal',2)===false, '週2→非候補');
ok(c.avIsUpsizeCandidate_('sanko',1)===false, 'sanko週1→非候補');
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

```javascript
// 追加できる空き枠：候補が使うampm(am/pm)を保ったまま、月〜金(現曜日除く)で空き>0の枠。
function avAddableSlots_(days, unit, slotsFree) {
  var mySet = avSlotSet_(days, unit);
  var useAm = false, usePm = false;
  Object.keys(mySet).forEach(function (k) {
    if (k.indexOf('午前') >= 0) useAm = true;
    if (k.indexOf('午後') >= 0) usePm = true;
  });
  var daysStr = String(days || '');
  var out = [];
  var passes = [];
  if (useAm) passes.push({ sess: 'am', label: 'AM' });
  if (usePm) passes.push({ sess: 'pm', label: 'PM' });
  passes.forEach(function (p) {
    AV_DAYS.forEach(function (d) {
      if (daysStr.indexOf(d) >= 0) return;          // 現曜日は除外
      var f = slotsFree[d] || { am: 0, pm: 0 };
      if (f[p.sess] > 0) out.push(d + p.label);
    });
  });
  return out;
}
function avIsUpsizeCandidate_(state, contractN) { return state === 'normal' && contractN === 1; }
```
module.exports に `avAddableSlots_, avIsUpsizeCandidate_` 追加。

- [ ] **Step 4: PASS確認**

- [ ] **Step 5: コミット** — `git commit -am "feat(attendance-view): avAddableSlots_/avIsUpsizeCandidate_"`

---

## Task 10: avKaigoAvgRate_ / avSortRows_（基準線と並べ替え）

**Files:** Modify core ＋ test

- [ ] **Step 1: 失敗するテスト**

```javascript
console.log('\n[avKaigoAvgRate_] normalのみ重み付き平均（除外群は分母外）');
const rows = [
  { displayState:'normal', windowAttended:11, windowScheduled:13 },
  { displayState:'normal', windowAttended:9,  windowScheduled:9  },
  { displayState:'sanko',  windowAttended:5,  windowScheduled:10 }, // 除外
  { displayState:'hanteichu', windowAttended:0, windowScheduled:0 } // 除外
];
ok(c.avKaigoAvgRate_(rows)===90.9, '(11+9)/(13+9)=20/22=90.9%（normalのみ）');
ok(c.avKaigoAvgRate_([])===null, '対象ゼロ→null');

console.log('\n[avSortRows_] 3モード');
const rs = [
  { name:'A', isUpsizeCandidate:true,  rate:100, diverge:0,   displayState:'normal' },
  { name:'B', isUpsizeCandidate:true,  rate:92,  diverge:0,   displayState:'normal' },
  { name:'C', isUpsizeCandidate:false, rate:60,  diverge:1.2, displayState:'normal' },
  { name:'D', isUpsizeCandidate:false, rate:null,diverge:null,displayState:'hanteichu' }
];
eq(c.avSortRows_(rs,'upsize').map(function(x){return x.name;}), ['A','B','C','D'], 'upsize:候補→率降順、非候補下、null末尾');
eq(c.avSortRows_(rs,'diverge').map(function(x){return x.name;}), ['C','A','B','D'], 'diverge:乖離降順、null末尾');
eq(c.avSortRows_(rs,'lowrate').map(function(x){return x.name;}), ['C','B','A','D'], 'lowrate:率昇順、null末尾');
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

```javascript
function avKaigoAvgRate_(rows) {
  var a = 0, s = 0;
  (rows || []).forEach(function (r) {
    if (r.displayState === 'normal') { a += r.windowAttended; s += r.windowScheduled; }
  });
  return s > 0 ? Math.round((1000 * a) / s) / 10 : null;
}
// mode: 'upsize'|'diverge'|'lowrate'。null(率/乖離なし)は常に末尾。安定ソート前提でtiebreakは名前。
function avSortRows_(rows, mode) {
  var arr = (rows || []).slice();
  function nn(v) { return v == null ? 1 : 0; } // nullを後ろへ
  arr.sort(function (x, y) {
    if (mode === 'upsize') {
      if (x.isUpsizeCandidate !== y.isUpsizeCandidate) return x.isUpsizeCandidate ? -1 : 1;
      if (nn(x.rate) !== nn(y.rate)) return nn(x.rate) - nn(y.rate);
      if (x.rate !== y.rate) return (y.rate || 0) - (x.rate || 0);
    } else if (mode === 'diverge') {
      if (nn(x.diverge) !== nn(y.diverge)) return nn(x.diverge) - nn(y.diverge);
      if (x.diverge !== y.diverge) return (y.diverge || 0) - (x.diverge || 0);
    } else if (mode === 'lowrate') {
      if (nn(x.rate) !== nn(y.rate)) return nn(x.rate) - nn(y.rate);
      if (x.rate !== y.rate) return (x.rate || 0) - (y.rate || 0);
    }
    return String(x.name).localeCompare(String(y.name));
  });
  return arr;
}
```
module.exports に `avKaigoAvgRate_, avSortRows_` 追加。

- [ ] **Step 4: PASS確認**（tiebreak/nullで期待どおりか確認。ズレたらテスト期待値ではなく実装意図を再確認）

- [ ] **Step 5: コミット** — `git commit -am "feat(attendance-view): avKaigoAvgRate_/avSortRows_"`

---

## Task 11: GAS `attendance_view(e)` ＋ doGet分岐（既存非改変）

**⚠️ 着手前に必ず `clasp pull` で本番GAS突合**（過去、本番のみ機能を消しかけた再発防止・MEMORY runbook）。別tempにpullし、`gas/yawaragi-board/コード.js`(master基点)と差分がないか確認してから編集する。

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（doGetに分岐1行＋末尾付近に `attendance_view` 関数）

- [ ] **Step 1: doGet に分岐を1行追加**（`debug_absence_rows` 分岐の直後、`return respond(result, callback);` の前あたり＝他の `action ===` 群と同列）

```javascript
    if (action === 'attendance_view') {
      return respond(attendance_view(ss, e), callback);
    }
```

- [ ] **Step 2: `attendance_view` 関数を追加**（`getUsageAlerts` の近く・末尾）。純関数coreはGAS同一プロジェクト内でグローバル可視（av*）。

```javascript
// ===== 出席率・利用頻度ビュー（要介護・dailyOps正本・2026-07-12）=====
// 純関数は attendance-view-core.js（av*）。ここは取得と組立のみ。
function attendance_view(ss, e) {
  var today = (e && e.parameter && e.parameter.date) || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 1) 台帳 patterns（全在籍＝占有用）＋ 介護度/開始日
  var patterns = getUserPatterns(ss, false); // {name:{days,unit,care,cancelled}}
  var sheet = ss.getSheetByName('利用者台帳');
  var data = sheet.getDataRange().getValues();
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var startCol = findCol(h, ['利用開始日', '利用開始']);
  var startMap = {};
  for (var i = 1; i < data.length; i++) {
    var nm = String(data[i][nameCol] || '').trim();
    if (nm && startCol >= 0 && data[i][startCol]) startMap[nm] = fmtDate(data[i][startCol]);
  }
  var patternsAll = Object.keys(patterns).map(function (nm) { return { days: patterns[nm].days, unit: patterns[nm].unit }; });
  var occupancy = avOccupancy_(patternsAll);
  var slotsFree = avSlotsFree_(occupancy, avConstCap_());

  // 2) dailyOps 取得 → 日別 attendedSet（正規化名）と稼働月
  var dailyOps = _muFetchAllDailyOps_(); // { 'YYYY-MM-DD': dayOps }
  var opDays = Object.keys(dailyOps).filter(function (k) {
    var d = dailyOps[k];
    return (d.am && d.am.users && d.am.users.length) || (d.pm && d.pm.users && d.pm.users.length);
  });
  var attByDate = {}, opsMonths = {};
  opDays.forEach(function (k) {
    opsMonths[k.slice(0, 7)] = true;
    var att = {};
    ['am', 'pm'].forEach(function (u) {
      var o = dailyOps[k][u]; if (!o || !o.users) return;
      o.users.forEach(function (nm) {
        var st = (o.userStatus && o.userStatus[nm]) || '';
        if (st !== 'absent' && st !== 'longabsent') att[_normalizeUserName(nm)] = true;
      });
    });
    attByDate[k] = att;
  });

  // 3) ウィンドウ・除外セット
  var displayMonths = avLast3CompletedMonths_(today);
  var windowMonths = displayMonths.filter(function (ym) { return opsMonths[ym]; });
  var longLeave = getOnLongLeaveSet(ss, today);
  var wdChange = getWeekdayChangeUsersSince(ss, (displayMonths[0] || today.slice(0, 7)) + '-01');

  // 4) 要介護のみ 行組立
  var rows = [];
  Object.keys(patterns).forEach(function (name) {
    var pt = patterns[name];
    if (pt.cancelled) return;
    if (String(pt.care || '').indexOf('要介護') < 0) return; // ★要介護のみ
    var norm = _normalizeUserName(name);
    var contractN = avContractN_(pt.days);
    var codes = _muParseWeekdays(pt.days);

    // monthlyCounts（稼働日ベース）
    var monthlyCounts = {};
    opDays.forEach(function (k) {
      var ym = k.slice(0, 7);
      if (displayMonths.indexOf(ym) < 0) return;
      var dow = new Date(parseInt(k.slice(0,4)), parseInt(k.slice(5,7)) - 1, parseInt(k.slice(8,10))).getDay();
      if (codes.indexOf(dow) < 0) return;
      if (!monthlyCounts[ym]) monthlyCounts[ym] = { scheduled: 0, attended: 0 };
      monthlyCounts[ym].scheduled++;
      if (attByDate[k] && attByDate[k][norm]) monthlyCounts[ym].attended++;
    });
    var ops = avUserOpsRate_(monthlyCounts, windowMonths, displayMonths);
    var ds = avDisplayState_({ isLongLeave: !!longLeave[norm], isWeekdayChange: !!wdChange[norm], startDate: startMap[name] || '', today: today });

    // hanteichu/chouki は率を出さない（数字がまだ無い/算出不可）
    var showRate = (ds.state === 'normal' || ds.state === 'sanko');
    var rate = showRate ? ops.rate : null;
    var monthly = showRate ? ops.monthly : blankMonthly_(displayMonths);
    var apw = avActualPerWeek_(contractN, rate);
    var isCand = avIsUpsizeCandidate_(ds.state, contractN);

    rows.push({
      name: name, care: pt.care, days: pt.days, unit: pt.unit, contractN: contractN,
      displayState: ds.state, stateLabel: ds.label,
      rate: rate, actualPerWeek: apw.actualPerWeek, diverge: apw.diverge, monthly: monthly,
      windowAttended: showRate ? ops.windowAttended : 0,
      windowScheduled: showRate ? ops.windowScheduled : 0,
      isUpsizeCandidate: isCand,
      addableSlots: isCand ? avAddableSlots_(pt.days, pt.unit, slotsFree) : []
    });
  });

  return {
    success: true,
    generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
    today: today,
    window: { months: windowMonths, note: '4月はdailyOps未保持のため対象外' },
    displayMonths: displayMonths,
    kaigoAvgRate: avKaigoAvgRate_(rows),
    capacity: avConstCap_(),
    slotsFree: slotsFree,
    users: rows
  };
}
function avConstCap_() { return 18; }
function blankMonthly_(months) { var o = {}; (months || []).forEach(function (m) { o[m] = null; }); return o; }

// dailyOps 全件（getMonthlyUsage の _muFetchDailyOpsForMonth と同経路・月フィルタなし）
function _muFetchAllDailyOps_() {
  try {
    var resp = UrlFetchApp.fetch(DIGEST_OPS_URL, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) return {};
    var json = JSON.parse(resp.getContentText());
    return (json && json.dailyOps) ? json.dailyOps : {};
  } catch (e) { return {}; }
}
```

- [ ] **Step 3: node で構文だけ通す（GASはローカル実行不可so、coreテストが緑なら十分。コード.jsは巨大でnode実行しない）**

Run: `node scripts/test-attendance-view-core.js`
Expected: 全PASS（coreに退行がない）

- [ ] **Step 4: コミット**

```bash
git add gas/yawaragi-board/コード.js
git commit -m "feat(attendance-view): GAS attendance_view(e)+doGet分岐（既存非改変）"
```

- [ ] **Step 5: 🔒デプロイは社長承認後**（Task 13）。ここではpushしない。

---

## Task 12: `出席率.html`（描画専用フロント・版ゲート）

**Files:** Create: `出席率.html`

- [ ] **Step 1: 版ゲート＋雛形を作成**（`genba.html:4-23` の版ゲートscriptを`<head>`最先頭にverbatim流用）。以下の骨子で作成:
  - `<head>`最先頭に版ゲート（genba.html:6-23と同一）
  - `API='https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec';`
  - 起動時 **JSONP で1回取得**（github.io→script.google.com は CORS so plain fetch不可。`intake.html` kdLoadDaicho と同じ script タグ JSONP：`API+'?action=attendance_view&callback='+cbName+'&t='+Date.now()`、in-flightガード＋12秒タイムアウト＋cleanup）。attendance_view は `respond(data, callback)` 経由so callback対応済み。
  - ヘッダに **基準線**「要介護の平均実来館率 XX.X%」＋注記「※4月はデータなし（dailyOps未保持）／出席率は実来館(dailyOps)基準」。
  - 並べ替えトグル3つ（増回候補／乖離大／出席率低）→ `avSortRows_` 相当をフロントにも1関数だけ複製（描画用）。※coreはnode/GAS用so、フロントは同ロジックの小関数を持つ（DRY例外＝配信境界）。
  - 1人1行テーブル: 氏名／介護度／契約曜日／契約週N／実績週N.N／出席率／月別(displayMonths)／状態ラベル／増回バッジ(addableSlots)。
  - `rate==null` は状態ラベル（判定中/算出不可）を表示。月別 `null`→「—」。
  - 増回候補行に addableSlots を「月AM / 火AM / 金AM」形式でバッジ表示。

```html
<!-- 版ゲート（genba.html:6-23 と同一・<head>最先頭）を貼る -->
```

- [ ] **Step 2: ローカル確認**（`node scripts/preview-server.js` 経由で開く。file://はキャッシュ罠so不可）。attendance_view のレスポンス形（Task 11）に対し、要介護のみ・4月「—」・基準線・増回バッジ・3ソートが描画されるか目視。

- [ ] **Step 3: コミット**

```bash
git add 出席率.html
git commit -m "feat(attendance-view): 出席率.html 描画専用フロント（版ゲート・github.io）"
```

---

## Task 13: 配信（portal登録・版bump・三点セット）★社長承認ゲート

**⚠️ すべて社長承認後。push origin masterはstale罠so `feat/attendance-view:master` 形式のFF push。**

- [ ] **Step 1: 本番GAS突合してデプロイ**（社長OK後）
  - 別tempに `clasp pull` → `gas/yawaragi-board/コード.js` の差分が「attendance_view追加のみ」か確認（本番先行の未deploy機能を消さない）。
  - `clasp push` → `clasp deploy -i "<既存デプロイID>"`（同一URL維持・新規作成禁止）。
  - 反映確認: `curl "<API>?action=attendance_view&date=2026-07-12"` → `success:true`・users全員 `要介護` を含む・要支援ゼロを実測。

- [ ] **Step 2: portal登録**
  - `getAppRegistry` の実装（コード.js）を読み、app registry シート/アクションを特定。
  - 出席率.html を1行登録（タイル名「出席率・利用頻度」等）。動的生成タイルに追随するか portal.html で確認。

- [ ] **Step 3: 版bump（三点セット）**
  - 作業ツリーがクリーン・origin/master とFF可能を確認。
  - `node scripts/bump-app-version.js <新版>`（version.txt と 出席率.html の `?v=` を同一コミットで同期・**手編集禁止**）。
  - 提示された push/verify コマンドを社長へ提示。

- [ ] **Step 4: 社長OKで手push → verify**
  - `git push origin feat/attendance-view:master`（FF）。
  - `git rev-parse HEAD` == `origin/master` を確認。
  - `node scripts/bump-app-version.js --verify <版>` で本番反映をポーリング確認（時間切れは成功扱いにしない）。
  - github.io の 出席率.html 実コードに版マーカーが含まれることを確認（三点セット: ①SHA一致 ②本番実コードにマーカー ③version.txt=期待値）。

- [ ] **Step 5: 完了報告**（受け入れ条件チェックリストを実測証跡つきで）

---

## 受け入れ条件（設計書§10・完了時に実測で確認）

- [ ] 要介護のみ表示（要支援ゼロ）を curl レスポンスで実測
- [ ] 出席率が dailyOps 基準（予定−欠席の推定でない）
- [ ] 月別3ヶ月・4月「—（データなし）」明示
- [ ] 要介護平均実来館率が基準線表示（要支援除外で再計算）
- [ ] 増回候補の追加空き枠が週間予定表と一致（同一 slotSet_ ロジック・宮さん幽霊なし）
- [ ] 長期休み＝算出不可／新規＝判定中／曜日変更＝参考値（率が不正確）の分離表示
- [ ] portal登録・版bump・三点セット（①SHA一致 ②本番マーカー ③version.txt）
