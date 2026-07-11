# 朝ボード（当日業務ピックアップ）設計

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
| 測定 | 前回測定日＋サイクル（要介護3ヶ月／その他4ヶ月）で期限接近・超過 | 当日出席者を**逼迫度（残日数昇順）順**。上位N名「今日やる」／残り「余裕あれば」。**N既定=3・画面から変更可** |
| 口腔体操 | `is_target`（明示false以外はtrue）× 当日出席 | 対象者一覧 |
| 個別機能訓練 | 介護度「要介護」× 当日出席（周期なし＝毎回全員） | 対象者一覧 |
| 誕生日 | 台帳M/Dで今月誕生月、かつ taskboard status 未完 | 今月の対象者一覧（当日出席フィルタなし＝月ベース） |

### 2.2 明示的な既定（曖昧さ潰し）

- **測定・口腔モニは当日出席者に限定**する（来館した人にしかできない業務のため）。
- **口腔体操・個訓は当日出席者の全員**（周期・実施記録なし＝毎日やる業務）。
- **誕生日だけは当日出席フィルタを掛けない**（月単位の準備業務のため、今月誕生月の全員が対象）。
- 測定サイクルは `sokuteiCycleMonths_` 準拠：要介護=3ヶ月、その他（要支援・事業対象）=4ヶ月。
- 測定「上位N名」の N は既定3。画面で変更でき、値は localStorage に保存（サーバへは送らない）。

### 2.3 第1版で「やらないこと」（YAGNI）

- **チェックの書き戻し（実施済みを朝ボードから記録）はやらない。** 実施済みは既存データから自動判定のみ（表示先行・チェック後追い）。
- 誕生日の**実写真ファイル管理はしない**（撮影済みは taskboard のブールstatusのみ）。
- 個訓の (I)/(II) 区別はしない（データにフラグが存在しないため、介護度「要介護」で代替）。
- 年齢計算はしない（台帳の生年月日はAPI出力時点でM/Dのみ＝年が取れない）。

## 3. アーキテクチャ（案A：サーバ集約＋判定は純関数core）

```
[asa-board-core.js]  純関数（判定ロジックの唯一の置き場）
      │  scripts/test-asa-board.js で TDD
      ▼
[board GAS: action=asaBoard(date)]  薄いラッパ
      │  attendance で当日AM/PM出席者を確定
      │  core関数で 5業務を判定して1レスポンスに集約
      ▼
[asa-board.html]  描画のみ（薄い）
      │
      └─(後足し)→ morningDigest の safe('asaBoard', …) が同core関数を流用
```

### 3.1 判定純関数 `asa-board-core.js`

- DOM非依存・GAS非依存の純関数群。`scripts/test-asa-board.js` でTDD。
- 入力は「当日出席者リスト（am/pm）」と各業務の生データ（レコード配列）、対象日。
- 出力は業務ごとの対象者配列。副作用なし。
- 既存 core（`kesseki-box-core.js` 等）と同じ規律で `gas/yawaragi-board/` 配下に置く。
- shared.js §I の周期関数（`isPlanMonth` 等）と重複する判定は、可能な限り §I を呼ぶ／
  口腔モニの role 付き判定（`oralCycleAt`）は現状 oral-plan.html にしかないため、
  core に**移植**する（oral-plan.html 側は当面現状維持、二重持ちは core を正とする方針をコメント明記）。

### 3.2 board GAS 新action `asaBoard(date)`

- `gas/yawaragi-board/コード.js` に `function asaBoard(e)` を追加、doGet に `action==='asaBoard'` 分岐を1行足す。
- 処理：
  1. 対象日 date（未指定は Asia/Tokyo の当日）を確定。
  2. `getAttendance` 相当（台帳曜日 − 出欠変更の欠席）で当日 `{am:[], pm:[]}` を得る＝**出席一次ソース**。
  3. 各業務の生データを読む：
     - 測定 → シート「個別機能訓練計画書記録」`sokutei_date`（要介護）＋別シート要支援測定。
     - 口腔モニ → シート「口腔機能向上記録」（`moni1_date`/`moni2_date`/`houkoku_date`/`plan_date`）＋「口腔機能向上設定」（`plan_start`/`plan_end`）。
     - 口腔体操 → シート「口腔機能向上設定」`is_target`。
     - 個訓 → 台帳「介護度」。
     - 誕生日 → 台帳「誕生日／生年月日」M/D ＋ 撮影済みstatus（§3.3）。
  4. core関数で判定し、`{ ok, date, am, pm, sokutei:[], koukuMoni:[], koukuTaisou:[], kotan:[], birthday:[] }` を1レスポンスで返す。
- **運用注意**：コード.js を触るため clasp pull 突合 → deploy が必須（本番のみ機能を消しかけた前科あり。MEMORY `月次定例+morningDigest統合` の runbook 準拠）。

### 3.3 誕生日 撮影済みstatusの取得（唯一の統合リスク）

- 撮影済みは taskboard.html 独自ストア（localStorage ＋ SYNC `type:'birthday'` → Drive JSON）にあり **board GAS 管轄外**。
- **既定**：asaBoard が birthday SYNC を **UrlFetch で読み**、撮影/プリント/お渡し未完の者を「未完」として抽出する（morningDigest が既に外部GASへ UrlFetch している実績パターン `safe('sougeiOps')`/`safe('furikae')` と同じ）。
- **フォールバック**：SYNC 参照が困難なら、asaBoard は「今月誕生月の全員」だけ返し、撮影済み除外はクライアント（asa-board.html が birthday ストアを読んで overlay）で行う。
- 実装計画時にどちらで進めるか最終確定する。

### 3.4 フロント `asa-board.html`

- 起動時に `action=asaBoard&date=YYYY-MM-DD` を1回叩き、返ってきた配列を業務ブロックに描画するだけの薄い実装。
- 測定の N（上位何名を「今日やる」に出すか）だけクライアント状態（localStorage）。
- 既存アプリ群と同じ配信・HTML版ゲート（`shared.js?v=` ／ `version.txt`）に載せる。
- github.io で開く前提（file:// はキャッシュ罠・genbaの前例）。

## 4. データフロー

```
朝、asa-board.html を開く
  → GET asaBoard(date)
     → getAttendance(台帳曜日 − 欠席) = 当日 am/pm 出席者【一次ソース】
     → 各シート生データ read（＋誕生日statusは §3.3）
     → asa-board-core の純関数で 5業務判定
  ← { date, am, pm, sokutei, koukuMoni, koukuTaisou, kotan, birthday }
  → 業務ブロックに描画（測定は逼迫度順・上位N「今日やる」）
```

## 5. エラーハンドリング

- morningDigest と同じ `safe(name, fn)` 型で業務ごとに try-catch。1業務が落ちても他業務とボード全体は描画する（`errors[]` に退避）。
- attendance（出席一次ソース）取得失敗時は、業務判定が全て当日出席に依存するため、
  ボードは「出席取得失敗」を明示し、当日フィルタ不要な誕生日のみ表示する（デグレード表示）。

## 6. テスト

- `scripts/test-asa-board.js`：core純関数を単体でTDD。
  - 口腔モニ：planStart×対象日で当月role判定、未実施（各date欄空）抽出、当日出席との積。
  - 測定：care別サイクル（3/4ヶ月）、残日数昇順ソート、上位N境界、超過（負の残日数）。
  - 口腔体操：is_target の明示false/未設定（既定true）/true、当日出席との積。
  - 個訓：介護度「要介護」判定（前方一致）、当日出席との積。
  - 誕生日：今月誕生月抽出、status未完フィルタ、当日出席フィルタを掛けないこと。
- 実データ突合は本番反映前に github.io 実機で1回（鍵が要るデータは社長確認）。

## 7. 根拠（2026-07-11 現状調査の要点）

- 出席一次ソース：`getAttendance`（台帳曜日 − 出欠変更の欠席）。コードは欠席を dailyOps より上位の真実として扱う（`gas/yawaragi-board/コード.js:13783`「欠席登録ある日はスキップ」）。sougei dailyOps は送迎ルート用で当日未作成なら空になり得るため二次的。
- 口腔モニ判定：`oralCycleAt(planStart, planEnd, year, month)`（`oral-plan.html:701`）。`(対象月−planStart月)%3` で role。未実施＝`moni1_date`/`moni2_date`/（setsumeは`houkoku_date && plan_date`）が空。正本シート「口腔機能向上記録」/「口腔機能向上設定」（board GAS）。
- 測定日：シート「個別機能訓練計画書記録」`sokutei_date`（`action=getKeikakushoYear`）＋要支援別シート（`getShienSokutei`）。前回測定日は userId／name キーで集約可（`sokutei.html:295` buildDerived）。サイクル `sokuteiCycleMonths_`（`sokutei.html:99`）要介護3／他4。
- 口腔体操フラグ：シート「口腔機能向上設定」`is_target`（`gas/yawaragi-board/コード.js:13045`）。行なし新規は既定true、明示falseのみ非対象。
- 個訓フラグ：専用フラグ無し。`getKeikakushoTargetUsers_` が「要介護で始まる利用者のみ」（`:13518`）。(I)/(II)区別はデータに無い。
- 誕生日：台帳 `findCol('誕生日','生年月日')`、API出力は `"M/D"`（年は失われる）（`gas/gas_出勤送迎表.gs:59-66`）。撮影済みは taskboard status（`taskboard.html:538` pending/photographed/printed/delivered）＝ブールのみ、実写真管理なし。
- morningDigest：`function morningDigest(e)`（`gas/yawaragi-board/コード.js:6804`）。`safe(name,fn)` でセクション集約。追加口は最後の `safe('chushi',…)` の `});`（:6894）直後・`return respond(…)`（:6896）直前。
- 流用候補の判定エンジン：`teireiDecision_`（`:7278`, 対象月＋実施済み＋urgency合成の汎用型）、shared.js §I 周期関数群（`:399-478`）。

## 8. 実装計画で最終確定する既定（各項に既定あり）

- 誕生日 撮影済みstatus取得 → **既定=UrlFetch（§3.3）**、フォールバック=クライアントoverlay。どちらで進めるか着手時に確定。
- 測定の要支援・事業対象者（別シート）→ **既定=含める**（サイクル4ヶ月・§2.2）。負荷や鍵の都合で要介護のみに絞るなら着手時に判断。
- asaBoard レスポンスのキー名 → **既定=§3.2の `sokutei/koukuMoni/koukuTaisou/kotan/birthday`**。morningDigest要約行と共有するため実装時にfix。
