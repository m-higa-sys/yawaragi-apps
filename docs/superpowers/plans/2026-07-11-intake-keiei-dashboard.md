# intake 経営ダッシュボード（P5）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** intake.html 内の新タブ「経営」に、需給対比・所要日数・問合せ元別・転換率・失注理由の5指標を鍵付きで表示する。

**Architecture:** 壊れやすい計算を純ロジック `gas/yawaragi-board/intake-dashboard-core.js`（Node+GAS両対応・末尾 module.exports ガード）に隔離しTDD。GASの `intake_dashboard` は「見学体験新規 全行read→行→案件obj正規化→core呼び→返す」薄アダプタ。P2.1ゲートに1action追加で鍵必須。フロントは intake.html インライン（版ゲート対象・shared.jsは?v=無しso入れない）。空き枠だけ週間予定表の `slotSet_`/`attendsCell_` を流用。

**Tech Stack:** Google Apps Script（clasp）・Node（テスト・jsdom不要）・素のHTML/JS（JSONP GET）。

**設計doc:** `docs/superpowers/specs/2026-07-11-intake-keiei-dashboard-design.md`

---

## 前提・共有事実（実装者向け）

- **core配線**：`gas/yawaragi-board/*.js` は clasp が各 `.gs` として push（`.claspignore` 除外を除く）。全ファイルの top-level 関数は GAS で同一グローバル。→ 新規 `intake-dashboard-core.js` の関数を `コード.js` からそのまま呼べる。
- **require禁止**：core に top-level `require()` を書くと GAS が起動時 `ReferenceError` で全停止（.claspignore 参照）。Node連携は**末尾** `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }` のみ（GASでは module 未定義so skip）。
- **グローバル名**：`INTAKE_DASH_` プレフィクス、core関数は `dash*_` 命名（全域scope衝突回避）。
- **ゲート**：`コード.js:1522` が `INTAKE_GATED_GET_ACTIONS_`（8725行）を見て未認証GETを `{error:'unauthorized',status:401}` で弾く。`intake_dashboard` を同リストに足す＋doGetに分岐追加、で鍵必須になる。
- **フェーズenum**：受付/見学/体験/契約準備/利用開始準備/アーカイブ/ドロップ。**フェーズ順位**（到達判定用）：受付0 < 見学1 < 体験2 < 契約準備3 < 利用開始準備4。アーカイブ/ドロップは順位を持たず別扱い。
- **日付正規化**：アダプタが Date/文字列を `yyyy-MM-dd`（or `''`）へ。coreは文字列前提。日数計算は `INTAKE_DASH_daysBetween_(a,b)`（両方妥当な日付のときのみ数値、他は null）。
- テスト実行：`node scripts/test-intake-dashboard-core.js`（PASS/FAIL自前assert・既存 test-weekly-core.js と同型）。

## File Structure

- **Create** `gas/yawaragi-board/intake-dashboard-core.js` — 純ロジック（5関数＋集約 `intakeDashboard_`＋ヘルパ）。責務：正規化済み案件配列→5指標オブジェクト。
- **Create** `scripts/test-intake-dashboard-core.js` — Node単体テスト。
- **Modify** `gas/yawaragi-board/コード.js` — (1) 8725行のゲートリストに `'intake_dashboard'` 追加、(2) 1520行付近に doGet 分岐追加、(3) アダプタ `getIntakeDashboard(ss)` 追加（getIntakeFunnel の隣 9067行付近）。
- **Modify** `intake.html` — 新タブ「経営」ボタン＋パネル＋fetch＋描画＋空き枠(slotSet_/attendsCell_流用)。
- **Modify** `version.txt` ＋ `genba.html`（`bump-app-version.js` 経由）。

---

## Task 1: core — 需給対比 `dashStageBuckets_`

**Files:**
- Create: `gas/yawaragi-board/intake-dashboard-core.js`
- Test: `scripts/test-intake-dashboard-core.js`

- [ ] **Step 1: Write the failing test**

`scripts/test-intake-dashboard-core.js`:
```javascript
const C = require('../gas/yawaragi-board/intake-dashboard-core.js');
let pass = 0, fail = 0;
function eq(label, got, exp) {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label, '\n    got', g, '\n    exp', e); }
}

console.log('[dashStageBuckets_]');
{
  const cases = [
    { フェーズ:'受付' },
    { フェーズ:'見学', 見学完了:false },
    { フェーズ:'見学', 見学完了:true },
    { フェーズ:'体験', 体験完了:false },
    { フェーズ:'体験', 体験完了:true },
    { フェーズ:'契約準備' },
    { フェーズ:'利用開始準備' },                 // 開始待ち
    { フェーズ:'ドロップ' },                     // 除外
    { フェーズ:'アーカイブ' },                   // 除外
    { フェーズ:'見学', 見学完了:true, 利用者台帳反映済:true } // 除外
  ];
  const r = C.dashStageBuckets_(cases);
  eq('受付', r.受付, 1);
  eq('見学予定', r.進行中.見学予定, 1);
  eq('見学済', r.進行中.見学済, 1);
  eq('体験予定', r.進行中.体験予定, 1);
  eq('体験済', r.進行中.体験済, 1);
  eq('契約準備', r.進行中.契約準備, 1);
  eq('進行中合計M', r.進行中合計, 5);
  eq('開始待ち', r.開始待ち, 1);
}

console.log('\n[' + (fail ? 'FAIL' : 'OK') + '] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-intake-dashboard-core.js`
Expected: FAIL — `Cannot find module '../gas/yawaragi-board/intake-dashboard-core.js'`

- [ ] **Step 3: Write minimal implementation**

Create `gas/yawaragi-board/intake-dashboard-core.js`:
```javascript
// intake 経営ダッシュボード 純ロジック（P5・2026-07-11）
// テスト: scripts/test-intake-dashboard-core.js ／ 呼び出し元: コード.js getIntakeDashboard
// ※require()は持たない（GAS本番でロード時停止しない・他 *-core.js と同方式）。
// ※グローバルは INTAKE_DASH_ プレフィクス／core関数は dash*_ 命名（全域scope衝突回避）。

var INTAKE_DASH_PHASE_RANK = { '受付':0, '見学':1, '体験':2, '契約準備':3, '利用開始準備':4 };

// 進行中パイプラインの需給対比。ドロップ/アーカイブ/台帳反映済は除外。
function dashStageBuckets_(cases) {
  var r = { 受付:0, 進行中:{ 見学予定:0, 見学済:0, 体験予定:0, 体験済:0, 契約準備:0 }, 進行中合計:0, 開始待ち:0 };
  (cases || []).forEach(function(c) {
    var ph = String(c.フェーズ || '');
    if (ph === 'ドロップ' || ph === 'アーカイブ' || c.利用者台帳反映済 === true) return;
    if (ph === '受付') { r.受付++; return; }
    if (ph === '利用開始準備') { r.開始待ち++; return; }
    if (ph === '見学') { c.見学完了 === true ? r.進行中.見学済++ : r.進行中.見学予定++; }
    else if (ph === '体験') { c.体験完了 === true ? r.進行中.体験済++ : r.進行中.体験予定++; }
    else if (ph === '契約準備') { r.進行中.契約準備++; }
  });
  var p = r.進行中;
  r.進行中合計 = p.見学予定 + p.見学済 + p.体験予定 + p.体験済 + p.契約準備;
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dashStageBuckets_: dashStageBuckets_, INTAKE_DASH_PHASE_RANK: INTAKE_DASH_PHASE_RANK };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-intake-dashboard-core.js`
Expected: PASS — `8 passed, 0 failed`（このタスク分）

- [ ] **Step 5: Commit**

```bash
git add gas/yawaragi-board/intake-dashboard-core.js scripts/test-intake-dashboard-core.js
git commit -m "feat(intake-dash): 需給対比 dashStageBuckets_（開始待ち/受付別枠・除外・TDD）"
```

---

## Task 2: core — 日付ヘルパ `INTAKE_DASH_daysBetween_` ＋所要日数 `dashLeadTime_`

**Files:**
- Modify: `gas/yawaragi-board/intake-dashboard-core.js`
- Test: `scripts/test-intake-dashboard-core.js`

**契約：** 対象＝`本格利用開始日` があり かつ **過去日（<= today）** の案件のみ。フェーズ条件なし。各案件 `{氏名, days, source:'history'|'approx', 段階別?}`。`days`＝問い合わせ日→本格利用開始日。`source='history'` は 履歴に遷移が1件以上あるとき（段階別分解を付ける）、無ければ `'approx'`（全体日数のみ）。返り `{中央値, 件数, cases}`（件数0→中央値null）。

- [ ] **Step 1: Write the failing test**

`scripts/test-intake-dashboard-core.js` の集計printの前に追記:
```javascript
console.log('[INTAKE_DASH_daysBetween_]');
eq('10日差', C.INTAKE_DASH_daysBetween_('2026-06-01','2026-06-11'), 10);
eq('不正→null', C.INTAKE_DASH_daysBetween_('','2026-06-11'), null);

console.log('[dashLeadTime_]');
{
  const today = '2026-07-11';
  const cases = [
    // 過去日・履歴あり（段階別分解が出る）
    { 氏名:'A', 問い合わせ日:'2026-05-01', 本格利用開始日:'2026-05-31',
      履歴:[{from:'受付',to:'見学',at:'2026-05-08'},{from:'見学',to:'体験',at:'2026-05-18'},{from:'体験',to:'利用開始準備',at:'2026-05-31'}] },
    // 過去日・履歴なし（approx・全体日数のみ）
    { 氏名:'B', 問い合わせ日:'2026-05-01', 本格利用開始日:'2026-05-21', 履歴:[] },
    // 未来日の本格利用開始日（開始予定）→除外
    { 氏名:'C', 問い合わせ日:'2026-06-01', 本格利用開始日:'2026-08-01', 履歴:[] },
    // 本格利用開始日なし（開始待ち等）→除外
    { 氏名:'D', フェーズ:'利用開始準備', 問い合わせ日:'2026-06-01', 本格利用開始日:'', 履歴:[] }
  ];
  const r = C.dashLeadTime_(cases, today);
  eq('件数=2(過去日のみ)', r.件数, 2);
  eq('中央値=(30+20)/2=25', r.中央値, 25);
  eq('Aはhistory', r.cases[0].source, 'history');
  eq('Bはapprox', r.cases[1].source, 'approx');
  eq('A段階別に受付→見学=7', r.cases[0].段階別['受付→見学'], 7);
  eq('Bは段階別なし', r.cases[1].段階別, undefined);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-intake-dashboard-core.js`
Expected: FAIL — `C.INTAKE_DASH_daysBetween_ is not a function`

- [ ] **Step 3: Write minimal implementation**

`intake-dashboard-core.js` の export ブロックの前に追記:
```javascript
// yyyy-MM-dd 2つの日数差（b - a）。どちらか不正なら null。
function INTAKE_DASH_daysBetween_(a, b) {
  var da = new Date(String(a || '').slice(0,10) + 'T00:00:00');
  var db = new Date(String(b || '').slice(0,10) + 'T00:00:00');
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function INTAKE_DASH_median_(nums) {
  if (!nums.length) return null;
  var s = nums.slice().sort(function(x,y){ return x - y; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

// 所要日数（問い合わせ日→本格利用開始日）。対象＝本格利用開始日が過去日のみ。
function dashLeadTime_(cases, today) {
  var out = [];
  (cases || []).forEach(function(c) {
    var start = String(c.本格利用開始日 || '');
    if (!start) return;
    if (INTAKE_DASH_daysBetween_(today, start) > 0) return; // 未来日は除外
    var days = INTAKE_DASH_daysBetween_(c.問い合わせ日, start);
    if (days === null) return;
    var hist = Array.isArray(c.履歴) ? c.履歴 : [];
    var rec = { 氏名: c.氏名 || '', days: days, source: hist.length ? 'history' : 'approx' };
    if (hist.length) {
      var seg = {};
      hist.forEach(function(h) {
        var d = INTAKE_DASH_daysBetween_(c.問い合わせ日, h.at);
        // 直前の at からの差でなく「from→to」ラベルで各遷移の到達日から前遷移を引く
      });
      // from→to ごとの所要＝ (この遷移のat) − (前遷移のat or 問い合わせ日)
      var prevAt = c.問い合わせ日;
      hist.forEach(function(h) {
        var d = INTAKE_DASH_daysBetween_(prevAt, h.at);
        if (d !== null) seg[h.from + '→' + h.to] = d;
        prevAt = h.at;
      });
      rec.段階別 = seg;
    }
    out.push(rec);
  });
  var nums = out.map(function(r){ return r.days; });
  return { 中央値: INTAKE_DASH_median_(nums), 件数: out.length, cases: out };
}
```
そして export を更新:
```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dashStageBuckets_: dashStageBuckets_,
    dashLeadTime_: dashLeadTime_,
    INTAKE_DASH_daysBetween_: INTAKE_DASH_daysBetween_,
    INTAKE_DASH_median_: INTAKE_DASH_median_,
    INTAKE_DASH_PHASE_RANK: INTAKE_DASH_PHASE_RANK
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-intake-dashboard-core.js`
Expected: PASS（Task1+2分すべて）

- [ ] **Step 5: Commit**

```bash
git add gas/yawaragi-board/intake-dashboard-core.js scripts/test-intake-dashboard-core.js
git commit -m "feat(intake-dash): 所要日数 dashLeadTime_（過去日限定/履歴段階別/approx・中央値・TDD）"
```

---

## Task 3: core — 到達判定 `dashReached_` ＋転換率 `dashConversion_`

**Files:**
- Modify: `gas/yawaragi-board/intake-dashboard-core.js`
- Test: `scripts/test-intake-dashboard-core.js`

**契約：** 到達判定は履歴優先→無ければ現フェーズ順位＋日付列/完了フラグで概算。転換率は見学到達→体験到達／体験到達→契約到達。分母＝直前段階到達 かつ 次段階の成否確定（次段階到達 or ドロップ）。分子＝次段階到達。進行中N＝直前到達 かつ 未確定 かつ 非ドロップ（分母分子から除外）。全期間・全案件。

- [ ] **Step 1: Write the failing test**

追記:
```javascript
console.log('[dashConversion_]');
{
  const cases = [
    // 見学到達→体験到達→契約到達（全確定・履歴あり）
    { フェーズ:'契約準備', 見学完了:true, 体験完了:true, 契約日:'2026-06-10',
      履歴:[{from:'受付',to:'見学',at:'x'},{from:'見学',to:'体験',at:'x'},{from:'体験',to:'契約準備',at:'x'}] },
    // 見学到達したが体験前にドロップ（見学→体験の分母に入る・分子に入らない）
    { フェーズ:'ドロップ', 見学日:'2026-06-01', 履歴:[] },
    // 見学到達したが体験まだ・活動中（進行中N・分母にも分子にも入らない）
    { フェーズ:'見学', 見学完了:true, 履歴:[] },
    // 受付のみ（見学未到達・どこにも入らない）
    { フェーズ:'受付', 履歴:[] }
  ];
  const r = C.dashConversion_(cases);
  // 見学→体験: 分母=case0(体験到達)+case1(ドロップ)=2, 分子=case0=1, 進行中N=case2=1
  eq('見学到達→体験 分母', r.見学到達_体験到達.分母, 2);
  eq('見学到達→体験 分子', r.見学到達_体験到達.分子, 1);
  eq('見学到達→体験 進行中N', r.見学到達_体験到達.進行中N, 1);
  eq('見学到達→体験 率', r.見学到達_体験到達.率, 0.5);
  // 体験→契約: 分母=case0=1, 分子=case0=1
  eq('体験到達→契約 分母', r.体験到達_契約到達.分母, 1);
  eq('体験到達→契約 分子', r.体験到達_契約到達.分子, 1);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-intake-dashboard-core.js`
Expected: FAIL — `r.見学到達_体験到達 is undefined`

- [ ] **Step 3: Write minimal implementation**

export前に追記:
```javascript
// 案件が stage（'見学'|'体験'|'契約準備'）に到達したか。履歴優先→現フェーズ/日付/フラグで概算。
function dashReached_(c, stage) {
  var hist = Array.isArray(c.履歴) ? c.履歴 : [];
  var wantRank = INTAKE_DASH_PHASE_RANK[stage];
  // 履歴の to の最大到達ランク
  for (var i = 0; i < hist.length; i++) {
    var r = INTAKE_DASH_PHASE_RANK[hist[i].to];
    if (r !== undefined && r >= wantRank) return true;
  }
  // 現フェーズ順位（ドロップ/アーカイブは順位なし＝この経路では判定しない）
  var cur = INTAKE_DASH_PHASE_RANK[String(c.フェーズ || '')];
  if (cur !== undefined && cur >= wantRank) return true;
  // 日付列/完了フラグでの概算
  if (stage === '見学'   && (c.見学日 || c.見学完了 === true)) return true;
  if (stage === '体験'   && c.体験完了 === true) return true;
  if (stage === '契約準備' && (c.契約日 || c.契約書取り交わし済 === true)) return true;
  return false;
}

// 段階遷移の歩留まり（累計）。進行中は分母/分子から除外し別枠。
function dashConversion_(cases) {
  function step(fromStage, toStage) {
    var 分母 = 0, 分子 = 0, 進行中N = 0;
    (cases || []).forEach(function(c) {
      if (!dashReached_(c, fromStage)) return;          // 直前段階に到達した案件のみ
      var reachedNext = dashReached_(c, toStage);
      var dropped = String(c.フェーズ || '') === 'ドロップ';
      if (reachedNext) { 分母++; 分子++; }
      else if (dropped) { 分母++; }                     // 到達せずドロップ＝確定failure
      else { 進行中N++; }                               // 未確定＝進行中（分母外）
    });
    return { 分母: 分母, 分子: 分子, 率: 分母 ? Math.round(分子 / 分母 * 1000) / 1000 : null, 進行中N: 進行中N };
  }
  return {
    見学到達_体験到達: step('見学', '体験'),
    体験到達_契約到達: step('体験', '契約準備')
  };
}
```
export に `dashConversion_`, `dashReached_` を追加。

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-intake-dashboard-core.js`
Expected: PASS（Task1-3分）。特に「進行中N=1 が 分母に入っていない（分母=2）」を確認。

- [ ] **Step 5: Commit**

```bash
git add gas/yawaragi-board/intake-dashboard-core.js scripts/test-intake-dashboard-core.js
git commit -m "feat(intake-dash): 転換率 dashConversion_（履歴優先到達判定・進行中を分母外で別枠・TDD）"
```

---

## Task 4: core — 問合せ元別 `dashSources_`

**Files:** Modify core ＋ test。

**契約：** 連絡元区分ごと `{件数, 利用開始数}`（利用開始数＝本格利用開始日ありの累計）。＋問い合わせ日 `yyyy-MM` 別の月次件数。空区分は `'未設定'`。

- [ ] **Step 1: Write the failing test**
```javascript
console.log('[dashSources_]');
{
  const cases = [
    { 連絡元区分:'ケアマネ', 問い合わせ日:'2026-06-03', 本格利用開始日:'2026-06-30' },
    { 連絡元区分:'ケアマネ', 問い合わせ日:'2026-06-10', 本格利用開始日:'' },
    { 連絡元区分:'', 問い合わせ日:'2026-05-20', 本格利用開始日:'2026-06-01' }
  ];
  const r = C.dashSources_(cases);
  eq('ケアマネ件数', r.区分別['ケアマネ'].件数, 2);
  eq('ケアマネ利用開始数', r.区分別['ケアマネ'].利用開始数, 1);
  eq('未設定件数', r.区分別['未設定'].件数, 1);
  eq('月次2026-06', r.月次['2026-06'], 2);
  eq('月次2026-05', r.月次['2026-05'], 1);
}
```

- [ ] **Step 2: Run** — Expected FAIL `dashSources_ is not a function`.

- [ ] **Step 3: Implement**
```javascript
function dashSources_(cases) {
  var 区分別 = {}, 月次 = {};
  (cases || []).forEach(function(c) {
    var k = String(c.連絡元区分 || '').trim() || '未設定';
    if (!区分別[k]) 区分別[k] = { 件数:0, 利用開始数:0 };
    区分別[k].件数++;
    if (String(c.本格利用開始日 || '')) 区分別[k].利用開始数++;
    var ym = String(c.問い合わせ日 || '').slice(0,7);
    if (ym.length === 7) 月次[ym] = (月次[ym] || 0) + 1;
  });
  return { 区分別: 区分別, 月次: 月次 };
}
```
export追加。

- [ ] **Step 4: Run** — Expected PASS。
- [ ] **Step 5: Commit** — `git commit -m "feat(intake-dash): 問合せ元別 dashSources_（区分別件数+利用開始数+月次・TDD)"`

---

## Task 5: core — 失注理由 `dashLostReasons_`

**Files:** Modify core ＋ test。

**契約：** ドロップ案件（フェーズ==ドロップ）を理由別 `{件数}`（空理由=`'未設定'`）＋一覧 `[{氏名, 到達段階, 到達段階approx, 理由, 日付}]`（日付降順）。`到達段階`＝到達したmax段階の日本語名（未到達は`'受付'`）。`到達段階approx`＝履歴なし=`true`。

- [ ] **Step 1: Write the failing test**
```javascript
console.log('[dashLostReasons_]');
{
  const cases = [
    { フェーズ:'ドロップ', 氏名:'X', 見学日:'2026-06-01', ドロップ理由:'他事業所に決定', ドロップ記録日時:'2026-06-05', 履歴:[] },
    { フェーズ:'ドロップ', 氏名:'Y', ドロップ理由:'', ドロップ記録日時:'2026-06-08',
      履歴:[{from:'受付',to:'見学',at:'x'},{from:'見学',to:'体験',at:'x'}] },
    { フェーズ:'見学', 氏名:'Z' } // ドロップでない→対象外
  ];
  const r = C.dashLostReasons_(cases);
  eq('理由 他事業所=1', r.理由別['他事業所に決定'], 1);
  eq('理由 未設定=1', r.理由別['未設定'], 1);
  eq('一覧件数', r.一覧.length, 2);
  eq('日付降順 先頭Y', r.一覧[0].氏名, 'Y');
  eq('X 到達段階=見学', r.一覧[1].到達段階, '見学');
  eq('X approx=true(履歴なし)', r.一覧[1].到達段階approx, true);
  eq('Y 到達段階=体験', r.一覧[0].到達段階, '体験');
  eq('Y approx=false(履歴あり)', r.一覧[0].到達段階approx, false);
}
```

- [ ] **Step 2: Run** — Expected FAIL。

- [ ] **Step 3: Implement**
```javascript
// 到達した最上位段階の日本語名（未到達は'受付'）。判定は dashReached_ を流用。
function dashMaxReachedLabel_(c) {
  if (dashReached_(c, '契約準備')) return '契約準備';
  if (dashReached_(c, '体験')) return '体験';
  if (dashReached_(c, '見学')) return '見学';
  return '受付';
}

function dashLostReasons_(cases) {
  var 理由別 = {}, 一覧 = [];
  (cases || []).forEach(function(c) {
    if (String(c.フェーズ || '') !== 'ドロップ') return;
    var rsn = String(c.ドロップ理由 || '').trim() || '未設定';
    理由別[rsn] = (理由別[rsn] || 0) + 1;
    var hist = Array.isArray(c.履歴) ? c.履歴 : [];
    一覧.push({
      氏名: c.氏名 || '', 到達段階: dashMaxReachedLabel_(c), 到達段階approx: hist.length === 0,
      理由: rsn, 日付: String(c.ドロップ記録日時 || '')
    });
  });
  一覧.sort(function(a,b){ return a.日付 < b.日付 ? 1 : (a.日付 > b.日付 ? -1 : 0); }); // 降順
  return { 理由別: 理由別, 一覧: 一覧 };
}
```
export に `dashLostReasons_`, `dashMaxReachedLabel_` 追加。

- [ ] **Step 4: Run** — Expected PASS。
- [ ] **Step 5: Commit** — `git commit -m "feat(intake-dash): 失注理由 dashLostReasons_（理由別+個別一覧+到達段階approx・TDD)"`

---

## Task 6: core — 集約 `intakeDashboard_` ＋ エッジ

**Files:** Modify core ＋ test。

**契約：** `intakeDashboard_(cases, today)` が5指標を1オブジェクトに束ねて返す。空配列・壊れ履歴で落ちない。

- [ ] **Step 1: Write the failing test**
```javascript
console.log('[intakeDashboard_ 集約・エッジ]');
{
  const r = C.intakeDashboard_([], '2026-07-11');
  eq('空:需給受付0', r.需給.受付, 0);
  eq('空:所要件数0', r.所要日数.件数, 0);
  eq('空:所要中央値null', r.所要日数.中央値, null);
  eq('空:転換率率null', r.転換率.見学到達_体験到達.率, null);
  eq('空:失注一覧空', r.失注.一覧.length, 0);
  // 履歴が配列でない(壊れ)→[]扱いで落ちない
  const r2 = C.intakeDashboard_([{ フェーズ:'ドロップ', 氏名:'W', 履歴:null }], '2026-07-11');
  eq('壊れ履歴でも失注1', r2.失注.一覧.length, 1);
}
```

- [ ] **Step 2: Run** — Expected FAIL `intakeDashboard_ is not a function`。

- [ ] **Step 3: Implement**
```javascript
function intakeDashboard_(cases, today) {
  var list = Array.isArray(cases) ? cases : [];
  return {
    需給: dashStageBuckets_(list),
    所要日数: dashLeadTime_(list, today),
    問合せ元: dashSources_(list),
    転換率: dashConversion_(list),
    失注: dashLostReasons_(list)
  };
}
```
export に `intakeDashboard_` 追加。

- [ ] **Step 4: Run** — Expected PASS（全タスク緑）。末尾の合計 `[OK] N passed, 0 failed` を確認。

- [ ] **Step 5: Commit** — `git commit -m "feat(intake-dash): 集約 intakeDashboard_ + 空/壊れ履歴エッジ（core完成・TDD)"`

---

## Task 7: GAS アダプタ `getIntakeDashboard` ＋ ゲート ＋ doGet 分岐

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（3箇所）

- [ ] **Step 1: ゲートリストに追加**

`コード.js:8725` を編集:
```javascript
var INTAKE_GATED_GET_ACTIONS_  = ['intake_list', 'intake_followup_pending', 'intake_get_funnel', 'intake_dashboard'];
```

- [ ] **Step 2: doGet に分岐追加**

`コード.js:1538`（`intake_get_funnel` 分岐の直後）に追加:
```javascript
    if (action === 'intake_dashboard') {
      return respond(getIntakeDashboard(ss), callback);
    }
```

- [ ] **Step 3: アダプタ関数を追加**

`コード.js` の `getIntakeFunnel` 定義の直後（9067行付近）に追加。**行→案件obj正規化**（日付は yyyy-MM-dd 文字列化・履歴は try-parse）:
```javascript
// P5 経営ダッシュボード：見学体験新規 全行を正規化して intakeDashboard_（純ロジック）に渡す薄アダプタ。
function getIntakeDashboard(ss) {
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: 'シートなし' };
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { success: true, dashboard: intakeDashboard_([], _dashToday_()) };
  var headers = values[0].map(function(v){ return String(v).trim(); });
  function col(name){ return headers.indexOf(name); }
  var idx = {
    氏名: col('氏名'), フェーズ: col('フェーズ'), 見学完了: col('見学完了'), 体験完了: col('体験完了'),
    問い合わせ日: col('問い合わせ日'), 見学日: col('見学日'), 予定日: col('予定日'), 契約日: col('契約日'),
    本格利用開始日: col('本格利用開始日'), ドロップ記録日時: col('ドロップ記録日時'),
    連絡元区分: col('連絡元区分'), 利用意向: col('利用意向'), ドロップ理由: col('ドロップ理由'),
    利用者台帳反映済: col('利用者台帳反映済'), 契約書取り交わし済: col('契約書取り交わし済'),
    フェーズ遷移履歴: col('フェーズ遷移履歴')
  };
  function dstr(v){ // Date/文字列 → yyyy-MM-dd or ''
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    var s = String(v || '').trim();
    return s.length >= 10 ? s.slice(0,10) : (s.length >= 7 ? s : '');
  }
  function boolv(v){ return v === true || String(v) === 'true' || String(v) === 'TRUE'; }
  var cases = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var hist = [];
    if (idx.フェーズ遷移履歴 >= 0) {
      try { var h = JSON.parse(String(row[idx.フェーズ遷移履歴] || '[]')); if (Array.isArray(h)) hist = h; }
      catch (e) { hist = []; }
    }
    cases.push({
      氏名: idx.氏名>=0 ? String(row[idx.氏名]||'') : '',
      フェーズ: idx.フェーズ>=0 ? String(row[idx.フェーズ]||'') : '',
      見学完了: idx.見学完了>=0 ? boolv(row[idx.見学完了]) : false,
      体験完了: idx.体験完了>=0 ? boolv(row[idx.体験完了]) : false,
      問い合わせ日: idx.問い合わせ日>=0 ? dstr(row[idx.問い合わせ日]) : '',
      見学日: idx.見学日>=0 ? dstr(row[idx.見学日]) : '',
      契約日: idx.契約日>=0 ? dstr(row[idx.契約日]) : '',
      本格利用開始日: idx.本格利用開始日>=0 ? dstr(row[idx.本格利用開始日]) : '',
      ドロップ記録日時: idx.ドロップ記録日時>=0 ? dstr(row[idx.ドロップ記録日時]) : '',
      連絡元区分: idx.連絡元区分>=0 ? String(row[idx.連絡元区分]||'') : '',
      ドロップ理由: idx.ドロップ理由>=0 ? String(row[idx.ドロップ理由]||'') : '',
      利用者台帳反映済: idx.利用者台帳反映済>=0 ? boolv(row[idx.利用者台帳反映済]) : false,
      契約書取り交わし済: idx.契約書取り交わし済>=0 ? boolv(row[idx.契約書取り交わし済]) : false,
      履歴: hist
    });
  }
  return { success: true, dashboard: intakeDashboard_(cases, _dashToday_()) };
}

function _dashToday_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }
```

- [ ] **Step 4: 構文チェック（Node で parse だけ確認）**

Run: `node --check gas/yawaragi-board/コード.js`
Expected: エラーなし（構文OK）。※GAS API（Utilities等）は実行しないので --check は構文のみ。

- [ ] **Step 5: Commit**

```bash
git add gas/yawaragi-board/コード.js
git commit -m "feat(intake-dash): GAS intake_dashboard（P2.1ゲート追加+doGet分岐+正規化アダプタ・getIntakeFunnel非改変)"
```

---

## Task 8: フロント — intake.html 新タブ「経営」

**Files:**
- Modify: `intake.html`

**注意：** ダッシュJS/HTMLは**intake.htmlインライン**に置く（shared.jsは?v=無しでキャッシュ事故）。空き枠は週間予定表の `slotSet_`/`attendsCell_` を流用（素朴indexOf禁止＝複合ampm宮さん幽霊再発防止）。

- [ ] **Step 1: 既存タブUIを読む**

`intake.html` 内のタブ切替の実装（タブボタンのclass・onclick・パネル表示切替関数）を grep で特定して踏襲する:
Run: `grep -n "tab\|switchTab\|active" intake.html | head -30`
既存タブと同じ仕組みで「経営」ボタン＋パネル `<div id="tab-keiei">` を追加する。

- [ ] **Step 2: 経営タブのfetch＋描画コードを追加（インライン`<script>`）**

`intake.html` の既存スクリプト末尾付近に追加。`BOARD_URL`/`getIntakeAdminKey`/`jsonp` は既存の intake.html 内実装を再利用（無ければ週間予定表.html と同型の jsonp を1つ追加）:
```javascript
function loadKeieiDashboard() {
  var url = BOARD_URL + '?action=intake_dashboard&adminKey=' + encodeURIComponent(getIntakeAdminKey()) + '&callback=__kd&_=' + Date.now();
  var s = document.createElement('script');
  window.__kd = function(res){
    document.body.removeChild(s); delete window.__kd;
    if (res && res.error === 'unauthorized') { handleIntakeUnauthorized(); return; } // 既存の鍵再入力へ
    if (!res || !res.success) { document.getElementById('tab-keiei').innerHTML = '<p>取得失敗</p>'; return; }
    renderKeiei(res.dashboard);
  };
  s.src = url; document.body.appendChild(s);
}

function renderKeiei(d) {
  var supply = computeVacantSlots();               // 空き枠（週間予定表流用・Step3）
  var m = d.需給.進行中合計;
  var html = '';
  // ① 需給対比
  html += '<section class="kd-sec"><h3>需給対比</h3>';
  html += '<div class="kd-supply">空き枠 <b>' + supply + '</b> ／ 開始待ち <b>' + d.需給.開始待ち + '</b> ／ 進行中 <b>' + m + '</b> ／ 受付 <b>' + d.需給.受付 + '</b></div>';
  var p = d.需給.進行中;
  html += '<div class="kd-pipe">見学予定 ' + p.見学予定 + '・見学済 ' + p.見学済 + '・体験予定 ' + p.体験予定 + '・体験済 ' + p.体験済 + '・契約準備 ' + p.契約準備 + '</div></section>';
  // ② 所要日数
  html += '<section class="kd-sec"><h3>所要日数（問合せ→本格利用開始）</h3>';
  html += '<p>中央値 <b>' + (d.所要日数.中央値 == null ? '—' : d.所要日数.中央値 + '日') + '</b>（' + d.所要日数.件数 + '件）</p><ul>';
  d.所要日数.cases.forEach(function(c){
    html += '<li>' + esc(c.氏名) + '：' + c.days + '日' + (c.source === 'approx' ? ' <span class="kd-approx">※日付列からの概算</span>' : '') + '</li>';
  });
  html += '</ul></section>';
  // ③ 問合せ元別
  html += '<section class="kd-sec"><h3>問合せ元別</h3><ul>';
  Object.keys(d.問合せ元.区分別).forEach(function(k){
    var v = d.問合せ元.区分別[k];
    html += '<li>' + esc(k) + '：' + v.件数 + '件（うち利用開始 ' + v.利用開始数 + '）</li>';
  });
  html += '</ul><div class="kd-monthly">' + Object.keys(d.問合せ元.月次).sort().map(function(ym){ return ym + ':' + d.問合せ元.月次[ym]; }).join(' / ') + '</div></section>';
  // ④ 転換率
  html += '<section class="kd-sec"><h3>転換率（累計）</h3>';
  html += kdRate('見学到達→体験到達', d.転換率.見学到達_体験到達);
  html += kdRate('体験到達→契約到達', d.転換率.体験到達_契約到達) + '</section>';
  // ⑤ 失注理由
  html += '<section class="kd-sec"><h3>失注理由</h3><ul>';
  Object.keys(d.失注.理由別).forEach(function(k){ html += '<li>' + esc(k) + '：' + d.失注.理由別[k] + '件</li>'; });
  html += '</ul><ol class="kd-lost">';
  d.失注.一覧.forEach(function(x){
    html += '<li>' + esc(x.氏名) + '（' + x.到達段階 + (x.到達段階approx ? '※推定' : '') + '）／' + esc(x.理由) + '／' + x.日付 + '</li>';
  });
  html += '</ol></section>';
  document.getElementById('tab-keiei').innerHTML = html;
}
function kdRate(label, r) {
  var pct = r.率 == null ? '—' : Math.round(r.率 * 100) + '%';
  return '<div class="kd-rate">' + label + '：<b>' + pct + '</b>（' + r.分子 + '/' + r.分母 + '）＋進行中 ' + r.進行中N + '件</div>';
}
function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
```
タブ選択時に `loadKeieiDashboard()` を呼ぶ。`handleIntakeUnauthorized`/`getIntakeAdminKey` が intake.html に無ければ既存の鍵取得実装名に合わせる（Step1で確認した名前を使う）。

- [ ] **Step 3: 空き枠計算 `computeVacantSlots()`（週間予定表流用）**

週間予定表.html の `slotSet_`/`attendsCell_`（曜日別ampmパース）を intake.html にも持ち込み、在籍daicho（riyousha-daichou-api 既定）から `Σ(18 − 各枠現員)`（am/pm×月〜金）を計算する:
```javascript
// ---- 週間予定表.html と同一ロジック（複合ampm宮さん幽霊防止・素朴indexOf禁止）----
var KD_WEEKDAY_CHARS = ['月','火','水','木','金','土','日'];
var KD_SLOT_OF = { am:'午前', pm:'午後' };
function slotSet_(days, ampm){
  var daysStr = String(days||''); var dayList = KD_WEEKDAY_CHARS.filter(function(d){ return daysStr.indexOf(d)>=0; });
  var set = {};
  String(ampm||'').split(/[、，,]/).forEach(function(seg){
    seg = String(seg).trim(); if(!seg) return;
    var slots = []; if (seg.indexOf('午前')>=0) slots.push('午前'); if (seg.indexOf('午後')>=0) slots.push('午後');
    if (!slots.length) return;
    var segDays = KD_WEEKDAY_CHARS.filter(function(d){ return seg.indexOf(d)>=0; });
    if (segDays.length){ segDays.forEach(function(d){ if(dayList.indexOf(d)>=0) slots.forEach(function(s){ set[d+'|'+s]=true; }); }); }
    else { dayList.forEach(function(d){ slots.forEach(function(s){ set[d+'|'+s]=true; }); }); }
  });
  return set;
}
function attendsCell_(days, ampm, day, sess){ return !!slotSet_(days, ampm)[day+'|'+KD_SLOT_OF[sess]]; }
// 在籍daicho(グローバル kdDaicho:[{days,ampm}])から空き枠合計を出す
function computeVacantSlots(){
  var DAYS = ['月','火','水','木','金'], SESS = ['am','pm'], CAP = 18, vac = 0;
  DAYS.forEach(function(day){ SESS.forEach(function(sess){
    var n = 0; (window.kdDaicho||[]).forEach(function(u){ if (attendsCell_(u.days, u.ampm, day, sess)) n++; });
    vac += Math.max(0, CAP - n);
  }); });
  return vac;
}
```
在籍daicho取得は既存の DAICHO_URL 呼び出しを流用し `window.kdDaicho` にセット（週間予定表.html と同じ既定エンドポイント＝在籍111・status空でも在籍）。ダッシュボード描画前に daicho ロード完了を待つ。

- [ ] **Step 4: 実機確認（file://ではなくpreview-server）**

Run: `node scripts/preview-server.js`（あれば）。ブラウザで intake.html を開き「経営」タブ→鍵入力→5セクション描画。空き枠数が週間予定表.html と一致することを目視突合。
Expected: unauthorized時は鍵プロンプト、鍵ありで5指標描画、空き枠一致。
※実データ＝鍵要so最終確認は社長。ここではコンソールエラーなし・レイアウト崩れなしまで。

- [ ] **Step 5: Commit**

```bash
git add intake.html
git commit -m "feat(intake-dash): 経営タブUI（5指標描画+空き枠slotSet_流用+unauthorized鍵フロー・インライン)"
```

---

## Task 9: 配信（版bump＋push＋三点セット＋社長実測）

**Files:**
- Modify: `version.txt`・`genba.html`（bump-app-version.js 経由）
- Deploy: clasp（board GAS）

- [ ] **Step 1: master同期・クリーン確認**

Run:
```bash
git fetch origin master && git rev-list --left-right --count HEAD...origin/master && git status --short
```
Expected: behind 0（divergedなら `git rebase origin/master`）・target dirty なし。

- [ ] **Step 2: GAS を clasp deploy（同一URL維持）**

Run（clasp-gas-deploy-url-iji の手順）: `cd gas/yawaragi-board && clasp push && clasp deploy -i "<既存deploymentID>"`
Expected: 新バージョン番号（@317等）。※deploy前に `clasp pull` で本番と突合（過去に本番のみ機能消し事故）。認証切れ時は再認証。

- [ ] **Step 3: GAS疎通実測（鍵ゲート）**

鍵なし: `curl -sL "<BOARD_URL>?action=intake_dashboard&callback=cb" | head -c 200`
Expected: `cb({"error":"unauthorized","status":401})`
鍵あり実測は**社長に依頼**（鍵はクロコ非保有）。「鍵ありで success + dashboard が返る／件数が実シートと一致」を社長確認。

- [ ] **Step 4: 版bump（intake.html は版ゲート対象）**

Run: `node scripts/bump-app-version.js 2026-07-XX-NN`（次の連番。飛びは先祖返りsoログ確認）
Expected: version.txt＋genba.html shared.js?v= 同期コミット。SHAと push/verify コマンド提示（案A＝push停止）。

- [ ] **Step 5: push＋verify＋三点セット（社長承認のうえ）**

Run（社長OK後）: `git push origin master` → `node scripts/bump-app-version.js --verify 2026-07-XX-NN`
三点セット確認:
1. `git rev-parse HEAD` = `git ls-remote origin master`（SHA一致）
2. 本番 version.txt = 新版（verify成功出力）
3. github.io intake.html 実コードに「経営」タブ＋`intake_dashboard` 呼び出しが含有（`curl -sL <intake.html URL> | grep intake_dashboard`）

- [ ] **Step 6: 完了報告＋memory更新**

完了条件チェック（設計§9）を証跡付きで報告。memory `project_intake案件台帳化-P1完了-P5宿題`（or 新規P5）を「P5反映済」に更新し MEMORY.md 追記。

---

## Self-Review（この計画の自己点検・記録）

- **Spec coverage**：需給(Task1)・所要日数(Task2)・転換率(Task3)・問合せ元(Task4)・失注(Task5)・集約/エッジ(Task6)・GAS配線+ゲート(Task7)・フロント+空き枠(Task8)・配信(Task9) — 設計§5.1〜5.6・§6・§7・§8・§9 を全被覆。
- **社長補正3点**：①所要日数=本格利用開始日過去日のみ（Task2 test の C/D 除外で実証）②失注approx（Task5 test で history有無の approx 実証）③空き枠 slotSet_流用（Task8 Step3・素朴indexOf禁止明記）。
- **型整合**：core関数名（`dashStageBuckets_`/`dashLeadTime_`/`dashConversion_`/`dashReached_`/`dashSources_`/`dashLostReasons_`/`dashMaxReachedLabel_`/`intakeDashboard_`）は Task1-6 で定義→Task7 で `intakeDashboard_` を呼ぶ、で一致。返りキー（需給/所要日数/問合せ元/転換率/失注、`見学到達_体験到達`/`体験到達_契約到達`、`区分別`/`月次`、`理由別`/`一覧`）は Task6集約→Task8描画で一致。
- **非改変の担保**：getIntakeFunnel（Task7で触らない）・appendPhaseHistory_・シート構造・P2.1ロジック（リスト1行追加のみ）。
