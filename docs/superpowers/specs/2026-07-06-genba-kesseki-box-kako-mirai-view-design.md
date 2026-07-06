# 欠席連絡ボックス「過去＋未来ビュー」 design.md

- 作成: 2026-07-06（クロコ）
- 対象: `genba.html`「本日の欠席連絡ボックス」（kbox / `#kbox-section`）
- 正本基点: origin/master `b9a7671`（Phase 1 調査は全てこのSHAの genba.html / board GAS を実測）
- 進め方: この spec → 社長レビュー → writing-plans で実装計画 → TDD 着手（**本文書時点で実装は未着手**）

---

## 0. この設計の位置づけ（"新発見"ではない点を明記）

本設計の材料の一部は**新発見ではなく、既知の確認事項／積みタスクの回収**である。誤って
「今回はじめて見つけた」と扱わないため、位置づけを明記する。

| 項目 | 位置づけ | 実測での確認結果（2026-07-06） |
|---|---|---|
| `getUpcomingAbsences` の `month=YYYY-MM` 対応 | **既知**（2026-06-20 に生URLで5月分78〜94件返却を実測済み） | [コード.js:4371-4389](../../../gas/yawaragi-board/コード.js#L4371) で再確認。`month=`指定でその月1日〜月末を返す。GAS改修ゼロも当時と同一結論。 |
| 「別タブが月指定GETを既に使用」（genba 5953行） | **自作機能**（"外部の既存利用"ではない） | その別タブ＝**欠席履歴タブ (kesseki-history)** の `khLoad()`（genba [5952行](../../../genba.html#L5952)）と実測確定。6/20新設の自作タブ。 |
| 「過去日の連絡状況が赤に化ける」 | **2026-06-23 に根本原因特定済み**。morningDigest に「終わるまで方式」で積まれていた | 震源＝**出席予定タブ**の日別cmNotifiedバッジ。**その修正は既に着地・稼働中**（§4詳述）。本機能は"新規発見"ではなく既存基盤の再利用。 |

> 要点: 本機能は「未来／過去の欠席をボックスで覗ける」ことを足すもので、データ取得の仕組み
> （`month=` GET・月キャッシュ）は 2026-06-20/06-23 に確立済みのものを**再利用**する。

---

## 1. 背景と目的

「本日の欠席連絡ボックス」(kbox) は現在、`kbLoad()` 内で表示対象日を `jstTodayStr()` に固定し
（[genba.html:7384](../../../genba.html#L7384)）、`date === today` の通常欠席カードだけを描く
（[genba.html:7399](../../../genba.html#L7399)）。ケアマネから「来週水曜休む」等の連絡が来ても、
その日が来るまでボックスで確認できない。社長要望＝「未来の箱も先に覗きたい／過去も遡って見たい」。

**目的:** kbox に "表示対象日" の概念を入れ、①◀▶で隣の日へ、②未来の欠席日へチップでジャンプ、
③過去日も遡って閲覧、を可能にする。ただし**送信・電話済みの操作は当日限定**（前倒し送信を構造的に封じる）。

**非目的:** 月カレンダーのマス目は作らない。kbox は従来どおり「1日ぶんのカードを描く窓」のまま。

---

## 2. やること（3機能）

### 機能A：日付送り（◀ ▶）
- kbox 上部に `◀  📅 7/8(水)  ▶` の帯。中央に表示中の日付。
- ◀▶ で表示対象日を **±1日**（素直な1日移動。社長確定）。◀ は過去へも進める（下限は設けない＝データが尽きれば空箱）。
- 初期表示は**本日**（`jstTodayStr()`）。

### 機能B：この先お休みがある日 ジャンプ一覧
- kbox の帯の下に、**今日以降で欠席レコードがある日だけ**をチップ横並び。例: `7/8(水)・7/15(水)・7/24(金)`。
- チップタップ → その日を表示対象日にしてジャンプ描画。
- 欠席が無い日はチップに出さない。**未来方向のみ**（"この先お休み"の意味。過去チップは出さない）。
- 範囲＝今日〜30日ぶん（初期ロードで今月＋来月ぶんをカバー。社長確定「30日以内を全部チップ表示」）。上限・省略なし（通常そんなに多くならない＝YAGNI）。

### 機能C：未来日/過去日ガード（★安全の要・二重）
- 表示対象日が**本日でないとき**は「閲覧のみ」。
  1. **UI無効化**: 一括送信ボタン・送信対象チェックボックス・「電話済みにする」ボタンを disabled／グレーアウト。
  2. **帯表示**: kbox 上部に `👀 閲覧のみ（送信・電話記録は当日のみ）` を出す。
  3. **関数レベルガード（構造的封じ）**: `kbExecuteSend` / `kbMarkPhoneDone` の**先頭に「表示対象日≠今日なら即return」**を入れる。UI無効化はDOM改変ですり抜け得るが、関数ガードはすり抜け不能＝前倒し送信を構造的に防ぐ。
- 表示対象日が**本日のとき**だけ、従来どおり送信・電話済み操作が有効。

---

## 3. 既存3表示系との棲み分け（クロ指示§1・重複実装しない）

同じ「欠席」を扱う表示系が genba に3つある。実測で役割境界を確定した。**目的が別々なので共存が正しい。**

| 表示系 | 場所 | 対象日 | 何を映すか | 操作 | データ源 |
|---|---|---|---|---|---|
| **欠席登録タブの一覧** (`upcoming`) | tab-absence 内 | 今日以降（当日含む） | 欠席レコードのロースター（名前・日・理由・報告者） | 編集/取消への導線 | localStorage∪GAS merge・[genba.html:5711](../../../genba.html#L5711) |
| **欠席履歴タブ** (kesseki-history) | tab-kesseki-history | **昨日以前**（月別） | 過去の欠席一覧（名前・理由・報告者／午前午後2列） | **なし（閲覧専用）** | `absences&month=`・[genba.html:5924](../../../genba.html#L5924) |
| **欠席連絡ボックス** (kbox)【本機能】 | tab-absence 最上部 | 当日 → **本機能で任意日** | **ケアマネ連絡状況カード**（送信済/電話済・連絡手段mail/phone・宛先） | **送信・電話済み（当日のみ）** | `absences`（today〜+30）＋月キャッシュ | 

**棲み分けの根拠（重複ゼロ）:**
- 履歴タブは「**誰が休んだかの記録一覧**」。連絡状況（送信済/電話済）は一切映さず、操作ボタンも無い（[khRender](../../../genba.html#L5969) 実測: name/reason/reporter のみ）。
- kbox は「**ケアマネへの連絡状況と送信/電話操作**」。履歴タブが持たない連絡カードを1日単位で扱う。
- よって kbox が過去日に行けても、履歴タブと**映す情報が違う**（履歴＝一覧／kbox＝連絡状況カード・当日のみ操作可）。機能は重複しない。
- 既存の日付境界コメント（[5711](../../../genba.html#L5711)「登録タブ一覧＝今日以降」／[5973](../../../genba.html#L5973)「履歴＝昨日以前」）は**別要素（`upcoming`／履歴）を規律するもので、kbox には適用されない**。kbox はもともと当日固定の連絡箱であり、この一覧境界とは独立。

**結論:** どちらかに寄せる必要はない。3系統は別目的で共存する。kbox の過去ビューは履歴タブの再実装ではなく、履歴タブに無い「連絡状況カード」を任意日で見せるもの。

---

## 4. morningDigest「過去日連絡状況が赤化け」タスクとの関係（クロ指示§2）

**報告: このタスクの震源（出席予定タブの日別cmNotifiedバッジ）は 2026-06-23 に既に修正・着地しており、稼働中である。** 実測根拠:

- 出席予定タブは表示日ごとに連絡状況バッジを出す。その引き当ては [attLookupCmNotified](../../../genba.html#L6663)。
- 同関数は `_cachedGasAbsences`(today〜+30) **∪ `attMonthAbsCache[表示月]`** を参照（[6666-6669](../../../genba.html#L6666)）。
- `attMonthAbsCache` は [attEnsureMonthAbsences](../../../genba.html#L6511) が `absences&month=` で表示月を取得して埋める。コメント6378「**2026-06-23: 過去日の連絡状況バグ対策**」。月ナビ描画から配線済み（[6501](../../../genba.html#L6501)）。

→ **kbox の過去ビューは、この赤化けタスクを"新規にクローズ"するものではない**（震源は別タブで既に解決済み）。もし morningDigest 側の追跡が今も「未完」で残っているなら、それは**追跡の陳腐化**の可能性が高く、本機能とは独立に「実装済み＝クローズ」の棚卸しをすべき（本design のスコープ外・別途1行で朝報告に上げる）。

**逆に本機能が得るもの（再利用）:** kbox は過去/遠未来の取得に、この既存の `attEnsureMonthAbsences` ＋ `attMonthAbsCache` を**そのまま再利用**できる（§6）。新しい fetch 関数・新しいキャッシュを作らない＝2026-06-23 基盤の回収。

**完了条件への反映:** 「過去月を `month=` で取得し、過去日で送信済が緑（✅送信済）で出ること」を kbox 過去ビューの受け入れ条件に含める（§10）。ただし morningDigest タスクの正式クローズは別トラックとして扱い、本機能では「同一根に基づく回収」と位置づける。

**① 棚卸しは"実測確認後"にクローズ（クロ指示・推測でTODOを消さない）:**
morningDigest「赤化け」該当行のクローズは、**実測目視を根拠にのみ行う**。手順:
1. 出席予定タブで**過去日**を1件開き、送信済だった利用者のバッジが**✅緑（連絡済系）で出る**ことを目視確認。
2. その結果を根拠に morningDigest 該当行をクローズ。
- 実測で緑が出なければクローズしない（＝赤化けがまだ生きている＝別途修正）。**推測でクローズしない。**
- 棚卸しは**本実装とは別トラック**（kbox実装のブロッカーにしない）・**朝報告1行**で扱う。

---

## 5. スコープ

**やる:**
- kbox に `viewDate` 状態を追加し、`kbLoad(viewDate)` で任意日を描画。
- 過去/遠未来の月は **kbox 自身が `attEnsureMonthAbsences(viewDate, cb)` を呼んでロード保証**（②）、cb後に描画。
- 前進窓GETと月キャッシュを `kbMergeDedupAbs_` でマージ・dedup（前進窓GET正本）（④）。
- ◀▶ 日付送り／未来ジャンプチップ／閲覧のみ帯 の3 DOM要素を `#kbox-section` 内に増設。
- 機能C の二重ガード（UI無効化＋関数レベルガード）。
- 純関数 core 5種（`kbAddDaysYMD_`/`kbJstYmdFromEpoch_`/`kbUpcomingAbsenceDates_`/`kbMergeDedupAbs_`/`kbIsViewToday_`）の追加＋ node テスト（既存 `kbFilterTodayTargets_` 流用）。

**やらない（YAGNI／非接触）:**
- 月カレンダーのマス目（DOMを増やさない）。
- 30日超の未来チップ（データ地平線＝現状の today+30／過去は on-demand 月取得で対応）。
- morningDigest 追跡の正式クローズ処理（別トラック）。
- 出席予定タブ・履歴タブ・欠席登録タブ一覧のロジック変更。

---

## 6. データ設計（既存基盤の再利用・GAS非接触）

**原則: 前進データは従来どおり、過去/遠未来だけ既存の月キャッシュを再利用。回帰ゼロ。**

- **前進窓（today〜+30）**: kbox は従来どおり自前の bare `absences` JSONP（[kbJsonp_](../../../genba.html#L7358)）で取得。これが
  - 当日カード（従来）
  - 機能B ジャンプ一覧（今日以降の欠席日 distinct）
  の源。**挙動不変＝回帰ゼロ**。
- **前進窓の外（過去日・>30日未来）**: 表示対象日がこの窓に無い月のときは、**kbox 自身が [attEnsureMonthAbsences](../../../genba.html#L6511)(viewDate, cb) を呼んでロードを保証**し、コールバック後に [attMonthAbsCache](../../../genba.html#L6381)[ym] を読む。
  - これは 2026-06-23 に確立し出席予定タブで稼働中の月キャッシュ。`data.absences.absences`（＝通常欠席のみ・longTerm除外）を格納する形で、kbox が欲しい形と一致。
  - **新規の fetch 関数・キャッシュを作らない**（DRY・実績あり・低リスク）。
- **kbox が1日ぶんを取り出す統合ビュー**: `pool = 前進窓GET結果 ∪ attMonthAbsCache[viewDateの月]`（§後述のdedup）を作り、純関数 `kbFilterTodayTargets_(pool, viewDate)`（既存・日付引数を取る）で当該日に絞る。

**② 依存方向は kbox 起点（クロ指示・f774228型回避）:**
kbox は attMonthAbsCache を**受動的に読むだけにしない**。閲覧月について **kbox 自身が `attEnsureMonthAbsences(viewDate, cb)` を呼び、ロード完了（cb）を待ってから描画**する。
- 理由: 出席予定タブ未訪問のまま kbox 過去ビューを開くと `attMonthAbsCache` が空→過去日が出ない、が起きる。これは「他所で用意される前提への依存」＝**f774228型と同種の落とし穴**。ロードの起点を kbox 側に持たせて自己完結させる。
- キャッシュ本体（`attMonthAbsCache`）は共用でよい（二重取得しない設計＝ `attEnsureMonthAbsences` が取得済み月を再取得しない）。
- 実装形: `kbLoad(viewDate)` は「viewDateの月が前進窓でカバーされていなければ `attEnsureMonthAbsences(viewDate, () => kbRenderDay(viewDate))` を呼ぶ」。窓内なら従来どおり自前GET結果だけで即描画。
- 依存の明示: kbox が `attEnsureMonthAbsences` / `attMonthAbsCache`（出席予定タブ由来のグローバル）に依存する旨を両所コメントに残し、将来これらを改修する際は kbox 追従が要ると書く。

**④ 前進窓GET(today+30)と月キャッシュの継ぎ目（±30日境界）の扱い（クロ指示）:**
当月の一部（今日〜月末）は前進窓GET と `attMonthAbsCache[当月]` の**両方に同じ欠席レコードが入り得る**（overlap）。dedup 方針を固定する:
- **ジャンプ一覧（`kbUpcomingAbsenceDates_`）**: 入力＝両ソースのマージ配列。抽出は「**日付でdistinct**」（同一 `date` は1つに集約）。overlap する日は日付単位で自然に1つになるため、**正本の取り合いは発生しない**（値は日付文字列のみ）。null/空はガード。
- **カード描画の pool（`kbFilterTodayTargets_` へ渡す前）**: 同一 `(name, date, unit)` の重複レコードを排除。**正本＝前進窓GET（自前 `absences`）を優先**。理由: 送信・電話済み直後に `kbLoad()` が自前GETを再取得する経路が最も新しい `cmNotified` を持つため。月キャッシュ側は「自前GETに無い (name,date,unit)」だけを補完として足す。
- 実装形: マージ時に `key = name + '|' + date + '|' + unit` の Set で自前GET側を先に登録、月キャッシュ側は未登録キーのみ push。この dedup も純関数化してテスト対象にする（§9）。

**JST厳守:** 表示対象日・当日判定・±日は全て `jstTodayStr()` 系のJST固定ヘルパー基準。±日は `new Date(y, m-1, d±n)` のローカル構成子方式（既存 [4476](../../../genba.html#L4476)/[4690](../../../genba.html#L4690) と同型・UTCずれなし）で純関数化。

---

## 7. UI設計（DOM最小・#kbox-section 内・init非依存）

`#kbox-section`（[genba.html:1555](../../../genba.html#L1555)）内、`#kbox-list` の**上**に静的マークアップで3要素を増設する（＝ロード時からDOMに存在。kbRender が毎描画で配線）。

```
#kbox-section
├─ (既存) タイトル「📮 …連絡」＋❓使い方＋pendingバッジ
├─ [新] #kbox-datenav   : ◀(#kbox-prev)  📅 <span#kbox-datelabel>  ▶(#kbox-next)
├─ [新] #kbox-viewonly-banner : 👀 閲覧のみ（送信・電話記録は当日のみ）  ※既定 display:none
├─ [新] #kbox-jumpchips  : この先お休み: [7/8(水)][7/15(水)]…       ※空なら非表示
├─ (既存) #kbox-operator-note
├─ (既存) #kbox-list
└─ (既存) #kbox-send-btn
```

- タイトル「📮 本日の欠席連絡」は、表示日が本日でないとき「📮 7/8(水) の欠席連絡」等に切替（datelabelと役割分担でもよい。実装で最小に）。
- **init非依存（f774228型回避）**: 新要素は `#kbox-section` の存在ガード下でのみ [kbInit](../../../genba.html#L7351) 系から扱う。他のどの init も新idに依存させない。要素不在なら黙って何もしない。
- チップ・ボタンの onclick は既存の inline ハンドラ流儀に合わせ、`kbGoDate(delta)` / `kbJumpTo(ymd)` を呼ぶ薄い配線のみ。

---

## 8. 機能C ガードの二重化（詳細）

1. **UI層（kbRender 内）**: `const viewIsToday = kbIsViewToday_(kbState.viewDate, jstTodayStr());`
   - `viewIsToday === false` のとき: 送信対象チェックボックスに `disabled`、電話済みボタンに `disabled`＋`opacity`、送信ボタン `disabled`、`#kbox-viewonly-banner` を表示。
   - `true` のとき: 従来どおり（operator有無での既存活性制御はそのまま）。
2. **関数層（すり抜け不能）**: `kbExecuteSend` / `kbMarkPhoneDone` の**先頭**（既存 `gnbGuardProdWrite` originガードと並べて）に:
   ```js
   if (!kbIsViewToday_(kbState.viewDate, jstTodayStr())) { showToast('未来日/過去日は閲覧のみです（送信・電話記録は当日のみ）', 3000); return; }
   ```
   - 既存の originガード（9本目/10本目）は非接触のまま、その直後にこの当日ガードを足す（fetch より前）。

---

## 9. 純関数 core と TDD 計画

**core 追加**（[gas/yawaragi-board/kesseki-box-core.js](../../../gas/yawaragi-board/kesseki-box-core.js)・GAS/node両用・SpreadsheetApp非依存）:

| 関数 | 仕様 |
|---|---|
| `kbAddDaysYMD_(ymd, delta)` | `'yyyy-mm-dd'` を delta 日ずらして `'yyyy-mm-dd'` を返す。月/年境界跨ぎ対応。ローカル構成子方式でUTCずれなし。 |
| `kbJstYmdFromEpoch_(epochMs)` | 与えた epoch(ms) の **JST(Asia/Tokyo, UTC+9) カレンダー日**を `'yyyy-mm-dd'` で返す（③ 当日判定のJST正本・時刻を引数化して境界テスト可能に）。genba の `jstTodayStr()`（Intl+Asia/Tokyo）と同一結果を返す実装とし、kbox の当日判定はこの経路＝JST固定を厳守。 |
| `kbUpcomingAbsenceDates_(absList, todayYMD)` | absList から `!isLongTerm && date >= today` の date を **distinct・昇順**で返す（機能Bジャンプ一覧）。入力は前進窓GET∪月キャッシュのマージ配列。 |
| `kbMergeDedupAbs_(primaryList, secondaryList)` | 2ソースをマージし `key=name\|date\|unit` で dedup。**primary（前進窓GET）を正本**とし、secondary（月キャッシュ）は未登録キーのみ補完（④ 継ぎ目の正本）。 |
| `kbIsViewToday_(viewYMD, todayYMD)` | 文字列厳密一致（機能Cガード）。両引数ともJST基準の `'yyyy-mm-dd'` を渡す前提。 |
| （再利用）`kbFilterTodayTargets_(absList, ymd)` | 既存。日付引数を取るので機能Aにそのまま流用。dedup後の pool を渡す。 |

**node テスト追加**（[scripts/test-genba-kesseki-box.js](../../../scripts/test-genba-kesseki-box.js) に追記・既存ハーネス踏襲）:
- `kbAddDaysYMD_`: `+1`で月跨ぎ(2026-07-31→2026-08-01)／`-1`で月跨ぎ(2026-07-01→2026-06-30)／`0`同日／年跨ぎ(2025-12-31→2026-01-01)。
- **`kbJstYmdFromEpoch_`（③ JST境界・必須）**:
  - **深夜23:30 JST**＝2026-07-06 23:30 JST（=2026-07-06 14:30 UTC）→ `'2026-07-06'`。
  - **早朝4:30 JST**＝2026-07-07 04:30 JST（=2026-07-06 19:30 UTC）→ `'2026-07-07'`（★当日。UTC素朴判定なら'2026-07-06'に化ける＝始業4:30〜5:00に当日なのに送信ガードが効く事故。これを弾く回帰テスト）。
  - 正午 2026-07-06 12:00 JST → `'2026-07-06'`。
  - 理由: 社長の始業4:30〜5:00。当日判定がUTCだと早朝が前日扱い→当日なのに送れない。
- `kbUpcomingAbsenceDates_`: distinct＋昇順／過去日除外／longTerm除外／当日含む／空入力で空配列／**overlap日（前進窓と月キャッシュの両方に同一date）が1つに集約**。
- **`kbMergeDedupAbs_`（④ 継ぎ目・必須）**: 同一(name,date,unit)がprimary/secondary両方 → primary(前進窓GET)が残る／primaryに無いsecondaryレコードは補完される／どちらか空/nullで落ちない。
- `kbIsViewToday_`: 一致true／不一致false。
- `kbFilterTodayTargets_`: **未来日**を渡してその日のみ返る（既存はtodayケースのみ→未来ケース追加）／**過去日**ケースも追加。

**genba.html 構造証明テスト追加**（同ファイルの extractFn パターン）:
- `#kbox-datenav` / `#kbox-prev` / `#kbox-next` / `#kbox-datelabel` / `#kbox-viewonly-banner` / `#kbox-jumpchips` が存在。
- `kbExecuteSend` 内に `kbIsViewToday_` ガードが `fetch` より前に在る（＋既存 `gnbGuardProdWrite` も維持）。
- `kbMarkPhoneDone` も同様。
- `kbState` に `viewDate` 宣言が在る。
- 既存 D群/E群（originガード・急ぎトグル）が緑のまま（無回帰）。

**TDDの順序:** core関数のテストを先に書いてRED → core実装でGREEN → genba構造証明テストをRED → genba配線でGREEN → 全体リグレッション。

---

## 10. 完了条件

- [ ] ◀▶で隣の日のkboxが見られる（初期＝本日）。
- [ ] 「この先お休みがある日」チップで未来日にジャンプできる（欠席がある未来日だけ・空の日は出ない）。
- [ ] 過去日も遡って閲覧でき、**過去日で送信済が✅緑で出る**（`month=`取得＋既存月キャッシュ再利用が効いている確認）。
- [ ] 未来日/過去日は閲覧のみ（送信・チェック・電話済みが無効・帯表示あり）。
- [ ] 本日は従来どおり送信・電話済みが動く（当日の一括送信・電話済み無回帰）。
- [ ] 月グリッドを作っていない（増やしたDOMは日付帯・帯・チップ行の3要素のみ）。
- [ ] 新id依存を init 連鎖に作っていない（f774228型でない）。
- [ ] カレンダーピッカー・①originガード・②改名・メールゲート 非接触（テスト全緑）。
- [ ] JSTずれなし（±日・当日判定が全JST基準）。**23:30 JST／4:30 JST の境界テストがPASS**（早朝が前日扱いに化けない）。
- [ ] 過去/遠未来を開くとき kbox 自身が `attEnsureMonthAbsences` を呼び、出席予定タブ未訪問でも過去日が出る（②）。
- [ ] 前進窓と月キャッシュのoverlap日が二重カード/二重チップにならない（④ dedup）。
- [ ] core node テスト＋genba構造証明テスト 全PASS。
- [ ] テスト行で当日送信の実送信確認（社長Gmail宛）→掃除まで。
- [ ] 非接触diff証明・SHA。
- [ ] （別トラック・朝報告1行）morningDigest「赤化け」追跡の棚卸し。**出席予定タブで過去日1件を開き送信済が✅緑で出ることを目視確認した結果を根拠にのみ**該当行をクローズ（①・推測でクローズしない・kbox実装のブロッカーにしない）。

---

## 11. 版ゲート手順（リリース時・genbaは版ゲート対象）

1. `node scripts/bump-app-version.js <新版>` で genba のバージョンを上げる（version.txt と `shared.js?v=` を同一コミットで同時更新・手編集禁止）。
2. **push前に停止して社長承認。** 本番 push は社長OKのうえ手動で `git push origin master`（正しくは FF push `<branch>:master`／bump案内の "push origin master" はローカルmaster stale罠に注意）。
3. deploy後 `node scripts/bump-app-version.js --verify <版>` ＋ 三点verify（SHA一致／本番HTMLに版ゲート含有／本番version.txt値）。GitHub Pages一時障害時は verify 時間切れを成功扱いにせず本番 version.txt 直ポーリング。

---

## 12. リスク・トレードオフ

| 論点 | 決定 | 理由 |
|---|---|---|
| 過去データ取得 | 既存 `attEnsureMonthAbsences`/`attMonthAbsCache` を再利用 | 新規fetch/キャッシュを作らない・2026-06-23実績・DRY。代償＝出席予定タブのグローバルへ依存（同一ファイル・コメントで明示）。 |
| キャッシュ依存方向（②） | **ロード起点を kbox 側に持つ**（kbox が `attEnsureMonthAbsences` を呼ぶ） | 受動的に読むだけだと出席予定タブ未訪問→過去空。f774228型（他所依存）を回避し自己完結。 |
| 当日判定のJST（③） | `kbJstYmdFromEpoch_` で時刻引数化・23:30/4:30境界テスト必須 | 始業4:30〜5:00。UTC判定だと早朝が前日化→当日なのに送信ガードが効く事故を構造的に排除。 |
| 継ぎ目dedup（④） | 日付distinct（チップ）＋(name,date,unit)dedup・**前進窓GETが正本**（カード） | overlap日の二重表示防止。自前GETが送信直後の最新cmNotifiedを持つため正本にする。 |
| 前倒し送信防止 | UI無効化＋**関数レベル当日ガード**の二重 | UI無効化のみはDOM改変ですり抜け得る。関数ガードで構造的に封じる（指示書§1機能Cの核心）。 |
| 未来チップ範囲 | today+30 まで | データ地平線。数ヶ月先は現状範囲外（将来 month拡張の余地・今回YAGNI）。 |
| ◀ 過去下限 | 下限なし（on-demand月取得） | 社長「過去も見たい」。データが尽きれば空箱＝実害なし。 |
| 履歴タブとの関係 | 共存（統合しない） | 目的が別（一覧 vs 連絡状況カード）・§3で重複ゼロを確認。 |

---

## 13. 次のアクション

1. 社長がこの spec をレビュー。
2. 承認後、writing-plans スキルで実装計画（タスク分解・TDDステップ）を作成。
3. master 基点の新ブランチ（例 `feat/genba-kbox-date-view`）で TDD 実装。
   - ⚠️ 現在の作業ツリーは stale ブランチ `fix/before-planstart-guard`（master比124遅れ）。実装は必ず fresh master 基点で行う。
4. 本 design.md の master 反映は docs-only ポリシー（隔離WTで cherry-pick → FF push → 中身突合）で処理。
