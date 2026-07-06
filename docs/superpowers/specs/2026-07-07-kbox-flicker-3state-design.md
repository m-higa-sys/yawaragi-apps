# 欠席box ちらつきバグ修正 設計書（3状態モデルの-25再統合）

- 日付: 2026-07-07
- ブランチ: fix/kbox-flicker-3state（隔離WT: C:/tmp/wt-kbox-flicker・基点 origin/master fc7cc93 = 版-25）
- 対象: genba.html / gas/yawaragi-board/kesseki-box-core.js / テスト（フロントのみ・**GAS本体非接触**）
- Phase1原因確定: 未取得/失敗/空応答/timeout を `[]` に潰し「0件＝欠席なし」と即断 → "○○の欠席はありません🎉" 先出し → 後入れちらつき。**連絡漏れ直結の重大表示バグ**。

---

## 0. 実コード接地（-25の現状・調査済み）

| 要素 | 現状（-25・genba.html/core） | 問題 |
|---|---|---|
| `kbState`（genba 7361） | `{ items, checked, methodMap, methodLoaded, viewDate, forward, _ensuringYm }` | **ロード成否フラグなし**（loadedOnce/forwardOk 不在） |
| `kbLoad`（genba 7447） | `kbState.forward = (aj && aj.absences && aj.absences.absences) \|\| []` | **null/失敗/timeout/空応答を全部 `[]` に潰す** |
| `kbRenderForDate`（7475） | 月未キャッシュ→`attEnsureMonthAbsences`→cb→`kbRenderDayNow_`／else即`kbRenderDayNow_` | 月GET失敗時 `attMonthAbsCache[ym]=arr\|\|[]`（GAS 6542）で**月源も失敗を0に潰す** |
| `kbRenderDayNow_`（7492） | `pool = kbMergeDedupAbs_(forward, attMonthAbsCache[ym])` → `kbFilterTodayTargets_(pool, viewDate)` → items | pool空=失敗も0件も同じ |
| `kbRender`（7539） | `if (!kbState.items.length) { … 'の欠席はありません 🎉' }`（7553） | **ロード成否を問わず items空で"欠席なし"描画** |
| core.js | `kbIsOkResponse_`/`kbDecideLoad_` **無し**（flicker修正は本番未搭載） | 3状態判定の土台がない |

**GET経路（-25）**：
- **forward GET**：`kbJsonp_('absences')`（month引数なし・today〜+30窓）→ **当日カードの正本源**。今回の症状の主因経路。
- **月GET（補完）**：`attEnsureMonthAbsences(viewDate, cb)` → `attMonthAbsCache[ym]`（過去/未来日ビューの源・attendanceタブと共有・冪等）。

---

## 1. 方式：flicker設計を-25構造へ再統合（cherry-pickしない）

flicker（`fix/kesseki-box-flicker` 973041a・-20時代）は**同一根本原因を解決済み**だが、-25の構造改修（kbRenderForDate/kbRenderDayNow_/forward/viewDate/AM-PM群 導入）で**genba差分は流用不可**。よって:

### 1-1. 移植する（構造非依存資産・そのまま/微修正で再利用）
- **core純関数**（`gas/yawaragi-board/kesseki-box-core.js` に追加＋export）:
  - `kbIsOkResponse_(resp)` = `!!(resp && resp.absences && Array.isArray(resp.absences.absences))` … **構造の整った成功（0件含む）か vs null/欠落（失敗/timeout）** を区別。
  - `kbDecideLoad_(resp, todayYMD, firstLoad)` … `{outcome}` を返す純関数（preserve/errored/empty/list）。**forward GET経路の判定に使用**。
  - ※flickerの `kbFilterTodayTargets_(absList, ymd)` は-25 core に同一シグネチャで既存 → そのまま流用。
- **G群/H群テスト**（core純関数の4状態網羅・kbLoadガードの構造証明）→ -25 core向けに移植。
- **実測ハーネス** `verify-kesseki-box-flicker.js` → **-25版に書き直し**（§5）。名前は `scripts/verify-kbox-flicker-3state.js`。

### 1-2. 書き直す（-25構造に合わせて再実装）
- `kbState` に **`loadedOnce`（成功表示到達）＋`forwardOk`（直近forward GETが成功）** を追加。
- `kbLoad`：forward GET を `kbJsonpRetry_`（retry+backoff）で取得 → `kbIsOkResponseInline_` で判定 → **成功時のみ forward 上書き**・失敗/空は forward を**触らない**。
- `kbRenderForDate`/`kbRenderDayNow_`/`kbRender`：**"欠席なし" を出す条件を「その表示日のデータがロード成功確定」に限定**（§3）。
- `kbIsOkResponseInline_` / `kbJsonpRetry_` をインライン追加（core と同一ロジック・両所保証）。

---

## 2. 3状態モデル（必須）と状態遷移

**3状態**：`未取得/失敗/timeout/空応答（＝!ok）` / `成功0件` / `成功N件`。

```
forward GET (kbJsonpRetry_ 3回・バックオフ) の結果
        │
        ├─ !kbIsOkResponse_ (null/構造欠落/全retry失敗)
        │       ├─ loadedOnce=false（初回）→ outcome=errored：
        │       │      #kbox-list = 「サーバーから取得できませんでした…」（❌"欠席なし"は出さない）
        │       └─ loadedOnce=true（既に表示あり）→ outcome=preserve：
        │              forwardを上書きしない → 既存itemsのまま再描画（❌"欠席なし"を出さない・ちらつかない）
        │
        └─ kbIsOkResponse_ (構造の整った成功)
                forward = resp.absences.absences（上書きOK）・forwardOk=true・loadedOnce=true
                kbFilterTodayTargets_(pool, viewDate).length
                        ├─ 0 → outcome=empty：✅"○○の欠席はありません🎉"（← 唯一これを出してよい）
                        └─ N → outcome=list：✅ AM/PM群でカード描画
```

**不変条件（最重要）**：`forward GET が !ok の間（失敗/timeout/空応答）は "欠席なし" を絶対に描画しない`。初回はローディング/失敗メッセージ、2回目以降は既存表示を保持。→ ここがすり抜けると連絡漏れ再発。

---

## 3. GET経路別の判定（当日源=forward・月キャッシュ=補完）

`kbRender` の "欠席なし" 分岐を、**表示日データがロード成功確定か**でゲートする純関数を新設:

```
kbViewLoaded_(viewDate, todayYMD, forwardOk, monthLoaded)
  = (viewDate === todayYMD) ? forwardOk : monthLoaded
```
- **当日（viewDate=today）**：`forwardOk`（forward GETが成功）を軸に判定。← 症状の主経路・連絡漏れ直結。
- **非当日（過去/未来・閲覧のみ）**：`monthLoaded = !!attMonthAbsCache[ym]`（月GET完了）で判定。補完源。

`kbRender` の分岐（改修後の意味）:
```
if (items.length)            → list（カード）
else if (kbViewLoaded_(…))   → empty（"欠席なし🎉"）  ← ロード成功確定のときだけ
else                         → loading（"読み込み中…"）  ← 未確定は欠席なしを出さない
```
- これで **どの呼び出し経路（kbLoad/kbGoDate/kbJumpTo/picker）でも** "欠席なし" が成功確定前に出ない（構造的封じ）。
- 非当日の月GET失敗（`attMonthAbsCache[ym]` が `[]` に潰れる GAS 6542 の件）は**閲覧のみ＝連絡漏れ非該当**のため今回スコープ外（補完源・別途）。ただし当日は forward 軸なので影響なし。gateはあくまで forward の ok を主軸（指示どおり）。

---

## 4. 具体設計（-25 genba.html）

### 4-1. kbState（追加）
```js
let kbState = { items: [], checked: {}, methodMap: {}, methodLoaded: false,
                viewDate: '', forward: [], _ensuringYm: '',
                loadedOnce: false, forwardOk: false };   // ← 追加
```

### 4-2. インライン純関数（core と同一・両所保証）
```js
function kbIsOkResponseInline_(resp) { return !!(resp && resp.absences && Array.isArray(resp.absences.absences)); }
function kbViewLoadedInline_(viewDate, todayYMD, forwardOk, monthLoaded) {
    return String(viewDate) === String(todayYMD) ? !!forwardOk : !!monthLoaded;
}
async function kbJsonpRetry_(action, idSuffix, tries) {
    tries = tries || 3;
    for (let i = 0; i < tries; i++) {
        const r = await kbJsonp_(action, idSuffix + (i ? '_r' + i : ''));
        if (kbIsOkResponseInline_(r)) return r;           // 構造の整った成功で確定
        if (r && action !== 'absences') return r;         // 非absences（method等）は従来どおり
        if (i < tries - 1) await new Promise(res => setTimeout(res, 800 * (i + 1)));
    }
    return null;                                          // 全retry失敗＝!ok
}
```

### 4-3. kbLoad（3状態化）
```js
async function kbLoad() {
    const listEl = document.getElementById('kbox-list');
    if (!listEl) return;
    if (!kbState.loadedOnce) listEl.innerHTML = '<div style="color:#888;">読み込み中…</div>';  // 初回のみ
    if (!kbState.viewDate) kbState.viewDate = jstTodayStr();

    const aj = await kbJsonpRetry_('absences', 'abs', 3);
    if (!kbIsOkResponseInline_(aj)) {                     // 失敗/timeout/空応答
        kbState.forwardOk = false;                       // forwardは触らない
        if (kbState.loadedOnce) { kbRenderForDate(kbState.viewDate); return; }  // preserve（既存維持・欠席なし出さない）
        listEl.innerHTML = '<div style="color:#c0392b;">サーバーから取得できませんでした。通信環境を確認して開き直してください。</div>';
        return;                                          // 初回失敗（欠席なしを出さない）
    }
    kbState.forward = aj.absences.absences || [];        // 成功時のみ上書き
    kbState.forwardOk = true;
    if (!kbState.methodLoaded) { const mj = await kbJsonp_('cm_method_audit','method'); const a=(mj&&mj.audit)||null; if(a){a.forEach(x=>{kbState.methodMap[x.userName]=x;}); kbState.methodLoaded=true;} }
    if (!absCmEmailMap || !Object.keys(absCmEmailMap).length) { try { absCmEmailMap = await absLoadCmEmailMap(); } catch(e){} }
    kbState.loadedOnce = true;
    kbRenderForDate(kbState.viewDate);
}
```
（当日ガードN群・originガード・メールゲートは非接触。kbLoadは取得と描画振り分けのみ。）

### 4-4. kbRender（"欠席なし" ゲート）
```js
// 既存: const _viewDate/_today/_viewIsToday を算出（不変）
const _monthLoaded = !!attMonthAbsCache[String(_viewDate).slice(0,7)];
const _loaded = kbViewLoadedInline_(_viewDate, _today, kbState.forwardOk, _monthLoaded);
if (!kbState.items.length) {
    if (_loaded) {
        listEl.innerHTML = '…の欠席はありません 🎉';    // 成功確定 かつ 0件のときだけ（既存文言）
    } else {
        listEl.innerHTML = '<div style="color:#888;">読み込み中…</div>';  // 未確定は欠席なしを出さない
    }
    kbUpdateBadge(); …（送信ボタン制御は既存維持）
    return;
}
```
（kbRenderChrome_/AM-PM群/操作者行/日付ピッカー同期 は不変。）

---

## 5. 実測ハーネス（★最重要の完了条件・-25版）

`scripts/verify-kbox-flicker-3state.js`：genba.html から**実コード**を抽出し、DOMスタブ＋即時setTimeoutで**実駆動**し `#kbox-list` を実測（flickerの13PASS相当を-25で再現）。

- 抽出（-25の実関数）：`kbState`(let)・`kbIsOkResponseInline_`・`kbViewLoadedInline_`・`kbJsonpRetry_`・`kbLoad`・`kbRenderForDate`・`kbRenderDayNow_`・`kbRenderChrome_`・`kbRender`・`kbRenderOperatorRow_`・`kbUpdateBadge`・`kbMergeDedupAbs_`・`kbFilterTodayTargets_`・`kbUnitGroup_`・`kbClassifyCardInline_`・`kbIsDoneInline_`・`kbEsc_`・`kbFmtChip_`・`kbUpcomingAbsenceDates_`・`kbAddDaysYMD_`・`kbIsViewToday_`。
- スタブ（外部依存のみ差替）：`kbJsonp_`（scripted）・`jstTodayStr`（固定）・`attMonthAbsCache`（obj）・`attEnsureMonthAbsences`（scripted: cb内でcache設定）・`absReceptionist`・`absCmEmailMap`・`absLoadCmEmailMap`・`getStaff`/`EXCLUDED_STAFF`。
- DOM els：`kbox-list`/`kbox-operator-note`/`kbox-pending-badge`/`kbox-send-btn`/`kbox-section`/`kbox-datelabel`/`kbox-viewonly-banner`/`kbox-jumpchips`/`kbox-datepicker`/`kbox-operator-select`。

**シナリオ（4状態＋回帰）**：
- A（同一セッション・放置復帰）: 成功N → 失敗(null) → 空応答({}) → 成功0。
  - A1 成功N→当日カード表示／A2 明日は本日boxに出さない
  - **A5/A6 失敗復帰→欠席者が消えない＋"欠席なし"を出さない（★最重点）**
  - **A7/A8 空応答→同上**
  - A9/A10 成功0→**このときだけ**"欠席なし🎉"・前の欠席者は消える
- B（初回×失敗）: **B1 失敗メッセージ／B2 "欠席なし"を誤表示しない（★）**
- C（初回×成功0）: C1 正しく"欠席なし🎉"
- D（forward成功・月GET経由の当日）: 当日カードがforward源で出る（月GET失敗でも当日は消えない＝forward軸ゲート実証）
- E（回帰・-25機能デグレなし）: kbGoDate(±1)で日付移動・kbJumpToで任意日・AM/PM群見出し・操作者行・当日ガード（未来日で送信不可）が生存。

**合格条件**：ハーネス全PASS＋既存 `scripts/test-genba-kesseki-box.js`（core49/構造69）全緑維持＋新規 core G/H群・構造証明（kbLoadガード・kbState.forwardOk/loadedOnce・kbViewLoadedInline_）追加も全緑。

---

## 6. 非接触（デグレゼロ・削除ゼロ）
- カレンダー式ピッカー（欠席登録）／メールゲート `send_box_cm_mails`／originガード `gnbGuardProdWrite`（×11）／当日ガード `kbIsViewToday_`・N群（kbExecuteSend/kbMarkPhoneDone）は**非接触**。
- 私の-25機能（日付送り◀▶・日付ピッカー・チップ・AM/PM群・操作者行・欠席者なし明示）**デグレなし**（ハーネスE群＋既存69で固定）。
- GAS本体（コード.js）**非接触**。フロントのみ。

---

## 7. 版ゲート・ブランチ運用
- 全緑後、-25土台に `node scripts/bump-app-version.js <次版>`（案A commit止め）→ 停止 → プレビュー再提示 → 社長目視 → push承認 → **push直前 再前進チェック** → FF push（`fix/kbox-flicker-3state:master`）→ `--verify` 三点verify。
- 完了後、**旧 `fix/kesseki-box-flicker` は退役**（WT `C:/tmp/wt-kesseki-box` 撤去・ブランチ削除・生き作業ゼロ実測後）。二重実装を残さない。

---

## 8. 実装順（承認後・writing-plans→TDD）
1. core に `kbIsOkResponse_`/`kbDecideLoad_` 追加＋export（RED→GREEN・G群）。
2. genba インライン純関数（`kbIsOkResponseInline_`/`kbViewLoadedInline_`/`kbJsonpRetry_`）追加（構造証明）。
3. `kbState` に loadedOnce/forwardOk 追加。
4. `kbLoad` 3状態化（retry+ok判定+preserve）。
5. `kbRender` "欠席なし" ゲート（kbViewLoadedInline_）。
6. 実測ハーネス `verify-kbox-flicker-3state.js` 新設（A〜E・★不変条件）。
7. 既存69＋新規 全緑・非接触本数確認 → bump → 停止。

**← ここまでが spec。実装には入らず、本design.mdをレビュー承認後に writing-plans へ。**
