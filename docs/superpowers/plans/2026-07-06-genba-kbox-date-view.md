# 欠席連絡ボックス 過去+未来ビュー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** genba.html「本日の欠席連絡ボックス」(kbox) に表示対象日の概念を入れ、◀▶で±1日・未来チップでジャンプ・過去日も遡って閲覧できるようにする（送信/電話操作は当日限定・GAS非接触）。

**Architecture:** データは前進窓GET(today〜+30・自前JSONP＝当日カード＋ジャンプ一覧の源)と、既存の月キャッシュ `attMonthAbsCache`（2026-06-23基盤・過去/遠未来）を kbox 自身が `attEnsureMonthAbsences` で埋めてマージ・dedup（前進窓GET正本）。判定は純関数core（GAS/node両用）＋genbaインライン移植の既存二重パターン踏襲。安全は「UI無効化＋関数レベル当日ガード」の二重。

**Tech Stack:** Vanilla JS (genba.html)、GAS Apps Script core（node require可能な純関数）、node素朴テストランナー（scripts/test-genba-kesseki-box.js）。JSONP GET / no-cors POST（genba既存流儀）。

**Spec:** [docs/superpowers/specs/2026-07-06-genba-kesseki-box-kako-mirai-view-design.md](../specs/2026-07-06-genba-kesseki-box-kako-mirai-view-design.md)

---

## 前提・環境

- ⚠️ **現在の作業ツリーは stale ブランチ `fix/before-planstart-guard`（master比124遅れ）。実装は必ず fresh master 基点の新ブランチで行う。**
  - `git fetch origin master && git worktree add C:/tmp/wt-kbox-dateview -b feat/genba-kbox-date-view origin/master`
  - 以降の編集・テスト・コミットは全て `C:/tmp/wt-kbox-dateview` 内で行う。
- テスト実行: `node scripts/test-genba-kesseki-box.js`（既存ハーネス。core純関数＋genba構造証明の2段）。
- genba.html は版ゲート対象。リリースは Task 12（bump→承認→三点verify）。

## File Structure

| ファイル | 役割 | 変更 |
|---|---|---|
| `gas/yawaragi-board/kesseki-box-core.js` | ボックス判定の純関数（GAS/node両用・SpreadsheetApp非依存） | 5純関数を追加（module.exports拡張） |
| `scripts/test-genba-kesseki-box.js` | core純関数テスト＋genba構造証明 | coreテスト群＋構造証明群を追記 |
| `genba.html` | kbox本体（HTML＋インラインJS） | HTML3要素増設／kbStateにviewDate／インライン純関数／kbLoad refactor＋kbRenderForDate／nav・chips・banner・UIガード／関数レベルガード×2 |

**設計上の注意（既存パターン踏襲）:** 純関数は core（node-testで検証）と genba インライン（runtime）に**同一ロジックを両所定義**する。ブラウザは node require 不可・GASのHTML実行文脈も同様のため。これは既存 `kbIsAlreadyNotified_`/`kbClassifyCard_` と同じ意図的二重化（core comment 参照）。**勝手に統合しない。**

---

## Task 1: core `kbAddDaysYMD_`（JST安全±日）

**Files:**
- Modify: `gas/yawaragi-board/kesseki-box-core.js`
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-genba-kesseki-box.js` の `console.log(\`kesseki-box core: ...\`)` 行の**直前**に追記:

```js
// ===== F. kbAddDaysYMD_（JST安全±日・月/年境界） =====
ok(core.kbAddDaysYMD_('2026-07-31', 1) === '2026-08-01', 'F1: +1 月跨ぎ');
ok(core.kbAddDaysYMD_('2026-07-01', -1) === '2026-06-30', 'F2: -1 月跨ぎ');
ok(core.kbAddDaysYMD_('2026-07-06', 0) === '2026-07-06', 'F3: 0 同日');
ok(core.kbAddDaysYMD_('2025-12-31', 1) === '2026-01-01', 'F4: +1 年跨ぎ');
ok(core.kbAddDaysYMD_('2026-01-01', -1) === '2025-12-31', 'F5: -1 年跨ぎ');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: FAIL（`core.kbAddDaysYMD_ is not a function` で TypeError／少なくとも F群が落ちる）

- [ ] **Step 3: 最小実装**

`gas/yawaragi-board/kesseki-box-core.js` の `if (typeof module !== 'undefined' ...` の**直前**に追記:

```js
// yyyy-mm-dd を delta 日ずらす。ローカル構成子方式（put/readとも局所成分）でUTCずれなし。
function kbAddDaysYMD_(ymd, delta) {
  var p = String(ymd || '').split('-');
  if (p.length !== 3) return String(ymd || '');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) + (delta || 0));
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var da = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + da;
}
```

そして `module.exports = {` の中に `kbAddDaysYMD_: kbAddDaysYMD_,` を追加。

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: F1〜F5 PASS（`kesseki-box core:` の PASS 数が5増える・FAIL 0）

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbAddDaysYMD_ JST安全±日 core+テスト"
```

---

## Task 2: core `kbJstYmdFromEpoch_`（JST当日・境界テスト必須）

**Files:**
- Modify: `gas/yawaragi-board/kesseki-box-core.js`
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗するテストを書く**（Task1 の F群の下に追記）

```js
// ===== G. kbJstYmdFromEpoch_（JST当日・深夜/早朝境界＝始業4:30事故の回帰） =====
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 14, 30)) === '2026-07-06', 'G1: 23:30 JST → 当日(07-06)');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 19, 30)) === '2026-07-07', 'G2: 4:30 JST → 当日(07-07)・前日化しない');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6,  3,  0)) === '2026-07-06', 'G3: 12:00 JST → 07-06');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 15,  0)) === '2026-07-07', 'G4: 0:00 JST翌日 → 07-07');
// クロ追加: JST日付繰り上がりの1秒境界（オフバイワンの丸め方向を殺す）
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 14, 59, 59)) === '2026-07-06', 'G5: JST23:59:59 → 07-06');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 15,  0,  0)) === '2026-07-07', 'G6: JST00:00:00 → 07-07');
```

（注: `Date.UTC(2026, 6, 6, 19, 30)` は2026-07-06 19:30 UTC = 2026-07-07 04:30 JST。UTC素朴判定なら07-06に化ける＝始業4:30に当日なのに送れない事故。G2がその回帰テスト。）

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: FAIL（`kbJstYmdFromEpoch_ is not a function`）

- [ ] **Step 3: 最小実装**（core、Task1関数の下に追記）

```js
// epoch(ms) の JST(UTC+9) カレンダー日を yyyy-mm-dd で返す。時刻を引数化して境界テスト可能に。
// genba の jstTodayStr()(Intl+Asia/Tokyo) と同一結果。kbox の当日判定はJST固定を厳守。
function kbJstYmdFromEpoch_(epochMs) {
  var d = new Date(epochMs + 9 * 3600 * 1000);   // +9h した瞬間のUTC日 = JST日
  var y = d.getUTCFullYear();
  var m = ('0' + (d.getUTCMonth() + 1)).slice(-2);
  var da = ('0' + d.getUTCDate()).slice(-2);
  return y + '-' + m + '-' + da;
}
```

`module.exports` に `kbJstYmdFromEpoch_: kbJstYmdFromEpoch_,` を追加。

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: G1〜G4 PASS・FAIL 0

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbJstYmdFromEpoch_ JST当日+境界テスト(始業4:30事故回帰)"
```

---

## Task 3: core `kbUpcomingAbsenceDates_`（未来欠席日distinct昇順）

**Files:**
- Modify: `gas/yawaragi-board/kesseki-box-core.js`
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗するテストを書く**（G群の下）

```js
// ===== H. kbUpcomingAbsenceDates_（機能B: 今日以降の欠席日distinct昇順） =====
const _hAbs = [
  { date: '2026-07-08', name: 'a', isLongTerm: false },
  { date: '2026-07-06', name: 'b', isLongTerm: false },   // 当日は含む
  { date: '2026-07-05', name: 'c', isLongTerm: false },   // 過去は除外
  { date: '2026-07-08', name: 'd', isLongTerm: false },   // 同日重複 → 1つに
  { date: '2026-07-15', name: 'e', isLongTerm: true  },   // 長期休みは除外
  { date: '2026-07-10', name: 'f', isLongTerm: false },
];
const _hOut = core.kbUpcomingAbsenceDates_(_hAbs, '2026-07-06');
ok(JSON.stringify(_hOut) === JSON.stringify(['2026-07-06','2026-07-08','2026-07-10']), 'H1: distinct昇順・過去/長期除外・当日含む');
ok(core.kbUpcomingAbsenceDates_(null, '2026-07-06').length === 0, 'H2: null入力で空配列(落ちない)');
// クロ追加H3: spec要件「未来方向のみ」を単独で明示（H1の間接証明に頼らない）
const _h3 = core.kbUpcomingAbsenceDates_([
  { date: '2026-07-01', name: 'p', isLongTerm: false },
  { date: '2026-07-05', name: 'q', isLongTerm: false },
], '2026-07-06');
ok(_h3.length === 0, 'H3: 基準日より前の日付は結果に含まれない(未来方向のみ)');
// クロ追加H4: 長期除外を単独で明示（H1依存にしない）
const _h4 = core.kbUpcomingAbsenceDates_([
  { date: '2026-07-08', name: 'r', isLongTerm: true },
  { date: '2026-07-10', name: 's', isLongTerm: true },
], '2026-07-06');
ok(_h4.length === 0, 'H4: isLongTrue のみ入力 → 空配列(長期除外)');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: FAIL（`kbUpcomingAbsenceDates_ is not a function`）

- [ ] **Step 3: 最小実装**（core）

```js
// 今日以降の通常欠席の date を distinct・昇順で返す（機能Bジャンプ一覧）。
function kbUpcomingAbsenceDates_(absList, todayYMD) {
  var seen = {}, out = [];
  (absList || []).forEach(function (a) {
    if (!a || a.isLongTerm) return;
    var d = String(a.date || '');
    if (!d || d < String(todayYMD)) return;
    if (seen[d]) return;
    seen[d] = true;
    out.push(d);
  });
  out.sort();
  return out;
}
```

`module.exports` に `kbUpcomingAbsenceDates_: kbUpcomingAbsenceDates_,` を追加。

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: H1・H2 PASS・FAIL 0

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbUpcomingAbsenceDates_ 未来欠席日distinct昇順"
```

---

## Task 4: core `kbMergeDedupAbs_`（継ぎ目dedup・前進窓GET正本）

**Files:**
- Modify: `gas/yawaragi-board/kesseki-box-core.js`
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗するテストを書く**（H群の下）

```js
// ===== I. kbMergeDedupAbs_（④継ぎ目: primary=前進窓GET正本, secondary=月キャッシュ補完） =====
const _iPrimary = [
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '送信済' },   // 正本(最新)
];
const _iSecondary = [
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '' },          // 同一key → 捨てる(primary優先)
  { name: '花子', date: '2026-07-04', unit: '午後', cmNotified: '電話連絡済' }, // primaryに無い → 補完
];
const _iOut = core.kbMergeDedupAbs_(_iPrimary, _iSecondary);
ok(_iOut.length === 2, 'I1: overlapは1つ・非重複は補完で計2件');
const _iTaro = _iOut.filter(function (x) { return x.name === '太郎'; });
ok(_iTaro.length === 1 && _iTaro[0].cmNotified === '送信済', 'I2: overlap日はprimary(前進窓GET)が正本');
ok(_iOut.some(function (x) { return x.name === '花子'; }), 'I3: primaryに無いsecondaryは補完される');
ok(core.kbMergeDedupAbs_(null, null).length === 0, 'I4: 両方null/空で落ちない');
// クロ追加I5: dedupキーが(name,date,unit)三点である証明。同一人・同一日でも午前/午後は別スロット→畳まない
const _i5 = core.kbMergeDedupAbs_([
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '送信済' },
  { name: '太郎', date: '2026-07-06', unit: '午後', cmNotified: '' },
], []);
ok(_i5.length === 2, 'I5: 太郎/07-06/午前 と 太郎/07-06/午後 は畳まれず2件(unitを鍵に含む)');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: FAIL（`kbMergeDedupAbs_ is not a function`）

- [ ] **Step 3: 最小実装**（core）

```js
// 2ソースをマージ・dedup。key=name|date|unit。primary(前進窓GET)を正本、secondaryは未登録キーのみ補完。
function kbMergeDedupAbs_(primaryList, secondaryList) {
  var out = [], seen = {};
  function key(a) { return String(a.name || '') + '|' + String(a.date || '') + '|' + String(a.unit || ''); }
  (primaryList || []).forEach(function (a) {
    if (!a) return;
    var k = key(a);
    if (seen[k]) return;
    seen[k] = true; out.push(a);
  });
  (secondaryList || []).forEach(function (a) {
    if (!a) return;
    var k = key(a);
    if (seen[k]) return;
    seen[k] = true; out.push(a);
  });
  return out;
}
```

`module.exports` に `kbMergeDedupAbs_: kbMergeDedupAbs_,` を追加。

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: I1〜I4 PASS・FAIL 0

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbMergeDedupAbs_ 継ぎ目dedup(前進窓GET正本)"
```

---

## Task 5: core `kbIsViewToday_`（当日判定）

**Files:**
- Modify: `gas/yawaragi-board/kesseki-box-core.js`
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗するテストを書く**（I群の下）

```js
// ===== J. kbIsViewToday_（機能Cガード判定・両者JST yyyy-mm-dd前提） =====
ok(core.kbIsViewToday_('2026-07-06', '2026-07-06') === true,  'J1: 一致 → true');
ok(core.kbIsViewToday_('2026-07-08', '2026-07-06') === false, 'J2: 未来 → false');
ok(core.kbIsViewToday_('2026-07-04', '2026-07-06') === false, 'J3: 過去 → false');
ok(core.kbIsViewToday_('', '2026-07-06') === false, 'J4: 空 → false(落ちない)');
// クロ追加: 型頑健性（例外を投げずfalse・jstTodayStr()が想定外を返した時の保険）
ok(core.kbIsViewToday_(null, '2026-07-06') === false, 'J5: null片方 → false');
ok(core.kbIsViewToday_('2026-07-06', undefined) === false, 'J6: undefined片方 → false');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: FAIL（`kbIsViewToday_ is not a function`）

- [ ] **Step 3: 最小実装**（core）

```js
// 表示対象日が当日か（両引数ともJST基準の yyyy-mm-dd を渡す前提）。
function kbIsViewToday_(viewYMD, todayYMD) {
  return String(viewYMD || '') === String(todayYMD || '');
}
```

`module.exports` に `kbIsViewToday_: kbIsViewToday_,` を追加。

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: J1〜J4 PASS・FAIL 0（core全群グリーン）

- [ ] **Step 5: コミット**

```bash
git add gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbIsViewToday_ 当日判定"
```

---

## Task 6: genba HTML — 日付帯・閲覧のみ帯・チップ行を増設（DOM 3要素・#kbox-section内）

**Files:**
- Modify: `genba.html`（`#kbox-section` 内・現状 [1563行](../../../genba.html#L1563) `#kbox-operator-note` の直前）
- Test: `scripts/test-genba-kesseki-box.js`（構造証明）

- [ ] **Step 1: 失敗する構造証明テストを書く**

`scripts/test-genba-kesseki-box.js` の D群 `tryOk(() => { ... }, 'D群(ボックスUI)');` ブロックの**直後**に追記:

```js
// K. 過去+未来ビュー DOM（月グリッド無し・3要素のみ）
tryOk(() => {
  ok2(html.indexOf('id="kbox-datenav"') >= 0, 'K1: 日付送り帯が存在');
  ok2(html.indexOf('id="kbox-prev"') >= 0 && html.indexOf('kbGoDate(-1)') >= 0, 'K2: ◀=kbGoDate(-1)');
  ok2(html.indexOf('id="kbox-next"') >= 0 && html.indexOf('kbGoDate(1)') >= 0, 'K3: ▶=kbGoDate(1)');
  ok2(html.indexOf('id="kbox-datelabel"') >= 0, 'K4: 中央日付ラベルが存在');
  ok2(html.indexOf('id="kbox-viewonly-banner"') >= 0, 'K5: 閲覧のみ帯が存在');
  ok2(html.indexOf('id="kbox-jumpchips"') >= 0, 'K6: ジャンプチップ行が存在');
}, 'K群(日付ビューDOM)');
```

同ファイル末尾の合否集計（`pass2`/`fail2` を出力する行）は既存のまま流用（K群も ok2 で加算される）。

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: K1〜K6 FAIL（genba.html 未変更＝要素不在）

- [ ] **Step 3: HTML 増設**

`genba.html` の `<div id="kbox-operator-note" ...></div>`（現状1563行）の**直前**に挿入:

```html
                <!-- 2026-07-06 過去+未来ビュー: 日付送り帯（#kbox-section内・init非依存・月グリッド無し） -->
                <div id="kbox-datenav" style="display:flex; align-items:center; justify-content:center; gap:12px; margin:6px 0;">
                    <button type="button" id="kbox-prev" onclick="kbGoDate(-1)" style="padding:4px 14px; border:1px solid #2c7a7b; background:#fff; color:#2c7a7b; border-radius:8px; cursor:pointer; font-weight:700; font-size:1rem;">◀</button>
                    <span id="kbox-datelabel" style="font-weight:700; min-width:8em; text-align:center;"></span>
                    <button type="button" id="kbox-next" onclick="kbGoDate(1)" style="padding:4px 14px; border:1px solid #2c7a7b; background:#fff; color:#2c7a7b; border-radius:8px; cursor:pointer; font-weight:700; font-size:1rem;">▶</button>
                </div>
                <div id="kbox-viewonly-banner" style="display:none; background:#fef3c7; color:#92400e; border:1px solid #f59e0b; border-radius:8px; padding:5px 10px; font-size:.85rem; font-weight:700; margin:6px 0;">👀 閲覧のみ（送信・電話記録は当日のみ）</div>
                <div id="kbox-jumpchips" style="margin:6px 0; font-size:.85rem;"></div>
```

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: K1〜K6 PASS（core群・D群も緑のまま）

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): 日付帯/閲覧のみ帯/チップ行DOM増設(月グリッド無し)"
```

---

## Task 7: genba JS — kbStateにviewDate＋インライン純関数＋表示ヘルパー

**Files:**
- Modify: `genba.html`（[7349行](../../../genba.html#L7349) `let kbState` 付近）
- Test: `scripts/test-genba-kesseki-box.js`（構造証明）

- [ ] **Step 1: 失敗する構造証明テストを書く**（K群の下）

```js
// L. kbState.viewDate と インライン純関数の存在
tryOk(() => {
  const kbStateSrc = html.slice(html.indexOf('let kbState ='), html.indexOf('let kbState =') + 200);
  ok2(/viewDate\s*:/.test(kbStateSrc), 'L1: kbStateにviewDate');
  ok2(html.indexOf('function kbAddDaysYMD_') >= 0, 'L2: インラインkbAddDaysYMD_');
  ok2(html.indexOf('function kbUpcomingAbsenceDates_') >= 0, 'L3: インラインkbUpcomingAbsenceDates_');
  ok2(html.indexOf('function kbMergeDedupAbs_') >= 0, 'L4: インラインkbMergeDedupAbs_');
  ok2(html.indexOf('function kbIsViewToday_') >= 0, 'L5: インラインkbIsViewToday_');
  ok2(html.indexOf('function kbFilterTodayTargets_') >= 0, 'L6: インラインkbFilterTodayTargets_(日付引数版)');
}, 'L群(状態+インライン純関数)');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: L1〜L6 FAIL

- [ ] **Step 3: 実装**

(3a) `genba.html` 7349行を差し替え:

```js
let kbState = { items: [], checked: {}, methodMap: {}, methodLoaded: false, viewDate: '', forward: [], _ensuringYm: '' };
```

(3b) 同じく `let kbState = ...` 行の**直後**に、インライン純関数（core と同一ロジック・runtime用）＋表示ヘルパーを追加:

```js
// ===== 2026-07-06 過去+未来ビュー: 純関数インライン移植（core=kesseki-box-core.js と同一ロジック・両所保証） =====
function kbAddDaysYMD_(ymd, delta) {
  var p = String(ymd || '').split('-');
  if (p.length !== 3) return String(ymd || '');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) + (delta || 0));
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function kbUpcomingAbsenceDates_(absList, todayYMD) {
  var seen = {}, out = [];
  (absList || []).forEach(function (a) {
    if (!a || a.isLongTerm) return;
    var d = String(a.date || '');
    if (!d || d < String(todayYMD)) return;
    if (seen[d]) return;
    seen[d] = true; out.push(d);
  });
  out.sort();
  return out;
}
function kbMergeDedupAbs_(primaryList, secondaryList) {
  var out = [], seen = {};
  function key(a) { return String(a.name || '') + '|' + String(a.date || '') + '|' + String(a.unit || ''); }
  (primaryList || []).forEach(function (a) { if (!a) return; var k = key(a); if (seen[k]) return; seen[k] = true; out.push(a); });
  (secondaryList || []).forEach(function (a) { if (!a) return; var k = key(a); if (seen[k]) return; seen[k] = true; out.push(a); });
  return out;
}
function kbIsViewToday_(viewYMD, todayYMD) { return String(viewYMD || '') === String(todayYMD || ''); }
function kbFilterTodayTargets_(absList, ymd) {
  return (absList || []).filter(function (a) { return a && !a.isLongTerm && String(a.date) === String(ymd); });
}
// 表示用: yyyy-mm-dd → "M/D(曜)"
function kbFmtChip_(ymd) {
  var p = String(ymd || '').split('-');
  if (p.length !== 3) return String(ymd || '');
  var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  var dow = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  return parseInt(p[1], 10) + '/' + parseInt(p[2], 10) + '(' + dow + ')';
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: L1〜L6 PASS

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbStateにviewDate/forward+インライン純関数移植"
```

---

## Task 8: genba JS — kbLoad refactor＋kbRenderForDate（月ロード保証＋dedup）

**Files:**
- Modify: `genba.html`（[7379行](../../../genba.html#L7379) `async function kbLoad()` 全体）

- [ ] **Step 1: kbLoad を差し替え**

現状の `async function kbLoad() { ... }`（7379〜7413行）を以下で置換:

```js
async function kbLoad() {
    const listEl = document.getElementById('kbox-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="color:#888;">読み込み中…</div>';
    try {
        if (!kbState.viewDate) kbState.viewDate = jstTodayStr();
        // ① 前進窓（today〜+30）: 従来どおり自前GET。当日カード＋ジャンプ一覧の源（回帰ゼロ）。
        const aj = await kbJsonp_('absences', 'abs');
        kbState.forward = (aj && aj.absences && aj.absences.absences) || [];
        // ② method/事業所/担当（既存GET・1回だけ）
        if (!kbState.methodLoaded) {
            const mj = await kbJsonp_('cm_method_audit', 'method');
            ((mj && mj.audit) || []).forEach(a => { kbState.methodMap[a.userName] = a; });
            kbState.methodLoaded = true;
        }
        // ③ 表示用メアドは既存 absCmEmailMap を流用（空なら取得）
        if (!absCmEmailMap || !Object.keys(absCmEmailMap).length) {
            try { absCmEmailMap = await absLoadCmEmailMap(); } catch (e) {}
        }
        kbRenderForDate(kbState.viewDate);
    } catch (e) {
        listEl.innerHTML = '<div style="color:#c0392b;">取得失敗: ' + kbEsc_(String(e && e.message || e)) + '</div>';
    }
}

// 表示対象日ぶんの描画エントリ。表示月が未ロードなら kbox自身が一度だけロード保証（②依存方向・f774228型回避）。
// ★ensureゲートと描画を分離: 失敗時 attEnsureMonthAbsences は attMonthAbsCache[ym] を埋めないため、
//   コールバック後は再ゲートせず kbRenderDayNow_ で直接描画する（＝GAS障害での無限フェッチループを防ぐ）。
function kbRenderForDate(viewDate) {
    const listEl = document.getElementById('kbox-list');
    if (!listEl) return;
    const ym = String(viewDate).slice(0, 7);
    if (!attMonthAbsCache[ym] && kbState._ensuringYm !== ym && typeof attEnsureMonthAbsences === 'function') {
        kbState._ensuringYm = ym;                       // 同一月の多重ensure/ループ防止
        listEl.innerHTML = '<div style="color:#888;">読み込み中…</div>';
        attEnsureMonthAbsences(viewDate, function () {
            kbState._ensuringYm = '';
            kbRenderDayNow_(kbState.viewDate || viewDate);   // 再ゲートせず描画（失敗時もcache空扱いで前進）
        });
        return;
    }
    kbRenderDayNow_(viewDate);
}

// 実描画: 前進窓GET(正本) ∪ 月キャッシュ(補完) を dedup → 表示日で絞って items 化 → kbRender。
function kbRenderDayNow_(viewDate) {
    const ym = String(viewDate).slice(0, 7);
    const pool = kbMergeDedupAbs_(kbState.forward || [], attMonthAbsCache[ym] || []);
    const targets = kbFilterTodayTargets_(pool, viewDate);
    kbState.items = targets.map(a => {
        const m = kbState.methodMap[a.name] || {};
        const email = (absCmEmailMap && absCmEmailMap[a.name]) || '';
        const cls = kbClassifyCardInline_(m.method, email, a.cmNotified);
        return Object.assign({}, a, { cmOffice: m.cmOffice || '', cmStaff: m.cmStaff || '', care: m.care || '', email, cls });
    });
    kbState.items.forEach(it => {
        if (!(it.name in kbState.checked)) kbState.checked[it.name] = it.cls.defaultChecked;
    });
    kbRender();
}

// 日付送り（機能A）／ジャンプ（機能B）
function kbGoDate(delta) {
    kbState.viewDate = kbAddDaysYMD_(kbState.viewDate || jstTodayStr(), delta);
    kbRenderForDate(kbState.viewDate);
}
function kbJumpTo(ymd) {
    if (!ymd) return;
    kbState.viewDate = String(ymd);
    kbRenderForDate(kbState.viewDate);
}
```

- [ ] **Step 2: 手元検証（構文・存在）**

Run: `node -e "const s=require('fs').readFileSync('genba.html','utf8'); ['kbRenderForDate','kbRenderDayNow_','kbGoDate','kbJumpTo'].forEach(n=>{if(s.indexOf('function '+n)<0)throw new Error('missing '+n)}); console.log('OK: kbLoad refactor 関数存在')"`
Expected: `OK: kbLoad refactor 関数存在`

- [ ] **Step 3: 既存テスト無回帰を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: core全群・D/E/K/L群 PASS・FAIL 0（この時点で kbRender未改修だが構造証明は緑のまま）

- [ ] **Step 4: コミット**

```bash
git add genba.html
git commit -m "feat(kbox): kbLoad refactor+kbRenderForDate(月ロード保証+dedup)+kbGoDate/kbJumpTo"
```

---

## Task 9: genba JS — kbRenderにchrome描画＋UIガード（機能A/B/C UI層）

**Files:**
- Modify: `genba.html`（[7435行](../../../genba.html#L7435) `function kbRender()`）
- Test: `scripts/test-genba-kesseki-box.js`（構造証明）

- [ ] **Step 1: 失敗する構造証明テストを書く**（L群の下）

```js
// M. kbRender の chrome描画（datelabel/banner/chips）とUIガード
tryOk(() => {
  const kbRenderSrc = extractFn('kbRender');
  ok2(kbRenderSrc.indexOf('kbRenderChrome_') >= 0, 'M1: kbRenderがchrome描画を呼ぶ');
  ok2(kbRenderSrc.indexOf('kbIsViewToday_') >= 0, 'M2: kbRenderが当日判定を持つ');
  ok2(/viewIsToday/.test(kbRenderSrc), 'M3: viewIsTodayでUI活性を分岐');
  ok2(html.indexOf('function kbRenderChrome_') >= 0, 'M4: kbRenderChrome_定義');
  const chromeSrc = extractFn('kbRenderChrome_');
  ok2(chromeSrc.indexOf('kbUpcomingAbsenceDates_') >= 0, 'M5: chromeがジャンプ一覧を描く');
  ok2(chromeSrc.indexOf('kbox-viewonly-banner') >= 0, 'M6: chromeが閲覧のみ帯を制御');
}, 'M群(chrome+UIガード)');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: M1〜M6 FAIL

- [ ] **Step 3a: kbRender 冒頭に当日判定＋chrome呼び出しを挿入**

`function kbRender() {` 直後の `const sendBtn = document.getElementById('kbox-send-btn');`（現状7440行）の**直後**に挿入:

```js
    const _today = jstTodayStr();
    const _viewDate = kbState.viewDate || _today;
    const _viewIsToday = kbIsViewToday_(_viewDate, _today);
    kbRenderChrome_(_viewDate, _today, _viewIsToday);
```

- [ ] **Step 3b: 空表示の文言を表示日対応に**

現状7443行 `listEl.innerHTML = '<div style="color:#2c7a7b; font-weight:700;">本日の欠席はありません 🎉</div>';` を:

```js
        listEl.innerHTML = '<div style="color:#2c7a7b; font-weight:700;">' + (_viewIsToday ? '本日' : kbFmtChip_(_viewDate)) + 'の欠席はありません 🎉</div>';
```

- [ ] **Step 3c: チェックボックスを未来/過去日で無効化**

現状7477行 `<input type="checkbox" ${chk} onchange="kbToggleCheck('${kbEsc_(it.name)}', this.checked)" style="width:18px; height:18px;">送信対象` を:

```js
                            <input type="checkbox" ${chk} ${_viewIsToday ? '' : 'disabled'} onchange="kbToggleCheck('${kbEsc_(it.name)}', this.checked)" style="width:18px; height:18px;">送信対象
```

- [ ] **Step 3d: 電話済みボタンを未来/過去日で無効化**

現状7483-7484行の電話派 body を:

```js
            body = `<div style="color:#d69e2e; font-weight:700; margin-top:4px;">☎ 電話してください</div>
                    <button class="abs-contact-btn" style="margin-top:4px; padding:4px 10px; font-size:.85rem;${(opDisabled || !_viewIsToday) ? ' opacity:.5;' : ''}" ${(opDisabled || !_viewIsToday) ? 'disabled' : ''} onclick="kbMarkPhoneDone('${kbEsc_(it.name)}', '${kbEsc_(it.date)}')">電話済みにする</button>`;
```

- [ ] **Step 3e: 一括送信ボタンを未来/過去日で無効化**

現状7493行 `sendBtn.disabled = opDisabled || !anyChecked;` を:

```js
        sendBtn.disabled = opDisabled || !anyChecked || !_viewIsToday;
```

現状7494行 `sendBtn.style.opacity = (opDisabled || !anyChecked) ? '.5' : '1';` を:

```js
        sendBtn.style.opacity = (opDisabled || !anyChecked || !_viewIsToday) ? '.5' : '1';
```

- [ ] **Step 3f: kbRenderChrome_ を新規追加**

`function kbToggleCheck(...)`（現状7499行）の**直前**に追加:

```js
// 日付帯ラベル・閲覧のみ帯・ジャンプチップ（機能A表示/B/C帯）。データ非変更・表示のみ。
function kbRenderChrome_(viewDate, today, viewIsToday) {
    const label = document.getElementById('kbox-datelabel');
    if (label) label.textContent = kbFmtChip_(viewDate) + (viewIsToday ? '（今日）' : '');
    const banner = document.getElementById('kbox-viewonly-banner');
    if (banner) banner.style.display = viewIsToday ? 'none' : 'block';
    const chips = document.getElementById('kbox-jumpchips');
    if (chips) {
        const dates = kbUpcomingAbsenceDates_(kbState.forward || [], today).filter(function (d) { return d !== viewDate; });
        if (!dates.length) {
            chips.innerHTML = '';
        } else {
            chips.innerHTML = '<span style="color:#555;">この先お休み: </span>' + dates.map(function (d) {
                return '<button type="button" onclick="kbJumpTo(\'' + d + '\')" style="margin:2px 3px; padding:2px 9px; border:1px solid #cbd5e0; background:#fff; border-radius:12px; cursor:pointer; font-size:.82rem;">' + kbFmtChip_(d) + '</button>';
            }).join('');
        }
    }
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: M1〜M6 PASS・他全群緑・FAIL 0

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbRenderにchrome描画(日付帯/帯/チップ)+未来過去日UIガード"
```

---

## Task 10: genba JS — 関数レベル当日ガード（構造的封じ・すり抜け不能）

**Files:**
- Modify: `genba.html`（[7612行](../../../genba.html#L7612) `kbExecuteSend`／[7642行](../../../genba.html#L7642) `kbMarkPhoneDone`）
- Test: `scripts/test-genba-kesseki-box.js`（構造証明）

- [ ] **Step 1: 失敗する構造証明テストを書く**（M群の下）

```js
// N. 関数レベル当日ガード（UIすり抜け不能・前倒し送信の構造的封じ）
tryOk(() => {
  const sendSrc = extractFn('kbExecuteSend');
  ok2(sendSrc.indexOf('kbIsViewToday_') >= 0, 'N1: kbExecuteSendに当日ガード');
  ok2(sendSrc.indexOf('kbIsViewToday_') < sendSrc.indexOf('fetch'), 'N2: 当日ガードはfetchより前');
  ok2(sendSrc.indexOf('gnbGuardProdWrite') >= 0, 'N3: 既存originガードも維持');
  const telSrc = extractFn('kbMarkPhoneDone');
  ok2(telSrc.indexOf('kbIsViewToday_') >= 0, 'N4: kbMarkPhoneDoneに当日ガード');
  ok2(telSrc.indexOf('kbIsViewToday_') < telSrc.indexOf('fetch'), 'N5: 当日ガードはfetchより前');
  ok2(telSrc.indexOf('gnbGuardProdWrite') >= 0, 'N6: 既存originガードも維持');
}, 'N群(関数レベル当日ガード)');
```

- [ ] **Step 2: テスト失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: N1〜N6 FAIL

- [ ] **Step 3a: kbExecuteSend 先頭にガード追加**

現状7613行 `if (!gnbGuardProdWrite('欠席連絡の一括送信')) return;` の**直後**に追加:

```js
    if (!kbIsViewToday_(kbState.viewDate || jstTodayStr(), jstTodayStr())) { showToast('未来日/過去日は閲覧のみです（送信・電話記録は当日のみ）', 3000); return; }
```

- [ ] **Step 3b: kbMarkPhoneDone 先頭にガード追加**

現状7643行 `if (!gnbGuardProdWrite('電話済みマーク')) return;` の**直後**に追加:

```js
    if (!kbIsViewToday_(kbState.viewDate || jstTodayStr(), jstTodayStr())) { showToast('未来日/過去日は閲覧のみです（送信・電話記録は当日のみ）', 3000); return; }
```

- [ ] **Step 4: テスト成功を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: N1〜N6 PASS・全群緑・FAIL 0

- [ ] **Step 5: コミット**

```bash
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): kbExecuteSend/kbMarkPhoneDone先頭に当日ガード(構造的封じ)"
```

---

## Task 11: 全体リグレッション＋実機手動検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 全自動テスト**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `kesseki-box core: N PASS / 0 FAIL`＋構造証明 D/E/K/L/M/N 全 PASS・FAIL 0

- [ ] **Step 2: 非接触diff証明**

Run: `git diff --stat origin/master -- genba.html gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js`
Expected: 変更はこの3ファイルのみ。`git diff origin/master -- genba.html | grep -E "gnbGuardProdWrite|カレンダー|absSubmit|maintenance_rename" ` で**既存originガード/ピッカー/②改名の行が削られていない**ことを目視（追加行のみ・既存削除なし）。

- [ ] **Step 3: ローカル実機確認（no-storeプレビュー）**

⚠️ file:// 直開きはキャッシュ罠。必ず no-store プレビューで:
Run: `node scripts/preview-server.js`（無ければ genba を配信できる簡易サーバ）→ ブラウザで欠席登録タブを開く。
確認項目（目視）:
- 初期＝本日。日付帯に「M/D(曜)（今日）」。送信・チェック・電話済みが**有効**。
- ▶ で翌日へ。欠席があればカード表示・**閲覧のみ帯が出て**チェック/送信/電話済みが**無効**。
- 「この先お休み」チップに欠席のある未来日だけ並ぶ→タップでジャンプ。
- ◀ で過去日へ。**出席予定タブを開いていない状態でも**過去日の欠席が出る（②ロード保証）。過去日で送信済が**✅緑**で出る。
- 本日へ戻すと送信系が**有効**に戻る。

- [ ] **Step 4: morningDigest棚卸し（別トラック・実測後クローズ）**

出席予定タブで過去日を1件開き、送信済だった利用者のバッジが**✅緑（連絡済系）**で出ることを目視確認。出たらその結果を根拠に morningDigest「赤化け」該当行をクローズ（朝報告1行）。出なければクローズしない。**kbox実装のブロッカーにしない。**

- [ ] **Step 5: 検証結果をコミット（あれば検証メモのみ）**

コード変更なしなら省略可。

---

## Task 12: 版ゲート（bump → 社長承認 → 三点verify）

**Files:** `version.txt`・`genba.html` の `shared.js?v=`（bumpスクリプトが自動更新）

- [ ] **Step 1: 現行版を実測（連番飛び防止）**

Run: `git show origin/master:version.txt`
現行版を確認し、次の連番を決める（例 現行 `2026-07-04-16` → 次 `2026-07-06-01`）。連番飛びは先祖返りシグナル。

- [ ] **Step 2: fresh・cleanを確認して bump**

feat/genba-kbox-date-view の genba.html 実装は全コミット済み・origin/master に対し behind でないことを確認後:
Run: `node scripts/bump-app-version.js 2026-07-06-01`
Expected: version.txt と genba.html の `shared.js?v=` を同一コミットで更新し、SHA と push/verify コマンドを提示（**実pushはしない＝案A**）。

- [ ] **Step 3: 社長承認 → 手push**

bump出力の SHA を提示し**社長承認を得る**。承認後:
Run: `git push origin feat/genba-kbox-date-view:master`（FF push・"push origin master"はローカルmaster stale罠のため使わない）
push前後で `git rev-parse HEAD` と `git rev-parse origin/master` の一致を確認。

- [ ] **Step 4: 三点verify**

Run: `node scripts/bump-app-version.js --verify 2026-07-06-01`
＋以下の三点を一次確認（tool出力の偽SHA罠に注意・`git show` で裏取り）:
1. `git show origin/master:version.txt` = `2026-07-06-01`
2. 本番 github.io の genba.html 実コードに `kbGoDate` / `kbIsViewToday_` / `kbox-viewonly-banner` が含まれる（`curl -s <本番genba> | grep -c kbGoDate`）
3. SHA一致（local HEAD = origin/master）
GitHub Pages 一時障害時は verify 時間切れを成功扱いにせず、本番 version.txt を直ポーリング。stuck run は空コミットFF pushで新規デプロイ強制。

- [ ] **Step 5: テスト送信の実機確認＋掃除**

本番で当日の欠席1件をテスト送信（社長Gmail宛）→受信確認 → テスト行を掃除（承認のうえ）。

---

## Self-Review（記録）

- **Spec coverage:** 機能A=Task6/8/9、機能B=Task3/9(chrome)、機能C=Task9(UI)＋Task10(関数ガード)、①棚卸し=Task11 Step4、②依存方向=Task8(kbRenderForDateのattEnsureMonthAbsences)、③JST境界=Task2、④継ぎ目=Task4＋Task8(kbMergeDedupAbs_使用)。棲み分け(§3)は非接触で担保（履歴タブ・登録タブ一覧に触れない＝Task11 Step2で証明）。版ゲート=Task12。全spec要件にタスク対応あり。
- **Placeholder scan:** なし（各stepに実コード・実コマンド・期待出力）。
- **Type consistency:** core関数名＝genbaインライン名一致（kbAddDaysYMD_/kbJstYmdFromEpoch_/kbUpcomingAbsenceDates_/kbMergeDedupAbs_/kbIsViewToday_）。kbState schema（viewDate/forward）はTask7で定義しTask8/9で参照。kbRenderForDate/kbGoDate/kbJumpTo/kbRenderChrome_/kbFmtChip_ は定義タスクと参照タスクが一致。
- **非接触:** originガード(gnbGuardProdWrite)・メールゲート・カレンダーピッカー・①②改名・既存kbRender描画ロジックは追加のみ（既存行削除なし）をTask11 Step2で証明。
