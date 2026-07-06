# 欠席box ちらつき修正（3状態モデル）実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未取得/失敗/timeout/空応答を「0件＝欠席なし」と誤認する連絡漏れ直結バグを、forward軸の3状態ゲート（描画出口一箇所での封じ）で修正する。

**Architecture:** flickerブランチの設計を-25構造へ再実装。core純関数 `kbIsOkResponse_`/`kbDecideLoad_` を移植、genba側に `loadedOnce`/`forwardOk` 状態＋インライン判定関数を追加し、`kbLoad`（retry+ok判定+preserve）と `kbRender`（"欠席なし"を成功確定時のみ）を改修。実測ハーネスで4状態＋3追加観点を実駆動証明。

**Tech Stack:** 素のHTML/JS（genba.html）、Node構造証明/純関数テスト（scripts/test-genba-kesseki-box.js）、core純関数（gas/yawaragi-board/kesseki-box-core.js）、DOMスタブ実駆動ハーネス（scripts/verify-kbox-flicker-3state.js 新設）。

**Spec:** [docs/superpowers/specs/2026-07-07-kbox-flicker-3state-design.md](../specs/2026-07-07-kbox-flicker-3state-design.md)

---

## 3追加観点 → テストID対応（クロ指示）
- **① 遅延成功/ローディング固着封じ** → ハーネス **Scenario F**（F1 retry内成功→カード／F2 総失敗→エラー表示(固着せず)／F3 総失敗後の再kbLoad成功→カード）
- **② 月GET先着・forward後着の上書き競合** → ハーネス **Scenario G**（G1 月キャッシュ有+forward失敗→カード保持・欠席なし不出／G2 forward空応答でも保持）
- **③ 非当日ビューの3状態** → ハーネス **Scenario H**（H1 未来日・月未充填→読込中(欠席なし不出)／H2 月成功0件→欠席なし(loaded)／H3 月成功N件→カード／H4 過去日も同様）

---

## File Structure
- **Modify** `gas/yawaragi-board/kesseki-box-core.js` — `kbIsOkResponse_`/`kbDecideLoad_` 追加＋export（Task1）。
- **Modify** `genba.html` — インライン判定関数・kbState・kbLoad・kbRender 改修（Task2-5）。
- **Modify** `scripts/test-genba-kesseki-box.js` — core G群＋構造証明 追加（既存49/69非破壊）。
- **Create** `scripts/verify-kbox-flicker-3state.js` — 実測ハーネス（Task6）。
- **Modify**（bump-script経由・手編集しない）`version.txt`＋`genba.html` shared.js?v=（Task7）。

---

## Task 1: core `kbIsOkResponse_` / `kbDecideLoad_` 追加

**Files:**
- Modify: `gas/yawaragi-board/kesseki-box-core.js`（`kbUnitGroup_` 定義の直後・export追記）
- Test: `scripts/test-genba-kesseki-box.js`（core末尾 `console.log(\`kesseki-box core…\`)` の直前）

- [ ] **Step 1: 失敗するcore純関数テストを追記**

`scripts/test-genba-kesseki-box.js` の `console.log(\`kesseki-box core: ${pass} PASS / ${fail} FAIL\`);` の直前に追記:
```javascript
// V. kbIsOkResponse_ / kbDecideLoad_（3状態判定・点滅封じの心臓）
ok(core.kbIsOkResponse_({ absences: { absences: [] } }) === true,  'V1: 構造整った成功0件 → ok');
ok(core.kbIsOkResponse_({ absences: { absences: [{}] } }) === true, 'V2: 成功N件 → ok');
ok(core.kbIsOkResponse_(null) === false,  'V3: null(失敗/timeout) → not ok');
ok(core.kbIsOkResponse_({}) === false,    'V4: 空応答(構造欠落) → not ok');
ok(core.kbIsOkResponse_({ absences: {} }) === false, 'V5: absences.absencesが配列でない → not ok');
const _r = core.kbDecideLoad_;
ok(_r(null, '2026-07-06', true).outcome === 'errored',   'V6: 失敗×初回 → errored');
ok(_r(null, '2026-07-06', false).outcome === 'preserve', 'V7: 失敗×既存あり → preserve(触らない)');
ok(_r({ absences: { absences: [] } }, '2026-07-06', false).outcome === 'empty', 'V8: 成功0件 → empty(欠席なしOK)');
ok(_r({ absences: { absences: [{ date: '2026-07-06', name: 'A', isLongTerm: false }] } }, '2026-07-06', false).outcome === 'list', 'V9: 成功N件 → list');
ok(_r({ absences: { absences: [{ date: '2026-07-07', name: 'B', isLongTerm: false }] } }, '2026-07-06', false).outcome === 'empty', 'V10: 成功だが当日0(明日のみ) → empty');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `TypeError: core.kbIsOkResponse_ is not a function`（V1で例外）

- [ ] **Step 3: core.js に関数追加＋export**

`function kbUnitGroup_(unit) { … }` の直後（`if (typeof module …` の直前）に追加:
```javascript
function kbIsOkResponse_(resp) {
  return !!(resp && resp.absences && Array.isArray(resp.absences.absences));
}
// kbLoad の描画判断（純関数）。resp=absences応答(失敗時null)、todayYMD=本日、firstLoad=まだ成功表示していないか。
// preserve: 失敗/空 かつ 既存表示あり→触らない ／ errored: 失敗 かつ 初回 ／ empty: 成功0件（"欠席なし"OK唯一） ／ list: 成功N件
function kbDecideLoad_(resp, todayYMD, firstLoad) {
  if (!kbIsOkResponse_(resp)) {
    return { outcome: firstLoad ? 'errored' : 'preserve', targets: [] };
  }
  var targets = kbFilterTodayTargets_(resp.absences.absences, todayYMD);
  return { outcome: targets.length ? 'list' : 'empty', targets: targets };
}
```
export に2行追加（`kbUnitGroup_: kbUnitGroup_` の後にカンマ＆追記）:
```javascript
    kbUnitGroup_: kbUnitGroup_,
    kbIsOkResponse_: kbIsOkResponse_,
    kbDecideLoad_: kbDecideLoad_
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `core: 59 PASS / 0 FAIL`（V群10件増）／`構造証明: 69 PASS / 0 FAIL`（不変）

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): core kbIsOkResponse_/kbDecideLoad_ 追加(3状態判定・点滅封じの心臓)"
```

---

## Task 2: genba インライン判定関数（`kbIsOkResponseInline_`/`kbViewLoadedInline_`/`kbJsonpRetry_`）

**Files:**
- Modify: `genba.html`（`function kbUnitGroup_` の直後・インライン純関数群）
- Test: `scripts/test-genba-kesseki-box.js`（U群の直後）

- [ ] **Step 1: 失敗する構造証明を追記**

`}, 'U群(移設)');` の直後に追記:
```javascript
// W. 3状態ちらつき封じ インライン関数
tryOk(() => {
  ok2(html.indexOf('function kbIsOkResponseInline_') >= 0, 'W1: kbIsOkResponseInline_ 定義');
  ok2(html.indexOf('function kbViewLoadedInline_') >= 0, 'W2: kbViewLoadedInline_ 定義');
  ok2(html.indexOf('function kbJsonpRetry_') >= 0, 'W3: kbJsonpRetry_ 定義');
  const okSrc = extractFn('kbIsOkResponseInline_');
  ok2(/Array\.isArray/.test(okSrc) && okSrc.indexOf('absences') >= 0, 'W4: okは absences.absences の配列判定');
  const vlSrc = extractFn('kbViewLoadedInline_');
  ok2(vlSrc.indexOf('forwardOk') >= 0 && vlSrc.indexOf('monthLoaded') >= 0, 'W5: 当日=forwardOk/非当日=monthLoaded で分岐');
  const rtSrc = extractFn('kbJsonpRetry_');
  ok2(rtSrc.indexOf('kbIsOkResponseInline_') >= 0 && rtSrc.indexOf('setTimeout') >= 0, 'W6: retryはok判定+バックオフ');
}, 'W群(3状態インライン)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `W1..W6` が FAIL（`構造証明: 69 PASS / 6 FAIL`）

- [ ] **Step 3: genba.html にインライン関数を追加**

`function kbUnitGroup_(unit) { … }`（インライン群・genba 7390付近）の閉じ `}` の直後に追加:
```javascript
function kbIsOkResponseInline_(resp) { return !!(resp && resp.absences && Array.isArray(resp.absences.absences)); }
function kbViewLoadedInline_(viewDate, todayYMD, forwardOk, monthLoaded) {
    return String(viewDate) === String(todayYMD) ? !!forwardOk : !!monthLoaded;
}
// absences GETのみ retry+backoff（ok応答で確定・失敗/空はリトライ）。非absencesは従来どおり素通し。
async function kbJsonpRetry_(action, idSuffix, tries) {
    tries = tries || 3;
    for (let i = 0; i < tries; i++) {
        const r = await kbJsonp_(action, idSuffix + (i ? '_r' + i : ''));
        if (kbIsOkResponseInline_(r)) return r;
        if (r && action !== 'absences') return r;
        if (i < tries - 1) await new Promise(res => setTimeout(res, 800 * (i + 1)));
    }
    return null;
}
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `core: 59 / 構造証明: 75 PASS / 0 FAIL`（W群6件増）

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): 3状態インライン(kbIsOkResponseInline_/kbViewLoadedInline_/kbJsonpRetry_)"
```

---

## Task 3: `kbState` に `loadedOnce`/`forwardOk` 追加

**Files:**
- Modify: `genba.html`（`let kbState =` 7361付近）
- Test: `scripts/test-genba-kesseki-box.js`（W群の直後）

- [ ] **Step 1: 失敗する構造証明を追記**

`}, 'W群(3状態インライン)');` の直後に追記:
```javascript
// X. kbStateのロード状態フラグ
tryOk(() => {
  const s = html.slice(html.indexOf('let kbState ='), html.indexOf('let kbState =') + 260);
  ok2(/loadedOnce\s*:/.test(s), 'X1: kbStateにloadedOnce');
  ok2(/forwardOk\s*:/.test(s), 'X2: kbStateにforwardOk');
}, 'X群(ロード状態)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `X1/X2` FAIL（2 FAIL）

- [ ] **Step 3: kbState にフラグ追加**

`let kbState = { … _ensuringYm: '' };`（7361）を置換:
```javascript
let kbState = { items: [], checked: {}, methodMap: {}, methodLoaded: false, viewDate: '', forward: [], _ensuringYm: '', loadedOnce: false, forwardOk: false };
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 77 PASS / 0 FAIL`）

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbStateにloadedOnce/forwardOk(ロード成否の追跡)"
```

---

## Task 4: `kbLoad` 3状態化（retry + ok判定 + preserve）

**Files:**
- Modify: `genba.html`（`async function kbLoad()` 7447）
- Test: `scripts/test-genba-kesseki-box.js`（X群の直後）

- [ ] **Step 1: 失敗する構造証明を追記**

`}, 'X群(ロード状態)');` の直後に追記:
```javascript
// Y. kbLoad 3状態化
tryOk(() => {
  const src = extractFn('kbLoad');
  ok2(src.indexOf('kbJsonpRetry_') >= 0, 'Y1: forward取得はretry版');
  ok2(src.indexOf('kbIsOkResponseInline_') >= 0, 'Y2: ok判定を持つ');
  ok2(/if\s*\(!kbState\.loadedOnce\)/.test(src), 'Y3: 「読み込み中」は初回のみ');
  ok2(src.indexOf('forwardOk = true') >= 0 && src.indexOf('forwardOk = false') >= 0, 'Y4: forwardOkを成功/失敗で更新');
  // 失敗分岐が forward 代入(=aj.absences)より前に return する＝失敗時forwardを上書きしない
  const okIdx = src.indexOf('kbState.forward = aj');
  const failReturn = src.indexOf('loadedOnce || kbState.items.length');
  ok2(failReturn >= 0 && failReturn < okIdx, 'Y5: 失敗時preserve分岐がforward上書きより前');
}, 'Y群(kbLoad3状態)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `Y1..Y5` FAIL

- [ ] **Step 3: kbLoad を置換**

`async function kbLoad() { … }`（7447〜、`catch` 閉じまで）を全置換:
```javascript
async function kbLoad() {
    const listEl = document.getElementById('kbox-list');
    if (!listEl) return;
    if (!kbState.loadedOnce) listEl.innerHTML = '<div style="color:#888;">読み込み中…</div>';  // 初回のみ
    if (!kbState.viewDate) kbState.viewDate = jstTodayStr();

    // ① 前進窓（today〜+30）: retry+backoff。失敗/timeout/空応答は !ok。
    const aj = await kbJsonpRetry_('absences', 'abs', 3);
    if (!kbIsOkResponseInline_(aj)) {
        kbState.forwardOk = false;                                        // forwardは触らない（潰さない）
        // 既存表示ありor既にカードが出ている→preserve（欠席なしで上書きしない・ちらつかせない）
        if (kbState.loadedOnce || kbState.items.length) { kbRenderForDate(kbState.viewDate); return; }
        // 月キャッシュが当月ぶんを持つなら月源で描ける→委ねる（kbRenderのゲートが欠席なし誤出を封じる）
        if (attMonthAbsCache[String(kbState.viewDate).slice(0, 7)]) { kbRenderForDate(kbState.viewDate); return; }
        // 完全な初回失敗（どこにも出せない）→ ローディング固着でなく明示エラー
        listEl.innerHTML = '<div style="color:#c0392b;">サーバーから取得できませんでした。通信環境を確認して開き直してください。</div>';
        return;
    }
    kbState.forward = aj.absences.absences || [];                          // 成功時のみ上書き
    kbState.forwardOk = true;
    // ② method/事業所/担当（成功時のみ・取れたら確定・失敗は次回再取得）
    if (!kbState.methodLoaded) {
        const mj = await kbJsonp_('cm_method_audit', 'method');
        const audit = (mj && mj.audit) || null;
        if (audit) { audit.forEach(a => { kbState.methodMap[a.userName] = a; }); kbState.methodLoaded = true; }
    }
    // ③ 表示用メアドは既存 absCmEmailMap を流用（空なら取得）
    if (!absCmEmailMap || !Object.keys(absCmEmailMap).length) {
        try { absCmEmailMap = await absLoadCmEmailMap(); } catch (e) {}
    }
    kbState.loadedOnce = true;
    kbRenderForDate(kbState.viewDate);
}
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 82 PASS / 0 FAIL`）。既存 N群（当日ガード）・D群（originガード）維持。

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "feat(kbox): kbLoadを3状態化(retry+ok判定・失敗時forward不上書きpreserve)"
```

---

## Task 5: `kbRender` の "欠席なし" ゲート（成功確定時のみ）

**Files:**
- Modify: `genba.html`（`kbRender()` 空items分岐 7553付近）
- Test: `scripts/test-genba-kesseki-box.js`（Y群の直後）

- [ ] **Step 1: 失敗する構造証明を追記**

`}, 'Y群(kbLoad3状態)');` の直後に追記:
```javascript
// Z. kbRender "欠席なし" ゲート（描画出口一箇所での封じ）
tryOk(() => {
  const src = extractFn('kbRender()');
  ok2(src.indexOf('kbViewLoadedInline_') >= 0, 'Z1: 空分岐がkbViewLoadedInline_でゲート');
  // items空の分岐内で、ロード未確定なら"欠席なし"でなく"読み込み中"
  const emptyIdx = src.indexOf('if (!kbState.items.length)');
  const seg = src.slice(emptyIdx, emptyIdx + 600);
  ok2(seg.indexOf('kbViewLoadedInline_') >= 0, 'Z2: 空分岐内でロード確定を判定');
  ok2(seg.indexOf('読み込み中') >= 0, 'Z3: 未確定は「読み込み中」（欠席なしを出さない）');
  ok2(seg.indexOf('の欠席はありません') >= 0, 'Z4: 確定0件のときは従来文言');
}, 'Z群(欠席なしゲート)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `Z1..Z2` FAIL（Z3/Z4は既存文言で部分成功しうるが Z1/Z2 で赤）

- [ ] **Step 3: kbRender 空分岐を置換**

genba.html の以下ブロック（7553-7559）:
```javascript
    if (!kbState.items.length) {
        listEl.innerHTML = '<div style="color:#2c7a7b; font-weight:700;">' + (_viewIsToday ? '本日' : kbFmtChip_(_viewDate)) + 'の欠席はありません 🎉</div>';
        kbUpdateBadge();
        if (sendBtn) sendBtn.style.display = 'none';
        if (noteEl) noteEl.textContent = '';
        return;
    }
```
を置換:
```javascript
    if (!kbState.items.length) {
        const _monthLoaded = !!attMonthAbsCache[String(_viewDate).slice(0, 7)];
        if (kbViewLoadedInline_(_viewDate, _today, kbState.forwardOk, _monthLoaded)) {
            listEl.innerHTML = '<div style="color:#2c7a7b; font-weight:700;">' + (_viewIsToday ? '本日' : kbFmtChip_(_viewDate)) + 'の欠席はありません 🎉</div>';
        } else {
            listEl.innerHTML = '<div style="color:#888;">読み込み中…</div>';   // ロード未確定は"欠席なし"を出さない（ちらつき/連絡漏れ封じ）
        }
        kbUpdateBadge();
        if (sendBtn) sendBtn.style.display = 'none';
        if (noteEl) noteEl.textContent = '';
        return;
    }
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 86 PASS / 0 FAIL`）

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "feat(kbox): 欠席なしは成功確定(kbViewLoadedInline_)時のみ・未確定は読込中継続"
```

---

## Task 6: 実測ハーネス `verify-kbox-flicker-3state.js`（4状態＋3追加観点）

**Files:**
- Create: `scripts/verify-kbox-flicker-3state.js`

- [ ] **Step 1: ハーネスを新規作成**

`scripts/verify-kbox-flicker-3state.js` を作成:
```javascript
// 欠席box ちらつき 3状態モデルの「実測」ハーネス（2026-07-07・-25版）
// genba.html から kbLoad/kbRenderForDate/kbRenderDayNow_/kbRender 等の【実コード】を抽出し、
// DOMスタブ＋即時setTimeoutで実駆動→#kbox-list の描画を実測する。実行: node scripts/verify-kbox-flicker-3state.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name + '(';
  let start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い');
  if (html.slice(start - 6, start) === 'async ') start -= 6;
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let j = braceStart; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}
function extractLet(name) {
  const sig = 'let ' + name + ' =';
  const start = html.indexOf(sig);
  if (start < 0) throw new Error(sig + ' が無い');
  const end = html.indexOf('\n', start);
  return html.slice(start, end);
}

const realSources = [
  extractLet('kbState'),
  extractFn('kbAddDaysYMD_'), extractFn('kbUpcomingAbsenceDates_'), extractFn('kbMergeDedupAbs_'),
  extractFn('kbIsViewToday_'), extractFn('kbUnitGroup_'), extractFn('kbFilterTodayTargets_'),
  extractFn('kbIsOkResponseInline_'), extractFn('kbViewLoadedInline_'), extractFn('kbJsonpRetry_'),
  extractFn('kbFmtChip_'), extractFn('kbInit'), extractFn('kbLoad'),
  extractFn('kbRenderForDate'), extractFn('kbRenderDayNow_'),
  extractFn('kbIsDoneInline_'), extractFn('kbClassifyCardInline_'), extractFn('kbEsc_'),
  extractFn('kbRenderOperatorRow_'), extractFn('kbRender'), extractFn('kbRenderChrome_'), extractFn('kbUpdateBadge'),
  extractFn('kbGoDate'), extractFn('kbJumpTo'),
].join('\n\n');

const stubs = `
let __scriptedAbs = [];   // kbJsonp_('absences') が順に返す応答列（尽きたら最後を反復）
let __absIdx = 0;
let attMonthAbsCache = {};
let __scriptedMonth = null;   // attEnsureMonthAbsences が cb 前に cache へ入れる配列（null=失敗で埋めない）
async function kbJsonp_(action, idSuffix) {
  if (action === 'absences') { const v = __scriptedAbs[Math.min(__absIdx, __scriptedAbs.length - 1)]; __absIdx++; return v; }
  if (action === 'cm_method_audit') return { audit: [] };
  return null;
}
function attEnsureMonthAbsences(dateStr, cb) {
  const ym = String(dateStr).slice(0, 7);
  if (__scriptedMonth !== null) attMonthAbsCache[ym] = __scriptedMonth;   // 成功: cacheを埋める
  cb();   // 失敗時は cache を埋めずに cb（-25の attMonthAbsCache[ym]=arr||[] 相当は成功時のみ）
}
function jstTodayStr() { return '2026-07-06'; }
var absReceptionist = '';
var absCmEmailMap = { A: '', B: '' };
async function absLoadCmEmailMap() { return {}; }
function getStaff() { return ['山田', '田中']; }
var EXCLUDED_STAFF = ['比嘉'];
`;

const factoryBody =
  '"use strict";\n' + stubs + '\n' + realSources + '\n' +
  'return { kbInit, kbLoad, kbGoDate, kbJumpTo, ' +
  'setAbs:function(seq){__scriptedAbs=seq;__absIdx=0;}, setMonth:function(m){__scriptedMonth=m;}, ' +
  'seedCache:function(ym,arr){attMonthAbsCache[ym]=arr;}, getState:function(){return kbState;} };';
const factory = new Function('document', 'window', 'setTimeout', factoryBody);

function makeEl() { return { innerHTML: '', textContent: '', style: {}, disabled: false, value: '' }; }
function newContext() {
  const els = {};
  ['kbox-list','kbox-operator-note','kbox-pending-badge','kbox-send-btn','kbox-section',
   'kbox-datelabel','kbox-viewonly-banner','kbox-jumpchips','kbox-datepicker','kbox-operator-select'
  ].forEach(id => els[id] = makeEl());
  const document = { getElementById: id => els[id] || null, createElement: () => makeEl(), body: { appendChild(){} } };
  const immediate = (fn) => { if (typeof fn === 'function') fn(); return 0; };
  const h = factory(document, {}, immediate);
  return { h, els };
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.error('  [FAIL] ' + label); } }

const RN = { absences: { absences: [
  { date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-07', name: '明日花子', unit: '午後', isLongTerm: false, cmNotified: '' },
] } };
const R0 = { absences: { absences: [] } };

async function run() {
  // ===== A: 同一セッション 成功N→失敗→空応答→成功0 =====
  console.log('■ A（放置復帰）');
  { const c = newContext(); const L = () => c.els['kbox-list'].innerHTML;
    c.h.setMonth([]); // 月GETは成功0(当日はforward源)
    c.h.setAbs([RN]); await c.h.kbLoad();
    ok(L().indexOf('当日太郎') >= 0, 'A1: 成功N → 当日太郎表示');
    ok(L().indexOf('明日花子') < 0, 'A2: 明日は本日boxに出さない');
    c.h.setAbs([null]); await c.h.kbLoad();
    ok(L().indexOf('当日太郎') >= 0, 'A5: 【失敗復帰】欠席者が消えない(★)');
    ok(L().indexOf('の欠席はありません') < 0, 'A6: 【失敗】欠席なしを出さない(★)');
    c.h.setAbs([{}]); await c.h.kbLoad();
    ok(L().indexOf('当日太郎') >= 0, 'A7: 【空応答】欠席者が消えない(★)');
    ok(L().indexOf('の欠席はありません') < 0, 'A8: 【空応答】欠席なしを出さない(★)');
    c.h.setAbs([R0]); await c.h.kbLoad();
    ok(L().indexOf('の欠席はありません') >= 0, 'A9: 【成功0件】このときだけ欠席なし');
    ok(L().indexOf('当日太郎') < 0, 'A10: 【成功0件】前の欠席者は消える');
  }
  // ===== B: 初回×失敗 / C: 初回×成功0 =====
  console.log('■ B/C（初回）');
  { const c = newContext(); c.h.setMonth(null); c.h.setAbs([null, null, null]); await c.h.kbLoad();
    const L = c.els['kbox-list'].innerHTML;
    ok(L.indexOf('取得できませんでした') >= 0, 'B1: 初回×総失敗 → エラー表示');
    ok(L.indexOf('の欠席はありません') < 0, 'B2: 初回×失敗 → 欠席なし誤表示しない(★)');
  }
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([R0]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('の欠席はありません') >= 0, 'C1: 初回×成功0件 → 正しく欠席なし');
  }
  // ===== D: forward軸（月GET失敗でも当日カードはforward源で出る） =====
  console.log('■ D（forward軸）');
  { const c = newContext(); c.h.setMonth(null); c.h.setAbs([RN]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'D1: 月GET失敗でも当日カードはforward源で表示');
  }
  // ===== F: ① 遅延成功/固着封じ =====
  console.log('■ F（遅延成功・固着封じ）');
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([null, null, RN]); await c.h.kbLoad();  // retry内で3回目成功
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'F1: forward失敗→retry成功→カードが出る(固着しない)');
  }
  { const c = newContext(); c.h.setMonth(null); c.h.setAbs([null, null, null]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('読み込み中') < 0, 'F2: 総失敗は読込中で固着せずエラー表示');
    c.h.setAbs([RN]); await c.h.kbLoad();
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'F3: 総失敗後の再ロード成功→カードが出る');
  }
  // ===== G: ② 月GET先着・forward後着の上書き競合 =====
  console.log('■ G（月先着・forward後着）');
  { const c = newContext();
    c.h.seedCache('2026-07', [{ date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' }]); // 月キャッシュ先着
    c.h.setMonth([{ date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' }]);
    c.h.setAbs([RN]); await c.h.kbLoad();                       // まず成功でカード
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'G0: 前提=カード表示');
    c.h.setAbs([null]); await c.h.kbLoad();                     // forward失敗
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'G1: 月キャッシュ有+forward失敗→カード保持(★)');
    ok(c.els['kbox-list'].innerHTML.indexOf('の欠席はありません') < 0, 'G1b: 欠席なしで上書きしない');
    c.h.setAbs([{}]); await c.h.kbLoad();                       // forward空応答
    ok(c.els['kbox-list'].innerHTML.indexOf('当日太郎') >= 0, 'G2: forward空応答でも保持(★)');
  }
  // ===== H: ③ 非当日ビューの3状態 =====
  console.log('■ H（非当日ビュー）');
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([R0]); await c.h.kbLoad();  // 当日ロード(0件)
    // 未来日へジャンプ: 月未充填の一瞬に欠席なしを出さない → setMonthで月成功時のみ埋まる
    c.h.setMonth(null);                                          // 未来月GETは失敗（cache埋めない）
    c.h.kbJumpTo('2026-09-10');
    ok(c.els['kbox-list'].innerHTML.indexOf('の欠席はありません') < 0, 'H1: 未来日・月未充填→欠席なしを先出ししない(読込中)(★)');
    c.h.setMonth([]);                                            // 未来月GET成功=0件
    c.h.kbJumpTo('2026-09-11');
    ok(c.els['kbox-list'].innerHTML.indexOf('の欠席はありません') >= 0, 'H2: 未来月成功0件→欠席なし(loaded)');
    c.h.setMonth([{ date: '2026-09-12', name: '未来次郎', unit: '午後', isLongTerm: false, cmNotified: '' }]);
    c.h.kbJumpTo('2026-09-12');
    ok(c.els['kbox-list'].innerHTML.indexOf('未来次郎') >= 0, 'H3: 未来月成功N件→カード');
    c.h.setMonth(null); c.h.kbJumpTo('2026-05-10');
    ok(c.els['kbox-list'].innerHTML.indexOf('の欠席はありません') < 0, 'H4: 過去日・月未充填→欠席なし先出ししない(★)');
  }
  // ===== E: -25機能デグレなし =====
  console.log('■ E（-25デグレなし）');
  { const c = newContext(); c.h.setMonth([]); c.h.setAbs([RN]); await c.h.kbLoad();
    const before = c.h.getState().viewDate;
    c.h.kbGoDate(1);
    ok(c.h.getState().viewDate !== before, 'E1: kbGoDate(1)でviewDate移動(◀▶生存)');
    ok(c.els['kbox-viewonly-banner'].style.display === 'block', 'E2: 未来日は閲覧のみ帯(当日ガード表示)');
    c.h.kbGoDate(-1);
    ok(c.h.getState().viewDate === before, 'E3: kbGoDate(-1)で当日へ戻る');
  }

  console.log(`\n実測ハーネス(3state): ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
run().catch(e => { console.error('harness error:', e); process.exit(1); });
```

- [ ] **Step 2: 実行してPASS確認**

Run: `node scripts/verify-kbox-flicker-3state.js`
Expected: `実測ハーネス(3state): 24 PASS / 0 FAIL`（A1/A2/A5-A10/B1/B2/C1/D1/F1-F3/G0/G1/G1b/G2/H1-H4/E1-E3）。0 FAIL 以外は原因調査（★印がすり抜けたら連絡漏れ再発なので最優先）。

- [ ] **Step 3: コミット**

```bash
git add scripts/verify-kbox-flicker-3state.js
git commit -m "test(kbox): 3状態実測ハーネス(A失敗中欠席なし不出/F遅延成功/G月先着/H非当日/E非デグレ)"
```

---

## Task 7: 全緑・非接触本数確認 ＋ 版bump（案A commit止め）

**Files:**
- 確認のみ: `genba.html`
- Modify（bump-script経由）: `version.txt`, `genba.html` shared.js?v=

- [ ] **Step 1: 無回帰＋実測ハーネス＋非接触本数**

Run:
```bash
node scripts/test-genba-kesseki-box.js
node scripts/verify-kbox-flicker-3state.js
echo "--- 非接触本数 ---"
grep -c "gnbGuardProdWrite" genba.html      # 期待 11
grep -c "send_box_cm_mails" genba.html        # 期待 1
grep -c "kbGoDate" genba.html                 # 期待 3
grep -oE 'kbExecuteSend|kbMarkPhoneDone' genba.html | sort | uniq -c   # 各2
```
Expected: `core: 59 / 構造証明: 86` 全緑、`実測ハーネス: 24 PASS`、非接触本数一致。ズレたら停止・原因調査。

- [ ] **Step 2: push直前 再前進チェック**

Run:
```bash
git fetch origin master
git rev-parse --short origin/master
git rev-list --left-right --count origin/master...HEAD
```
Expected: 0 behind。前進していれば **bumpせず停止**し再rebase＋版繰り上げ再提案。

- [ ] **Step 3: 版bump（案A・commit止め・pushしない）**

Run: `node scripts/bump-app-version.js <次版>`（例 origin現況が -25 なら `2026-07-04-26`。Step2の本番version.txtを確認して連番+1を採る。手でversion.txt編集しない）
Expected: `版上げ完了（commitまで・push未実行）`・version.txt＋genba.html shared.js?v= 2行のみ更新。

- [ ] **Step 4: bump後 一次確認**

Run:
```bash
git show HEAD:version.txt
grep -oE 'shared\.js\?v=[0-9a-z-]+' genba.html | head -1
git show --stat HEAD | head -6
node scripts/test-genba-kesseki-box.js && node scripts/verify-kbox-flicker-3state.js
```
Expected: version.txt=次版、shared.js?v=次版、bumpは2ファイルのみ、全緑。

- [ ] **Step 5: 停止（push前ゲート）**

**pushしない。** 全緑・実測ハーネス・非接触・bump後diffを提示 → プレビュー再提示 → 社長目視 → push承認 → push直前再前進チェック → FF push（`fix/kbox-flicker-3state:master`）→ `--verify` 三点verify → 旧 `fix/kesseki-box-flicker` 退役。

---

## Self-Review

**1. Spec coverage:**
- §1 移植（core kbIsOkResponse_/kbDecideLoad_）→ Task1 ✅／インライン → Task2 ✅
- §2 3状態モデル → Task4(kbLoad) ✅
- §3 forward軸ゲート（kbViewLoaded_）→ Task2(定義)+Task5(kbRender適用) ✅
- §4 kbState追加 → Task3 ✅
- §5 実測ハーネス → Task6 ✅／★不変条件(失敗中欠席なし不出)=A5-A8/B2/G1b/H1/H4 ✅
- 追加観点①→F ②→G ③→H（冒頭マップ）✅
- §6 非接触 → Task7 Step1 本数確認＋各Task既存テスト維持 ✅
- §7 版ゲート/退役 → Task7 Step5 ✅

**2. Placeholder scan:** 各Stepに実コード/実コマンド/期待値。TBD/TODO無し。Task7 Step3の「次版」はStep2の実測本番version.txt+1を採る運用（手編集禁止）を明記＝プレースホルダでなく手順。✅

**3. Type consistency:**
- `kbIsOkResponse_`/`kbDecideLoad_`（core・Task1）↔ インライン `kbIsOkResponseInline_`/`kbViewLoadedInline_`/`kbJsonpRetry_`（Task2）名称一致・Task4/5で使用一致 ✅
- `kbState.loadedOnce`/`forwardOk`（Task3）→ Task4/5で参照一致 ✅
- ハーネス抽出関数名（Task6）＝genba実関数名と一致（kbLoad/kbRenderForDate/kbRenderDayNow_/kbRender/kbRenderChrome_/kbGoDate/kbJumpTo/kbRenderOperatorRow_）✅
- テスト群 V/W/X/Y/Z は既存 A-U と非衝突 ✅

---

**実行方式の選択待ち（下記本文で提示）。**
