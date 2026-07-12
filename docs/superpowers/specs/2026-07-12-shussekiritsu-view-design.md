# 出席率・利用頻度ビュー（要介護・常設）設計書

- 日付: 2026-07-12
- ブランチ: `feat/attendance-view`（origin/master 起点）
- 前提調査: 同日「出席率の土台データ検証」（dailyOps＝実来館の網羅的正本／欠席登録漏れ0.34％／4月ops無し）を根拠にする

## 1. 目的

週1回・要介護・高出席率の利用者を見つけて「週2回」を提案するための**営業ビュー**。併せて契約週N回に対する実績週N.N回の乖離を可視化する。社長が毎月自分で見られる**常設アプリ**（1回限りのレポートではない）。

配信: 新規 `出席率.html`（repo・github.io・版ゲート・portal登録）。バックエンドは board GAS の**新action `attendance_view`（既存action非改変・追加のみ）**。

## 2. データの正本（検証済み）

| データ | 正本 | 取得 | 注意 |
|---|---|---|---|
| 実来館 | **dailyOps**（出勤送迎表GAS `?action=getOps`） | UrlFetch | **2026-05以降のみ保持・4月は無い**。毎稼働日に全員（欠席者含む名簿・約33.5人/日）を記録＝網羅的 |
| 欠席登録 | 出欠変更シート | 既存関数 | 漏れ0.34%だが**正本はdailyOps**とする |
| 契約週N | 利用者台帳 `利用曜日` の曜日数 | getUserPatterns | 午前午後は回数に足さない |
| 介護度 | 利用者台帳 `介護度` | getUserPatterns.care | 要介護のみ対象 |
| 時間帯 | 利用者台帳 `午前/午後` | getUserPatterns.unit | 増回の空き枠マッチに使用 |

**住所・TEL・医療情報は取得も返却もしない。** 利用者名は現場が日常的に扱うため鍵なしでよい。

## 3. アーキテクチャ

```
出席率.html (github.io・版ゲート・portal登録)
   │ GET attendance_view（鍵なし・1回）
   ▼
board GAS  attendance_view(e)   ← 新規・薄いラッパ
   ├ _muFetchDailyOps系 …getOps(UrlFetch)で dailyOps 全取得→窓月に絞る
   ├ getUserPatterns(ss,false) …name/days/care/unit（非中止のみ）
   ├ getOnLongLeaveSet(ss,today) …長期休み中
   ├ getWeekdayChangeUsersSince(ss,窓開始) …曜日変更あり
   └ 利用者台帳 利用開始日 …新規（判定中）判定
   ▼ attendance-view-core.js（純関数・TDD）が全計算
   ▼ 要介護のみの完成行 + 基準線 + 空き枠 を返す
   ▼
HTML は 並べ替え と 描画 だけ（計算はしない）
```

**新規ファイル2つ**:
- `gas/yawaragi-board/attendance-view-core.js` … 純関数（素node `scripts/test-attendance-view-core.js`）
- `出席率.html` … 描画専用フロント

**GAS本体への追記**: `attendance_view(e)` 関数 ＋ doGet 分岐1行 のみ。既存action・シート構造は非改変。

## 4. 集計窓・指標定義（確定）

- **集計窓 = 直近完了3ヶ月 ∩ opsあり月**。＝ `displayMonths（下記ローリング3ヶ月）` のうち dailyOps に稼働日が存在する月だけを率計算に使う。今日=2026-07-12 → displayMonths=[4,5,6]、ops有=[5,6] → **集計窓=2026-05+2026-06**（当月7月は月途中so displayMonths外・4月はops無しで窓外）。窓は毎月自動で進み、常に最大3ヶ月・opsのある月だけを採用（無限に増えない）。
- **出席率（正本）** = Σ実来館 ÷ Σ契約予定稼働日（窓内）。稼働日＝dailyOpsにキーがあり roster>0 の日。
  - 実来館 = その利用者が am/pm いずれかの `users` に載り、`userStatus` が `absent`/`longabsent` でない日。
- **実績 週N.N** = 契約N × 出席率（＝ attended×N ÷ scheduled）。部分週・祝日で分母がブレない補正済み定義。
- **乖離** = 契約N − 実績N.N。
- **月別推移 = 直近完了3ヶ月ローリング**（今 = 4/5/6月）。**4月は「—」（データなし）を明示**。5・6月は各月のops率(%)。「—」を推測で埋めない。
- **基準線 = 要介護の平均実来館率** = Σ(要介護·normal のattended) ÷ Σ(要介護·normal のscheduled)（＝実測重み付き率）。除外群（下記）は分母から外す。「85%を悪いと誤読させない」基準。

## 5. 表示状態マシン（★修正反映：approx と no-data を分離）

各 要介護利用者に1つの `displayState` を割り当てる。**優先順（上が勝つ）**:

| 優先 | 状態 | 判定源 | 率・実績・乖離 | 月別 | 基準線分母 | 増回候補 | ラベル |
|---|---|---|---|---|---|---|---|
| 1 | `chouki`（長期休み中） | getOnLongLeaveSet | 出さない | — | 外 | 外 | **算出不可** |
| 2 | `hanteichu`（新規・判定中） | 利用開始日 ≥ today−3ヶ月 | **出さない（数字がまだ無い）** | — | 外 | 外 | **判定中（データ蓄積中）** |
| 3 | `sanko`（曜日変更あり） | getWeekdayChangeUsersSince（窓内） | **出す（数字は不正確）** | 出す | 外 | 外 | **参考値（率が不正確）** |
| 4 | `normal` | 上記いずれも非該当 | 出す | 出す | 入 | 週1回なら候補 | （なし） |

**設計意図（社長指示）**: `hanteichu`(新規)と`sanko`(曜日変更)を同一ラベルにしない。前者は「まだ数字が無いだけ」＝**利用開始から3ヶ月経過で自動的に `normal` へ復帰**（率を出す）。後者は「数字はあるが信用度が低い」＝数字を出しつつ不正確と明示。同じラベルだと新規者を「怪しい数字の人」と誤解して候補から外し続けるのを防ぐ。

- `hanteichu` の閾値 = **利用開始日が today の3ヶ月前より新しい**（例: today=2026-07-12 なら利用開始 > 2026-04-12 が判定中）。3ヶ月経過で自動復帰。
- `sanko` は率を出すが基準線・増回候補からは外す（旧曜日混在で率が不正確なため）。

## 6. 空き枠（★台帳契約ベース＝週間予定表と一致）

**社長確定の理由**: 空き枠は「契約を入れられる椅子の数」であり「その日空いている席」ではない。dailyOps実況ベースだと当日欠席者の席まで空きに数え**ダブルブッキング**になる。かつ週間予定表・経営ダッシュボードと数字が食い違う（同じ数字が3箇所で違う）。**空き枠の正本は台帳ベース1つに統一**。

- 定員 = **18/単位**（AM18・PM18）。
- 占有[曜日][AM/PM] = **全在籍（非中止・要介護＋要支援すべて。椅子は共有）** の `days × unit` を**曜日別ampmパース**で数える。
  - 曜日別ampmパース = 複合 `"月午前、木午後"` を曜日ごとに正しい時間帯へ振る（**宮さん幽霊の再発防止**）。単純 `unit="午前"`＋`days="火木"` は 火AM・木AM に振る。`unit="午前午後"` はその曜日の AM と PM 両方に1ずつ計上。
- 空き枠[曜日][AM/PM] = max(0, 18 − 占有)。
- **追加できる空き枠**（増回候補の行に表示） = その候補の unit を保ったまま、月〜金（**現曜日を除く**）で空き>0 の枠。例「水AMのみ利用 → 月AM / 火AM / 金AM に追加可能」。unit=午前午後 の候補は AM枠・PM枠 の両方から空きを拾う。

## 7. 並べ替え（HTML側・既定＝増回候補）

1. **増回候補が上**（既定）: `normal` かつ 契約週1回 を上位に、その中で出席率高い順。増回候補以外はその下。
2. 乖離の大きい順（`normal`＋`sanko` を乖離降順・`hanteichu`/`chouki`は末尾）。
3. 出席率の低い順（率のある行のみ・無い行は末尾）。

増回候補行に「追加できる空き枠」バッジを表示。

## 8. attendance_view のレスポンス形（データ契約）

```
{
  success: true,
  generatedAt: 'YYYY-MM-DD HH:mm',
  today: 'YYYY-MM-DD',
  window: { months: ['2026-05','2026-06'], note: '4月はdailyOps未保持のため対象外' },
  displayMonths: ['2026-04','2026-05','2026-06'],   // 月別推移の列（ローリング3ヶ月）
  kaigoAvgRate: 87.3,                                // 要介護·normal の平均実来館率(%)
  slotsFree: { '月': {am:1,pm:1}, '火': {am:1,pm:2}, ... },  // 台帳ベース空き枠
  capacity: 18,
  users: [
    {
      name, care, days, unit,                        // 台帳
      contractN,                                     // 契約週N
      displayState: 'normal'|'sanko'|'hanteichu'|'chouki',
      stateLabel: ''|'参考値（率が不正確）'|'判定中（データ蓄積中）'|'算出不可',
      rate: 92.3|null,                               // 出席率(%)・状態により null
      actualPerWeek: 1.85|null,                       // 実績週N.N
      diverge: 1.15|null,
      monthly: { '2026-04': null, '2026-05': 100, '2026-06': 84.6 },  // null=—
      isUpsizeCandidate: true|false,
      addableSlots: ['月AM','火AM','金AM'] | []       // 増回候補のみ非空
    }, ...
  ]
}
```

住所・TEL・医療は**含めない**。

## 9. 純関数（attendance-view-core.js・TDD対象）

`SpreadsheetApp`/`UrlFetch` 非依存。プレフィクス `av`（全域scope衝突回避）。GAS本番でロード時停止しない（require()を持たない・末尾 module.exports）。

| 関数 | 役割 |
|---|---|
| `avParseDayAmpm_(days, unit)` | 台帳の days×unit → `[{dow, ampm}]`（曜日別ampm・宮さん幽霊対策の核） |
| `avContractN_(days)` | 曜日数 |
| `avOccupancy_(patternsAll)` | 全在籍から占有[曜日][am/pm] を集計 |
| `avSlotsFree_(occupancy, capacity)` | 18−占有 → 空き枠 |
| `avUserOpsRate_(attendedDates, scheduledOpDates)` | 窓内 出席率・月別率 |
| `avActualPerWeek_(contractN, rate)` | 実績週N.N・乖離 |
| `avDisplayState_(name, {longLeaveSet, weekdayChangeSet, startDate, today})` | 状態＋ラベル（優先順） |
| `avAddableSlots_(days, unit, slotsFree)` | 追加できる空き枠 |
| `avIsUpsizeCandidate_(displayState, contractN)` | 週1回×normal |
| `avKaigoAvgRate_(rows)` | 要介護·normal の重み付き平均率 |
| `avSortRows_(rows, mode)` | 3モードの並べ替え |

GAS側 `attendance_view(e)` は上記に「取得したデータ」を渡して組み立てるだけ（fetch/SpreadsheetApp のみ担当）。

## 10. 完了条件（受け入れ）

- [ ] 要介護のみ表示（要支援ゼロ）を実データで確認
- [ ] 出席率が dailyOps 基準（予定−欠席の推定でない）で算出
- [ ] 月別3ヶ月表示・**4月は「データなし」明示**
- [ ] 要介護の平均実来館率が基準線表示（要支援除外で再計算）
- [ ] 増回候補の「追加できる空き枠」が週間予定表の空き枠と一致（曜日別ampmパース・宮さん幽霊なし）
- [ ] 長期休み＝算出不可 / 新規＝判定中 / 曜日変更＝参考値（率が不正確）が正しく分離表示
- [ ] portal登録・版bump（`node scripts/bump-app-version.js`）・三点セット（版同期・SHA一致・本番反映証跡）

## 11. 制約

- GAS: 新action追加のみ。既存action（intake_*ゲート・weekly系・欠席系）非改変。
- シート構造変更禁止（読むだけ）。
- 住所・TEL・医療情報は返さない／表示しない。
- 本番push＝master・社長承認・`bump-app-version.js`経由（version.txt手編集禁止）・`--verify`で反映確認。GAS改修前は必ず `clasp pull` 突合。
