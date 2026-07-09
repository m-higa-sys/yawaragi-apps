# 送迎時間「変更 → 色 → 連絡済み」実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 社長が sougei で変更＋色ONした未来日の送迎（迎え）時刻を、スタッフ用一覧(sched-grid)で「☎要連絡(色A)→連絡済み(色B)」として追跡し、連絡履歴を prune 対象外の「送迎連絡台帳」に残す。

**Architecture:** 追記型(append-only)の新シート「送迎連絡台帳」を正本にし、(適用日,利用者) キーの最新行で現在状態を導出する。色判定・最新勝ち導出・idempotency・旧時間引き当ての4つを純関数化し Node で TDD（既存 `extractFn` ブレース抽出パターンを踏襲）。GAS は saveSchedTimes に要連絡行追記／doPost に markSchedContacted／getSchedTimesResponse に台帳現在状態合成を足す。sched-grid に色A/B・連絡済みボタン・モーダル・オリジンガード・ライトバック検証を足す。sougei は実質ノータッチ。

**Tech Stack:** Google Apps Script（`gas/gas_出勤送迎表.gs`・RELAY GAS `AKfycby-V66Uddi…`）／素の HTML+JS（`sched-grid.html`）／Node（`scripts/test-*.js`・依存ゼロの自作アサート）

**設計書:** `docs/superpowers/specs/2026-07-09-sougei-jikan-henkou-renrakuzumi-design.md`（A1/C1/E1/迎えのみ/B1/D1 承認済み）

---

## 前提・厳守事項

- **Q1 ゲート（§8）**: 連絡者セレクタの候補ソース（スタッフ名簿）が未確定。**Task 0 の調査が完了して名簿ソースが確定するまで、Task 9-B（連絡者セレクタ）のコーディングに入らない。** Task 1〜8・9-A は名簿に依存しないので先行可。
- **Q2**: 緊急「共有」ボタンは初回サイクルは隠しフォールバックで残す＝**本計画では sougei を触らない**（撤去は auto 経路の本番検証後の別フェーズ）。
- **no-cors の罠**（memory `genba-nocors-post-成否読めない罠`）: 書込 POST の成功は自己申告で判断せず、必ずライトバック検証（読み直して突合）で裁定する。
- **オリジンガード**（memory `genba-betsu-origin-touroku-jiko`）: 本番オリジン以外からの書込を先頭で遮断。
- **版ゲート**: sched-grid は版ゲート対象。本番反映は `node scripts/bump-app-version.js <版>` 経由（CLAUDE.md ハードルール）。sougei は本計画で未変更。
- **TZ 罠**（memory `shutsuketsu-sheet-timestamp-tz-shift`）: 台帳の時刻列は `Utilities.formatDate(d,'Asia/Tokyo','yyyy-MM-dd HH:mm:ss')` の文字列で書く（Date 直書きの +16h ずれ回避）。
- **データSS**: `1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw`（getSchedTimesResponse:142 / saveSchedTimes:172 と同一）。台帳もここに置く。

---

## File Structure

| ファイル | 変更種別 | 責務 |
|---|---|---|
| `gas/gas_出勤送迎表.gs` | 修正 | 純関数4種（`schedContactLatest`/`schedContactColor`/`schedContactShouldSkip`/`resolveOldTime`）＋`_ensureSchedContactSheet`＋`_appendSchedContactRow`＋saveSchedTimes要連絡追記＋doPost `markSchedContacted`＋getSchedTimesResponse合成 |
| `scripts/test-sched-renrakuzumi.js` | 新規 | 上記4純関数を実コード抽出して Node で検証（罠テスト含む） |
| `sched-grid.html` | 修正 | 色A/B表示・「連絡済み」ボタン・連絡者モーダル・オリジンガード・ライトバック検証 |
| `version.txt` / `sched-grid.html` の `?v=` | 修正 | 版ゲート bump（最終・承認後） |
| `sougei.html` | **未変更** | Q2 により初回は隠しフォールバックのまま |

台帳シート「送迎連絡台帳」列（設計§1）: `記録日時, 適用日, 利用者, 時間帯, 旧時間, 新時間, status, 連絡者, 連絡日時, source`（10列）。キー=(適用日,利用者)。

---

## Task 0: 連絡者名簿ソースの調査（コーディング前・§8・Q1ゲート）

**Files:** なし（調査のみ・コミット不要）

**目的:** sched-grid のモーダルに出す連絡者(スタッフ)候補の正本を1つに特定する。特定できるまで Task 9-B に入らない。

- [ ] **Step 1: 候補3ソースを実データで確認**

次の3つを調べ、「スタッフ名の配列がどの関数/GET/シートで取れるか」を1つ確定する:
1. **ボードGAS**（`gas/yawaragi-board/コード.js`）にスタッフ名一覧を返す関数/API があるか。
   Run: `grep -nE "スタッフ|staff|職員|従業員" "gas/yawaragi-board/コード.js" | head -30`
2. **sougei（`sougei.html` / `gas/gas_出勤送迎表.gs`）** が参照するスタッフ名リスト（出勤表の担当者列など）。
   Run: `grep -nE "staff|スタッフ|担当|受付者|operator" sougei.html gas/gas_出勤送迎表.gs | head -30`
3. **アプリ台帳(Sheets)** にスタッフマスタ相当シートがあるか（`gas/gas_アプリ台帳登録.gs` など）。
   Run: `grep -rnE "スタッフ|職員|staff" gas/ | grep -iE "sheet|master|台帳" | head -30`

- [ ] **Step 2: 確定を設計書へ追記**

特定できたソース（例: 「ボードGAS `getStaffList()`」）を設計書 §3-4 と §8 に1行で確定記録し、Task 9-B の取得方式（GET/JSONP か、静的リストか）を確定する。
参考: memory の欠席box/kbox は「担当者はモーダル内選択」パターン（受付者バー直読はしない）。

- [ ] **Step 3: ゲート判定**

名簿ソースが1つに確定 → Task 9-B 着手可。確定できない → **社長に確認するまで Task 9-B を保留**（Task 9-A まではセレクタ無しで進めてよい）。

---

## Task 1: 純関数 `schedContactLatest`（台帳 最新勝ち導出）— TDD

**Files:**
- Create: `scripts/test-sched-renrakuzumi.js`
- Modify: `gas/gas_出勤送迎表.gs`（純関数群を末尾付近に追加）

- [ ] **Step 1: テストハーネスと失敗テストを書く**

`scripts/test-sched-renrakuzumi.js` を新規作成。既存 `scripts/test-cycle-judge.js` の `extractFn`（ブレース対応抽出）を流用する。

```js
// test-sched-renrakuzumi.js
// gas/gas_出勤送迎表.gs の送迎連絡 純関数を実コード抽出して node で検証。
// 実行: node scripts/test-sched-renrakuzumi.js
const fs = require('fs');
const path = require('path');
const SRC_PATH = path.join(__dirname, '..', 'gas', 'gas_出勤送迎表.gs');
const src = fs.readFileSync(SRC_PATH, 'utf8');

function extractFn(name) {
  const sigParen = 'function ' + name + '(';
  const sigSpace = 'function ' + name + ' (';
  function findSig(from) {
    const a = src.indexOf(sigParen, from);
    const b = src.indexOf(sigSpace, from);
    if (a < 0) return b < 0 ? -1 : b;
    if (b < 0) return a;
    return Math.min(a, b);
  }
  const start = findSig(0);
  if (start < 0) throw new Error('gas に function ' + name + ' が無い（未実装＝RED）');
  if (findSig(start + ('function ' + name).length) >= 0) {
    throw new Error(name + ' が複数定義（抽出器が誤った塊を掴む恐れ）');
  }
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const sandbox = {};
const code = extractFn('schedContactLatest')
  + '\nsandbox.schedContactLatest = schedContactLatest;';
(function () { eval(code); })();
const { schedContactLatest } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    期待: ' + e + '\n    実際: ' + a); }
}

console.log('# schedContactLatest');
// 同一キーは記録日時が新しい行が勝つ
eq(schedContactLatest([
  { recordedAt: '2026-07-10 08:40:00', date: '2026-07-15', user: '山田花子', status: '要連絡' },
  { recordedAt: '2026-07-10 08:42:05', date: '2026-07-15', user: '山田花子', status: '連絡済み' },
])['2026-07-15|山田花子'].status, '連絡済み', '最新行が勝つ');
// 別キーは混ざらない
eq(Object.keys(schedContactLatest([
  { recordedAt: '2026-07-10 08:40:00', date: '2026-07-15', user: '山田花子', status: '要連絡' },
  { recordedAt: '2026-07-10 08:40:00', date: '2026-07-16', user: '山田花子', status: '要連絡' },
])).sort(), ['2026-07-15|山田花子', '2026-07-16|山田花子'], '別適用日は別キー');
// 空・不正行は無視
eq(schedContactLatest([null, { recordedAt: '1', date: '', user: 'x' }, { recordedAt: '2', date: '2026-07-15', user: '' }]), {}, '不正行は無視');
eq(schedContactLatest(null), {}, 'null 入力で空オブジェクト');

console.log('\n結果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: テストを実行して RED を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: FAIL（`gas に function schedContactLatest が無い（未実装＝RED）` で throw）

- [ ] **Step 3: 純関数を実装**

`gas/gas_出勤送迎表.gs` の末尾付近（他のヘルパ群と同じ階層・トップレベル関数として）に追加:

```js
// ===== 送迎連絡台帳: 純関数群（Node で test-sched-renrakuzumi.js が実コード抽出して検証）=====
// 台帳の全行から (適用日|利用者) キーごとの最新行を導出（記録日時 文字列比較で最新勝ち）。
// rows: [{recordedAt, date, user, oldTime, newTime, status, operator, contactedAt, source}, ...]
function schedContactLatest(rows) {
  var map = {};
  (rows || []).forEach(function(r) {
    if (!r || !r.date || !r.user) return;
    var key = r.date + '|' + r.user;
    var prev = map[key];
    if (!prev || String(r.recordedAt) > String(prev.recordedAt)) map[key] = r;
  });
  return map;
}
```

- [ ] **Step 4: テストを実行して GREEN を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add scripts/test-sched-renrakuzumi.js "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): 送迎連絡台帳 最新勝ち導出 schedContactLatest（純関数・TDD）"
```

---

## Task 2: 純関数 `schedContactColor`（色判定）— TDD

**Files:**
- Modify: `scripts/test-sched-renrakuzumi.js`
- Modify: `gas/gas_出勤送迎表.gs`

- [ ] **Step 1: 失敗テストを追加**

`test-sched-renrakuzumi.js` の `code` 連結に `schedContactColor` を足し、分割代入に加える:

```js
const code = extractFn('schedContactLatest') + '\n' + extractFn('schedContactColor')
  + '\nsandbox.schedContactLatest = schedContactLatest; sandbox.schedContactColor = schedContactColor;';
```
```js
const { schedContactLatest, schedContactColor } = sandbox;
```

アサートを追加（`console.log('\n結果...')` の直前）:

```js
console.log('\n# schedContactColor');
eq(schedContactColor(false, null), 'normal', '変更色OFF→通常');
eq(schedContactColor(false, '連絡済み'), 'normal', '色OFFは連絡済みでも通常（変更表示しない）');
eq(schedContactColor(true, null), 'need', '色ON・台帳なし→要連絡A');
eq(schedContactColor(true, '要連絡'), 'need', '色ON・要連絡→A');
eq(schedContactColor(true, '連絡済み'), 'done', '色ON・連絡済み→B');
eq(schedContactColor(true, '通常化'), 'need', '色再ON・旧通常化→A（新しい変更）');
```

- [ ] **Step 2: RED を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: FAIL（`function schedContactColor が無い`）

- [ ] **Step 3: 実装**

`schedContactLatest` の直後に追加:

```js
// 色判定: その stop の変更色ON(timeChanged) と 台帳最新 status から一覧の色を返す。
// timeChanged: boolean（override の stop の timeChanged）
// latestStatus: '要連絡'|'連絡済み'|'通常化'|null
// 戻り値: 'normal'（通常）| 'need'（色A=要連絡）| 'done'（色B=連絡済み）
function schedContactColor(timeChanged, latestStatus) {
  if (!timeChanged) return 'normal';         // 色の起点は timeChanged。E1の色OFFもここで通常化
  if (latestStatus === '連絡済み') return 'done';
  return 'need';
}
```

- [ ] **Step 4: GREEN を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: PASS（10件）

- [ ] **Step 5: コミット**

```bash
git add scripts/test-sched-renrakuzumi.js "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): 送迎連絡 色判定 schedContactColor（純関数・TDD）"
```

---

## Task 3: 純関数 `schedContactShouldSkip`（idempotency）— TDD

**Files:**
- Modify: `scripts/test-sched-renrakuzumi.js`
- Modify: `gas/gas_出勤送迎表.gs`

- [ ] **Step 1: 失敗テストを追加**

`code` 連結・分割代入に `schedContactShouldSkip` を足し、アサート追加:

```js
console.log('\n# schedContactShouldSkip');
eq(schedContactShouldSkip('連絡済み'), true, '最新が連絡済み→追記スキップ');
eq(schedContactShouldSkip('要連絡'), false, '要連絡→追記する');
eq(schedContactShouldSkip('通常化'), false, '通常化→追記する');
eq(schedContactShouldSkip(null), false, '台帳なし→追記する');
```

- [ ] **Step 2: RED を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: FAIL（`function schedContactShouldSkip が無い`）

- [ ] **Step 3: 実装**

```js
// markSchedContacted 受信時の二重押し対策: 最新が既に連絡済みなら追記しない。
function schedContactShouldSkip(latestStatus) {
  return latestStatus === '連絡済み';
}
```

- [ ] **Step 4: GREEN を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: PASS（14件）

- [ ] **Step 5: コミット**

```bash
git add scripts/test-sched-renrakuzumi.js "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): 送迎連絡 idempotency schedContactShouldSkip（純関数・TDD）"
```

---

## Task 4: 純関数 `resolveOldTime`（A1 旧時間引き当て）— TDD

**Files:**
- Modify: `scripts/test-sched-renrakuzumi.js`
- Modify: `gas/gas_出勤送迎表.gs`

- [ ] **Step 1: 失敗テストを追加**

```js
console.log('\n# resolveOldTime');
eq(resolveOldTime('09:10', '09:00'), '09:10', '直前override優先');
eq(resolveOldTime('', '09:00'), '09:00', 'overrideなし→曜日ベース');
eq(resolveOldTime(null, null), '', '両方なし→空欄');
eq(resolveOldTime(undefined, '09:00'), '09:00', 'undefinedは曜日ベースへ');
```

- [ ] **Step 2: RED を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: FAIL（`function resolveOldTime が無い`）

- [ ] **Step 3: 実装**

```js
// A1: 旧時間 = 直前override時刻 ?? 曜日ベース時刻 ?? ''（引けなければ空欄。事実＝新時間・要連絡は残す）。
function resolveOldTime(prevOverrideTime, weekdayBaseTime) {
  if (prevOverrideTime) return String(prevOverrideTime);
  if (weekdayBaseTime) return String(weekdayBaseTime);
  return '';
}
```

- [ ] **Step 4: GREEN を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: PASS（18件）

- [ ] **Step 5: コミット**

```bash
git add scripts/test-sched-renrakuzumi.js "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): 送迎連絡 旧時間引き当て resolveOldTime（純関数・TDD）"
```

---

## Task 5: 台帳シート ensure と行追記ヘルパ（GAS・純関数外）

**Files:**
- Modify: `gas/gas_出勤送迎表.gs`（`_ensureChangeLogSheet`:575 の直後に追加）

*注: シート I/O は Node 単体テスト対象外。GAS エディタで `_test_schedContactSheet()` を手動実行して確認する。*

- [ ] **Step 1: 定数と ensure 関数を追加**

`_ensureChangeLogSheet`（575行）の直後に追加。既存の ensure パターンを踏襲:

```js
// ===== 送迎連絡台帳（append-only・prune対象外の正本）=====
var SCHED_CONTACT_SS_ID = '1-CryIbGLFERANKWeHul1zPfFEHfuE6WfGXsZNiD6TGw'; // データSS（送迎時間と同一）
var SCHED_CONTACT_SHEET = '送迎連絡台帳';
// 列11「変更詳細」= AM/PM ロスレスの [{slot,old,new}] JSON（社長要件・先勝ち禁止）
var SCHED_CONTACT_HEADERS = ['記録日時','適用日','利用者','時間帯','旧時間','新時間','status','連絡者','連絡日時','source','変更詳細'];

function _ensureSchedContactSheet() {
  var ss = SpreadsheetApp.openById(SCHED_CONTACT_SS_ID);
  var sheet = ss.getSheetByName(SCHED_CONTACT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SCHED_CONTACT_SHEET);
    sheet.getRange(1, 1, 1, SCHED_CONTACT_HEADERS.length).setValues([SCHED_CONTACT_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SCHED_CONTACT_HEADERS.length).setFontWeight('bold');
    // TZ罠回避: 日時列は文字列で書くため書式は既定(テキスト表示)のままでよい
  }
  return sheet;
}

// 台帳の現在状態（キー→最新行）を返す。getSchedTimesResponse と markSchedContacted から使う。
function _readSchedContactLatest() {
  var sheet = _ensureSchedContactSheet();
  if (sheet.getLastRow() < 2) return {};
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    var changes = [];
    try { changes = v[10] ? JSON.parse(String(v[10])) : []; } catch (e) { changes = []; }
    rows.push({
      recordedAt: String(v[0] || ''), date: String(v[1] || ''), user: String(v[2] || ''),
      unit: String(v[3] || ''), oldTime: String(v[4] || ''), newTime: String(v[5] || ''),
      status: String(v[6] || ''), operator: String(v[7] || ''), contactedAt: String(v[8] || ''),
      source: String(v[9] || ''), changes: changes
    });
  }
  return schedContactLatest(rows);
}

// 台帳へ1行 append（TZ罠回避のため時刻は Asia/Tokyo 文字列）。
// row.changes = [{slot,old,new}] があれば列11へ JSON 保存。旧時間/新時間/時間帯は先頭スロットで補完。
function _appendSchedContactRow(row) {
  var sheet = _ensureSchedContactSheet();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var changes = Array.isArray(row.changes) ? row.changes : [];
  var head = changes[0] || null;
  var unit = row.unit || (head ? head.slot : '') || '';
  var oldTime = (row.oldTime != null && row.oldTime !== '') ? row.oldTime : (head ? head.old : '') || '';
  var newTime = (row.newTime != null && row.newTime !== '') ? row.newTime : (head ? head.new : '') || '';
  sheet.appendRow([
    now, row.date, row.user, unit,
    oldTime, newTime, row.status,
    row.operator || '', row.contactedAt || '', row.source || '',
    changes.length ? JSON.stringify(changes) : ''
  ]);
  return now;
}
```

- [ ] **Step 2: GAS 手動確認テストを追加**

```js
function _test_schedContactSheet() {
  var latest0 = _readSchedContactLatest();
  Logger.log('現在キー数: ' + Object.keys(latest0).length);
  _appendSchedContactRow({ date: '2099-01-01', user: 'テスト太郎', unit: '午前', oldTime: '09:00', newTime: '09:30', status: '要連絡', source: '出勤送迎表' });
  var latest1 = _readSchedContactLatest();
  Logger.log('追記後 テスト太郎: ' + JSON.stringify(latest1['2099-01-01|テスト太郎']));
  // 後始末: テスト行は台帳末尾を手動削除するか、2099-01-01 の掃除関数で消す
}
```

- [ ] **Step 3: GAS エディタで手動実行**

clasp push 後（memory `clasp-gas-deploy-url-iji`）、GAS エディタで `_test_schedContactSheet` を実行。
Expected: ログに「追記後 テスト太郎: {...status:'要連絡'...}」。実行後、台帳末尾のテスト行(2099-01-01)を手動削除。

- [ ] **Step 4: コミット**

```bash
git add "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): 送迎連絡台帳 ensure/read/append ヘルパ（GAS）"
```

---

## Task 6: saveSchedTimes に「要連絡」行追記（②の自動トリガー）

**Files:**
- Modify: `gas/gas_出勤送迎表.gs`（`saveSchedTimes`:167、override保存ブロック `if (parsed.overrideDate && _hasRoutes) {...}`:280-291 の**中／直後**）

- [x] **Step 1: override の stop 形を確認（2026-07-09 確認済み・実コード裏取り）**

**確認結果（`gas_出勤送迎表.gs` / `sougei.html` / `sched-grid.html` の最新本番コード）**:
- override は**入れ子**。保存単位は `_ovStore[parsed.overrideDate] = { routes: newData.routes[mergeDay], weekday, savedAt, members }`（`gas:285-288`）。`parsed.overrideDate`=ISO日付、`parsed.day`(=mergeDay)=曜日文字。
- `routes[曜日]` の形（`sougei.html:891-892` コメントが正）:
  - `pick:[ {driver, vehicle, stops:[{user, time, timeChanged, ...}]} ]` ＝**迎え**（`time` あり）
  - `drop:[ {no, driver, vehicle, stops:[{user}]} ]` ＝**送り**（`time` 無し）
  - さらに `am` / `pm` の2レイヤ: `routes[曜日].am.pick[*].stops[*]` / `routes[曜日].pm.pick[*].stops[*]`。
  - → **設計 F「迎えのみ」がデータ構造で裏取り**: 時刻を持つのは `pick` の stop だけ。`drop` は時刻を持たないので対象外。
- **色フラグ `timeChanged`** は **pick stop 単位の boolean**。`sougei.html:2832` で `stop.timeChanged=true`（手動ON）、`:2836` で `delete stop.timeChanged`（OFF）、保存時 `sougei.html:4970` で stop に載る。`sched-grid.html:791` は既に `s.timeChanged` で「変更」バッジを描画済み。
- **旧時間の引き当て源**: ①直前override＝上書き前の `_readSchedOverrides()[overrideDate]` の同 user の pick stop `time`。②曜日ベース＝A1 `existing.routes[mergeDay]`（上書き前）の同 user の pick stop `time`。両方 pick stops を歩いて引く。
- **⚠️ 計画修正点**: 旧版 Step2 の「フラット `stops.forEach`」は誤り。実際は `routes[曜日].{am,pm}.pick[*].stops[*]` の**3重ループ**で走査する。

- [ ] **Step 2: 要連絡追記ロジックを実装**

override 保存ブロック（`if (parsed.overrideDate && _hasRoutes) {`:280）の中、`_writeSchedOverrides(_ovStore);`（:290）の**直後**に追加。上書き前の値を先に読むため、`_ovStore` 書込前に「直前override」と「曜日ベース」を退避しておく:

```js
// === 新規: 変更色ON の迎え(pick)を台帳へ「要連絡」で追記（②自動トリガー）===
// 実データ形: newData.routes[mergeDay].{am,pm}.pick[*].stops[*] = {user, time, timeChanged}
// AM/PM ロスレス（社長要件・先勝ち禁止）: timeChanged のある pick を AM/PM 全部拾い、
//   利用者ごとに changes=[{slot,old,new}] を束ねて (適用日,利用者) の1行に追記。
// 旧時間源: 上書き前の同キー override（_ovPrev）→ 無ければ上書き前の曜日ベース（existing.routes[mergeDay]）。
(function _appendNeedContactRows() {
  var _latest = _readSchedContactLatest();
  var _ovPrevRoutes = (_ovPrev && _ovPrev[parsed.overrideDate] && _ovPrev[parsed.overrideDate].routes) || null; // 上書き前override
  var _baseRoutes = _existingRoutesBefore || null;    // 上書き前の曜日ベース routes[mergeDay]

  // 指定スロット(am/pm)の pick stops を {user: time} に畳む小ヘルパ（旧時間の引き当て用）
  function pickTimesOfSlot(routesForDay, ap) {
    var m = {};
    var lanes = routesForDay && routesForDay[ap] && routesForDay[ap].pick;
    if (!Array.isArray(lanes)) return m;
    lanes.forEach(function(lane) {
      var stops = lane && lane.stops;
      if (!Array.isArray(stops)) return;
      stops.forEach(function(st) {
        if (st && st.user && m[st.user] == null && st.time) m[st.user] = String(st.time);
      });
    });
    return m;
  }

  // 今回保存した override の pick stops を走査し、timeChanged の迎えを利用者ごとに集約
  var savedRoutes = _ovRoutes;                          // = newData.routes[mergeDay]（:282で確定済み）
  var byUser = {};                                      // user -> [{slot,old,new}]
  ['am', 'pm'].forEach(function(ap) {
    var slotLabel = (ap === 'am') ? '午前' : '午後';
    var prevOvSlot = pickTimesOfSlot(_ovPrevRoutes, ap);
    var baseSlot = pickTimesOfSlot(_baseRoutes, ap);
    var lanes = savedRoutes && savedRoutes[ap] && savedRoutes[ap].pick;
    if (!Array.isArray(lanes)) return;
    lanes.forEach(function(lane) {
      var stops = lane && lane.stops;
      if (!Array.isArray(stops)) return;
      stops.forEach(function(st) {
        if (!st || !st.user || !st.timeChanged) return;
        // 旧時間はスロット単位で引く（AMの旧はAM側、PMの旧はPM側）
        var oldTime = resolveOldTime(prevOvSlot[st.user] || '', baseSlot[st.user] || '');
        if (!byUser[st.user]) byUser[st.user] = [];
        byUser[st.user].push({ slot: slotLabel, old: oldTime, new: String(st.time || '') });
      });
    });
  });

  // 利用者ごとに1行 追記（重複ガード＝同キー最新が要連絡かつ changes が完全一致なら skip）
  Object.keys(byUser).forEach(function(user) {
    var changes = byUser[user];
    var key = parsed.overrideDate + '|' + user;
    var cur = _latest[key];
    if (cur && cur.status === '要連絡' && JSON.stringify(cur.changes || []) === JSON.stringify(changes)) return;
    _appendSchedContactRow({
      date: parsed.overrideDate, user: user, status: '要連絡', source: '出勤送迎表', changes: changes
    });
  });
})();
```

**上書き前値の退避**（override 保存ブロックの**前**、`_readSchedOverrides()` を呼ぶ:281 の直前あたりに1行ずつ足す）:

```js
var _ovPrev = _readSchedOverrides();                    // 上書き前の overrides 全体（同 date の直前値を含む）
var _existingRoutesBefore = existing.routes && existing.routes[mergeDay] ? JSON.parse(JSON.stringify(existing.routes[mergeDay])) : null; // 上書き前の曜日ベース
```

*注: `existing.routes[mergeDay]` は :247-249 でこの mergeDay ぶんが delete され、:269-271 で newData に置換される。よって「上書き前の曜日ベース」は**その delete より前**（:227 の直前）で退避する必要がある。実装時は退避行を `for (var name in existing.schedTime)` ループ（:229）より前に置く。*

- [ ] **Step 3: AM/PM 掛け持ちカウント関数を追加（社長要件・畳みの安全性確認）**

実 overrides で「同一日・同一 user が am/pm 両 pick に出る」件数を数える読み取り専用関数。台帳ヘルパ群の近くに追加:

```js
// 実 overrides を走査し、同一日・同一 user が am/pm 両方の pick に出るケースを数える（読み取り専用）。
// 0 件なら AM/PM 畳み（changes 集約）は落ちる情報ゼロで完全に安全と確定できる。
function _count_amPmPickOverlap() {
  var ov = _readSchedOverrides();
  var overlaps = [];
  Object.keys(ov || {}).forEach(function(date) {
    var routes = ov[date] && ov[date].routes;
    if (!routes) return;
    function usersOf(ap) {
      var set = {};
      var lanes = routes[ap] && routes[ap].pick;
      if (Array.isArray(lanes)) lanes.forEach(function(lane) {
        var stops = lane && lane.stops;
        if (Array.isArray(stops)) stops.forEach(function(st) { if (st && st.user) set[st.user] = true; });
      });
      return set;
    }
    var am = usersOf('am'), pm = usersOf('pm');
    Object.keys(am).forEach(function(u) { if (pm[u]) overlaps.push(date + ' / ' + u); });
  });
  Logger.log('AM/PM 両pick 掛け持ち: ' + overlaps.length + ' 件');
  overlaps.forEach(function(s) { Logger.log('  ' + s); });
  return overlaps;
}
```

Run（clasp窓）: GAS エディタで `_count_amPmPickOverlap` を実行。
Expected: 件数を報告（**0 件なら畳み完全安全**と社長へ確定報告。1件以上なら changes 配列で AM/PM 両方が拾えていることを台帳で確認）。

- [ ] **Step 4: GAS 手動確認（changes・AM/PM ロスレス）**

clasp push 後、GAS エディタで擬似 saveSchedTimes を実行（未来日・pick stop に `timeChanged=true` を含む JSON。可能なら am と pm 両方に同一 user の変更を入れる）。
Expected:
- 台帳に (適用日,利用者) の「要連絡」行が**利用者1件**でき、列11「変更詳細」に `[{slot:'午前',...},{slot:'午後',...}]` が**両方**入る（先勝ちで片方が落ちない）。
- 同 JSON をもう一度実行 → 重複追記されない（changes 完全一致で skip）。
- 確認後テスト行を掃除。

- [ ] **Step 5: コミット**

```bash
git add "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): saveSchedTimes で変更色ONの迎えを台帳へ要連絡追記（AM/PMロスレス changes・旧時間A1引き当て）"
```

---

## Task 7: doPost に `markSchedContacted`（連絡済み行追記・idempotency）

**Files:**
- Modify: `gas/gas_出勤送迎表.gs`（`doPost`:355 のディスパッチに分岐追加）

- [ ] **Step 1: doPost 分岐を追加**

`doPost`（355行）の `saveSchedTimes` 分岐（366-369）の直後に追加:

```js
    // 送迎連絡「連絡済み」記録（2026-07 追加）
    if (parsed.action === 'markSchedContacted') {
      return ContentService.createTextOutput(JSON.stringify(markSchedContacted(parsed)))
        .setMimeType(ContentService.MimeType.JSON);
    }
```

- [ ] **Step 2: markSchedContacted 本体を実装**

台帳ヘルパ群の近くに追加:

```js
// 連絡済みを台帳へ追記。二重押しは idempotency で吸収（最新が既に連絡済みなら追記せず ok）。
// parsed: { action, date, user, operator, contactedAt, unit? }
function markSchedContacted(parsed) {
  var date = String(parsed.date || '').trim();
  var user = String(parsed.user || '').trim();
  if (!date || !user) return { ok: false, error: 'date/user 必須' };
  var latest = _readSchedContactLatest();
  var cur = latest[date + '|' + user];
  if (schedContactShouldSkip(cur ? cur.status : null)) {
    return { ok: true, skipped: true };   // 既に連絡済み＝二重行を作らない
  }
  var contactedAt = String(parsed.contactedAt || '') || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  // 連絡済み行は直前の要連絡行の changes（AM/PMロスレス）をそのまま引き継ぐ＝履歴を欠落させない
  _appendSchedContactRow({
    date: date, user: user, unit: parsed.unit || (cur ? cur.unit : ''),
    oldTime: cur ? cur.oldTime : '', newTime: cur ? cur.newTime : '',
    changes: (cur && cur.changes) ? cur.changes : [],
    status: '連絡済み', operator: String(parsed.operator || ''),
    contactedAt: contactedAt, source: '送迎時間一覧'
  });
  return { ok: true };
}
```

- [ ] **Step 3: GAS 手動確認**

GAS エディタで `markSchedContacted({date:'2099-01-01',user:'テスト太郎',operator:'佐藤'})` を2回実行。
Expected: 1回目 `{ok:true}`・台帳に連絡済み行、2回目 `{ok:true,skipped:true}`・行が増えない。確認後テスト行を掃除。

- [ ] **Step 4: コミット**

```bash
git add "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): doPost markSchedContacted（連絡済み追記・二重押しidempotency）"
```

---

## Task 8: getSchedTimesResponse に台帳現在状態を合成（D1）

**Files:**
- Modify: `gas/gas_出勤送迎表.gs`（`getSchedTimesResponse`:141）

- [ ] **Step 1: レスポンスに現在状態を載せる**

`getSchedTimesResponse`（141行）が組み立てるレスポンス（callback 有無で JSONP/素のJSON を出し分け。sched-grid は素の fetch で `.then(r=>r.json())` するため素JSON 経路が使われる）に、未来日ぶんの台帳現在状態を1フィールド追加する。overrides を返している構造の近くに:

```js
  // D1: 未来日の送迎連絡 現在状態を合成（sched-grid が色A/Bとモーダルを出すため）。
  // 形: contactStatus[適用日|利用者] = { status, operator, contactedAt, oldTime, newTime, changes }
  //   changes=[{slot,old,new}] は AM/PM ロスレス（モーダルが「AM旧→新／PM旧→新」を並べる）
  var _latest = _readSchedContactLatest();
  var contactStatus = {};
  var _todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  Object.keys(_latest).forEach(function(k) {
    var r = _latest[k];
    if (r.date >= _todayStr) {          // 未来日（適用日が今日以降）だけ渡す。過去は prune 済で色付けしない
      contactStatus[k] = { status: r.status, operator: r.operator, contactedAt: r.contactedAt, oldTime: r.oldTime, newTime: r.newTime, changes: r.changes || [] };
    }
  });
  // ↓ 既存の返却オブジェクトに contactStatus を1キー追加（既存フィールドは不変＝後方互換）
```

返却 JSON（例 `{ times, overrides }`）に `contactStatus: contactStatus` を足す。**既存フィールドは変更しない**（sched-grid 旧版が壊れないため）。

- [ ] **Step 2: GAS 手動確認**

GAS エディタで getSchedTimesResponse をログ出力し、`contactStatus` に未来日の要連絡/連絡済みキーが載ること、過去日が載らないことを確認。

- [ ] **Step 3: コミット**

```bash
git add "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): getSchedTimesResponse に未来日の連絡現在状態 contactStatus を合成（D1・後方互換）"
```

---

## Task 9-A: sched-grid 色A/B表示（読み取り側・名簿非依存）

**Files:**
- Modify: `sched-grid.html`

*注: sched-grid の既存レンダリング構造・受信部を Step1 で確認してから差し込む。**通信は素の `fetch`（CORS）で JSONP ではない**（Task 0 で確認済・`sched-grid.html:546` が `fetch(GAS_URL+'?action=getSchedTimes...').then(r=>r.json())`）。*

- [ ] **Step 1: 受信部と stop 描画箇所を確認**

Run: `grep -nE "getSchedTimes|overrides|timeChanged|render|stop|fetch" sched-grid.html | head -40`
確認: `fetch(...).then(r=>r.json())` で受けたデータのどこで stop を描画するか、override の timeChanged をどう見るか。**JSONP コールバックではない**点に注意（`data = await res.json()` 系）。

- [ ] **Step 2: 色クラスと判定を実装**

受信データ `data.contactStatus`（Task 8）と、その stop の `timeChanged` から色を決める。GAS 純関数と同じロジックを HTML 側にも小さく持つ（1関数）:

```js
// 送迎連絡 色判定（GAS schedContactColor と同ロジック）
function sgContactColor(timeChanged, latestStatus) {
  if (!timeChanged) return 'normal';
  if (latestStatus === '連絡済み') return 'done';
  return 'need';
}
```

stop 描画時（適用日 date・利用者 user が分かる箇所）:

```js
var _cs = (data.contactStatus || {})[date + '|' + user];
var _col = sgContactColor(!!stop.timeChanged, _cs ? _cs.status : null);
// _col: 'normal' | 'need'（色A） | 'done'（色B）
// need → クラス sg-need ＋「☎ 要連絡」バッジ / done → クラス sg-done ＋「連絡済み」表示
```

CSS を `<style>` に追加:

```css
.sg-need { background:#fff3cd; border-left:4px solid #e6a700; }   /* 色A=要連絡 */
.sg-done { background:#e6f4ea; border-left:4px solid #1e8e3e; }   /* 色B=連絡済み */
.sg-badge-need { color:#a05a00; font-weight:bold; }
```

- [ ] **Step 3: file:// ではなく no-store プレビューで目視**

Run: `node scripts/preview-server.js`（memory `genba-欠席カレンダーピッカー`）で sched-grid を開き、要連絡/連絡済みの色が出ることを確認（キャッシュ罠回避）。ただし書込経路はオリジンガードで localhost 不可（実機は github.io）。

- [ ] **Step 4: コミット**

```bash
git add sched-grid.html
git commit -m "feat(sched-grid): 未来日の要連絡(色A)/連絡済み(色B)表示（読み取り・名簿非依存）"
```

---

## Task 9-B: sched-grid 「連絡済み」ボタン＋連絡者モーダル＋ライトバック検証＋オリジンガード

**⚠️ 前提: Task 0（名簿ソース調査）完了必須。未確定なら着手しない。**

**Files:**
- Modify: `sched-grid.html`

- [ ] **Step 1: オリジンガードを移植**

genba の `gnbGuardProdWrite` 同型（memory `genba-betsu-origin-touroku-jiko`）:

```js
// 本番オリジン以外からの送迎連絡 書込を遮断
var SG_PROD_ORIGIN = 'https://<本番github.ioホスト>';   // sched-grid の本番URLに合わせる
function sgGuardProdWrite() {
  if (location.origin !== SG_PROD_ORIGIN) {
    alert('このプレビューでは連絡済みを記録できません（本番URLで操作してください）');
    return false;
  }
  return true;
}
```
非本番では「連絡済み」ボタンを `disabled` にする（描画時に `location.origin !== SG_PROD_ORIGIN` で判定）。

- [ ] **Step 2: 連絡者セレクタ（Task 0 確定＝ボードGAS `staff_list`）**

**確定ソース**: ボードGAS `action=staff_list`（`getStaffListFromShiftSheet`／シフト希望SS「スタッフ」シートA列／`{staff:[...]}`）。sched-grid は素の fetch（CORS）なので JSONP は使わない。**ボードGAS URL を別途定数追加**する（既存 `GAS_URL`=V66Udd… は出勤送迎表GASでボードGASではない）:

```js
// 連絡者名簿の正本＝ボードGAS staff_list（sched-grid の既存 GAS_URL とは別のGAS）
var SG_BOARD_URL = 'https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec';

function sgLoadOperators() {
  return fetch(SG_BOARD_URL + '?action=staff_list&t=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var list = (data && data.staff) ? data.staff.slice() : [];
      // 比嘉（社長）は staff_list に含まれない前例（yawaragi-board.html:5311）。送迎連絡者に社長を含めるならここで先頭固定で足す。
      // → 送迎連絡者に社長を含めるか否かは実装時に社長へ一言確認（既定: staff_list のまま・社長は足さない）。
      return list;
    })
    .catch(function() { return []; });   // 取得失敗時は空（モーダルで「名簿を取得できません」表示）
}
```

取得した配列をモーダル内 `<select id="sg-operator-select">` に `<option>` で流す（受付者バー直読はしない・欠席box/kbox の「モーダル内選択」パターン）。名簿が空なら連絡済みボタンを押させず「名簿を取得できません」を表示。

*⚠️ 社長への一言確認事項（実装時）: 送迎の連絡者に**比嘉（社長）を含めるか**。既定は staff_list のまま（含めない）。含めるなら上記コメント位置で先頭固定。*

- [ ] **Step 3: 連絡済みボタン → モーダル → POST（no-cors）→ ライトバック検証**

設計 §3-2 の手順を実装:

```js
function sgMarkContacted(date, user, unit) {
  if (!sgGuardProdWrite()) return;
  var operator = document.getElementById('sg-operator-select').value;
  if (!operator) { alert('連絡者を選んでください'); return; }
  sgSetPending(date, user);                 // 楽観的に「連絡済み(保留中)」＝色Bはまだ確定させない
  fetch(GAS_ENDPOINT, {                      // sched-grid が使う RELAY GAS URL
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'markSchedContacted', date: date, user: user, unit: unit, operator: operator })
  }).finally(function() {
    // no-cors はレスポンスを読めない → 一定待ちで読み直して突合（唯一の裁定者）
    setTimeout(function() { sgVerifyContacted(date, user); }, 5000);  // 4〜6秒（HAICHI_VERIFY_DELAY_MS相当）
  });
}

function sgVerifyContacted(date, user) {
  // getSchedTimes を素の fetch で再取得（JSONPではない）。キャッシュ回避に t= を付ける。
  fetch(GAS_URL + '?action=getSchedTimes&t=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var cs = (data.contactStatus || {})[date + '|' + user];
      if (cs && cs.status === '連絡済み') { sgResolvePending(date, user, true); }   // 色B確定・保留解除
      else { sgResolvePending(date, user, false); alert('記録できませんでした。もう一度お試しください'); } // 色Aへ戻す
    })
    .catch(function() { sgResolvePending(date, user, false); alert('確認できませんでした。もう一度お試しください'); });
}
```

*注: `GAS_URL` は sched-grid 既存の出勤送迎表GAS（V66Udd…・getSchedTimes を返す）。連絡者名簿の `SG_BOARD_URL`（Step 2）とは別URL。*

`sgSetPending`/`sgResolvePending` は保留スピナー表示と解決（成否どちらでも必ず保留を解く＝放置しない）。

- [ ] **Step 4: 実機（github.io）で検証**

本番 sched-grid で連絡済みを押し、5秒後に色Bへ確定→再読込しても連絡済みが残ることを確認（memory `exit0-nonhang-not-functional-proof`＝固まらず返った≠成功。台帳の実値で裁定）。

- [ ] **Step 5: コミット**

```bash
git add sched-grid.html
git commit -m "feat(sched-grid): 連絡済みボタン＋連絡者モーダル＋ライトバック検証＋オリジンガード"
```

---

## Task 10: E1（連絡前に変更色OFF → 台帳に「通常化」行で自動解除）

**Files:**
- Modify: `gas/gas_出勤送迎表.gs`（Task 6 の saveSchedTimes 追記ロジック内）

- [ ] **Step 1: 色OFF検出→通常化行を追記**

Task 6 の stops ループに、timeChanged が false になった（＝色OFF）が台帳最新が「要連絡」のキーを検出して `通常化` を追記する分岐を足す:

```js
// E1: 変更色OFF（timeChanged=false）だが台帳最新が要連絡 → 通常化を追記して色A解除。
(stops || []).forEach(function(st) {
  if (!st || st.timeChanged) return;                 // 色ONは Task6 で処理済
  var key = overrideDate + '|' + st.user;
  var cur = _latest[key];
  if (cur && cur.status === '要連絡') {
    _appendSchedContactRow({
      date: overrideDate, user: st.user, unit: st.unit || '',
      oldTime: cur.oldTime, newTime: cur.newTime, status: '通常化', source: '出勤送迎表'
    });
  }
});
```

*注: 連絡済み後の色OFFは通常化しない（cur.status==='要連絡' のみ対象）＝連絡済み履歴を消さない。*

- [ ] **Step 2: GAS 手動確認**

要連絡を作る→同 stop を色OFFで saveSchedTimes→台帳最新が「通常化」になり、getSchedTimesResponse の contactStatus で色が消える（timeChanged=false なので sgContactColor→normal）ことを確認。

- [ ] **Step 3: 純関数テストで通常化の色を固定（回帰防止）**

`test-sched-renrakuzumi.js` に既にある `schedContactColor(false,'通常化')→'normal'` / `schedContactColor(true,'通常化')→'need'` が E1 を担保していることを確認（Task 2 で追加済み）。追加不要ならスキップ。

- [ ] **Step 4: コミット**

```bash
git add "gas/gas_出勤送迎表.gs"
git commit -m "feat(sched): E1 変更色OFFで要連絡を通常化（連絡済み履歴は保全）"
```

---

## Task 11: 本番反映（GAS デプロイ＋版ゲート bump・社長承認後）

**Files:**
- Modify: `version.txt`＋`sched-grid.html` の `shared.js?v=`（bump スクリプト経由）

*⚠️ このタスクは社長承認後にのみ実行。実 push は手動（CLAUDE.md 案A）。*

- [ ] **Step 1: 全 Node テスト緑を確認**

Run: `node scripts/test-sched-renrakuzumi.js`
Expected: 全 PASS（18件）
Run: `node scripts/test-schedgrid-version-gate.js`
Expected: PASS（版ゲート不変条件）

- [ ] **Step 2: GAS を clasp デプロイ（同一URL維持）**

memory `clasp-gas-deploy-url-iji`：`clasp push -f` → `clasp deploy -i "<既存デプロイID>" -d "送迎連絡台帳 追加"`。URL を変えない（変えると全壊）。GAS の `_test_*` 手動実行で疎通確認。

- [ ] **Step 3: 版ゲート bump（sched-grid）**

Run: `node scripts/bump-app-version.js <新版>`（version.txt と sched-grid の `?v=` を同一コミット・commit まで自動）。**手編集・手 add はしない。**

- [ ] **Step 4: 社長承認 → 手 push → verify**

`git push origin master`（承認後）→ `node scripts/bump-app-version.js --verify <新版>`（時間切れは成功扱いにしない）。`git rev-parse HEAD` = `origin/master` 一致を確認。

- [ ] **Step 5: 完了証跡（CLAUDE.md 完了定義）**

**配信到達の確認（これだけでは Task 11 をクローズできない）**: 本番 github.io の sched-grid 実コードに `markSchedContacted` / `sgContactColor` が含まれること（`grep -c`）＋本番 version.txt = 新版＋SHA一致の3点セット。これらは「配信が届いたか」の確認であって、台帳に行が入ったかの確認ではない。

**サーバー再読による機能検証（クローズの必須ゲート）**: 実機で 要連絡→連絡済み を1サイクル実行し、getSchedTimes を再取得して台帳の contactStatus[date|user] が 要連絡→連絡済み へ実際に遷移したことを読んで確認する。no-cors の成功レスでは判定しない（レスポンスは読めない前提）。遷移が読めない場合は本番反映を未完了として扱い、原因を切り分けるまでクローズしない。

**関係**: 版ゲート／grep／SHA は「配信が届いたか」の確認として残すが、それだけでは Task 11 をクローズできない。上の「サーバー再読で遷移を読めた」ことが揃って初めてクローズ。

---

## Self-Review（spec 突合）

- **設計§1 台帳10列・キー(適用日,利用者)** → Task 5（ensure/列定義）＋Task 1（最新勝ち）。✅
- **§2 ①〜⑥フロー** → ②=Task6、③=Task8+9A、④⑤=Task9B、⑥=Task8（未来日のみ合成＝過去は色なし）、E1=Task10。✅
- **§3-1 markSchedContacted** → Task7。**§3-2 ライトバック検証** → Task9B Step3。**§3-3 オリジンガード** → Task9B Step1。**§3-4 連絡者(C1)** → Task0＋Task9B Step2。✅
- **§4 エラー対応**: 保存失敗→Task9B（不一致で色A戻し）、二重押し→Task7 idempotency、旧時間取得不可→Task4 resolveOldTime 空欄、台帳無し→Task5 ensure。✅
- **§5 テスト項目**: 純関数分（最新勝ち/色/idempotency）=Task1-3、GAS/UI 正常異常系=各 Task の手動確認＋Task11 実機。✅
- **§7 A1/B1/C1/D1/E1/迎えのみ**: A1=Task4+Task6、B1=追記型(全Task)、C1=Task0+9B、D1=Task8、E1=Task10、迎えのみ=キー(date,user)全体。✅
- **Q1 ゲート**: Task0 未完なら Task9B 保留を明記。✅
- **Q2**: sougei 未変更（File Structure・前提に明記）。✅

型整合: `schedContactLatest`/`schedContactColor`/`schedContactShouldSkip`/`resolveOldTime`/`_ensureSchedContactSheet`/`_readSchedContactLatest`/`_appendSchedContactRow`/`markSchedContacted`/`sgContactColor` — 全 Task で同名参照。キー表記は一貫して `date + '|' + user`。
