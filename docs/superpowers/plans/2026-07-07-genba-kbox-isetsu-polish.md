# 欠席box 移設＋polish 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 欠席box を出席予定タブへ移設し、リネーム・日付ピッカー・AM/PM群・日付拡大の4 polish を1パスで乗せ、全緑維持で版-25へ繰り上げる（push前で停止）。

**Architecture:** 現緑ビルド(-24)を土台に、genba.html のみを編集（GAS非接触）。polishをboxがまだ欠席登録タブに在るうちに確定→最後にbox全体を出席予定タブ最上部へ移設＋init配線を独立追記/撤去。AM/PM分類は純関数 `kbUnitGroup_` を core.js＋インライン両所に置く既存パターンを踏襲。操作者行はboxに埋め込み既存 `absSelectReceptionist` を再利用し自己完結。

**Tech Stack:** 素のHTML/JS（genba.html 単一ファイル）、Nodeスクリプトの構造証明テスト（`scripts/test-genba-kesseki-box.js`）、core純関数（`gas/yawaragi-board/kesseki-box-core.js`）。

**Spec:** [docs/superpowers/specs/2026-07-07-genba-kbox-isetsu-polish-design.md](../specs/2026-07-07-genba-kbox-isetsu-polish-design.md)

---

## File Structure

- **Modify** `genba.html` — box UI/JS。全タスクがここを触る。
- **Modify** `gas/yawaragi-board/kesseki-box-core.js` — 純関数 `kbUnitGroup_` 追加＋export（Task 3のみ）。
- **Modify** `scripts/test-genba-kesseki-box.js` — 各タスクで構造証明/純関数テストを追記（既存44+41は非破壊）。
- **Modify** `version.txt` + `genba.html`(shared.js?v=) — Task 8 の bump-script が同期更新（手編集しない）。

各タスクは独立コミット。テストは常に「既存全緑を維持しつつ新規もPASS」。

---

## Task 1: リネーム「本日の欠席連絡」→「欠席box」

**Files:**
- Modify: `genba.html`（見出し1558付近・ヘルプ見出し1617付近）
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗する構造証明を追記**

`scripts/test-genba-kesseki-box.js` の N群ブロック（`}, 'N群(関数レベル当日ガード)');` の直後）に追記:

```javascript
// P. リネーム（本日→欠席box）
tryOk(() => {
  ok2(html.indexOf('📮 欠席box') >= 0, 'P1: タイトルが「欠席box」');
  ok2(html.indexOf('📮 本日の欠席連絡</strong>') < 0, 'P2: 旧タイトル「本日の欠席連絡」見出しが消えている');
  ok2(html.indexOf('📮 欠席box の使い方') >= 0, 'P3: ヘルプ見出しも「欠席box の使い方」');
}, 'P群(リネーム)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `構造証明: ... / 3 FAIL`（P1/P2/P3 が FAIL）

- [ ] **Step 3: 最小実装（genba.html の2文字列を置換）**

置換1（見出し 1558付近）:
```html
                <strong style="font-size:1.05rem;">📮 欠席box</strong>
```
置換2（ヘルプ見出し 1617付近）:
```html
                <h3 style="margin:0; font-size:1.15rem;">📮 欠席box の使い方</h3>
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `core: 44 PASS / 0 FAIL` ＋ `構造証明: 44 PASS / 0 FAIL`（P群3件増）

- [ ] **Step 5: コミット**

```bash
git add scripts/test-genba-kesseki-box.js genba.html
git commit -m "test+feat(kbox): タイトル/ヘルプ見出しを『欠席box』へリネーム(本日を外す)"
```

---

## Task 2: 帯の日付フォント拡大

**Files:**
- Modify: `genba.html`（`#kbox-datelabel` 1566付近）
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗する構造証明を追記**

P群ブロックの直後に追記:

```javascript
// Q. 日付ラベル拡大
tryOk(() => {
  const idx = html.indexOf('id="kbox-datelabel"');
  ok2(idx >= 0, 'Q0: datelabel存在');
  const tag = html.slice(idx, html.indexOf('>', idx));
  ok2(/font-size\s*:\s*1\.35rem/.test(tag), 'Q1: datelabelに font-size:1.35rem');
}, 'Q群(日付ラベル拡大)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `Q1` が FAIL（1 FAIL）

- [ ] **Step 3: 最小実装（style に font-size 追加）**

`#kbox-datelabel`（1566付近）の style を変更:
```html
        <span id="kbox-datelabel" style="font-weight:700; min-width:8em; text-align:center; font-size:1.35rem;"></span>
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 45 PASS / 0 FAIL`）

- [ ] **Step 5: コミット**

```bash
git add scripts/test-genba-kesseki-box.js genba.html
git commit -m "test+feat(kbox): 帯の日付フォントを1.35remへ拡大(視認性)"
```

---

## Task 3: AM/PM分類 純関数 `kbUnitGroup_`（core + インライン）

**Files:**
- Modify: `gas/yawaragi-board/kesseki-box-core.js`（関数追加＋export）
- Modify: `genba.html`（インライン同一実装を追加）
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗するcore純関数テストを追記**

`scripts/test-genba-kesseki-box.js` の core セクション末尾（構造証明 `// D.` の直前、`let pass2 = 0` より前）に追記:

```javascript
// O. kbUnitGroup_（AM/PM分類・終日/空はPMへ害なきフォールバック）
ok(core.kbUnitGroup_('午前') === 'am', 'O1: 午前 → am');
ok(core.kbUnitGroup_('午後') === 'pm', 'O2: 午後 → pm');
ok(core.kbUnitGroup_('終日') === 'pm', 'O3: 終日 → pm(害なきフォールバック・実運用では発生しない)');
ok(core.kbUnitGroup_('') === 'pm', 'O4: 空 → pm(消さない)');
ok(core.kbUnitGroup_(null) === 'pm', 'O5: null → pm(落ちない)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `TypeError: core.kbUnitGroup_ is not a function`（O1で例外）

- [ ] **Step 3: core.js に関数追加＋export**

`kbIsViewToday_`（89-91）の直後、`if (typeof module...` の直前に追加:
```javascript
function kbUnitGroup_(unit) {
  var u = String(unit == null ? '' : unit);
  if (u.indexOf('午前') >= 0) return 'am';
  return 'pm';   // 午後・終日・空・不明はPM群へ（害なき防御: カードを消さない。同一日AM/PM併用者は存在しない前提）
}
```
export に1行追加（`kbIsViewToday_: kbIsViewToday_` の後にカンマ＆追記）:
```javascript
    kbIsViewToday_: kbIsViewToday_,
    kbUnitGroup_: kbUnitGroup_
```

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `core: 49 PASS / 0 FAIL`（O群5件増）

- [ ] **Step 5: genba.html にインライン同一実装を追加**

インライン純関数群（`function kbIsViewToday_(...)` の定義 7385付近）の直後に、同一ロジックを追加:
```javascript
function kbUnitGroup_(unit) {
    var u = String(unit == null ? '' : unit);
    if (u.indexOf('午前') >= 0) return 'am';
    return 'pm';   // 午後・終日・空・不明はPM群へ（害なき防御: カードを消さない）
}
```

- [ ] **Step 6: インライン存在の構造証明を追記**

L群ブロック（`}, 'L群(状態+インライン純関数)');`）内の最後の `ok2(...)` の後ろに1行追加:
```javascript
  ok2(html.indexOf('function kbUnitGroup_') >= 0, 'L7: インラインkbUnitGroup_');
```

- [ ] **Step 7: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `core: 49 PASS / 0 FAIL` ＋ `構造証明: 46 PASS / 0 FAIL`

- [ ] **Step 8: コミット**

```bash
git add gas/yawaragi-board/kesseki-box-core.js genba.html scripts/test-genba-kesseki-box.js
git commit -m "test+feat(kbox): AM/PM分類純関数kbUnitGroup_(core+インライン・終日→PMフォールバック)"
```

---

## Task 4: kbRender を AM群/PM群 の四角バッジ見出しで描画

**Files:**
- Modify: `genba.html`（`function kbRender()` のカード生成ループ 7547-7577付近）
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗する構造証明を追記**

Q群ブロックの直後に追記:

```javascript
// R. AM/PM群描画（四角バッジ・各カード1群に1回）
tryOk(() => {
  const src = extractFn('kbRender()');
  ok2(src.indexOf('kbUnitGroup_') >= 0, 'R1: kbRenderがkbUnitGroup_で群分け');
  ok2(/kb-ampm-badge/.test(src), 'R2: AM/PM四角バッジのマーカー(kb-ampm-badge)がある');
  ok2(src.indexOf("'AM'") >= 0 && src.indexOf("'PM'") >= 0, 'R3: AM/PMラベルを描画');
  // 各カードは1群1回: itemsを2バケットへ push（重複pushしない）
  ok2(/groups\.am|groups\['am'\]/.test(src) && /groups\.pm|groups\['pm'\]/.test(src), 'R4: am/pmバケットに振り分け');
}, 'R群(AM/PM群描画)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `R1..R4` が FAIL（4 FAIL）

- [ ] **Step 3: kbRender のカード生成ループを群分けに置換**

`function kbRender()` 内、`const opDisabled = !operator;`（7545付近）の次行から `listEl.innerHTML = html;`（7577付近）までを、以下で置換:

```javascript
    const opDisabled = !operator;

    // カード1枚のHTML（既存カード生成を関数化＝DRY・マークアップは不変）
    function kbCardHtml_(it) {
        const cm = kbEsc_(it.cmStaff || '') + (it.cmOffice ? ('／' + kbEsc_(it.cmOffice)) : '');
        let careBadge = '';
        if (it.care === '要支援') careBadge = '<span style="font-size:.72rem; font-weight:700; padding:1px 7px; border-radius:6px; background:#e5f4ec; color:#1f7a52; margin-left:6px;">要支援</span>';
        else if (it.care === '要介護') careBadge = '<span style="font-size:.72rem; font-weight:700; padding:1px 7px; border-radius:6px; background:#fbf0dd; color:#a15c00; margin-left:6px;">要介護</span>';
        const head = `<div style="font-weight:700;">${kbEsc_(it.name)}${careBadge} <span style="font-weight:400; color:#666;">(${kbEsc_(it.unit || '')})</span></div>
                      <div style="font-size:.82rem; color:#555;">ケアマネ: ${cm || '（台帳に情報なし）'}</div>`;
        let body = '';
        if (it.cls.done) {
            const label = (String(it.cmNotified).indexOf('電話') >= 0) ? '電話済' : '送信済';
            const who = it.lastOperator ? ('（担当: ' + kbEsc_(it.lastOperator) + '）') : '';
            body = `<div style="color:#2c7a7b; font-weight:700; margin-top:4px;">✅ ${label}${who}</div>`;
        } else if (it.cls.kind === 'mail') {
            const chk = kbState.checked[it.name] ? 'checked' : '';
            body = `<div style="font-size:.82rem; color:#555;">宛先: ${kbEsc_(it.email)}</div>
                    <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
                        <label style="display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" ${chk} ${_viewIsToday ? '' : 'disabled'} onchange="kbToggleCheck('${kbEsc_(it.name)}', this.checked)" style="width:18px; height:18px;">送信対象
                        </label>
                        <button class="abs-contact-btn" style="padding:4px 10px; font-size:.85rem;" onclick="kbOpenPreview('${kbEsc_(it.name)}')">内容を見る</button>
                    </div>`;
        } else {
            body = `<div style="color:#d69e2e; font-weight:700; margin-top:4px;">☎ 電話してください</div>
                    <button class="abs-contact-btn" style="margin-top:4px; padding:4px 10px; font-size:.85rem;${(opDisabled || !_viewIsToday) ? ' opacity:.5;' : ''}" ${(opDisabled || !_viewIsToday) ? 'disabled' : ''} onclick="kbMarkPhoneDone('${kbEsc_(it.name)}', '${kbEsc_(it.date)}')">電話済みにする</button>`;
        }
        return `<div style="border:1px solid #cbd5e0; border-radius:8px; padding:8px; margin:6px 0; background:#fff;">${head}${body}</div>`;
    }

    // AM群/PM群に振り分け（表示のみ・kbState.itemsは非重複のまま＝各カード1群に1回）
    const groups = { am: [], pm: [] };
    kbState.items.forEach(it => { (kbUnitGroup_(it.unit) === 'am' ? groups.am : groups.pm).push(it); });

    let html = '';
    [['am', 'AM'], ['pm', 'PM']].forEach(g => {
        const key = g[0], label = g[1];
        if (!groups[key].length) return;
        html += `<div style="margin:10px 0 4px;"><span class="kb-ampm-badge" style="display:inline-block; border:2px solid #2c7a7b; color:#2c7a7b; font-weight:800; padding:1px 12px; border-radius:4px; letter-spacing:2px; font-size:.9rem;">${label}</span></div>`;
        groups[key].forEach(it => { html += kbCardHtml_(it); });
    });
    listEl.innerHTML = html;
```

（注: `_viewIsToday` は同関数内で既に定義済み〔7528〕・`operator`/`opDisabled` も既存。参照はそのまま有効。）

- [ ] **Step 4: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 50 PASS / 0 FAIL`）。既存 M群（kbRenderがchrome/当日判定を持つ）も維持されていること。

- [ ] **Step 5: コミット**

```bash
git add scripts/test-genba-kesseki-box.js genba.html
git commit -m "test+feat(kbox): 欠席カードをAM群/PM群の四角バッジ見出しで描画(各カード1群1回)"
```

---

## Task 5: ネイティブ日付ピッカー `<input type="date">` 追加

**Files:**
- Modify: `genba.html`（`#kbox-datenav` 1564-1568付近 ＋ `kbRenderChrome_` 7589付近）
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗する構造証明を追記**

R群ブロックの直後に追記:

```javascript
// S. 日付ピッカー（type=date・kbJumpTo経路・chromeで値同期）
tryOk(() => {
  const idx = html.indexOf('id="kbox-datepicker"');
  ok2(idx >= 0, 'S1: #kbox-datepickerが存在');
  const line = html.slice(html.lastIndexOf('<', idx), html.indexOf('>', idx) + 1);
  ok2(/type="date"/.test(line), 'S2: type=date');
  ok2(/onchange="kbJumpTo\(this\.value\)"/.test(line), 'S3: onchangeがkbJumpTo(this.value)');
  const chrome = extractFn('kbRenderChrome_');
  ok2(chrome.indexOf('kbox-datepicker') >= 0, 'S4: chromeがpicker値を現在viewDateへ同期');
}, 'S群(日付ピッカー)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `S1..S4` が FAIL（4 FAIL）

- [ ] **Step 3: `#kbox-datenav` に日付ピッカーを追加**

`#kbox-datenav`（1564）の `▶` ボタン（1567の `id="kbox-next"`）の直後、`</div>`（1568）の前に追加:
```html
            <input type="date" id="kbox-datepicker" onchange="kbJumpTo(this.value)" style="margin-left:8px; padding:3px 6px; border:1px solid #2c7a7b; border-radius:8px; font-size:.95rem;">
```

- [ ] **Step 4: `kbRenderChrome_` に picker値同期を追加**

`function kbRenderChrome_(viewDate, today, viewIsToday)` 内、先頭の `const label = ...`（7590）の直前に追加:
```javascript
    const picker = document.getElementById('kbox-datepicker');
    if (picker && picker.value !== viewDate) picker.value = viewDate;   // ◀▶/チップ移動時もpicker表示を一致
```

- [ ] **Step 5: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 54 PASS / 0 FAIL`）

- [ ] **Step 6: コミット**

```bash
git add scripts/test-genba-kesseki-box.js genba.html
git commit -m "test+feat(kbox): ネイティブ日付ピッカー追加(任意日ジャンプ・kbJumpTo経路・ガード不変)"
```

---

## Task 6: box内 コンパクト操作者行（`absSelectReceptionist` 再利用）

**Files:**
- Modify: `genba.html`（box内に操作者コンテナ追加 ＋ `kbRenderOperatorRow_` 追加 ＋ `kbRender`/`kbInit` から呼出）
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗する構造証明を追記**

S群ブロックの直後に追記:

```javascript
// T. box内操作者行（自己完結・既存absSelectReceptionist再利用）
tryOk(() => {
  ok2(html.indexOf('id="kbox-operator-select"') >= 0, 'T1: box内に操作者コンテナ');
  ok2(html.indexOf('function kbRenderOperatorRow_') >= 0, 'T2: kbRenderOperatorRow_定義');
  const src = extractFn('kbRenderOperatorRow_');
  ok2(src.indexOf('getStaff') >= 0 && src.indexOf('EXCLUDED_STAFF') >= 0, 'T3: 名簿はgetStaff−EXCLUDED_STAFF流用');
  ok2(src.indexOf('absSelectReceptionist') >= 0, 'T4: タップは既存absSelectReceptionistを呼ぶ');
  const rsrc = extractFn('kbRender()');
  ok2(rsrc.indexOf('kbRenderOperatorRow_') >= 0, 'T5: kbRenderが操作者行を再描画(選択ハイライト同期)');
}, 'T群(box内操作者行)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `T1..T5` が FAIL（5 FAIL）

- [ ] **Step 3: box内に操作者コンテナを追加**

box見出しブロック（`#kbox-pending-badge` を閉じる `</div>`、1562付近）と `#kbox-datenav`（1564）の間に追加:
```html
        <div id="kbox-operator-select" style="display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; align-items:center;"></div>
```

- [ ] **Step 4: `kbRenderOperatorRow_` を追加**

`function kbInit()`（7398）の直前に追加:
```javascript
// box内 操作者行: 名簿=既存getStaff−EXCLUDED_STAFF、タップ=既存absSelectReceptionist（global+localStorage共有で欠席登録タブと同期）
function kbRenderOperatorRow_() {
    const box = document.getElementById('kbox-operator-select');
    if (!box) return;
    const cur = (typeof absReceptionist !== 'undefined' && absReceptionist) ? absReceptionist : '';
    const staff = (typeof getStaff === 'function' ? getStaff() : []).filter(s => !(typeof EXCLUDED_STAFF !== 'undefined' && EXCLUDED_STAFF.includes(s)));
    box.innerHTML = '<span style="font-size:.82rem; color:#555;">操作者:</span>' + staff.map(s =>
        `<button type="button" class="abs-contact-btn${cur === s ? ' selected' : ''}" style="padding:3px 10px; font-size:.85rem;" onclick="absSelectReceptionist('${kbEsc_(s)}', this)">${kbEsc_(s)}</button>`
    ).join('');
}
```

- [ ] **Step 5: `kbInit` と `kbRender` から呼び出す**

`kbInit`（7398-7402）を変更（`kbLoad();` の前に操作者行を1回描画）:
```javascript
function kbInit() {
    const sec = document.getElementById('kbox-section');
    if (!sec) return;                      // 要素不在ガード（f774228型回避）
    kbRenderOperatorRow_();                // box内操作者行（自己完結・既存関数再利用）
    kbLoad();
}
```
`kbRender()` の先頭（`const listEl = document.getElementById('kbox-list');` 7519 の直後）に追加（選択後 absSelectReceptionist→kbRender で行ハイライトを同期）:
```javascript
    kbRenderOperatorRow_();
```

- [ ] **Step 6: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 59 PASS / 0 FAIL`）

- [ ] **Step 7: コミット**

```bash
git add scripts/test-genba-kesseki-box.js genba.html
git commit -m "test+feat(kbox): box内にコンパクト操作者行(getStaff/absSelectReceptionist再利用・自己完結)"
```

---

## Task 7: DOM移設（欠席登録タブ→出席予定タブ）＋ init配線移設

**Files:**
- Modify: `genba.html`（`#kbox-section` 移動 ＋ タブ切替フック 2754/2761）
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗する移設の構造証明を追記**

T群ブロックの直後に追記:

```javascript
// U. 移設（出席予定タブ単独・欠席登録タブ非依存・二重fetchなし）
tryOk(() => {
  const iAtt = html.indexOf('id="tab-attendance"');
  const iRemind = html.indexOf('id="tab-remind"');   // attendanceの次タブ
  const iAbs = html.indexOf('id="tab-absence"');
  const iBox = html.indexOf('id="kbox-section"');
  ok2(iBox > iAtt && iBox < iRemind, 'U1: kbox-sectionは出席予定タブ内(tab-attendance〜tab-remindの間)');
  ok2(!(iBox > iAbs), 'U2: kbox-sectionは欠席登録タブ(tab-absence)より前=欠席登録タブ内に無い');
  // 配線: attendance分岐にkbInit・absence分岐にkbInit無し
  const attBranch = html.slice(html.indexOf("dataset.tab === 'attendance'"), html.indexOf("dataset.tab === 'remind'"));
  ok2(attBranch.indexOf('kbInit(') >= 0, 'U3: attendance分岐にkbInit()を独立追記');
  const absBranch = html.slice(html.indexOf("dataset.tab === 'absence'"), html.indexOf("dataset.tab === 'jisseki'"));
  ok2(absBranch.indexOf('kbInit(') < 0, 'U4: absence分岐からkbInit()撤去');
  // f774228回避: kbInitは要素不在ガードを保持（既存D2の再確認）
  ok2(/if\s*\(!\w+\)\s*return/.test(extractFn('kbInit')), 'U5: kbInitの要素不在ガード維持');
  // 二重fetchなし: 冪等early-return と _ensuringYm ガード両方が生存
  ok2(html.indexOf('if (attMonthAbsCache[ym]) { cb(); return; }') >= 0, 'U6: attEnsureMonthAbsencesの月命中early-return生存(冪等)');
  ok2(html.indexOf('kbState._ensuringYm !== ym') >= 0, 'U7: kbox側_ensuringYm二重ensureガード生存');
}, 'U群(移設)');
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `U1`（またはU3/U4）が FAIL（移設前なのでboxはabsence内・kbInitはabsence分岐）

- [ ] **Step 3: `#kbox-section` を出席予定タブ最上部へ移動**

3-a. 欠席登録タブから `#kbox-section` ブロック全体（`<div id="kbox-section" ...>` 1555 〜 対応する `</div>` 1574、直後の空行含む）を**切り取り**。この節の直前コメント `<!-- 2026-07-04 指示書③修正①: このタブのメイン機能なので最上部に配置（スクロール不要） -->`（1554）も一緒に削除。

3-b. 出席予定タブ `<div id="tab-attendance" class="tab-content">`（1508）の**直後の行**に、切り取ったコメント＋`#kbox-section` ブロックを**貼り付け**（`att-date-bar` 1509 の前）。結果:
```html
<div id="tab-attendance" class="tab-content">
    <!-- 2026-07-07 移設: 欠席box（出席予定タブ最上部・自己完結） -->
    <div id="kbox-section" style="margin:0 0 12px; border:2px solid #2c7a7b; border-radius:10px; padding:10px; background:#f0fdfa;">
        ... (Task1-6で確定した box 中身をそのまま) ...
    </div>

    <div class="att-date-bar">
        ... (既存) ...
```

- [ ] **Step 4: init配線を移設**

4-a. attendance分岐（2754-2758）に kbInit を独立追記:
```javascript
            if (btn.dataset.tab === 'attendance') {
                attLoad();
                // 長期休み一覧も再取得（再開予定日が更新されているかも）
                if (typeof absLoadLongTermList === 'function') absLoadLongTermList();
                try { kbInit(); } catch (e) { console.warn('kbox init skip', e); }   // 移設: box初期化を独立に後付け(attLoad連鎖に混ぜない)
            }
```
4-b. absence分岐（2761）から kbInit を撤去:
```javascript
            if (btn.dataset.tab === 'absence') { absRenderTodayList(); absRenderUpcomingList(); }
```

- [ ] **Step 5: 実行してPASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: 全PASS（`構造証明: 66 PASS / 0 FAIL`）。既存D1（kbox-section存在）・K群（datenav等）も維持。

- [ ] **Step 6: コミット**

```bash
git add scripts/test-genba-kesseki-box.js genba.html
git commit -m "feat(kbox): 欠席boxを出席予定タブ最上部へ移設+init配線移設(欠席登録タブ非依存・f774228回避維持)"
```

---

## Task 8: 全緑・非接触本数の最終確認 ＋ 版-25 繰り上げ（案A・commit止め）

**Files:**
- Read/確認のみ: `genba.html`
- Modify（bump-script経由・手編集しない）: `version.txt`, `genba.html`(shared.js?v=)

- [ ] **Step 1: 無回帰＋非接触本数を実測**

Run:
```bash
node scripts/test-genba-kesseki-box.js
echo "--- 非接触本数 ---"
grep -c "gnbGuardProdWrite" genba.html      # 期待: 11
grep -c "send_box_cm_mails" genba.html        # 期待: 1（メールゲート）
grep -c "kbGoDate" genba.html                 # 期待: 3
grep -oE 'kbExecuteSend|kbMarkPhoneDone' genba.html | sort | uniq -c
```
Expected: `core: 49 PASS / 0 FAIL` ＋ `構造証明: 66 PASS / 0 FAIL`、gnbGuardProdWrite=11、send_box_cm_mails=1、kbGoDate=3。ズレていれば停止して原因調査（非接触が崩れている）。

- [ ] **Step 2: push直前チェック（origin/master再前進していないか）**

Run:
```bash
git fetch origin master
git rev-parse --short origin/master
git rev-list --left-right --count origin/master...HEAD
```
Expected: origin/master が `b4fb9cf` のまま（0 behind）。前進していれば **bumpせず停止**し、再rebase＋版繰り上げ再提案（-26等）をクロ・社長へ。

- [ ] **Step 3: 版-25へ bump（案A・commit止め・pushしない）**

Run: `node scripts/bump-app-version.js 2026-07-04-25`
Expected: `版上げ完了（commitまで・push未実行）: 2026-07-04-24 -> 2026-07-04-25`。version.txt と genba.html の `shared.js?v=` が **-25 同期**・2行のみのbumpコミット生成。

- [ ] **Step 4: bump結果を一次確認（ツール出力を鵜呑みにしない）**

Run:
```bash
git show HEAD:version.txt
grep -oE 'shared\.js\?v=[0-9a-z-]+' genba.html | head -1
git show --stat HEAD | head -8
node scripts/test-genba-kesseki-box.js
```
Expected: version.txt=`2026-07-04-25`、shared.js?v=`2026-07-04-25`、bumpコミットは version.txt+genba.html の2ファイルのみ、テスト全緑。

- [ ] **Step 5: 停止（push禁止ゲート）**

**pushしない。** rebase結果・競合解決内容（今回は移設のみでpolish競合なし想定）・再緑・bump後diffをクロ/社長へ提示。push は「社長の手動2件OK＋push承認＋push直前の再前進チェック」が全部揃うまで禁止。実push時は `git push origin feat/genba-kbox-date-view:master`（FF push・`push origin master` のstale罠回避）→ `node scripts/bump-app-version.js --verify 2026-07-04-25` で本番反映ポーリング確認。

---

## Self-Review（プラン作成後の自己点検）

**1. Spec coverage:**
- §1 移設 → Task 7（DOM移設＋配線）＋ §1-3操作者 → Task 6 ✅
- §2 リネーム → Task 1 ✅
- §3 日付ピッカー → Task 5 ✅
- §4 AM/PM群 → Task 3（純関数）＋ Task 4（描画）✅
- §5 日付拡大 → Task 2 ✅
- §6 非接触 → Task 8 Step1 本数確認 ＋ 各Taskで既存テスト維持 ✅
- §7 TDD構造証明 → 各Taskのテスト追記（P/Q/O/L7/R/S/T/U群）✅
- §8 版-25 → Task 8 ✅

**2. Placeholder scan:** 各Stepに実コード/実コマンド/期待出力を記載。TBD/TODO無し。✅

**3. Type consistency:**
- `kbUnitGroup_`（Task3定義）→ Task4で `kbUnitGroup_(it.unit)` 使用。名称一致 ✅
- `kbRenderOperatorRow_`（Task6定義）→ kbInit/kbRenderから呼出。名称一致 ✅
- `kbCardHtml_`（Task4内ローカル）→ 同関数内で定義即使用 ✅
- `#kbox-datepicker`（Task5 HTML）→ `kbRenderChrome_`/構造証明で同id参照 ✅
- `#kbox-operator-select`（Task6 HTML）→ `kbRenderOperatorRow_`/構造証明で同id参照 ✅
- テスト群ラベル O/P/Q/R/S/T/U は既存 A-N と非衝突 ✅

---

**実行方式の選択待ち（下記本文で提示）。**
