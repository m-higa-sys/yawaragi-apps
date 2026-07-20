# 引継ぎ文 — yawaragi-apps（2026-06-28・通所満了日スレッド）

## 0. まず
MEMORY.md が自動ロードされる（残タスク・落とし穴の索引）。この引継ぎ文は「今の状態スナップショット＋進行中スレッド」だけ。詳細は各設計書(docs/superpowers/specs/)とmemoryを辿る。

## 1. 今セッションで完了したもの（本番反映済）
- **案2 GAS改修**：yawaragiボードGAS(scriptId `1pJN4vjIRM9NMGxco42PjogRcjg1R3zY6AgjDKXNWqHLlXtcuw5lYTPSz`)に **`setTsushoDueDate`/`getTsushoDueDates` を追加のみで実装** → 本番デプロイ `AKfycbwo…/exec` を **@278→@279**へredeploy。既存5アプリ無退行を確認済。設計書=`2026-06-27-tsusho-duedate-gas-an2-design.md`。
- **満了日 一括投入**：リハブのケアプラン期間一覧(スクショ10枚)をOCR→CSV化→台帳userId正規化→**114人中113人を本番投入**（利用者111=リハブ未設定で空スキップ）。値は全件検証済(形式異常0・オーフィン0)。CSV=`scratchpad/rehab_keikaku_kigen_FINAL.csv`。
- **Phase6 task1**：monitoring.html 計画書タブが `getTsushoDueDates` をマージ → 暫定満了予定を**実満了日(📅リハブ満了日)表示**に差替・無い人は暫定(≈)へフォールバック。本番反映(origin/master系譜 `6232f74`、現在は3749992の先祖)。
- **荒谷誤入力クリア**：荒谷の最終作成日に未来日11/30(満了日)が誤入力されていた→`updateTsushoPlan value=''`でクリア済。**記録の空行は残存**（plan_date空・他の人に出ない送付チェック行が1つ出る軽微差）。完全パリティはスプレッドシート「通所介護計画書記録」で荒谷行を手動削除（任意・無害）。

## 2. 今の状態（重要・実測）
- **origin/master = `3749992`**。今セッションのmonitoring task1(6232f74)はこの先祖＝保持。別セッションが上に **`08b75fc` soufu「送付方法別」表示**（ケアマネ送付チェックリスト.html変更）＋口腔動画docsを追加済。
- ローカルHEAD = `2e8c6ef`（branch `fix/before-planstart-guard`）。
- **GAS @279 稼働中**（getTsushoDueDates応答・満了日113件・荒谷=2026-11-30）。
- バックアップ原本(ロールバック用・読取専用)=`C:/Users/mh/yawaragi-gas-backups/2026-06-27_yawaragいボード_1pJN4/`（コード.js SHA `0188839f…`）。復帰=これをclasp push→デプロイ@278へ。

### ⚠️ 落とし穴（次セッション必読）
- **clasp CLIトークンが失効**（invalid_rapt）。GASをpush/deployする日は最初に `clasp login` 再認証が要る（板GASのscriptIdは上記）。
- **リポジトリの `gas_yawaragiボード.gs` は古いスナップショット**（setTsushoDueDate無し）。**絶対にclasp pushしない**（@279=満了日コードごと巻き戻る）。本番の正本は @279、作業コピーは `scratchpad/gas-board-pull/`。
- 板GASは**共有バックエンド**（通所/送付/口腔/区分/yawaragiボード）。改修は「追加のみ」＋差分目視＋デプロイ前にHEAD vs デプロイ版のドリフト確認、を厳守。
- 本番反映の作法：単独コミット→origin/master上worktreeでcherry-pick→`--stat`で対象1ファイル・他混入なし目視→社長go→push→SHA一致→curl実測→worktree撤去。no-storeアプリ(monitoring/soufu)はbump不要・genba/version.txt系のみ`bump-app-version.js`。
- git日本語名は `git -c core.quotePath=false`。

## 3. 残タスク（優先順位つき・やるまで残す）
### 🟢 すぐ可（clasp不要・小）
- **F: 未来日ガード** — monitoring.html `plan-date-input` onchangeで未来日を弾く/警告（荒谷誤入力の再発防止）。
- **K: kubun残エラー3つ** — applySchedCb/kubunScheduledCb/kubunDelayCb未定義（非致命）。init重複呼び削除＋cbNameにrandom付与。[[project_kubun-app-堅牢化]]
- **E: 自費グレーアウト** — monitoringで自費利用者をグレーアウト＋「自費利用」表示。先に「台帳に自費フラグがあるか」確認要。利用者041(2033長期=自費)が発端。

### 🟡 要設計・中（clasp不要だが詰め要）
- **A: Phase6 task2 横断ビューの結果報告を実満了日ベースに** — 利用者103(満了6/30)が正しい月に出るように。`monitoringFinalEvalMonth`(shared.js L451)は**触らず**、soufu側で`getTsushoDueDates`をfetchしfinalEvalMonthを満了日由来で上書き。**設計1枚を先に**＋**soufuは最新master(送付方法別入り)の上で**作業。吉崎で検証。

### 🔴 重い（clasp再認証＋調査前提）
- **B: Phase6 task3 事業対象者6名を計画書タブに表示** — board台帳(getTsushoTargetUsers_=108)に6名(利用者040/利用者045/利用者054/利用者072/利用者087/利用者090)が不在＝**名簿ギャップの調査から**。満了日は投入済だが表示されない。
- **J: 口腔アプリ2分割** — getOralPlansにdocType追加＋clasp再認証＋既存109件分類。[[project_口腔アプリ2分割-設計済み実装次回]]

### ⚪ 軽微・確認待ち
- **D: 利用者111の満了日** — リハブ未設定＝1件。設定され次第 setTsushoDueDate。
- **G: 荒谷の空記録行** 手動削除（任意・cosmetic）。
- **最終作成日(plan_date)の廃止検討** — 結論：**消すと横断ビューの通所計画書ケアマネ送付が壊れる**（getTsushoPlansがplan_date必須）。満了日(締切)と最終作成日(作成→送付の起点)は別役割・補完。→ **要確認：通所計画書をケアマネに送る運用はこのアプリ(横断ビュー)経路か別経路か**。それ次第で廃止可否判断。

## 4. 個別機能訓練アプリ分析（通所改良のお手本・完了）
個別の1人立ちは「①サイクルから当月該当者を自動算出→②カウントで仕事量を数で出す→③色で進捗/取りこぼし可視化→④ケアマネ未提出ビューで送付漏れ防止」の4点セット。
- **通所に足すべき＝★1（満了日から「今月作るべき人N」を自動カウント/抽出）＋★4（満了連動の今月送付ビュー）**。今は満了日を表示しただけ。
- 逆に**通所の実満了日カウントダウンは個別に還元できる強み**（個別はサイクル月単位判定のみ・実日付なし）。

## 5. 進行中スレッドの「次の一手」
社長のおすすめ確認待ち。クロコ推奨＝**F(未来日ガード)で荒谷の件を完全クローズ → A(task2)設計** の順。clasp要のB/Jはやる前に`clasp login`。

## 6. データ確認のコツ（読み取り専用）
- 満了日：`curl "…/exec?action=getTsushoDueDates"` → {userId:'YYYY-MM-DD'}
- 通所計画：getTsushoPlansYear(users+records) / getTsushoPlans(月次・plan_date必須)
- 台帳：USERS_API(114人) ＝ board台帳(108・事業対象6名欠落)とは別ソース。
- node fetch可（v24）。書込系(setTsushoDueDate/updateTsushoPlan等)は社長承認なしに叩かない。
