# 電算 結果Excel取込リマインド 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 電算の結果Excel（kekka.xls）の取込忘れを morningDigest で毎朝催促し、取り込んだら自動で消す（終わるまで方式・手動完了不要）。

**Architecture:** 案B（records内センチネル）。不能0件の月にも「取込済マーカー行」（`isImportMarker:true`・`status:'回収済'`）を records に1件だけ残し、既存 cloudSync（無改修）で同期。板GAS morningDigest が前月M-1分の取込痕跡（`records.some(r=>r.month===M-1)`）を見て未取込なら催促、取込済なら消滅。マーカーは内部フラグで表示・件数・fold・伝達ボード件数・actionable の5経路すべてから除外する隠しデータ。

**Tech Stack:** furikae.html（バニラJS・実コード抽出テスト方式）／板GAS `my-project/gas/yawaragi-board/コード.js`（Apps Script・純関数を `test-morning-digest.js` に二重持ち）／`morning-digest.ps1`（PowerShell表示）。

**設計書:** `docs/superpowers/specs/2026-07-06-furikae-kekka-import-remind-design.md`

---

## リポジトリと作業場

- **Phase A（トラッカー）** = このworktree `C:\tmp\wt-furikae-tracker`（`yawaragi-apps` / feat/furikae-funou-tracker）。furikae.html＋scripts/test-furikae-tracker.js。
- **Phase B（板GAS＋表示）** = `C:\Users\mh\OneDrive\デスクトップ\my-project`。gas/yawaragi-board/コード.js＋scripts/test-morning-digest.js＋scripts/morning-digest.ps1。
- push/deploy はしない（go-live順序＝トラッカー本番化と同じ承認フロー）。各Task末尾の commit はローカルのみ。

## File Structure

| ファイル | 責務 | 変更 |
|---|---|---|
| `furikae.html`（worktree） | マーカー純関数群＋5経路のうちトラッカー側4経路の除外＋processExcelFile 改修 | Modify |
| `scripts/test-furikae-tracker.js`（worktree） | マーカー純関数・除外4経路・冪等のテスト | Modify |
| `my-project/gas/yawaragi-board/コード.js` | `_digestPrevYm_`＋`furikaeImportReminder_`＋`safe('furikaeImport')`＋fold除外 | Modify |
| `my-project/scripts/test-morning-digest.js` | 判定純関数・年またぎ・fold除外（5経路の5つ目）のテスト | Modify |
| `my-project/scripts/morning-digest.ps1` | furikaeImport セクション表示＋表面化閾値加算 | Modify |

## マーカー隠蔽 5経路 ⇔ テスト 1:1 対応（社長指示・番人）

| # | 経路 | 除外を入れる関数 | テスト（アサーション） | 場所 |
|---|---|---|---|---|
| 1 | 表示 | `getMonths` / `renderMonth` の monthRecords | マーカーのみの月はタブに出ない・"全て回収済"誤表示が出ない | Phase A / Task 3 |
| 2 | 件数集計 | `fnkMonthSummary` | マーカーのみの月 → `{count:0,total:0}` | Phase A / Task 3 |
| 3 | fold | `foldFurikaeByMonth_`（板GAS） | マーカーは `unresolvedTotal` に入らない・`byMonth` に幽霊キー無し | Phase B / Task 6 |
| 4 | 伝達ボード件数 | `fnkNoticeBody(fnkActionableCount(...))` | マーカーのみの月 → 本文空（締め＝通知しない） | Phase A / Task 3 |
| 5 | actionable判定 | `fnkActionableCount` | マーカーのみの月 → `0` | Phase A / Task 3 |

> 1経路でもテスト漏れがあると幽霊行の穴になるため、上表の5つを明示的に別々のテストとして書く。

---

# Phase A — トラッカー側マーカー（worktree / feat branch）

## Task 1: マーカー純関数（判定・生成・冪等）

**Files:**
- Modify: `furikae.html`（純関数ブロック `===== 振替不能トラッカー 純関数 =====`（842行付近）の末尾、`fnkActionableCount` の直後に追加）
- Test: `scripts/test-furikae-tracker.js`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-furikae-tracker.js` の関数抽出ブロック（`new Function('sb', ... )` 内）に3関数を追加抽出する。既存の抽出行群の末尾（`extractFn('fnkActionableCount') + '\n' +` の後）へ挿入:

```js
    extractFn('fnkIsImportMarker') + '\n' +
    extractFn('fnkNeedsImportMarker') + '\n' +
    extractFn('fnkMarkerRecord') + '\n' +
```

同ブロックの `sb.xxx = ...` 割り当て行群の末尾に追加:

```js
    'sb.isMarker = fnkIsImportMarker; sb.needsMarker = fnkNeedsImportMarker; sb.markerRec = fnkMarkerRecord;' +
```

ファイル末尾（`if (fail)` 集計の直前）へテストを追加:

```js
// ===== M. 取込済マーカー 純関数（案B・センチネル）=====
ok(sb.isMarker({ isImportMarker: true }) === true, 'M1: isImportMarker:true → マーカー');
ok(sb.isMarker({ status: '回収済' }) === false, 'M2: フラグ無し → 非マーカー（status依存にしない）');
ok(sb.isMarker(null) === false, 'M3: null → 非マーカー（fail-safe）');

ok(sb.needsMarker([], '2026-06') === true, 'M4: 該当月レコード皆無 → マーカー要');
ok(sb.needsMarker([{ month: '2026-06', status: '未対応' }], '2026-06') === false, 'M5: 該当月に実レコード有 → マーカー不要');
ok(sb.needsMarker([{ month: '2026-05' }], '2026-06') === true, 'M6: 別月レコードのみ → 対象月2026-06はマーカー要');
ok(sb.needsMarker([{ month: '2026-06', isImportMarker: true }], '2026-06') === false, 'M7: 既にマーカー有 → 二重に作らない（冪等）');

const mk = sb.markerRec('2026-06', 42, '2026-07-06');
ok(mk.isImportMarker === true, 'M8: 生成物は isImportMarker:true');
ok(mk.status === '回収済', 'M9: status=回収済（fold/unpaid が既存ロジックで落とす二重安全）');
ok(mk.month === '2026-06' && mk.id === 42 && mk.createdAt === '2026-07-06', 'M10: month/id/createdAt が引数どおり');
ok(mk.amount === 0 && mk.customerId === '' && !mk.resolvedMonth, 'M11: 金額0・顧客番号空・resolvedMonth無し（回収済フッタにも出ない）');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-furikae-tracker.js`
Expected: `extractFn('fnkIsImportMarker')` が throw（`furikae.html に function fnkIsImportMarker が無い（未実装＝RED）`）

- [ ] **Step 3: 最小実装を書く**

`furikae.html` の `fnkActionableCount`（892-896行）の直後に追加:

```js
// ===== 取込済マーカー（案B・センチネル）2026-07-06 =====
// 不能0件の月にも「取り込んだ痕跡」を1件だけ records に残す隠しデータ。
// morningDigest の未取込リマインド判定のためだけに読む。表示/件数/fold/伝達ボード件数/actionable の
// 全経路から除外する（fnkIsImportMarker が唯一の正体判定・status依存にしない）。
function fnkIsImportMarker(rec) {
  return !!(rec && rec.isImportMarker === true);
}

// 対象月にマーカーを追加すべきか。該当月のレコード（実/マーカー問わず）が1件でもあれば不要（冪等）。
function fnkNeedsImportMarker(records, month) {
  if (!month) return false;
  return !(records || []).some(function (r) { return r.month === month; });
}

// マーカー行を生成（純関数）。status:'回収済'＋resolvedMonth無し＝既存の未回収/回収済フッタ双方に出ない。
function fnkMarkerRecord(month, id, today) {
  return {
    id: id, month: month, isImportMarker: true, status: '回収済',
    name: '(取込済マーカー)', reason: '取込済み・不能0件', amount: 0,
    customerId: '', hikiotoshiDate: '', createdAt: today
  };
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-furikae-tracker.js`
Expected: `[OK] 45 passed, 0 failed`（既存34 + M1-M11 の11件。M6は常真のプレースを含むため実質カウントは環境準拠。既存34＋新11で増加していること）

- [ ] **Step 5: コミット**

```bash
git add furikae.html scripts/test-furikae-tracker.js
git commit -m "feat(furikae): 取込済マーカー純関数(isImportMarker/needsImportMarker/markerRecord)+テスト"
```

---

## Task 2: 5経路のうちトラッカー側4経路にマーカー除外ガードを入れる

**Files:**
- Modify: `furikae.html`（`getMonths` 825-830 / `fnkMonthSummary` 878-881 / `fnkActionableCount` 892-896 / `renderMonth` 899-931）
- Modify: `scripts/test-furikae-tracker.js`（抽出に `getMonths` 追加）
- Test: `scripts/test-furikae-tracker.js`

> 経路4「伝達ボード件数」は `fnkNoticeBody(fnkActionableCount(...))` の合成。fnkActionableCount にガードを入れれば連動する。テストは経路5と別に書く（Step 1 参照）。

- [ ] **Step 1: 失敗するテストを書く**

Step 3 で `getMonths` を records引数の純関数 `fnkMonthsOf` に分離する。その `fnkMonthsOf` と、経路4で使う `fnkNoticeBody`（クラウド同期ブロックの純関数・672行）を抽出ブロックに追加（`extractFn('fnkMarkerRecord') + '\n' +` の後）:

```js
    extractFn('fnkMonthsOf') + '\n' +
    extractFn('fnkNoticeBody') + '\n' +
```

割り当て行群に追加:

```js
    'sb.monthsOf = fnkMonthsOf; sb.noticeBody = fnkNoticeBody;' +
```

テストを追加（マーカーのみの月 `2026-06` を仕込み、4経路それぞれで不可視を検証）:

```js
// ===== N. マーカー隠蔽 5経路（トラッカー側4経路・社長指示の番人）=====
const MK = sb.markerRec('2026-06', 99, '2026-07-06'); // 2026-06はマーカーだけの月
const REC_WITH_MARKER = [
  { id: 1, month: '2026-05', status: '未対応', resultCode: '2', amount: 1000, customerId: '10' }, // 別月の実不能
  MK
];

// 経路1 表示: getMonths相当(fnkMonthsOf)にマーカー月が出ない（幽霊タブ防止）
ok(sb.monthsOf(REC_WITH_MARKER).indexOf('2026-06') === -1, 'N1(表示): マーカーのみの月2026-06はタブに出ない');
ok(sb.monthsOf(REC_WITH_MARKER).indexOf('2026-05') >= 0, 'N1b(表示): 実レコードの月2026-05は出る');

// 経路2 件数集計: fnkMonthSummary がマーカーを数えない
ok(sb.summary(REC_WITH_MARKER, '2026-06').count === 0 && sb.summary(REC_WITH_MARKER, '2026-06').total === 0,
  'N2(件数集計): マーカーのみの月 → count0/total0');

// 経路4 伝達ボード件数: actionable→noticeBody が締め（空文字）
ok(sb.noticeBody(sb.act(REC_WITH_MARKER, '2026-06')) === '', 'N4(伝達ボード件数): マーカーのみの月 → 通知本文は空（締め）');

// 経路5 actionable判定: fnkActionableCount がマーカーを数えない
ok(sb.act(REC_WITH_MARKER, '2026-06') === 0, 'N5(actionable): マーカーのみの月 → 0件');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-furikae-tracker.js`
Expected: `extractFn('fnkMonthsOf')` が throw（未実装＝RED）

- [ ] **Step 3: 最小実装（4経路にガード）**

**(a) `getMonths` を records引数の純関数 `fnkMonthsOf` に分離**（825-830行を置換）:

```js
// 月一覧（新しい順）。マーカーのみの月はタブに出さない（幽霊タブ防止・経路1）。
function fnkMonthsOf(records) {
  const months = [...new Set((records || []).filter(r => !fnkIsImportMarker(r)).map(r => r.month))];
  months.sort().reverse();
  if (months.length === 0) months.push('2026-02');
  return months;
}
function getMonths() { return fnkMonthsOf(data.records); }
```

**(b) `fnkMonthSummary`**（878-881行）にガード追加:

```js
function fnkMonthSummary(records, month) {
  const list = (records || []).filter(function (r) { return r.month === month && !fnkIsImportMarker(r) && fnkIsUnpaid(r); });
  return { count: list.length, total: list.reduce(function (s, r) { return s + (r.amount || 0); }, 0) };
}
```

**(c) `fnkActionableCount`**（892-896行）にガード追加:

```js
function fnkActionableCount(records, month) {
  return (records || []).filter(function (r) {
    return r.month === month && !fnkIsImportMarker(r) && fnkIsUnpaid(r) && fnkBadgeFor(r).key !== 'white';
  }).length;
}
```

**(d) `renderMonth`**（901行）の monthRecords にガード追加:

```js
  const monthRecords = data.records.filter(r => r.month === month && !fnkIsImportMarker(r));
```

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-furikae-tracker.js`
Expected: `[OK]` 全PASS（既存＋M＋N1,N1b,N2,N4,N5）

- [ ] **Step 5: コミット**

```bash
git add furikae.html scripts/test-furikae-tracker.js
git commit -m "feat(furikae): マーカー隠蔽4経路(表示/件数集計/伝達ボード件数/actionable)ガード+テスト"
```

---

## Task 3: processExcelFile 改修（不能0件でもマーカー付与・冪等）

**Files:**
- Modify: `furikae.html`（`processExcelFile` 494-504行）
- Test: `scripts/test-furikae-tracker.js`（マーカー付与の統合純関数を追加）

> processExcelFile 本体は XLSX/DOM 依存で単体不可。マーカー付与ロジックを純関数 `fnkApplyImportMarker(data, month, today)` に切り出してテストし、processExcelFile はそれを呼ぶだけにする（DRY・テスト可能）。

- [ ] **Step 1: 失敗するテストを書く**

抽出ブロックに追加:

```js
    extractFn('fnkApplyImportMarker') + '\n' +
```
```js
    'sb.applyMarker = fnkApplyImportMarker;' +
```

テスト追加:

```js
// ===== O. マーカー付与（不能0件パス・冪等）=====
const d1 = { records: [], nextId: 5 };
ok(sb.applyMarker(d1, '2026-06', '2026-07-06') === true, 'O1: 空→付与true');
ok(d1.records.length === 1 && d1.records[0].isImportMarker === true && d1.records[0].month === '2026-06', 'O2: マーカー1件追加(2026-06)');
ok(d1.records[0].id === 5 && d1.nextId === 6, 'O3: idにnextId消費・nextId進む');

ok(sb.applyMarker(d1, '2026-06', '2026-07-06') === false, 'O4: 同月再実行→付与false（冪等）');
ok(d1.records.length === 1, 'O5: 二重追加されない');

const d2 = { records: [{ id: 1, month: '2026-06', status: '未対応' }], nextId: 2 };
ok(sb.applyMarker(d2, '2026-06', '2026-07-06') === false, 'O6: 実レコード有の月→付与false');
ok(d2.records.length === 1, 'O7: 実レコードの月にマーカー足さない');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-furikae-tracker.js`
Expected: `extractFn('fnkApplyImportMarker')` が throw（未実装＝RED）

- [ ] **Step 3: 最小実装＋processExcelFile 差し替え**

`fnkMarkerRecord` の直後に純関数を追加:

```js
// 対象月が未取込ならマーカーを1件追加して data を変更（副作用は data のみ）。追加したら true。
function fnkApplyImportMarker(data, month, today) {
  if (!fnkNeedsImportMarker(data.records, month)) return false;
  data.records.push(fnkMarkerRecord(month, data.nextId++, today));
  return true;
}
```

`processExcelFile` の 494-504行（不能0件の早期return〜月決定）を次に置換:

```js
      // 月を決定（ファイル名優先・不能0件でも先に確定してマーカーへ使う）
      let month = hikiotoshiMonth;
      if (!month) {
        month = prompt('引落月を入力してください（例: 2026-03）');
        if (!month) return;
      }

      if (funou.length === 0) {
        // 成功のみの月も「取込済み」痕跡を残す（morningDigest の未取込リマインドを消すため・案B）
        if (fnkApplyImportMarker(data, month, new Date().toISOString().slice(0, 10))) {
          saveData(data);
        }
        initMonthSelect();
        showImportResult(`✅ 振替不能は0件でした！（全${dataRows.length}件が正常振替）`, false);
        return;
      }
```

（元の 506行以降「重複チェック」からは `let month = ...` の再宣言が消えた状態で続く。既存の `const existingIds = data.records...` はそのまま。）

- [ ] **Step 4: テスト成功を確認 & 二重宣言が無いこと**

Run: `node scripts/test-furikae-tracker.js`
Expected: 全PASS（O1-O7 追加）

Run: `node -e "require('fs').readFileSync('furikae.html','utf8').match(/let month = hikiotoshiMonth/g).length===1 || (()=>{throw new Error('month二重宣言')})()" && echo OK`
Expected: `OK`（`let month = hikiotoshiMonth` が1箇所のみ＝再宣言エラー回避）

- [ ] **Step 5: コミット**

```bash
git add furikae.html scripts/test-furikae-tracker.js
git commit -m "feat(furikae): 不能0件パスで取込済マーカー付与(冪等)・processExcelFile改修"
```

---

# Phase B — 板GAS＋表示（my-project）

> 作業ディレクトリを `C:\Users\mh\OneDrive\デスクトップ\my-project` に移す。以降の相対パスはそこ基準。

## Task 4: 前月ヘルパ＋取込リマインド判定 純関数（板GAS＋二重持ちテスト）

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（`_digestNextYm_` 6500-6504行の直後に追加）
- Modify: `scripts/test-morning-digest.js`（純関数を二重持ち・末尾にテスト）
- Test: `scripts/test-morning-digest.js`

> このリポジトリは純関数を「テストファイル内に二重持ち」する方式。RED を本物にするため、Step 1 ではテスト本文だけを書き（関数はまだどこにも定義しない）→ Step 2 で未定義 RED を確認 → Step 3 で**テストファイルと板GAS本体の両方に同一実装**を追加、の順で進める。

- [ ] **Step 1: 失敗するテストを書く（関数定義はまだ書かない）**

`scripts/test-morning-digest.js` のファイル末尾（集計 `if (fail)` の直前）にテストだけ追加。既存スタイル（`console.log('OK ...')`・throw方式）に合わせる:

```js
// ---- _digestPrevYm_: 前月（年またぎ）----
console.log('--- _digestPrevYm_ ---');
if (_digestPrevYm_('2026-06-15') !== '2026-05') throw new Error('prevYm 通常月');
if (_digestPrevYm_('2026-01-05') !== '2025-12') throw new Error('prevYm 1月→前年12月（年またぎ）');
if (_digestPrevYm_('2026-03-01') !== '2026-02') throw new Error('prevYm 3月→2月');
console.log('OK _digestPrevYm_');

// ---- furikaeImportReminder_: 前月M-1固定・終わるまで方式 ----
console.log('--- furikaeImportReminder_ ---');
// day < startDay → 静観（null）
if (furikaeImportReminder_([], '2026-07-02', 3) !== null) throw new Error('startDay前は静観');
// 対象月(前月)の実レコード有 → 取込済 → null
if (furikaeImportReminder_([{ month: '2026-06', status: '未対応' }], '2026-07-06', 3) !== null) throw new Error('前月実レコード→消滅');
// 対象月のマーカー(回収済)有 → 取込済 → null（経路3 foldとは別に判定側でも消える）
if (furikaeImportReminder_([{ month: '2026-06', isImportMarker: true, status: '回収済' }], '2026-07-06', 3) !== null) throw new Error('前月マーカー→消滅');
// 対象月レコード皆無 → 催促
var rem = furikaeImportReminder_([{ month: '2026-05', status: '未対応' }], '2026-07-06', 3);
if (!rem || rem.month !== '2026-06') throw new Error('前月未取込→催促(2026-06)');
if (rem.message.indexOf('2026-06') < 0) throw new Error('メッセージに対象月を含む');
// 年またぎ: 2026-01-05 → 対象2025-12 の未取込を催促
var remY = furikaeImportReminder_([], '2026-01-05', 3);
if (!remY || remY.month !== '2025-12') throw new Error('年またぎ 1月→2025-12催促');
console.log('OK furikaeImportReminder_');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-morning-digest.js`
Expected: FAIL（`ReferenceError: _digestPrevYm_ is not defined`）

- [ ] **Step 3: テストファイルと板GAS本体の両方へ同一実装を追加**

**(a) `scripts/test-morning-digest.js`** の純関数二重持ち部（`foldFurikaeByMonth_` 定義の近く・22行付近のブロック内）へ追加:

```js
function _digestPrevYm_(dateStr) {
  var y = parseInt(dateStr.slice(0, 4), 10), m = parseInt(dateStr.slice(5, 7), 10);
  var py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return py + '-' + ('0' + pm).slice(-2);
}
function furikaeImportReminder_(records, dateStr, startDay) {
  var day = parseInt(dateStr.slice(8, 10), 10);
  if (day < startDay) return null;
  var target = _digestPrevYm_(dateStr);
  var imported = (records || []).some(function (r) { return r.month === target; });
  if (imported) return null;
  return { month: target, message: '電算から結果Excel(kekka.xls)をDL → 振替不能トラッカーに取込（' + target + '分・未取込）' };
}
```

**(b) `gas/yawaragi-board/コード.js`** の `_digestNextYm_`（6500-6504行）の直後に、(a) と**文字通り同一**の2関数を追加。加えて判定に使う定数を morningDigest 近傍（`DIGEST_FURIKAE_URL` 定義 5864行の直後）に追加:

```js
var FURIKAE_IMPORT_START_DAY = 3; // 翌月この日から結果Excel未取込を催促（振替日27+6〜8日≒翌月上旬・実測・運用調整可）
```

- [ ] **Step 4: テスト成功＋本体二重持ち一致を確認**

Run: `node scripts/test-morning-digest.js`
Expected: `OK _digestPrevYm_` / `OK furikaeImportReminder_` を含み全体が緑

本体一致の目視:
Run: `grep -c "function furikaeImportReminder_" gas/yawaragi-board/コード.js scripts/test-morning-digest.js`
Expected: 両ファイル各 `1`

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/コード.js scripts/test-morning-digest.js
git commit -m "feat(digest): 取込リマインド判定 furikaeImportReminder_+_digestPrevYm_(前月M-1固定・年またぎ)+二重持ちテスト"
```

---

## Task 5: fold のマーカー除外（5経路の5つ目・板GAS）

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（`foldFurikaeByMonth_` 6570-6584行）
- Modify: `scripts/test-morning-digest.js`（二重持ちの `foldFurikaeByMonth_` を同期更新＋テスト）
- Test: `scripts/test-morning-digest.js`

> マーカーは `status:'回収済'` なので現行 fold でも未解決には入らない。ただし社長指示の「5経路1:1」を満たすため、明示ガード＋専用テストを置く（status依存でなく isImportMarker で確実に落とす）。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-morning-digest.js` 末尾（fold既存テスト `console.log('OK foldFurikaeByMonth_')` の直前）に追加:

```js
// 経路3 fold: 取込済マーカーは未解決にもbyMonthにも出さない
const fkMk = foldFurikaeByMonth_([
  { month: '2026-05', status: '未対応' },
  { month: '2026-06', isImportMarker: true, status: '回収済' } // マーカーのみの月
]);
if (fkMk.unresolvedTotal !== 1) throw new Error('fold: マーカーは未解決に数えない（未対応1のみ）');
if (fkMk.byMonth['2026-06']) throw new Error('fold: マーカー月2026-06の幽霊キーを作らない');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-morning-digest.js`
Expected: FAIL（現行 fold は status:'回収済' で落とすので `unresolvedTotal` は通るが、`byMonth['2026-06']` は…現行は status 回収済で `return` するため既に作られない → このテストは現行でも通る可能性がある。RED を保証するため、テストのマーカーを `status:'未対応'` 相当の「フラグだけ」に一時変更して確認する）

RED保証の手順: 上記テストのマーカー行を一時的に `{ month: '2026-06', isImportMarker: true, status: '未対応' }` にして実行 → `unresolvedTotal !== 1`（2になる）で FAIL することを確認 → 確認後 `status:'回収済'` に戻す。これで「isImportMarker ガードが無いと落ちる」ことを担保。

- [ ] **Step 3: 最小実装（両ファイルの fold にガード）**

`gas/yawaragi-board/コード.js` と `scripts/test-morning-digest.js` の**両方**の `foldFurikaeByMonth_` 冒頭 forEach にガードを追加（1行）:

```js
function foldFurikaeByMonth_(records) {
  var byMonth = {};
  (records || []).forEach(function (r) {
    if (r && r.isImportMarker === true) return; // 取込済マーカーは集計に出さない（経路3・隠しデータ）
    var m = r.month; if (!m) return;
    var st = r.status; if (!st || st === '回収済') return;
    byMonth[m] = byMonth[m] || {};
    byMonth[m][st] = (byMonth[m][st] || 0) + 1;
  });
  var unresolvedTotal = 0;
  Object.keys(byMonth).forEach(function (m) {
    Object.keys(byMonth[m]).forEach(function (st) { unresolvedTotal += byMonth[m][st]; });
  });
  return { byMonth: byMonth, unresolvedTotal: unresolvedTotal };
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-morning-digest.js`
Expected: 全PASS（fold マーカー除外テスト含む）

本体一致の目視:
Run: `grep -c "取込済マーカーは集計に出さない" gas/yawaragi-board/コード.js scripts/test-morning-digest.js`
Expected: 両ファイル各 `1`

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/コード.js scripts/test-morning-digest.js
git commit -m "feat(digest): fold(foldFurikaeByMonth_)に取込済マーカー除外ガード+テスト(5経路の5つ目)"
```

---

## Task 6: morningDigest セクション追加 safe('furikaeImport')

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（`safe('furikae', ...)` 5889-5892行の直後）

> これは実 GAS 呼び出しを含む配線。純関数テストは Task 4/5 で完了済み。ここはセクション追加のみ（追記・既存に非破壊）。

- [ ] **Step 1: セクション追加**

`safe('furikae', function () { ... });`（5892行で閉じる）の直後に挿入:

```js
  // 外部アプリ: 結果Excel取込リマインド（前月M-1の取込痕跡が無ければ催促・終わるまで方式・2026-07-06）
  safe('furikaeImport', function () {
    var d = JSON.parse(UrlFetchApp.fetch(DIGEST_FURIKAE_URL, { muteHttpExceptions: true }).getContentText());
    return furikaeImportReminder_(d.records || [], dateStr, FURIKAE_IMPORT_START_DAY);
  });
```

- [ ] **Step 2: 構文チェック（Nodeでパースのみ・GAS実行はしない）**

Run: `node --check gas/yawaragi-board/コード.js`
Expected: エラー無し（終了コード0）

- [ ] **Step 3: セクションが sections に載ることを目視確認**

Run: `grep -n "safe('furikaeImport'" gas/yawaragi-board/コード.js`
Expected: 1件ヒット（`safe('furikae'` の直後の行番号）

- [ ] **Step 4: コミット**

```bash
git add gas/yawaragi-board/コード.js
git commit -m "feat(digest): morningDigestにsafe('furikaeImport')セクション追加(既存DIGEST_FURIKAE_URL再利用)"
```

---

## Task 7: morning-digest.ps1 表示＋表面化閾値加算

**Files:**
- Modify: `scripts/morning-digest.ps1`（表示: 186-200行「3. 口座振替」直後／閾値: 89-102行 `$sum` 計算）

- [ ] **Step 1: 表面化閾値に加算**

`$sum += [int]$s.furikae.unresolvedTotal`（93行）の直後に追加:

```powershell
  if ($s.furikaeImport -and $s.furikaeImport.PSObject.Properties.Match('month').Count -and $s.furikaeImport.month) { $sum += 1 }
```

- [ ] **Step 2: 表示ブロックを追加**

「3. 口座振替 未解決」ブロックの末尾（`WL "[OK] 口座振替: 未解決なし"` を含む if/else が閉じた直後・200行付近）に追加:

```powershell
# 3-b. 電算 結果Excel 取込リマインド（終わるまで方式・取込で自動消滅）
$fi = $s.furikaeImport
if ($fi -and $fi.PSObject.Properties.Match('month').Count -and $fi.month) {
  WL "[!!] 電算 結果Excel未取込: $($fi.message)" Red
}
```

- [ ] **Step 3: PowerShell 構文チェック**

Run（PowerShell）: `$null = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path scripts/morning-digest.ps1), [ref]$null, [ref]$null); if ($?) { 'OK' }`
Expected: `OK`（パースエラー無し）

- [ ] **Step 4: コミット**

```bash
git add scripts/morning-digest.ps1
git commit -m "feat(digest): morning-digest.ps1に結果Excel取込リマインド表示+表面化閾値加算"
```

---

## 完了時の状態（go-live前）

- Phase A（worktree・feat/furikae-funou-tracker）: Task 1-3 コミット済。furikae.html にマーカー実装＋5経路のうち4経路除外＋不能0件付与。テスト全緑。
- Phase B（my-project）: Task 4-7 コミット済。判定純関数＋fold除外（5経路の5つ目）＋セクション＋表示。テスト全緑。
- **push/deploy はしない。** go-live はトラッカー本番化と同じ承認フロー:
  1. トラッカー（furikae.html）本番化（版ゲート＋社長承認）。マーカーが本番稼働 → 以後の取込で痕跡が残る。
  2. その後（または同時）に板GAS を clasp deploy（同一URL維持・社長承認）＋ps1反映。板GASリマインドを先行させない（取込先が無い状態で催促しないため）。
- 各Phaseの全テストを最終再実行して緑を確認してから承認フローへ。

## 最終検証コマンド（全テスト）

```bash
# Phase A（worktree）
cd /c/tmp/wt-furikae-tracker && node scripts/test-furikae-tracker.js
# Phase B（my-project）
cd "/c/Users/mh/OneDrive/デスクトップ/my-project" && node scripts/test-morning-digest.js
node --check "gas/yawaragi-board/コード.js"
```
Expected: tracker `[OK] ... passed, 0 failed` / digest 全 `OK ...` 出力・throw無し / `--check` エラー無し。
