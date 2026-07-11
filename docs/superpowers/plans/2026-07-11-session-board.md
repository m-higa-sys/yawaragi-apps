# セッションボード（当日業務ピックアップ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当日AM/PM出席者 × 5業務（口腔モニ・測定要介護・測定要支援・口腔体操・個訓・誕生日）の「今日この人にこれをやる」を自動ピックアップするセッションボードを、判定を純関数coreに集約して構築する。

**Architecture:** 案A＝サーバ集約＋判定は純関数core。`session-board-core.js`（GAS/node両用・SpreadsheetApp非依存の純関数）に全判定を置き `scripts/test-session-board.js` でTDD。board GAS に薄い `sessionBoard(e)` action を1本足し、既存取得関数（`getAttendance`/`getKeikakushoTargetUsers_`/`getOralPlansYear`/`getShienSokutei`）の結果をcoreに流して1レスポンスに集約。`session-board.html` は描画専用。②morningDigest要約行は同core流用で後日あと足し（Phase 5・本計画ではスコープ外）。

**Tech Stack:** Vanilla JS（ES5準拠・GASランタイム互換）、Google Apps Script（clasp）、node（テストランナーは素のnode・アサートは自前 `ok(cond,label)`）、GitHub Pages 配信＋HTML版ゲート（`shared.js?v=` / `version.txt`）。

**設計spec:** `docs/superpowers/specs/2026-07-11-session-board-design.md`（本計画の唯一の真実源。矛盾したらspec優先）

---

## 前提・ルール（着手前に必ず読む）

- **本計画は新機能なので専用ブランチで実行する。** 実行開始時に `git switch -c feat/asa-board`（現在の作業ブランチから切る／master最新なら `git switch master && git pull --ff-only && git switch -c feat/asa-board`）。孤立ブランチ検知（`node scripts/check-orphan-branches.js`）の対象になる点に留意。
- **board GAS（`gas/yawaragi-board/コード.js`）を触る Phase 2 は、着手直前に必ず `clasp pull` で本番スナップショットと突合してから編集する**（過去、本番のみ3機能を消しかけた事故あり。MEMORY `月次定例+morningDigest統合` の runbook 準拠）。本計画のコード断片は現行 repo 版基準。実装時に clasp pull 結果とズレたら pull 側を正としてマージする。
- **純関数の逐語転記**：sokutei系純関数（`sokuteiCycleMonths_`/`sokuteiDueDate_`/`sokuteiRemaining_`）は `sokutei.html:99-121` から**1文字も変えず**core へ転記する（repo慣習「正本から同一コード転記」）。`isHyoukaMonth` は `shared.js:420` の正準を使い、core へは**依存注入（引数渡し）**する（node テストで shared.js から抽出して注入・GASランタイムではグローバル）。
- **ES5厳守**：`const`/`let` は既存coreに合わせ `var` を基本とする（`kesseki-box-core.js` 準拠）。アロー関数・テンプレートリテラルはcoreでは使わない（GAS安全側）。
- **名寄せ**：全業務の突合キーは `sbNormalizeName_`（`_normalizeUserName` 相当）を通す。突合不能な出席者は捨てず「名寄せ不能」residue として返す。

---

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `gas/yawaragi-board/session-board-core.js` | 新規 | 全判定の純関数（名寄せ正規化・出席一意化・測定2系統・口腔モニ・口腔体操・個訓・誕生日・当日出席交差＋名寄せ不能residue）。GAS/node両用・SpreadsheetApp非依存。末尾 `module.exports`。 |
| `scripts/test-session-board.js` | 新規 | 上記coreのTDD。`node scripts/test-session-board.js` で実行。`isHyoukaMonth`/`oralCycleAt` は shared.js/oral-plan.html から抽出注入。 |
| `gas/yawaragi-board/コード.js` | 修正 | `function sessionBoard(e)`（薄いラッパ）追加＋doGetに `action==='sessionBoard'` 分岐1行。既存取得関数を呼びcoreへ流す。 |
| `session-board.html` | 新規 | 描画専用フロント。`action=sessionBoard` を1回叩き業務ブロック描画。測定NはlocalStorage。HTML版ゲート同梱。 |
| `version.txt` / `session-board.html` の `shared.js?v=` | 修正 | 本番配信の版上げ（`node scripts/bump-app-version.js` 経由のみ）。 |

---

## Phase 1: 判定純関数 core（TDD）

**このPhaseの成果物：`gas/yawaragi-board/session-board-core.js` と全緑の `scripts/test-session-board.js`。GASにもHTMLにも触れず、node単体で完結する。**

### Task 1: テストランナーの骨組みと名寄せ正規化 `sbNormalizeName_`

**Files:**
- Create: `gas/yawaragi-board/session-board-core.js`
- Create: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-session-board.js` を新規作成：

```javascript
// セッションボード判定 純関数テスト
// 実行: node scripts/test-session-board.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }

// ===== A. sbNormalizeName_（名寄せ正規化＝全突合キーの唯一の正） =====
eq(core.sbNormalizeName_('山田 太郎'), '山田太郎', 'A1: 半角スペース除去');
eq(core.sbNormalizeName_('山田　太郎'), '山田太郎', 'A2: 全角スペース除去');
eq(core.sbNormalizeName_('山田太郎 様'), '山田太郎', 'A3: 末尾「様」除去');
eq(core.sbNormalizeName_('ﾔﾏﾀﾞ'), 'ヤマダ', 'A4: NFKC半角カナ→全角');
eq(core.sbNormalizeName_(null), '', 'A5: null→空文字(落ちない)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`Cannot find module '.../session-board-core.js'`）

- [ ] **Step 3: core を最小実装**

`gas/yawaragi-board/session-board-core.js` を新規作成：

```javascript
// 2026-07-11 セッションボード（当日業務ピックアップ）の判定純関数。
// GAS/node 両用（kesseki-box-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しない。
// 名寄せは全業務ここを通す。判定spec: docs/superpowers/specs/2026-07-11-session-board-design.md

// 名寄せ正規化＝全突合キーの唯一の正（_normalizeUserName 相当・NFKC＋全空白除去＋末尾敬称除去）
function sbNormalizeName_(name) {
  var s = String(name == null ? '' : name);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  s = s.replace(/[\s　]+/g, '');
  s = s.replace(/(様|さま|サマ)$/, '');
  return s;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sbNormalizeName_: sbNormalizeName_
  };
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS（5 passed, 0 failed）

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): 名寄せ正規化 sbNormalizeName_ ＋テスト骨組み（TDD）"
```

---

### Task 2: 出席者の一意化 `sbUniquePresent_`

当日 am/pm を氏名で一意化し「出席」の人だけ正規化キー付きで返す（`sokutei.html:400-408` の交差前処理を純関数化）。

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**（Task1の console.log 直前に挿入）

```javascript
// ===== B. sbUniquePresent_（am/pm一意化・出席のみ・正規化キー付与） =====
var att1 = { attendance: {
  am: [{ name: '山田 太郎', status: '出席', care: '要介護1' }, { name: '欠席子', status: '欠席' }],
  pm: [{ name: '山田太郎', status: '出席', care: '要介護1' }, { name: '佐藤花子', status: '出席', care: '要支援2' }]
}};
var pres1 = core.sbUniquePresent_(att1);
eq(pres1.length, 2, 'B1: 出席のみ2名（欠席子は除外・山田はam/pm重複排除）');
eq(pres1[0].key, '山田太郎', 'B2: 正規化キー付与（スペース吸収でam/pm同一視）');
ok(pres1.some(function(p){ return p.key === '佐藤花子' && p.care === '要支援2'; }), 'B3: careを保持');
eq(core.sbUniquePresent_(null).length, 0, 'B4: null→空（落ちない）');
eq(core.sbUniquePresent_({ attendance: { am: [{ name: 'A', status: '欠席' }] } }).length, 0, 'B5: 全欠席→空');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sbUniquePresent_ is not a function`）

- [ ] **Step 3: 実装を追加**（`module.exports` の前に関数を足し、exportsにも追加）

```javascript
// am/pm を正規化キーで一意化し「出席」の人だけ返す。どちらかで出席なら出席扱い。
// 返り値: [{ name, key, care, status }]（name は最初に現れた表記を保持）
function sbUniquePresent_(att) {
  var out = [], seen = {};
  var root = att && att.attendance;
  if (!root) return out;
  ['am', 'pm'].forEach(function (k) {
    (root[k] || []).forEach(function (a) {
      var key = sbNormalizeName_(a && a.name);
      if (!key) return;
      if (seen[key]) {
        if (a.status === '出席') seen[key].status = '出席';
        if (!seen[key].care && a.care) seen[key].care = a.care;
        return;
      }
      var c = { name: a.name, key: key, care: a.care || '', status: a.status || '' };
      seen[key] = c; out.push(c);
    });
  });
  return out.filter(function (c) { return c.status === '出席'; });
}
```

exports に `sbUniquePresent_: sbUniquePresent_,` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): 出席者一意化 sbUniquePresent_（am/pm重複排除・出席のみ・正規化キー）"
```

---

### Task 3: sokutei純関数の逐語転記 ＋ 測定要支援判定 `sbMeasureShien_`

要支援・事業対象＝前回"実"測定日＋4ヶ月固定。`sokutei.html:99-121` の3純関数を逐語転記し、要支援対象を残日数昇順で返す。

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**

```javascript
// ===== C. sokutei純関数（sokutei.html:99-121 の逐語転記・挙動同一） =====
eq(core.sokuteiCycleMonths_('要支援2'), 4, 'C1: 要支援→4ヶ月');
eq(core.sokuteiCycleMonths_('要介護1'), 3, 'C2: 要介護→3ヶ月');
eq(core.sokuteiDueDate_('2026-03-10', '要支援2'), '2026-07-10', 'C3: 実測定日+4ヶ月');
eq(core.sokuteiRemaining_('2026-07-10', '2026-07-01'), 9, 'C4: 残9日');

// ===== D. sbMeasureShien_（要支援・事業対象＝前回実測定日+4ヶ月・残日数昇順・未測定最優先） =====
var shienLast = { '佐藤花子': '2026-03-10', '未測定男': '' };
var shienUsers = [
  { name: '佐藤花子', care: '要支援2' },
  { name: '未測定男', care: '事業対象者' }
];
var shienRows = core.sbMeasureShien_(shienUsers, shienLast, '2026-07-01');
eq(shienRows[0].key, '未測定男', 'D1: 未測定(実測定日なし)が最優先で先頭');
ok(shienRows[0].unmeasured === true, 'D2: 未測定フラグ');
ok(shienRows[1].key === '佐藤花子' && shienRows[1].remaining === 9, 'D3: 佐藤は残9日');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sokuteiCycleMonths_ is not a function`）

- [ ] **Step 3: 実装を追加**（sokutei.html:99-121 を1文字も変えず転記＋要支援判定）

```javascript
// --- sokutei.html:99-121 からの逐語転記（1文字も変えない・正本=my-project/scripts/test-sokutei-priority.js） ---
function sokuteiCycleMonths_(care) {
  return String(care || '').indexOf('要介護') === 0 ? 3 : 4;
}
function sokuteiDueDate_(baseDateStr, care) {
  var y = parseInt(String(baseDateStr).slice(0, 4), 10);
  var m = parseInt(String(baseDateStr).slice(5, 7), 10);
  var d = parseInt(String(baseDateStr).slice(8, 10), 10);
  var add = sokuteiCycleMonths_(care);
  var m0 = (m - 1) + add;
  var ny = y + Math.floor(m0 / 12);
  var nm = (m0 % 12) + 1;
  var lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  var nd = d > lastDay ? lastDay : d;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return ny + '-' + pad(nm) + '-' + pad(nd);
}
function sokuteiRemaining_(dueDateStr, todayStr) {
  var due = Date.parse(String(dueDateStr) + 'T00:00:00Z');
  var today = Date.parse(String(todayStr) + 'T00:00:00Z');
  return Math.round((due - today) / 86400000);
}

// 要支援・事業対象の測定対象行。前回実測定日+4ヶ月。未測定(実測定日なし)は最優先。残日数昇順。
// 返り値: [{ name, key, care, last, due, remaining, unmeasured }]
function sbMeasureShien_(shienUsers, lastByName, todayStr) {
  var rows = (shienUsers || []).map(function (u) {
    var key = sbNormalizeName_(u.name);
    var last = (lastByName && lastByName[u.name]) || '';
    var due = '', remaining = -999, unmeasured = !last;
    if (last) { due = sokuteiDueDate_(last, u.care || ''); remaining = sokuteiRemaining_(due, todayStr); }
    return { name: u.name, key: key, care: u.care || '', last: last, due: due, remaining: remaining, unmeasured: unmeasured };
  });
  rows.sort(function (a, b) { return a.remaining - b.remaining; });
  return rows;
}
```

exports に `sokuteiCycleMonths_`/`sokuteiDueDate_`/`sokuteiRemaining_`/`sbMeasureShien_` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): sokutei純関数逐語転記＋測定要支援 sbMeasureShien_（実測定日+4ヶ月・未測定最優先）"
```

---

### Task 4: 測定要介護判定 `sbMeasureKaigo_`（isHyoukaMonth 依存注入）

要介護＝個訓評価月（isHyoukaMonth）で当月が評価月かつ未実施の人。isHyoukaMonth は shared.js の正準を注入する。

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**（isHyoukaMonth を shared.js から抽出注入）

test-session-board.js の先頭 require 群の直後に抽出ユーティリティを追加：

```javascript
// shared.js から isHyoukaMonth を抽出注入（正準を使う・drift防止。test-cycle-judge.js と同方式）
const fs = require('fs');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('shared.js に ' + name + ' が無い');
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { i++; break; } } }
  return src.slice(start, i);
}
const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
const isHyoukaMonth = new Function(extractFn(sharedSrc, 'isHyoukaMonth') + '; return isHyoukaMonth;')();
```

console.log 直前にテストを追加：

```javascript
// ===== E. sbMeasureKaigo_（要介護＝評価月isHyoukaMonth・未実施・月末残日数昇順） =====
// planStart=2026-08 → diff=-1 の 2026-07 が評価月（計画開始前月）
var kaigoUsers = [
  { name: '評価月太郎', category: '要介護1', planStart: '2026-08', planMonths: 3 }, // 7月=評価月
  { name: '対象外子', category: '要介護2', planStart: '2026-09', planMonths: 3 }    // 7月は評価月でない
];
var doneByKey = {}; // 当評価月に sokutei_date 済みの正規化キー集合
var kRows = core.sbMeasureKaigo_(kaigoUsers, doneByKey, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows.length, 1, 'E1: 評価月かつ未実施は1名（対象外子は評価月でない）');
eq(kRows[0].key, '評価月太郎', 'E2: 評価月太郎が対象');
eq(kRows[0].remaining, 11, 'E3: 7/20→月末7/31まで残11日');

var kRows2 = core.sbMeasureKaigo_(kaigoUsers, { '評価月太郎': true }, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows2.length, 0, 'E4: 当評価月に測定済みなら除外');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sbMeasureKaigo_ is not a function`）

- [ ] **Step 3: 実装を追加**（月末残日数ヘルパ＋要介護判定）

```javascript
// 対象日が属する月の月末(YYYY-MM-DD)を返す
function sbMonthEnd_(year, month) {
  var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return year + '-' + pad(month) + '-' + pad(lastDay);
}

// 要介護の測定対象行。当月が評価月(isHyoukaMonthFn)かつ当評価月未実施(doneByKey に無い)。月末残日数昇順。
// doneByKey: 当評価月に sokutei_date が入っている人の正規化キー→true。isHyoukaMonthFn は shared.js の isHyoukaMonth を注入。
// 返り値: [{ name, key, care, remaining }]（remaining=対象日から月末までの残日数）
function sbMeasureKaigo_(kaigoUsers, doneByKey, year, month, todayStr, isHyoukaMonthFn) {
  var monthEnd = sbMonthEnd_(year, month);
  var rows = [];
  (kaigoUsers || []).forEach(function (u) {
    if (!isHyoukaMonthFn(u.planStart, u.planMonths, year, month)) return;
    var key = sbNormalizeName_(u.name);
    if (doneByKey && doneByKey[key]) return;
    rows.push({ name: u.name, key: key, care: u.category || '', remaining: sokuteiRemaining_(monthEnd, todayStr) });
  });
  rows.sort(function (a, b) { return a.remaining - b.remaining; });
  return rows;
}
```

exports に `sbMonthEnd_`/`sbMeasureKaigo_` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): 測定要介護 sbMeasureKaigo_（評価月isHyoukaMonth注入・当評価月未実施・月末残日数昇順）"
```

---

### Task 5: 口腔モニ判定 `sbKoukuMoni_`（oralCycleAt 依存注入）

当月が口腔モニ対象（role が none 以外）かつ未実施の人を role 仕分けなしで全員。

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**（oralCycleAt を oral-plan.html から抽出注入）

require直後の抽出ブロックに追加：

```javascript
const oralSrc = fs.readFileSync(path.join(__dirname, '..', 'oral-plan.html'), 'utf8');
const oralCycleAt = new Function(extractFn(oralSrc, 'oralCycleAt') + '; return oralCycleAt;')();
```

console.log 直前にテストを追加：

```javascript
// ===== F. sbKoukuMoni_（口腔モニ＝oralCycleAt role!=none かつ 未実施・role仕分けなし） =====
// planStart=2026-07 → 7月は (T-P)%3=0 → role='moni1'。moni1未実施＝moni1_date空。
var oralUsers = [
  { userId: 'モニ太郎', name: 'モニ太郎', planStart: '2026-07', planEnd: '' },
  { userId: '対象外郎', name: '対象外郎', planStart: '2026-07', planEnd: '2026-06' } // planEnd超過→none
];
var oralRecByKey = { 'モニ太郎': { moni1_date: '', moni2_date: '', houkoku_date: '', plan_date: '' } };
var mRows = core.sbKoukuMoni_(oralUsers, oralRecByKey, 2026, 7, oralCycleAt);
eq(mRows.length, 1, 'F1: 対象かつ未実施1名（対象外郎はplanEnd超過でnone）');
eq(mRows[0].key, 'モニ太郎', 'F2: モニ太郎が対象');
eq(mRows[0].role, 'moni1', 'F3: role=moni1');

// moni1実施済み（moni1_dateあり）は除外
var oralRecDone = { 'モニ太郎': { moni1_date: '2026-07-05', moni2_date: '', houkoku_date: '', plan_date: '' } };
eq(core.sbKoukuMoni_(oralUsers, oralRecDone, 2026, 7, oralCycleAt).length, 0, 'F4: moni1実施済みは除外');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sbKoukuMoni_ is not a function`）

- [ ] **Step 3: 実装を追加**（role→実施済み判定欄のマッピング）

```javascript
// 口腔モニ対象行。role が none 以外かつ当月role未実施。role仕分けはせず対象者を全員返す。
// oralRecByKey: 正規化キー → { moni1_date, moni2_date, houkoku_date, plan_date }。oralCycleAtFn は oral-plan.html の oralCycleAt を注入。
// 実施済み判定: moni1→moni1_date / moni2→moni2_date / setsume→(houkoku_date && plan_date)。
// 返り値: [{ name, key, role }]
function sbKoukuMoni_(oralUsers, oralRecByKey, year, month, oralCycleAtFn) {
  var rows = [];
  (oralUsers || []).forEach(function (u) {
    var res = oralCycleAtFn(u.planStart, u.planEnd, year, month);
    if (!res || res.role === 'none') return;
    var key = sbNormalizeName_(u.name);
    var rec = (oralRecByKey && oralRecByKey[key]) || {};
    var done;
    if (res.role === 'moni1') done = !!rec.moni1_date;
    else if (res.role === 'moni2') done = !!rec.moni2_date;
    else done = !!(rec.houkoku_date && rec.plan_date); // setsume
    if (done) return;
    rows.push({ name: u.name, key: key, role: res.role });
  });
  return rows;
}
```

exports に `sbKoukuMoni_` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): 口腔モニ sbKoukuMoni_（oralCycleAt注入・role未実施・仕分けなし全員）"
```

---

### Task 6: 口腔体操 `sbKoukuTaisou_` ＋ 個訓 `sbKotan_`

どちらも周期なしの「対象者一覧」。口腔体操＝is_target（明示false以外true）、個訓＝介護度「要介護」前方一致。当日出席との交差は Task 8 で行うのでここは対象母集合を返す。

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**

```javascript
// ===== G. sbKoukuTaisou_（is_target 明示false以外はtrue） =====
var oralSettings = [
  { name: '体操太郎', is_target: true },
  { name: '既定子', is_target: undefined },   // 未設定→対象
  { name: '除外郎', is_target: false }         // 明示false→非対象
];
var gRows = core.sbKoukuTaisou_(oralSettings);
eq(gRows.length, 2, 'G1: 明示false以外は対象（2名）');
ok(gRows.some(function(r){ return r.key === '体操太郎'; }) && gRows.some(function(r){ return r.key === '既定子'; }), 'G2: 太郎と既定子が対象');

// ===== H. sbKotan_（介護度「要介護」前方一致） =====
var allUsers = [
  { name: '個訓太郎', category: '要介護3' },
  { name: '要支子', category: '要支援1' },
  { name: '中止郎', category: '要介護1', cancelled: true }
];
var hRows = core.sbKotan_(allUsers);
eq(hRows.length, 1, 'H1: 要介護かつ非中止のみ（要支子除外・中止郎除外）');
eq(hRows[0].key, '個訓太郎', 'H2: 個訓太郎が対象');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sbKoukuTaisou_ is not a function`）

- [ ] **Step 3: 実装を追加**

```javascript
// 口腔体操対象。is_target が明示 false 以外は対象（未設定=既定true）。返り値: [{ name, key }]
function sbKoukuTaisou_(oralSettings) {
  return (oralSettings || []).filter(function (u) { return u.is_target !== false; })
    .map(function (u) { return { name: u.name, key: sbNormalizeName_(u.name) }; });
}

// 個訓対象。介護度「要介護」前方一致かつ非中止。返り値: [{ name, key, care }]
function sbKotan_(users) {
  return (users || []).filter(function (u) {
    return !u.cancelled && String(u.category || '').indexOf('要介護') === 0;
  }).map(function (u) { return { name: u.name, key: sbNormalizeName_(u.name), care: u.category || '' }; });
}
```

exports に `sbKoukuTaisou_`/`sbKotan_` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): 口腔体操 sbKoukuTaisou_（is_target）＋個訓 sbKotan_（要介護前方一致）"
```

---

### Task 7: 誕生日 `sbBirthday_`（今月誕生月・撮影未完・当日出席フィルタなし）

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**

```javascript
// ===== I. sbBirthday_（今月誕生月・撮影status未完・当日出席フィルタなし） =====
var bdUsers = [
  { name: '誕生太郎', birthday: '7/15' },
  { name: '来月子', birthday: '8/1' },
  { name: '済み郎', birthday: '7/20' }
];
// statusByKey: 正規化キー → { photo, print, give } すべて true なら完了＝除外
var bdStatus = { '済み郎': { photo: true, print: true, give: true } };
var iRows = core.sbBirthday_(bdUsers, 7, bdStatus);
eq(iRows.length, 1, 'I1: 今月誕生月かつ未完のみ（来月子は月違い・済み郎は完了）');
eq(iRows[0].key, '誕生太郎', 'I2: 誕生太郎が対象');
eq(iRows[0].day, 15, 'I3: 日を数値で保持');
// status不明（未登録）は未完扱いで残る
eq(core.sbBirthday_([{ name: '未登録美', birthday: '7/3' }], 7, {}).length, 1, 'I4: status未登録は未完で残す');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sbBirthday_ is not a function`）

- [ ] **Step 3: 実装を追加**

```javascript
// 誕生日対象。birthday("M/D") が今月＝targetMonth かつ 撮影status未完（photo&&print&&give でない）。
// 当日出席フィルタは掛けない（月単位業務）。statusByKey: 正規化キー→{photo,print,give}。
// 返り値: [{ name, key, month, day }]（日昇順）
function sbBirthday_(users, targetMonth, statusByKey) {
  var rows = [];
  (users || []).forEach(function (u) {
    var mm = String(u.birthday == null ? '' : u.birthday).match(/(\d{1,2})\/(\d{1,2})/);
    if (!mm) return;
    var mo = parseInt(mm[1], 10), da = parseInt(mm[2], 10);
    if (mo !== targetMonth) return;
    var key = sbNormalizeName_(u.name);
    var st = (statusByKey && statusByKey[key]) || {};
    var done = !!(st.photo && st.print && st.give);
    if (done) return;
    rows.push({ name: u.name, key: key, month: mo, day: da });
  });
  rows.sort(function (a, b) { return a.day - b.day; });
  return rows;
}
```

exports に `sbBirthday_` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): 誕生日 sbBirthday_（今月誕生月・撮影未完・当日出席フィルタなし）"
```

---

### Task 8: 当日出席との交差 ＋ 名寄せ不能residue `sbIntersectPresent_`

測定・口腔モニ・口腔体操・個訓の各対象を「当日出席者」と交差し、出席者のうちどの対象にも当たらなかった者を「名寄せ不能」residue として返す安全弁。

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**

```javascript
// ===== J. sbIntersectPresent_（対象×当日出席の交差・出席順維持） =====
var present = [{ name: '山田太郎', key: '山田太郎' }, { name: '佐藤花子', key: '佐藤花子' }];
var targets = [{ name: '山田 太郎', key: '山田太郎', care: '要介護1' }, { name: '欠席男', key: '欠席男' }];
var inter = core.sbIntersectPresent_(targets, present);
eq(inter.length, 1, 'J1: 出席かつ対象は1名（欠席男は出席にいない）');
eq(inter[0].key, '山田太郎', 'J2: 山田太郎が交差');
ok(inter[0].care === '要介護1', 'J3: 対象側の属性を保持');

// ===== K. sbResidue_（出席者のうちどの対象キーにも当たらない＝名寄せ不能） =====
var allTargetKeys = { '山田太郎': true };
var residue = core.sbResidue_(present, allTargetKeys);
eq(residue.length, 1, 'K1: 佐藤花子はどの対象にも当たらず名寄せ不能');
eq(residue[0].key, '佐藤花子', 'K2: 佐藤花子がresidue');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sbIntersectPresent_ is not a function`）

- [ ] **Step 3: 実装を追加**

```javascript
// 対象リスト × 当日出席者。出席keyの集合に含まれる対象のみを、出席順で返す。
function sbIntersectPresent_(targets, present) {
  var presentKeys = {};
  (present || []).forEach(function (p) { presentKeys[p.key] = true; });
  return (targets || []).filter(function (t) { return presentKeys[t.key]; });
}

// 出席者のうち、どの対象キー集合(allTargetKeys)にも当たらない者＝名寄せ不能residue。
// 別人誤割当より拾い漏れ可視化を優先する安全弁。返り値: [{ name, key }]
function sbResidue_(present, allTargetKeys) {
  return (present || []).filter(function (p) { return !allTargetKeys[p.key]; })
    .map(function (p) { return { name: p.name, key: p.key }; });
}
```

exports に `sbIntersectPresent_`/`sbResidue_` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): 交差 sbIntersectPresent_ ＋名寄せ不能residue sbResidue_（拾い漏れ可視化の安全弁）"
```

---

### Task 9: トップレベル集約 `sbBuildBoard_`

各判定を束ね、セッションボード1レスポンス相当のオブジェクトを純粋に組み立てる。GAS側 sessionBoard はデータ取得後この関数を1回呼ぶだけになる。

**Files:**
- Modify: `gas/yawaragi-board/session-board-core.js`
- Test: `scripts/test-session-board.js`

- [ ] **Step 1: 失敗するテストを追加**

```javascript
// ===== L. sbBuildBoard_（全業務集約・当日出席交差・residue） =====
var input = {
  year: 2026, month: 7, today: '2026-07-20',
  attendance: { attendance: {
    am: [{ name: '評価月太郎', status: '出席', care: '要介護1' }, { name: 'モニ太郎', status: '出席', care: '要介護1' }],
    pm: [{ name: '佐藤花子', status: '出席', care: '要支援2' }, { name: '謎の人', status: '出席', care: '' }]
  }},
  kaigoUsers: [{ name: '評価月太郎', category: '要介護1', planStart: '2026-08', planMonths: 3 }],
  kaigoDoneByKey: {},
  shienUsers: [{ name: '佐藤花子', care: '要支援2' }],
  shienLastByName: { '佐藤花子': '2026-03-10' },
  oralUsers: [{ userId: 'モニ太郎', name: 'モニ太郎', planStart: '2026-07', planEnd: '' }],
  oralRecByKey: { 'モニ太郎': {} },
  oralSettings: [{ name: 'モニ太郎', is_target: true }],
  allUsers: [{ name: '評価月太郎', category: '要介護1' }],
  bdUsers: [{ name: '評価月太郎', birthday: '7/25' }],
  bdStatusByKey: {}
};
var board = core.sbBuildBoard_(input, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt });
ok(board.sokutei.length === 2, 'L1: 測定=要介護(評価月太郎)+要支援(佐藤花子)の2名');
ok(board.koukuMoni.length === 1 && board.koukuMoni[0].key === 'モニ太郎', 'L2: 口腔モニ=モニ太郎');
ok(board.koukuTaisou.length === 1, 'L3: 口腔体操=出席かつis_target(モニ太郎)');
ok(board.kotan.length === 1 && board.kotan[0].key === '評価月太郎', 'L4: 個訓=出席かつ要介護');
ok(board.birthday.length === 1, 'L5: 誕生日=今月誕生月(評価月太郎・当日出席フィルタなし)');
ok(board.residue.some(function(r){ return r.key === '謎の人'; }), 'L6: 謎の人はどの対象にも当たらず名寄せ不能residue');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-session-board.js`
Expected: FAIL（`sbBuildBoard_ is not a function`）

- [ ] **Step 3: 実装を追加**（judges は依存注入）

```javascript
// 全業務を集約してセッションボード1レスポンス相当を組み立てる純関数。
// judges = { isHyoukaMonth, oralCycleAt }（GASはグローバル、nodeは抽出注入）。
// 測定=要介護(交差)+要支援(交差) を sokutei に統合。口腔体操・個訓は当日出席と交差。誕生日は交差しない。
// residue = 出席者のうち 測定/口腔モニ/口腔体操/個訓 のどれにも当たらない者。
function sbBuildBoard_(input, judges) {
  var present = sbUniquePresent_(input.attendance);
  var kaigo = sbMeasureKaigo_(input.kaigoUsers, input.kaigoDoneByKey, input.year, input.month, input.today, judges.isHyoukaMonth);
  var shien = sbMeasureShien_(input.shienUsers, input.shienLastByName, input.today);
  var sokutei = sbIntersectPresent_(kaigo, present).concat(sbIntersectPresent_(shien, present));
  var koukuMoni = sbIntersectPresent_(sbKoukuMoni_(input.oralUsers, input.oralRecByKey, input.year, input.month, judges.oralCycleAt), present);
  var koukuTaisou = sbIntersectPresent_(sbKoukuTaisou_(input.oralSettings), present);
  var kotan = sbIntersectPresent_(sbKotan_(input.allUsers), present);
  var birthday = sbBirthday_(input.bdUsers, input.month, input.bdStatusByKey);

  var hit = {};
  [sokutei, koukuMoni, koukuTaisou, kotan].forEach(function (arr) {
    arr.forEach(function (r) { hit[r.key] = true; });
  });
  var residue = sbResidue_(present, hit);

  return {
    date: input.today, year: input.year, month: input.month,
    presentCount: present.length,
    sokutei: sokutei, koukuMoni: koukuMoni, koukuTaisou: koukuTaisou,
    kotan: kotan, birthday: birthday, residue: residue
  };
}
```

exports に `sbBuildBoard_` を追加。

- [ ] **Step 4: テストが通るのを確認**

Run: `node scripts/test-session-board.js`
Expected: PASS（全テスト緑）

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/session-board-core.js scripts/test-session-board.js
git commit -m "feat(session-board): トップ集約 sbBuildBoard_（5業務×当日出席交差・測定2系統統合・residue）"
```

---

### Task 5B: judge関数（isHyoukaMonth / oralCycleAt）をGAS実行可能な形に移植（drift-guard付き）

**背景（コードレビュー指摘）**：Task 4/5 は `isHyoukaMonth`（`shared.js:420`）と `oralCycleAt`（`oral-plan.html:701`）を依存注入している。node テストでは各ソースから抽出注入できるが、**GASランタイムにはこの2関数が存在しない**（`shared.js` は repo 直下のクライアント配信ファイルで GASプロジェクト `gas/yawaragi-board/` に含まれず、`oralCycleAt` は `oral-plan.html` 内のみ。grep で `gas/` 配下に両関数とも0件を確認済み）。このままでは Phase 2 の `sessionBoard(e)` が `sbBuildBoard_(input, {isHyoukaMonth, oralCycleAt})` を呼べず GAS で落ちる。GAS runtime は V8（`appsscript.json` 確認済み）なので `const`/arrow を含む逐語転記が可能。session-board 系ファイルは `.claspignore` 除外対象外＝GASに載る。

**方針**：`gas/yawaragi-board/session-board-judges.js` を新規作成し、`isHyoukaMonth`（shared.js）と `oralCycleAt`（oral-plan.html）を**byte-identical逐語転記**でGASグローバルとして定義。`scripts/test-session-board-judges.js` で「ソース抽出版」と「移植版」を byte比較＋挙動マトリクスで突合し、drift（元が変わったのに移植が古いまま）を機械検知する。二重持ちだが core 側を正とはせず「shared.js/oral-plan.html を正・移植はdrift-guardで追従保証」とする（spec §3.1 の口腔移植方針と整合）。Task 9/10 は DI を維持し、GASではこの移植グローバルを渡す。

**Files:**
- Create: `gas/yawaragi-board/session-board-judges.js`
- Create: `scripts/test-session-board-judges.js`

- [ ] **Step 1: drift-guardテストを書く（失敗させる）** — `scripts/test-session-board-judges.js` を作成。`shared.js` から `isHyoukaMonth`、`oral-plan.html` から `oralCycleAt` をブレース対応抽出し、移植ファイル `../gas/yawaragi-board/session-board-judges.js`（require）と (a)関数ソース文字列の byte一致、(b)入力マトリクス（isHyoukaMonth: planStart各種×planMonths=3/変則×前月/当月/翌月境界、oralCycleAt: planStart×planEnd超過×role moni1/moni2/setsume/none）で全出力一致、を検証する。`extractFn` は `scripts/test-session-board.js` と同じ実装を用いる。
- [ ] **Step 2: 失敗を確認** — Run: `node scripts/test-session-board-judges.js` → Expected: FAIL（Cannot find module session-board-judges.js）
- [ ] **Step 3: 移植を実装** — `gas/yawaragi-board/session-board-judges.js` を作成。`shared.js:420-437` の `isHyoukaMonth` と `oral-plan.html:701-720` の `oralCycleAt` を**実ファイルから1文字も変えず**転記（V8なので `const` のまま可）。ファイル末尾に node テスト用 `if (typeof module !== 'undefined' && module.exports) { module.exports = { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt }; }` を付す（GASでは module 未定義でスキップ）。転記後、両関数を実ソース該当行と `cmp`/diff で byte一致を必ず確認する。
- [ ] **Step 4: テストが通るのを確認** — Run: `node scripts/test-session-board-judges.js` → Expected: PASS（byte一致＋全マトリクス一致）。既存の `node scripts/test-session-board.js` も 32 passed のまま影響なしを確認。
- [ ] **Step 5: コミット**
```bash
git add gas/yawaragi-board/session-board-judges.js scripts/test-session-board-judges.js
git commit -m "feat(session-board): judge関数isHyoukaMonth/oralCycleAtをGAS実行可能に逐語移植＋drift-guardテスト（GASにjudge globalが無くTask10が落ちる穴を封鎖）"
```

**注（Task 9/10へ）**：Task 9 の `sbBuildBoard_` は DI（`judges`引数）を維持。GAS の `sessionBoard(e)`（Task 10）は本ファイルが供給するグローバル `isHyoukaMonth`/`oralCycleAt` を `sbBuildBoard_(input, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt })` として渡す。node の Task 9 テストは従来どおりソース抽出版を注入する（どちらも drift-guard により同一挙動が保証される）。

---

### Task 4C: 測定プールの優先順位（1プール・階層ソート・加重加算）

**spec §2.4 準拠。** 要介護・要支援を1プールに統合し、`careLayer`（第0層）→`urgency`（第1層・加重加算）でソートする純関数群を追加し、`sbMeasureKaigo_`/`sbMeasureShien_`/`sbBuildBoard_` を改修する。すべてTDD。

**追加する純関数（`gas/yawaragi-board/session-board-core.js`）:**
- `sbCountWeeklyVisits_(days)` — 「利用曜日」文字列（例 "火木"）の曜日文字数＝週来所回数（日数ベース）。数え方は `gas/gas_利用者台帳_v2.gs:103-105` 準拠。null/空→0。
- `sbCountRemainingVisits_(days, todayStr)` — 明日〜当月末で `days` に含まれる曜日の日数（残来所日数）。`sokutei.html:147-160 sokuteiRemainingVisits_` 準拠（起点 d+1）。null/空→0。
- `sbMeasureUrgency_(row, weights)` — 加重加算スコア（spec §2.4 式）。`row={weeklyVisits, remainingVisits, absenceRate, unmeasured}`、`weights={chance,freq,absence,unmeasuredBoost}`。欠損ガード：weeklyVisits<=0 は chance/freq を0。
- `sbSokuteiSort_(pool, weights)` — comparator（careLayer↑ → urgency↓ → remainingVisits↑ → weeklyVisits↑ → absenceRate↓ → key↑）で新配列を返す（非破壊）。

**改修:**
- `sbMeasureKaigo_(kaigoUsers, doneByKey, year, month, todayStr, isHyoukaMonthFn, usageByKey)` — 引数 `usageByKey`（正規化名→出席率U・内部正規化・§3.4）を追加。各行に `careLayer:0`, `weeklyVisits`(days), `remainingVisits`(days,today), `absenceRate`(=1−U,既定U=1.0) を付与。**この関数内の従来ソート（月末残日数）は廃止**し、並びは `sbSokuteiSort_` に委ねる（行の付与のみ）。`remaining`(月末カレンダー残日数)は表示用に残す。
- `sbMeasureShien_(shienUsers, lastByName, todayStr, usageByKey)` — 引数 `usageByKey` 追加。各行に `careLayer:1`, `weeklyVisits`, `remainingVisits`, `absenceRate`, （既存の`unmeasured`）を付与。`shienUsers` は `days` を持つ前提。従来の残日数ソートは維持不要（`sbSokuteiSort_` が並べる）。
- `sbBuildBoard_` — `sokutei = sbSokuteiSort_( sbIntersectPresent_(kaigo,present).concat(sbIntersectPresent_(shien,present)), SOKUTEI_WEIGHTS )`。入力に `usageByKey` を追加し、両measure関数へ渡す。`SOKUTEI_WEIGHTS` は既定定数（W_CHANCE=1.0,W_FREQ=0.6,W_ABSENCE=0.6,UNMEASURED_BOOST=2.0）。

**テスト観点（`scripts/test-session-board.js` に節追加）:**
- `sbCountWeeklyVisits_('火木')===2`／`('月水金')===3`／`('')===0`／`(null)===0`。
- `sbCountRemainingVisits_`：既知の月・today・daysで残来所日数を手計算突合／空→0。
- `sbMeasureUrgency_`：週1>週2で頻度項が効く／欠席率が加算される／weeklyVisits0で欠損ガード（chance/freq=0）／未測定boost。
- `sbSokuteiSort_`：**要介護が要支援より必ず先（careLayer）**／同層内で週1・欠席多が先／未測定要支援は要支援層先頭だが要介護より下／安定tiebreak。
- `sbBuildBoard_`：統合プールが1本でソートされ、上位が要介護の高リスク者、末尾に要支援低リスク者。

**注（Phase 2データ契約）:** `usageByKey` は `usage_stats`（`getUsageStats`）から「正規化名→出席率U（Σattended/Σscheduled、`isPreOperational`月除外）」で構築。`shienUsers`/`kaigoUsers` は `days`（利用曜日）を含めること（`getKeikakushoTargetUsers_` は `days` を返す。要支援の母集合取得元も `days` を持たせる）。

---

## Phase 2: board GAS `sessionBoard(e)` action（薄いラッパ）

**このPhaseは `gas/yawaragi-board/コード.js` を触るため、着手直前に必ず `clasp pull` で本番と突合してから編集する（runbook必須）。coreは変更しない。GAS実行はnode単体テスト不可なので、擬似データによるcore検証はPhase1で済み、ここは配線と実データ突合。**

### Task 10: sessionBoard(e) 実装と doGet 分岐

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（doGetの action 分岐に1行追加＋末尾付近に `function sessionBoard(e)`）

**`sbBuildBoard_(input, judges)` の確定データ契約（Phase 1最終レビューで確定・Phase 2はこれを埋めるだけ）:**

```
input.year / input.month     : number（対象年・月）
input.today                  : 'YYYY-MM-DD'（Asia/Tokyo）
input.attendance             : { attendance: { am: Row[], pm: Row[] } }
    Row = { name, status:'出席'|'欠席', care }  ← getAttendance() の戻りそのまま（コード.js:3990）
input.kaigoUsers             : { name, category, planStart:'YYYY-MM', planMonths:1-12, days:'火木'等, cancelled? }[]
    ← getKeikakushoTargetUsers_()（既定・cancelledは源で除外済み。includeCancelled=true は渡さない）。days=利用曜日(週回数算出用)
input.usageByKey             : { [name]: 出席率U(0..1) }  ← ★usage_stats(getUsageStats)から構築。
    U=Σattended/Σscheduled（isPreOperational月除外・運用開始2026-04以降/直近3ヶ月）。欠席率=1−U。キーはnameのまま(core内部正規化)
input.kaigoDoneByKey         : { [name]: true }
    ← ★Phase 2で新規に作る：getKeikakushoYear の記録から「当評価月(year/month)に sokutei_date がある人」の name→true。
      既成の集約関数は無いので records を回して作る。キーは name のまま（core が内部正規化する）。
input.shienUsers             : { name, care, days:'火木'等 }[]  ← care は category を写像（§2.2）／days=利用曜日(週回数用)
input.shienLastByName        : { [name]: 'YYYY-MM-DD'|'' }
    ← 要支援測定記録シート（shienSokuteiRowToObj_ の sokutei_date）を利用者ごと最新で。キーは name のまま。
input.oralUsers              : { name, planStart:'YYYY-MM', planEnd:'YYYY-MM'|'' }[]  ← 口腔機能向上設定(plan_start/plan_end)
input.oralRecByKey           : { [name]: { moni1_date, moni2_date, houkoku_date, plan_date } }  ← 口腔機能向上記録(当該userの当年月行)
input.oralSettings           : { name, isTarget? }[]   ← ★getOralTargetUsers_() は isTarget(キャメル)で返す。sbKoukuTaisou_は両対応済み
input.allUsers               : { name, category, cancelled? }[]  ← 個訓母集合。kaigoUsersと同じ getKeikakushoTargetUsers_() 可
input.bdUsers                : { name, birthday:'M/D' }[]  ← 台帳 誕生日/生年月日（年は失われている）
input.bdStatusByKey          : { [name]: { photo, print, give } }  ← §3.3（初版フォールバック＝空でも可＝撮影除外なし）
judges                       : { isHyoukaMonth, oralCycleAt }  ← Task 5B の session-board-judges.js が供給するGASグローバル

出力: { date, year, month, presentCount, sokutei[], koukuMoni[], koukuTaisou[], kotan[], birthday[], residue[] }
  sokutei = 要介護＋要支援を1プール統合し sbSokuteiSort_ で並べた1配列（careLayer↑→urgency↓…§2.4）。
  フロントは丸ごと上位N＝「今日やる」/残り＝「余裕があれば」（要介護/要支援でセクション分割しない・trackはバッジ表示のみ）。
```

- [ ] **Step 1: 現行の取得関数の返却フィールドを clasp pull 後に確認**

`clasp pull` 実行後、以下を実コードで確認し、Phase1のcore入力キーと突合する（ズレたらcore呼び出し側で写像）：
- `getAttendance(ss, dateStr, dow)` の戻り（`{attendance:{am:[{name,care,status}],pm:[...]}}` 形か、`{am,pm}` 直か）
- `getKeikakushoTargetUsers_(includeCancelled)` → `{userId,name,category,planStart,planMonths,cancelled,...}`
- `getKeikakushoYear` 相当の記録（`{userId,sokutei_date,year,month}`）から「当評価月に sokutei_date 済み」の doneByKey を作る経路
- `getOralPlansYear`（`{users,records}`。records のキー構造 `userId_year_month` と `moni1_date` 等）
- `getShienSokutei`（`{name,sokutei_date}` の配列）と前回実測定日 lastByName の作り方
- 口腔設定 `is_target`（`getOralTargetUsers_` の戻り）
- 誕生日 M/D の取得元（§3.3・下記 Step 3）

Run: `clasp pull`（`gas/yawaragi-board/` で）
Expected: 差分なし or 既知差分のみ。差分があれば pull 側を正としてマージ。

- [ ] **Step 2: doGet に分岐を1行追加**

`function doGet` の action 分岐群（morningDigest の分岐 `コード.js:1146` 近辺）に追加：

```javascript
  if (e && e.parameter && e.parameter.action === 'sessionBoard') return sessionBoard(e);
```

- [ ] **Step 3: sessionBoard(e) 本体を追加**（morningDigest の `safe()` 流儀を踏襲）

`gas/yawaragi-board/コード.js` の末尾付近に追加。誕生日status（§3.3）は既定=UrlFetchだが、初版は**フォールバック（撮影status除外なし・今月誕生月全員）**で配線し、UrlFetch統合はTask13で判断：

```javascript
// セッションボード: 当日出席 × 5業務判定を1レスポンスに集約（判定は session-board-core.js の純関数）
function sessionBoard(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var dateStr = (e && e.parameter && e.parameter.date && /^\d{4}-\d{2}-\d{2}$/.test(e.parameter.date))
    ? e.parameter.date
    : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var year = parseInt(dateStr.slice(0, 4), 10);
  var month = parseInt(dateStr.slice(5, 7), 10);
  var sections = {}, errors = [];
  function safe(name, fn) {
    try { sections[name] = fn(); }
    catch (err) { sections[name] = null; errors.push({ section: name, error: String((err && err.message) || err) }); }
  }

  var ss = SpreadsheetApp.openById(SS_ID);
  var dow = new Date(year, month - 1, parseInt(dateStr.slice(8, 10), 10)).getDay();

  // 取得（各取得はStep1で確認した実シグネチャに合わせる。ここは配線の骨格）
  var attendance = { attendance: getAttendance(ss, dateStr, dow) };        // {am,pm} を attendance でラップ
  var kaigoUsers = getKeikakushoTargetUsers_(false);                       // 非中止の要介護含む全対象
  var allUsers = kaigoUsers;                                               // 個訓の母集合も同一（要介護前方一致でcore側フィルタ）
  var oralData = getOralPlansYear({ parameter: { year: year } });          // {users,records}（実シグネチャに合わせる）
  var shienList = getShienSokutei({ parameter: {} });                      // 要支援測定記録

  // core が要求する形へ整形（doneByKey / oralRecByKey / shienLastByName / bdStatusByKey 等）は
  // Step1の実データ確認結果に基づき、この関数内のヘルパで作る（別テーブル参照を伴うため）。
  var input = sessionBoardBuildInput_(dateStr, year, month, attendance, kaigoUsers, allUsers, oralData, shienList);
  // isHyoukaMonth / oralCycleAt は Task 5B の gas/yawaragi-board/session-board-judges.js が供給するGASグローバル
  var board = sbBuildBoard_(input, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt });

  var out = { ok: true, date: dateStr };
  ['presentCount','sokutei','koukuMoni','koukuTaisou','kotan','birthday','residue'].forEach(function (k) { out[k] = board[k]; });
  out.errors = errors;
  return respond(out, callback);
}
```

`sessionBoardBuildInput_`（整形ヘルパ）は Step1 の実データ確認に基づき別途この関数直下に実装する。整形の責務は「各取得結果を core 入力キー（`kaigoDoneByKey`/`oralRecByKey`/`shienLastByName`/`bdUsers`/`bdStatusByKey`）へ写像」。誕生日は初版フォールバックで `bdStatusByKey={}`（撮影除外なし）。

- [ ] **Step 4: GAS構文の静的確認**

Run: `node -e "require('fs').readFileSync('gas/yawaragi-board/コード.js','utf8'); console.log('read ok')"`（構文はGAS側で確認するため、ここは読めることの確認）
補助: エディタ/`clasp push --dry-run` 相当が無いため、`sessionBoardBuildInput_` と `sessionBoard` のブレース対応・未定義参照が無いことを目視レビュー。

- [ ] **Step 5: コミット（push はしない）**

```bash
git add gas/yawaragi-board/コード.js
git commit -m "feat(session-board): board GAS sessionBoard(e) action追加＋doGet分岐（判定はsession-board-core・撮影status除外は初版フォールバック）"
```

---

### Task 11: clasp deploy と実データ検証（同一URL維持）

**Files:** なし（デプロイ操作）

- [ ] **Step 1: clasp push**

`session-board-core.js` と `コード.js` を GAS へ反映（`.claspignore` に session-board-core.js が除外されていないこと＝GASに載ることを事前確認。除外されていたら外す）。

Run: `clasp push`（`gas/yawaragi-board/`）
Expected: 2ファイル反映。エラーなし。

- [ ] **Step 2: 既存URL維持で deploy**

Run: `clasp deploy -i "<既存デプロイID>"`（新規作成禁止＝URL維持。MEMORY `clasp-gas-deploy-url-iji`）
Expected: バージョン採番。URL不変。

- [ ] **Step 3: 実データで sessionBoard を叩いて検証**

本番URLに `?action=sessionBoard&date=<今日>` を付けてGET（callback無しでJSON）。
Expected: `ok:true`、`sokutei/koukuMoni/koukuTaisou/kotan/birthday/residue` の各配列が返る。`errors` が空。1〜2名を既知の実データ（今日の出席者・評価月該当者）と手照合。

- [ ] **Step 4: 検証結果を記録**

`residue` に想定外の大量氏名が出ていないか（＝名寄せ崩れの兆候）確認。出ていれば `sbNormalizeName_` の正規化不足を特定し Phase1 の Task1 に戻ってテスト追加→修正。

- [ ] **Step 5: コミット（検証メモがあれば docs へ）**

必要なら検証結果を spec の §8 に追記してコミット。

---

## Phase 3: フロント `session-board.html`（描画専用）

### Task 12: session-board.html の作成

**Files:**
- Create: `session-board.html`

- [ ] **Step 1: 既存アプリのHTML骨格・版ゲート・JSONP取得の型を確認**

`sokutei.html` の先頭（版ゲート `shared.js?v=`、`fetchFromGAS`/JSONP、`errCard`）と `genba.html` の配信前提（github.ioで開く・file://禁止）を確認し同型に合わせる。

- [ ] **Step 2: session-board.html を作成**

- 起動時に `action=sessionBoard&date=<today>` を1回JSONPで叩く。
- 返却の各配列を業務ブロックに描画（測定＝要介護は「評価月・月末残N日」、要支援は「残N日/未測定」。上位N=localStorage `sessionBoard.topN`（既定3）を「今日やる」、残りを「余裕あれば」に振り分け。口腔モニ＝role表示。口腔体操/個訓＝一覧。誕生日＝今月一覧。residue＝末尾「⚠️名寄せ不能（要確認）」）。
- attendance取得失敗時は誕生日のみ表示するデグレード（§5）。
- チェック書き戻しは実装しない（第1版・表示専用）。

（HTMLの完全コードは Step1 で確認した既存アプリの版ゲート/JSONPブロックを土台に構築する。骨格は `sokutei.html` を参照テンプレとする。）

- [ ] **Step 3: github.io preview で目視確認**

Run: `node preview-server.js` 等で配信し、実GAS応答で各ブロックが描画されることを確認（file://はキャッシュ罠のため使わない）。
Expected: 今日の出席者ベースで各業務ブロックが妥当に表示。residueが異常に多くない。

- [ ] **Step 4: コミット**

```bash
git add session-board.html
git commit -m "feat(session-board): フロントsession-board.html（描画専用・当日業務ピックアップ・residue表示・測定N可変）"
```

---

## Phase 4: 本番配信（版ゲート）

### Task 13: 誕生日 撮影status統合の最終判断（§3.3）

- [ ] **Step 1:** Task11 Step3 の実データで、誕生日ブロックが「今月誕生月全員（撮影除外なし）」で運用上許容かを社長に確認。
- [ ] **Step 2:** 除外が必要なら、sessionBoard に birthday SYNC の UrlFetch を追加（morningDigest `safe('sougeiOps')` の UrlFetch パターン流用）して `bdStatusByKey` を埋める。不要なら初版フォールバックのまま確定。
- [ ] **Step 3:** 変更した場合は Phase1（core は変更不要・statusByKeyは既に受け口あり）→ Phase2 sessionBoardBuildInput_ のみ修正→再push/deploy→再検証。
- [ ] **Step 4:** コミット。

### Task 14: portal台帳登録と版上げ

- [ ] **Step 1:** portal台帳（`getAppRegistry`）にセッションボードのタイルを追加（動的生成なら追随。要確認）。
- [ ] **Step 2:** `node scripts/bump-app-version.js <新版>`（手編集禁止・version.txtとHTMLの `shared.js?v=` を同一コミットで版同期。CLAUDE.md ハードルール）。
- [ ] **Step 3:** SHA一致確認のうえ社長承認を得て `git push origin master`（FF push）。
- [ ] **Step 4:** `node scripts/bump-app-version.js --verify <版>` で本番反映をポーリング確認（時間切れは成功扱いにしない）。
- [ ] **Step 5:** 完了報告に本番反映証跡（--verify成功出力＋sessionBoard実応答）を含める。

---

## Phase 5（後日・本計画スコープ外）: morningDigest 要約行あと足し

②要約行は同core（`sbBuildBoard_`）流用でタダあと足しできる。morningDigest の最後の `safe('chushi',…)` の `});`（`コード.js:6894`）直後・`return respond(…)`（`:6896`）直前に `safe('sessionBoard', function(){ ... sbBuildBoard_ ... return 件数サマリ; })` を1ブロック足す。社長の「①独立HTML先行→②要約行あと足し」方針に従い、Phase1〜4の本番運用が固まってから別計画で実施する。

---

## Self-Review（spec突合）

- **spec §2.1 全5業務** → Task4(要介護)/Task3(要支援)/Task5(口腔モニ)/Task6(口腔体操・個訓)/Task7(誕生日) で網羅。測定2系統は Task3+Task4、集約は Task9。✅
- **spec §2.2 当日出席交差の範囲**（測定・口腔モニ・口腔体操・個訓は交差／誕生日は交差しない）→ Task9 `sbBuildBoard_` で birthday のみ非交差。✅
- **spec §3.0 流用元**（sokutei.html測定・要介護のみisHyoukaMonth差し替え）→ Task3(要支援=元ロジック)/Task4(要介護=isHyoukaMonth)。✅
- **spec §3.4 名寄せ規約**（正規化統一・residue安全弁）→ Task1 `sbNormalizeName_`／Task8 `sbResidue_`／Task9でresidue算出。✅
- **spec §3.6 Q4 データソース**（台帳計画書開始・キャッシュ無し毎回直読み）→ Task10 は毎回 `getKeikakushoTargetUsers_` を呼ぶ（キャッシュ導入しない）。✅
- **spec §3.3 誕生日status**（既定UrlFetch/フォールバック）→ Task10で初版フォールバック配線、Task13で最終判断。✅
- **spec §5 デグレード**（attendance失敗→誕生日のみ）→ Task12 Step2。✅
- **spec §2.3 YAGNI**（チェック書き戻し無し・写真ファイル管理無し・年齢計算無し）→ Task12は表示専用、誕生日はM/Dのみ。✅
- **Type consistency:** core関数名は Task間で一貫（`sbNormalizeName_`/`sbUniquePresent_`/`sbMeasureKaigo_`/`sbMeasureShien_`/`sbKoukuMoni_`/`sbKoukuTaisou_`/`sbKotan_`/`sbBirthday_`/`sbIntersectPresent_`/`sbResidue_`/`sbBuildBoard_`）。返却キー `key` を全対象で統一、集約キー `sokutei/koukuMoni/koukuTaisou/kotan/birthday/residue` を Task9 と Task10 で一致。✅
- **未確定（実装時に潰す）:** Task10 Step1 の各取得関数の実シグネチャ（clasp pull で確認）／要支援初回未測定の扱い（spec §8）／誕生日status統合（Task13）。いずれも該当Taskに確認ステップを内包。
