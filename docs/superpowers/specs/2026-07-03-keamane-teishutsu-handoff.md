# 引継ぎ文 — ケアマネ提出物統合管理アプリ（2026-07-03セッション）

## 0. まず
MEMORY.md が自動ロードされる（`project_ケアマネ提出物統合管理アプリ-v1確定.md` が本件の索引）。この引継ぎ文は「今の状態スナップショット＋承認待ち3件」だけ。詳細はdocs/superpowers/specs/の各設計書とmemoryを辿る。

## 1. 今セッションで完了・本番反映済みのもの

- **Phase 0**: 板GAS `getTsushoTargetUsersV2_` + action `getTsushoPlansYearV2` を純粋追加（@282デプロイ）。事業対象者6名（塩島孝子/鈴木菊枝/知久淑子/長谷川正/松嵜由子/南靜子）を含む113人を返す。既存5action無退行を前後比較で証明。
- **Phase 1**: 「提出送付台帳」新シート14列＋action `getSoufuLedger`/`upsertSoufuStatus`（真の冪等・LockService直列化）＋`backfillSoufuLedgerMoni`（モニ103件をシート/PDF送付日から投入済み・冪等確認済み）。板GAS最終状態=**@287**。
- **Phase 2フロント**: `teishutsu.html` 新設・**origin/master `ba0863d`・github.io 200配信済み**（no-store・既存アプリ無変更）。当日ベースの変換層で件数実測済み（実buildTasks実測92件・7月時点）。
- **B1修正（重要）**: 個訓(kokun_set)の対象月判定が仕様違反だった（`isPlanMonth∪isHyoukaMonth`で37件→開始月に前月完了済みタスクが過剰表示）。`isHyoukaMonth`のみに修正し20件に。実測: 伊熊二三子(8月開始)が「7月分: 個訓セット（8月〜）」と正しく表示。
- **A/C修正**: 操作者呼称「代表」に統一（Gaku廃止）。optgroupでスタッフ/代表を視覚分離。権限マトリクス`PERM`定数1箇所に集約（揃った=スタッフ全書類/代表kokun_setのみ、送付済=代表のみ）。フィルタ「測定」→「測定(要支援)」に改名。
- **柳瀬さと事件・解決済み**: 6/1区分変更（要介護1→要支援2）が区変履歴には正式記録済みだったが、台帳の介護度列だけ未反映。**横断突合で他5件の区変適用は全て正常**＝構造バグではなく柳瀬さん1名の個別不整合と結論。社長が台帳セルを直接修正→USERS_API/V2/teishutsu変換層で要支援2化・moni対象化を実測確認済み。

## 2. 承認待ちで止まっている3件（次のアクション）

### 🔴 最優先: sokutei（要支援測定）60名の紙台帳照合
- 社長提供の紙台帳PDF（`要支援の測定（４ヶ月）.pdf`）を構造化: `C:\tmp\gas-board-phase0\sokutei-paper-2026.json`（60名・7月25/8月15/9月20）。字体2件を台帳表記に正規化済み（円城寺弘江→圓城寺弘江／成田繫子→成田繁子）。柳瀬さと（9月アンカー）合流済み。
- 現役要支援59名との機械突合＝**完全一致**（平野啓二=利用終了のみ差分・履歴として投入予定）。
- **社長からの照合承認（紙とのつき合わせOK）待ち**。承認後 → sokutei投入diff（Phase B record action・dryRun→件数突合→投入の3段階）を提示する段階。
- sokuteiのdocTypeフローは確定済み: 測定→測定結果の2状態のみ（計画書工程なし・加算なし）。周期=前回測定日+4ヶ月ローリング（現行のplanStart近似は実データと3/25名しか一致せず不採用・紙台帳が正）。
- 投入先は **sokutei.html Phase Bの設計（列構成=設計書§6）を正とし、teishutsu側から合わせる**方針。sokutei.html側の設計者と整合を取ってからGAS diff作成。

### 🟡 GASデプロイ待ち: スタッフマスタ
- diff完成済み（`C:\tmp\gas-board-phase0\staff287.diff`・@287基点74行純粋追加）。新シート「スタッフマスタ」＋action `setupStaffMaster`/`getStaffMaster`。seedは8名（勝又/星野/下浦/髙山/春山/石井/工藤/大久保）+代表。
- **請求繁忙期（1〜10日）を避けて後日clasp push**の方針（社長承認済み）。今はteishutsu.html側のフォールバック（`STAFF_FALLBACK`定数）で動作中、GASデプロイ後は自動でgetStaffMasterに切り替わる。
- 名前の正本は既存 `action=staff_list`（シフト希望SS）＝入退社はそちらの更新で足りる。スタッフマスタは統合アプリ固有属性（role/対象/表示順）だけの差分シート。

### 🟢 実機フィードバック待ち: Phase 2細部調整
社長がteishutsu.html（ https://m-higa-sys.github.io/yawaragi-apps/teishutsu.html ）を実機で触った上での次の指示待ち。既に出ている指示は上記B1/A/C修正で対応済み。

## 3. 積み残しタスク（急がない・memory記載済み）

1. **同名衝突の識別表示**: 伊藤フミ子・伊藤ふみ子は別人と社長確認済み（クレンジング不要）。同姓同音衝突時のみケアマネ事業所名を氏名脇に小さく併記する方針（フリガナ正規化一致で検出）。実装は実機OK後。
2. **区変履歴 vs 台帳介護度の不一致検知**: 柳瀬さん事件の再発防止策としてPhase 5朝報相乗りの候補に登録済み（社長承認済み・急がない）。
3. **localStorage移行UI**: 旧ケアマネ送付チェックリストの進捗（社長端末のみ）を台帳へ一括取込。旧キー→docTypeマッピング表を提示して確認要（train/evalの意味取り違え注意）。
4. **Phase 2b以降**: 前月準備の原則の他docTypeへの展開（通所計画書・口腔は既に翌月表示済み）／サイン期限自動計算（Phase 3・休業日正本=[[yawaragi-kyugyobi-seihon]]: 土日休・年末年始12/30〜1/3・夏季8/13〜15・祝日は営業）／管理者ビュー／繰越理由チップのprompt→ちゃんとしたピッカー化。

## 4. 落とし穴（次セッション必読）

- **repo内 `gas_yawaragiボード.gs` は古いスナップショット**。clasp push厳禁。作業は `C:\tmp\gas-board-phase0\コード.js`（@287相当・スタッフマスタ差分込み）を正本に。デプロイ前は必ず `clasp pull` で最新@番号を確認してからdiff。
- **シートTZ罠（米西海岸系）**: 提出送付台帳は全列テキスト書式（`setNumberFormat('@')`）＋「書式確定→setValues」の同一パスで書く。`appendRow`は先頭ゼロ落ち・Date誤解釈の温床なので使用禁止。列を増設する場合は書式範囲（現状A:N）もセットで拡張。
- **clasp認証**: セッション開始時に切れていることが多い。`clasp login`→ブラウザ承認（m-higa@keepfitlife.com）。
- teishutsu.htmlの周期判定5関数（isMeasureMonth/normOffice/resolveSoufu/METHOD_GROUPS/methodGroupOf）は **shared.jsではなくケアマネ送付チェックリスト.htmlのインライン定義**。shared.js由来は isPlanMonth/isHyoukaMonth/isOralEvalMonth の3つのみ。

## 5. 作業場所

- `C:\tmp\gas-board-phase0\` — GASコード作業場（`コード.js`＝最新・`.pristine-backup`等の各段階スナップショット・各種verify-*.mjs検証スクリプト）
- `C:\tmp\gas-board-287\`, `C:\tmp\gas-board-286-check\` — 差分検証用のクリーンpull場所（使い捨て）
- `C:\tmp\wt-teishutsu-*` — 隔離ワークツリー（push後は削除済み）
