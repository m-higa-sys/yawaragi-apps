# セッションボード（当日業務ピックアップ）設計

- 作成日: 2026-07-11
- ステータス: 設計確定（社長承認済み・実装計画待ち）
- 関連調査: 本ファイル §7 参照（2026-07-11 実施の7項目現状調査）

## 1. 目的

当日のAM/PM出席者 × 5業務の「今日この人にこれをやる」対象判定を自動でピックアップし、
朝いちで一目で把握できるボードを提供する。判定ロジックを1箇所に集約し、
既存 morningDigest（朝の報告）にも同じ判定を要約行として後足しできる形にする。

## 2. スコープ

### 2.1 対象業務（第1版・5業務）

| 業務 | 判定 | 表示 |
|---|---|---|
| 口腔モニ | planStart起点3ヶ月周期（`oralCycleAt`型）で当月対象、かつ未実施 | 当日出席者のうち対象＆未実施を**全員ピックアップ（role仕分けなし）** |
| 測定（1プール統合） | 要介護＝個訓の評価月（`isHyoukaMonth`：計画開始前月／各サイクル前月・当月が評価月かつ `sokutei_date` 空）。要支援・事業対象＝前回"実"測定日＋4ヶ月固定（`sokuteiCycleMonths_`その他=4・未測定最優先）。**両者を1プールに合算**し §2.4 の優先順位で並べる | 当日出席者のうち上記対象を、**当該AM/PMタブ内で優先順位順**に（§2.5）。**タブ内プールの上位N名「今日やる」／残り「余裕があれば」（要介護/要支援でセクション分割しない）**。N既定=3・画面から変更可 |
| 口腔体操 | 算定対象フラグ（明示false以外はtrue）× 当日出席。**実源 `getOralTargetUsers_` は `isTarget`（キャメル）で返す**（`is_target` はシート列名）。`sbKoukuTaisou_` は両フィールド対応 | 対象者一覧 |
| 個別機能訓練 | 介護度「要介護」前方一致 × 非中止（`u.cancelled` が真でない）× 当日出席（周期なし＝毎回全員） | 対象者一覧 |
| 誕生日 | 台帳M/Dで今月誕生月、かつ taskboard status 未完 | 今月の対象者一覧（当日出席フィルタなし＝月ベース） |

### 2.2 明示的な既定（曖昧さ潰し）

- **測定・口腔モニは当日出席者に限定**する（来館した人にしかできない業務のため）。
- **口腔体操・個訓は当日出席者の全員**（周期・実施記録なし＝毎日やる業務）。
- **誕生日だけは当日出席フィルタを掛けない**（月単位の準備業務のため、今月誕生月の全員が対象）。
- **測定は介護度で2系統に分岐する（core分岐）：**
  - **要介護 → 個訓計画書サイクルに紐づく（`isHyoukaMonth`）。** 前回測定日からの独立サイクルは採用しない。理由：要介護の測定は個訓計画を更新するための評価であり、計画開始の前月（評価月）に行う運用のため（社長確認：計画開始8月なら7月に測定）。個別短縮は `planMonths`（台帳「計画月数」1-12）で自動反映され、`isHyoukaMonth` がそれを起点に評価月を算出するため別フラグ不要（Q1は要介護に限り解決）。
  - **要支援・事業対象 → 前回"実"測定日＋4ヶ月固定周期（`sokuteiCycleMonths_`のその他=4）。** 評価月モデルは適用しない。この4ヶ月周期は不変で、休み等のスライドは実測定日起点で自然に吸収される。要支援は個訓計画書（planStart/planMonths）を持たない場合があるため、評価月モデルを使わないのはデータ上も正しい。
- 測定「上位N名」の N は既定3。画面で変更でき、値は localStorage に保存（サーバへは送らない）。**上位N は要介護/要支援を分けず、当該セッション（AM/PMタブ）の統合プールの上位N**（§2.4・§2.5）。午前・午後は独立枠（各セッションで上位N＝最大2N名/日）。
- **個訓の非中止除外の契約**：個訓対象母集合 `sbKotan_` は `u.cancelled` が真の利用者を除外する（終了・中止者を「毎日やる」に出さない）。この `cancelled` boolean は Phase 2 で `getKeikakushoTargetUsers_`（`cancelled: isCancelled` を返す・`gas/yawaragi-board/コード.js:13559`）から供給する。当日出席フィルタでも実務上は落ちるが、二重の安全として母集合側でも除外する。
- **測定2系統の判別子（track）**：`sbMeasureKaigo_` の行は `track:'kaigo'`・`careLayer:0`、`sbMeasureShien_` の行は `track:'shien'`・`careLayer:1` を持つ。`sbBuildBoard_` は両者を1プール `sokutei` に統合し **§2.4 の comparator で1回ソート**する（フロントはソート済みプールを丸ごと上位Nで切ってよい）。track はUIバッジ表示（要介護/要支援）に使う。
- **要支援の care フィールド**：`sbMeasureShien_` は `u.care` を読む。実源の介護度フィールドは `category` なので、Phase 2 で `shienUsers` を作る際に `care: category` へ写像する（未写像でもサイクル4ヶ月判定は正しく落ちるが、表示 care が空になる。`sokutei.html:344` と同じ写像規約）。

### 2.4 測定プールの優先順位（1プール・階層ソート）

要介護・要支援を**1プールに統合**し、テスト可能な純関数 comparator で1回ソートする。上位N（既定3）が「今日やる」、残りが「余裕があれば」。

**ソートキー（earlier＝今日やる先頭）：**
1. **第0層 `careLayer` 昇順**：要介護(0) を要支援・事業対象(1) より必ず先（要介護＝加算必達、要支援＝翌月可）。
2. **第1層 `urgency` 降順**：同層内で「取り逃しリスク＝今後会える残チャンスが少ない人」ほど先。
3. 同点：残来所日数↑ → 週回数↑ → 欠席率↓ → 氏名（安定・決定的）。

**urgency（加重加算スコア・高いほど先）：**
```
urgency = W_CHANCE  × chanceScarcity
        + W_FREQ    × freqScarcity
        + W_ABSENCE × absenceRate
        + (未測定(要支援)なら UNMEASURED_BOOST)
  chanceScarcity = weeklyVisits>0 ? 1/(remainingVisits+1) : 0   // remainingVisits=明日〜月末の契約来所日数(0=今日が最後→最大1.0)
  freqScarcity   = weeklyVisits>0 ? 1/weeklyVisits : 0            // 週1→1.0, 週2→0.5, 週5→0.2
  absenceRate    = clamp(1 − U, 0, 1)                            // U=出席率(usage_stats)・データ不足時U=1.0
```
- 既定の重み（名前付き定数・実データ確認後に調整可）：`W_CHANCE=1.0`, `W_FREQ=0.6`, `W_ABSENCE=0.6`, `UNMEASURED_BOOST=2.0`（未測定要支援を層内先頭へ／ただし careLayer により要介護より上には来ない）。
- **データ欠損ガード**：`利用曜日` 不明（weeklyVisits=0）は chanceScarcity・freqScarcity とも0＝欠損で誤って上位化しない（欠席率のみ効く）。
- **軸1 週回数**＝台帳「利用曜日」の曜日文字数（日数ベース・AM/PMは使わない。Q5）。**軸2 欠席率**＝`1−U`、U は `usage_stats`（運用開始2026-04以降・直近3ヶ月・`isPreOperational` 月除外）。（Q6）
- 純関数構成：`sbCountWeeklyVisits_(days)`／`sbCountRemainingVisits_(days, today)`／`sbMeasureUrgency_(row, weights)`／`sbSokuteiSort_(pool, weights)`。`sbMeasureKaigo_`/`sbMeasureShien_` は行に `careLayer`/`weeklyVisits`/`remainingVisits`/`absenceRate`（＋要支援は`unmeasured`）を付与し、`sbBuildBoard_` が交差後の統合プールを `sbSokuteiSort_` で並べる。
- 追加データ契約（Phase 2）：`sbMeasureKaigo_`/`sbMeasureShien_` は各利用者の `days`（利用曜日）を要する（`getKeikakushoTargetUsers_` は既に `days` を返す）。U は新入力 `usageByKey`（正規化名→出席率、`usage_stats` から構築・キーは core が内部正規化）で供給する。

### 2.5 AM/PM分割（タブ）と session 帰属

**前提＝1日2単位制**：やわらぎは午前の部／午後の部の2単位制で、**同一利用者が同日にAM/PMの両方へ来ることは無い**。したがって session は **`'am'` / `'pm'` の2値のみ**で、`'both'`（通し利用者）は運用上存在しない。「通し利用者」を両タブに出す・二重カウントを避ける等の設計は**採用しない**。

- **session 帰属**：`sbUniquePresent_` は当日出席者を am/pm で単純二分し、各出席者に `session:'am'|'pm'` を付与する（出席＝`status==='出席'` のみ対象）。名寄せは正規化キー（§3.4）。
- **タブ＝表示フィルタ（厳格）**：午前タブは `session==='am'` のみ、午後タブは `session==='pm'` のみを表示する。**午前タブに午後専用の人、午後タブに午前専用の人は絶対に混ぜない**。
- **上位N（測定）はタブ内で計算**：当該セッションの出席者 × 測定対象を §2.4 の comparator でソートし、その中の上位N（既定3）が「今日やる」。**午前と午後は独立した枠**（午前で上位3・午後で上位3＝最大2N名/日）。誕生日以外の各業務は当該セッションの出席者に絞られる。
- **人数の恒等**：`presentAm`（session `'am'` の distinct 人数）＋ `presentPm`＝`presentCount`（総 distinct）。同一人物は1名として1度だけ数える（2単位制ゆえ両枠加算は起きない）。
- **誕生日はタブ外・常時表示**：出席非依存（月単位業務）so タブに関係なく今月対象を常に表示する。
- **初期タブ**：時間帯で自動選択（正午前＝午前／以降＝午後）。**手動切替の記憶は当日内のみ**：`localStorage` に「日付＋選択タブ」を保存し、保存日付が当日でなければ無視して自動選択へ戻す（→毎朝5時に開けば常に午前が出て朝の準備に自然）。上位N の値は日付非依存で従来どおり localStorage 保存。

**データ異常の扱い（am/pm キー衝突）**：2単位制で**同一正規化キーが am と pm の両方に「出席」で現れることは本来あり得ない**。現実的な原因は「別人が正規化後に同一キーへ衝突」（NFKC＋空白除去＋敬称除去で別人が同キーになる）で、これを silent に片方採用すると **別人の出席が握りつぶされ業務が誤割当**される。so 次の安全側で扱う（`sbResidue_` と同じ「別人誤割当より可視化優先」の思想）：
- 衝突キーは **`session:'am'` へ決定的に割当てて業務からは落とさない**（無害な二重登録でも実在出席者を取りこぼさない）。
- かつ `sbUniquePresent_` が当該行に `conflict:true` を立て、`sbBuildBoard_` が `ampmConflict:[{name,key}]` として出力する。フロントは **⚠️「AM/PM両方に出席登録＝要確認」バナー**で名指し可視化する。

**core への追加（§2.5 実装契約）**：
- `sbUniquePresent_` → 返り値の各行に `session:'am'|'pm'`（＋衝突時のみ `conflict:true`）。am/pm 二分・出席のみ。
- `sbIntersectPresent_` → 当たった出席者の `session` を業務 hit 行へ載せる（順序保持・元 target 行を破壊しない浅いコピー）。
- `sbBuildBoard_` → 各業務行が `session` を持つ。出力に `presentAm`／`presentPm`／`ampmConflict` を追加（`presentCount` は従来どおり総 distinct）。residue 行にも `session`。上位N の線引きは core で行わず**フロントがタブ内で切る**（§2.2 の localStorage 変更式を踏襲）。

### 2.3 第1版で「やらないこと」（YAGNI）

- **チェックの書き戻し（実施済みをセッションボードから記録）はやらない。** 実施済みは既存データから自動判定のみ（表示先行・チェック後追い）。
- 誕生日の**実写真ファイル管理はしない**（撮影済みは taskboard のブールstatusのみ）。
- 個訓の (I)/(II) 区別はしない（データにフラグが存在しないため、介護度「要介護」で代替）。
- 年齢計算はしない（台帳の生年月日はAPI出力時点でM/Dのみ＝年が取れない）。

## 3. アーキテクチャ（案A：サーバ集約＋判定は純関数core）

```
[session-board-core.js]  純関数（判定ロジックの唯一の置き場）
      │  scripts/test-session-board.js で TDD
      ▼
[board GAS: action=sessionBoard(date)]  薄いラッパ
      │  attendance で当日AM/PM出席者を確定
      │  core関数で 5業務を判定して1レスポンスに集約
      ▼
[session-board.html]  描画のみ（薄い）
      │
      └─(後足し)→ morningDigest の safe('sessionBoard', …) が同core関数を流用
```

### 3.0 流用元（Q3追加調査で確定）

- **測定ブロックは `sokutei.html` タブ1「今日の測定優先リスト」が直接の流用元**（`sokutei.html:396-413` `renderTab1`）。`action=attendance`で当日出席取得→`status==='出席'`で絞り→対象と氏名キーで積集合→逼迫度昇順→上位/余裕振り分け、という**当日出席×対象の交差構造をそのまま流用**する。
  - **要介護ブロックのみサイクル判定を差し替える**：sokutei.html の `sokuteiDueDate_`（前回測定日＋3/4ヶ月）ではなく `isHyoukaMonth`（評価月）を使う。
  - **要支援・事業対象ブロックは sokutei.html の元ロジックをそのまま流用**：`sokuteiCycleMonths_`（その他=4）＋`sokuteiDueDate_`（前回実測定日＋4ヶ月）＋`sokuteiRemaining_`。差し替えない。
- **口腔モニ・口腔体操・個訓・誕生日の「当日出席×対象」交差は既存に実例が無い＝セッションボードが初実装**（oral.html/oral-plan.html/teishutsu.html は月次で対象者全員を出すのみで出席交差なし）。この4業務は交差部分を新規に書く。

### 3.1 判定純関数 `session-board-core.js`

- DOM非依存・GAS非依存の純関数群。`scripts/test-session-board.js` でTDD。
- 入力は「当日出席者リスト（am/pm）」と各業務の生データ（レコード配列）、対象日。
- 出力は業務ごとの対象者配列。副作用なし。
- 既存 core（`kesseki-box-core.js` 等）と同じ規律で `gas/yawaragi-board/` 配下に置く。
- shared.js §I の周期関数（`isPlanMonth` 等）と重複する判定は、可能な限り §I を呼ぶ／
  口腔モニの role 付き判定（`oralCycleAt`）は現状 oral-plan.html にしかないため、
  core に**移植**する（oral-plan.html 側は当面現状維持、二重持ちは core を正とする方針をコメント明記）。

### 3.2 board GAS 新action `sessionBoard(date)`

- `gas/yawaragi-board/コード.js` に `function sessionBoard(e)` を追加、doGet に `action==='sessionBoard'` 分岐を1行足す。
- 処理：
  1. 対象日 date（未指定は Asia/Tokyo の当日）を確定。
  2. `getAttendance` 相当（台帳曜日 − 出欠変更の欠席）で当日 `{am:[], pm:[]}` を得る＝**出席一次ソース**。
  3. 各業務の生データを読む：
     - 測定（要介護）→ 台帳「計画書開始」`planStart`＋「計画月数」`planMonths`（`getKeikakushoTargetUsers_` が既に返す・**§3.6の正本**）で `isHyoukaMonth` により当月が評価月か判定。実施済みはシート「個別機能訓練計画書記録」の当評価月 `sokutei_date`。
     - 測定（要支援・事業対象）→ 別シート要支援測定（`getShienSokutei`）の前回実測定日＋4ヶ月で判定。planStart/planMonthsは使わない。
     - 口腔モニ → シート「口腔機能向上記録」（`moni1_date`/`moni2_date`/`houkoku_date`/`plan_date`）＋「口腔機能向上設定」（`plan_start`/`plan_end`）。
     - 口腔体操 → シート「口腔機能向上設定」`is_target`。
     - 個訓 → 台帳「介護度」。
     - 誕生日 → 台帳「誕生日／生年月日」M/D ＋ 撮影済みstatus（§3.3）。
  4. core関数（`sbBuildBoard_`）で判定し、`{ ok, date, year, month, presentCount, presentAm, presentPm, sokutei:[], koukuMoni:[], koukuTaisou:[], kotan:[], birthday:[], residue:[], ampmConflict:[] }` を1レスポンスで返す。測定・口腔モニ・口腔体操・個訓・residue の各行は `session:'am'|'pm'` を持つ（誕生日は出席非依存so session 無し・§2.5）。
- **運用注意**：コード.js を触るため clasp pull 突合 → deploy が必須（本番のみ機能を消しかけた前科あり。MEMORY `月次定例+morningDigest統合` の runbook 準拠）。

### 3.3 誕生日 撮影済みstatusの取得（唯一の統合リスク）

- 撮影済みは taskboard.html 独自ストア（localStorage ＋ SYNC `type:'birthday'` → Drive JSON）にあり **board GAS 管轄外**。
- **既定**：sessionBoard が birthday SYNC を **UrlFetch で読み**、撮影/プリント/お渡し未完の者を「未完」として抽出する（morningDigest が既に外部GASへ UrlFetch している実績パターン `safe('sougeiOps')`/`safe('furikae')` と同じ）。
- **フォールバック**：SYNC 参照が困難なら、sessionBoard は「今月誕生月の全員」だけ返し、撮影済み除外はクライアント（session-board.html が birthday ストアを読んで overlay）で行う。
- 実装計画時にどちらで進めるか最終確定する。

### 3.4 名寄せ規約（Q2追加調査の対応・必須）

**⚠️前提リスク：利用者に安定IDは存在しない。** 台帳に「利用者ID」列が無く、全システムが `userId === 氏名`（文字列一致）で突合している（`gas/yawaragi-board/コード.js:13551` 他2箇所コメント明記）。`getAttendance` は氏名のみ・`.trim()` だけで返す。よってセッションボードの「当日出席（氏名）× 各シート（userId＝氏名）」は氏名一致に完全依存する。

- **正規化を core の突合キーに統一適用**：口腔"設定"で既に使われている `_normalizeUserName`（NFKC＋全空白除去＋末尾敬称「様/さま/サマ」除去、`gas/yawaragi-board/コード.js:11870`）**相当を session-board-core の全業務突合キーに適用**する。現状は口腔"設定"だけが正規化し、記録・モニタリング・計画書記録は生trimで基準が食い違う。セッションボードは自分の突合を正規化側に寄せる。
- **安全弁（サイレント欠落の禁止）**：当日出席者のうち、正規化しても各対象シートに突合先が見つからなかった者は**捨てず、末尾に「名寄せ不能（要確認）」として氏名を表示**する。別人へタスクを誤割当するより、拾い漏れを可視化する方を優先する。
- **構造的に解決不能な残存リスク**（specに明記して運用で許容）：①同姓同名（同一綴り）＝氏名キーで衝突し1人に集約。②改名・旧姓変更＝記録行の氏名を同時に直さないと旧記録が孤立（自動移行コードは存在しない）。セッションボードはこれらを新規に解決しない（既存全システムと同じ制約）。

### 3.6 計画開始月の正本と動的連動（Q4追加調査で確定）

- **書込先＝読取元は完全に同一フィールド。** 計画書チェックHTMLの「計画書開始月を変更」ダイアログ（`applyPlanStart` → `action=updatePlanStart`）は、台帳（`SS_ID`・シート「利用者台帳」）の列「計画書開始」「計画月数」に直接 `setValue` する（`gas/yawaragi-board/コード.js:2246-2281`）。セッションボードが読む `getKeikakushoTargetUsers_` は**同一SS・同一シート・同一列を毎回 `getDataRange().getValues()` で直読み**（`gas/yawaragi-board/コード.js:13473-13488`）。
- **キャッシュ層なし**（CacheService/PropertiesService不使用）。→ **セッションボードは正本を毎回読むだけで、計画開始月の変更に即自動連動する。要介護測定のデータソースは台帳「計画書開始」「計画月数」で確定・キャッシュ禁止。**
- **⚠️運用リスク（設計で解決せず明記・運用で担保）**：「計画書作成（`keikaku_date` を `updateKeikakusho` で記録シートへ）」と「計画開始月の更新（`updatePlanStart` で台帳へ）」は**別操作でコード上連動しない**。社長が計画作成時に開始月ダイアログを操作し忘れると `planStart` が旧値のまま残り、`isHyoukaMonth` が古い評価月を出す。これはフィールドのズレではなく「正本の更新漏れ」。セッションボード側では解決できないため、②morningDigest要約行や運用リマインドで補完する余地として残す（第1版スコープ外）。

### 3.7 フロント `session-board.html`

- 起動時に `action=sessionBoard&date=YYYY-MM-DD` を1回叩き、返ってきた配列を業務ブロックに描画するだけの薄い実装。
- 測定の N（上位何名を「今日やる」に出すか）だけクライアント状態（localStorage）。
- 既存アプリ群と同じ配信・HTML版ゲート（`shared.js?v=` ／ `version.txt`）に載せる。
- github.io で開く前提（file:// はキャッシュ罠・genbaの前例）。

## 4. データフロー

```
朝、session-board.html を開く
  → GET sessionBoard(date)
     → getAttendance(台帳曜日 − 欠席) = 当日 am/pm 出席者【一次ソース】
     → 各シート生データ read（＋誕生日statusは §3.3）
     → session-board-core の純関数で 5業務判定
  ← { date, am, pm, sokutei, koukuMoni, koukuTaisou, kotan, birthday }
  → 業務ブロックに描画（測定は逼迫度順・上位N「今日やる」）
```

## 5. エラーハンドリング

- morningDigest と同じ `safe(name, fn)` 型で業務ごとに try-catch。1業務が落ちても他業務とボード全体は描画する（`errors[]` に退避）。
- attendance（出席一次ソース）取得失敗時は、業務判定が全て当日出席に依存するため、
  ボードは「出席取得失敗」を明示し、当日フィルタ不要な誕生日のみ表示する（デグレード表示）。

## 6. テスト

- `scripts/test-session-board.js`：core純関数を単体でTDD。
  - 口腔モニ：planStart×対象日で当月role判定、未実施（各date欄空）抽出、当日出席との積。
  - 測定（要介護）：`isHyoukaMonth`で評価月判定（計画開始前月 diff===-1／L=3の各サイクル前月 diff%3===2／変則planMonthsの diff===L-1）、planMonths短縮での評価月前倒し、未実施（当評価月 sokutei_date空）抽出、当日出席との積、月末残日数昇順、上位N境界。
  - 測定（要支援・事業）：`sokuteiCycleMonths_`その他=4、前回実測定日＋4ヶ月の `sokuteiDueDate_`/`sokuteiRemaining_`、超過（負の残日数）、当日出席との積。要介護と要支援の**core分岐が介護度で正しく振り分くこと**。
  - 口腔体操：is_target の明示false/未設定（既定true）/true、当日出席との積。
  - 個訓：介護度「要介護」判定（前方一致）、当日出席との積。
  - 誕生日：今月誕生月抽出、status未完フィルタ、当日出席フィルタを掛けないこと。
- 実データ突合は本番反映前に github.io 実機で1回（鍵が要るデータは社長確認）。

## 7. 根拠（2026-07-11 現状調査の要点）

- 出席一次ソース：`getAttendance`（台帳曜日 − 出欠変更の欠席）。コードは欠席を dailyOps より上位の真実として扱う（`gas/yawaragi-board/コード.js:13783`「欠席登録ある日はスキップ」）。sougei dailyOps は送迎ルート用で当日未作成なら空になり得るため二次的。
- 口腔モニ判定：`oralCycleAt(planStart, planEnd, year, month)`（`oral-plan.html:701`）。`(対象月−planStart月)%3` で role。未実施＝`moni1_date`/`moni2_date`/（setsumeは`houkoku_date && plan_date`）が空。正本シート「口腔機能向上記録」/「口腔機能向上設定」（board GAS）。
- 測定タイミング（**2系統**）：
  - 要介護＝**個訓の評価月** `isHyoukaMonth(planStart, planMonths, y, m)`（`shared.js:420`。計画開始前月 diff===-1、L=3は各サイクル前月、変則planMonthsは diff===L-1）。同関数は「個別機能訓練計画書チェック.htmlの同名関数を移植」とコメントにあり個訓アプリが把握。planStart/planMonthsは台帳「計画書開始」「計画月数」＝`getKeikakushoTargetUsers_`（`gas/yawaragi-board/コード.js:13488`/`:13558`）が返す。実施済みはシート「個別機能訓練計画書記録」`sokutei_date`（`action=getKeikakushoYear`）。
  - 要支援・事業対象＝**前回実測定日＋4ヶ月固定** `sokuteiCycleMonths_`その他=4／`sokuteiDueDate_`（`sokutei.html:99`/`:103`）。前回実測定日は要支援別シート（`getShienSokutei`）。planStart不要。
- 計画開始月の正本＝台帳「計画書開始」「計画月数」。書込`updatePlanStart`（`gas/yawaragi-board/コード.js:2246-2281`）＝読取`getKeikakushoTargetUsers_`（`:13473-13488`）で同一列・キャッシュなし＝毎回直読みで自動連動（Q4）。ただし計画作成`updateKeikakusho`と開始月更新`updatePlanStart`は非連動（正本更新漏れの運用リスク）。
- 名寄せ：安定ID無し。`userId===氏名`（`gas/yawaragi-board/コード.js:13551`他）。`getAttendance`は氏名のみ`.trim()`（`:3939`）。正規化は口腔"設定"の`_normalizeUserName`（`:11870`）のみで記録系は生trim＝基準不一致。改名で旧記録孤立（自動移行なし）・同姓同名衝突・sokutei.htmlの「改名耐性あり」コメントは実は不成立（Q2追加調査で裏取り）。
- 当日出席×対象の交差実例：`sokutei.html`タブ1のみ（`sokutei.html:396-413`）。他アプリは月次で出席交差なし。
- 口腔体操フラグ：シート「口腔機能向上設定」`is_target`（`gas/yawaragi-board/コード.js:13045`）。行なし新規は既定true、明示falseのみ非対象。
- 個訓フラグ：専用フラグ無し。`getKeikakushoTargetUsers_` が「要介護で始まる利用者のみ」（`:13518`）。(I)/(II)区別はデータに無い。
- 誕生日：台帳 `findCol('誕生日','生年月日')`、API出力は `"M/D"`（年は失われる）（`gas/gas_出勤送迎表.gs:59-66`）。撮影済みは taskboard status（`taskboard.html:538` pending/photographed/printed/delivered）＝ブールのみ、実写真管理なし。
- morningDigest：`function morningDigest(e)`（`gas/yawaragi-board/コード.js:6804`）。`safe(name,fn)` でセクション集約。追加口は最後の `safe('chushi',…)` の `});`（:6894）直後・`return respond(…)`（:6896）直前。
- 流用候補の判定エンジン：`teireiDecision_`（`:7278`, 対象月＋実施済み＋urgency合成の汎用型）、shared.js §I 周期関数群（`:399-478`）。

## 8. 実装計画で最終確定する既定（各項に既定あり）

- 誕生日 撮影済みstatus取得 → **既定=UrlFetch（§3.3）**、フォールバック=クライアントoverlay。どちらで進めるか着手時に確定。
- 測定の要支援・事業対象者 → **含める（別系統）。前回実測定日＋4ヶ月固定で判定**するため planStart 不要。要支援に前回実測定日が1件も無い（初回）場合の扱い（未測定最優先で先頭に出す等）を着手時に確認。
- sessionBoard レスポンスのキー名 → **既定=§3.2の `sokutei/koukuMoni/koukuTaisou/kotan/birthday`**。morningDigest要約行と共有するため実装時にfix。
- 測定サイクルの個別短縮（Q1）→ **解決済み。planStart＋planMonths（個訓計画書サイクル）を `isHyoukaMonth` で使うことで自動反映**。専用の個別測定サイクル列は存在しないことを確認済み（新規に作らない）。
