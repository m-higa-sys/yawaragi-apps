# セッションボード（当日業務ピックアップ）引き継ぎ — 2026-07-12

新しいチャットはこの1枚を読めば続きから作業できる。

## 一言サマリ
当日AM/PM出席者 × 5業務（口腔モニ・測定・口腔体操・個訓・誕生日）の「今日この人にこれをやる」を自動ピックアップする新アプリ。**判定ロジックの純関数層（Phase 1）＋測定の優先順位ロジック（Task 4C）は実装完了・全テスト緑・二段レビュー済み**。次は社長がプレビューの見た目を確定 → Phase 2（GAS配線）→ Phase 3（HTML本番fetch）→ Phase 4（本番反映）。

## ブランチ / 状態
- 作業ブランチ **`feat/asa-board`**（`feat/furikae-100ten-card` から分岐・**未push**）。HEAD＝`ed32f6d`。
- **本番影響ゼロ**：私の変更は core/judges/test/docs の6ファイルのみ。`gas/yawaragi-board/コード.js`・`version.txt`・HTML は一切触っていない。
- テスト：`node scripts/test-session-board.js` → **91 passed**、`node scripts/test-session-board-judges.js` → **182 passed**（合計273緑）。

## 正本ドキュメント（必読）
- 設計spec：`docs/superpowers/specs/2026-07-11-session-board-design.md`（**唯一の真実源**。矛盾したらspec優先。特に §2.4 測定優先順位、§3.4 名寄せ規約、§3.6 Q4データソース）
- 実装計画：`docs/superpowers/plans/2026-07-11-session-board.md`（Phase 1〜5・Task 10に**確定データ契約**）

## 完成物（Phase 1 + Task 4C）
### `gas/yawaragi-board/session-board-core.js`（GAS/node両用・ES5 var・SpreadsheetApp非依存・末尾module.exports）
判定純関数（21本）。要点：
- **名寄せ**：`sbNormalizeName_`（NFKC＋全空白除去＋敬称除去）。全業務の突合キーはこれを通す。マップ照合する関数は内部でマップのキーも正規化（§3.4・表記ゆれ耐性）。
- **出席**：`sbUniquePresent_`（am/pm一意化・出席のみ・正規化キー）。
- **測定2系統**：要介護＝`sbMeasureKaigo_`（`isHyoukaMonth`＝個訓評価月・当評価月未実施）、要支援＝`sbMeasureShien_`（前回実測定日+4ヶ月・未測定最優先）。両者とも **enriched未ソート**（careLayer/weeklyVisits/remainingVisits/absenceRate付与）。並びは `sbSokuteiSort_` が唯一の権威。
- **測定優先順位（Task 4C・社長訂正の1プールモデル）**：`sbCountWeeklyVisits_`（利用曜日→週回数）、`sbCountRemainingVisits_`（明日〜月末の残来所日数）、`sbMeasureUrgency_`（加重加算スコア）、`sbSokuteiSort_`（careLayer↑→urgency↓→tiebreak）。式は spec §2.4。既定重み `SOKUTEI_WEIGHTS={chance:1.0,freq:0.6,absence:0.6,unmeasuredBoost:2.0}`（`sbBuildBoard_` 直前・**実データ確認後に調整可**）。
- **他業務**：`sbKoukuMoni_`（oralCycleAt注入・role未実施）、`sbKoukuTaisou_`（isTarget/is_target両対応）、`sbKotan_`（要介護前方一致・非中止）、`sbBirthday_`（今月誕生月・撮影未完・当日出席フィルタなし）。
- **交差/安全弁**：`sbIntersectPresent_`（対象×出席）、`sbResidue_`（名寄せ不能＝出席したが台帳と氏名不一致→末尾表示）。
- **集約**：`sbBuildBoard_(input, judges)` — 測定は1プール統合ソート、誕生日は非交差、residueは4当日業務のhitから算出。

### `gas/yawaragi-board/session-board-judges.js`
`isHyoukaMonth`（shared.js）と `oralCycleAt`（oral-plan.html）の**GAS実行可能な逐語移植**。GASにこの2関数が無くPhase 2で落ちる穴を封鎖。`scripts/test-session-board-judges.js` が byte一致＋挙動マトリクスで drift 監視。

## 測定優先順位モデル（社長確定・要理解）
測定は**要介護/要支援を分けず1プール**。上位N（既定3）が「今日やる」、残りが「余裕があれば」。
- 第0層 `careLayer`：要介護(0) ＞ 要支援・事業対象(1)（要介護=加算必達、要支援=翌月可）。**要介護は必ず要支援より上**。
- 第1層 `urgency`（加重加算・高い順）：取り逃しリスク＝`W_CHANCE×1/(残来所+1) + W_FREQ×1/週回数 + W_ABSENCE×欠席率`（未測定要支援は`+UNMEASURED_BOOST`）。週1・欠席多・残来所少ほど先。欠損（利用曜日不明）はchance/freq=0で誤上位化しない。
- Q5：週回数＝台帳「利用曜日」の曜日文字数（日数ベース・AM/PM不使用）。Q6：欠席率＝`1−U`、U＝出席率（`usage_stats`・運用開始2026-04以降/直近3ヶ月・`isPreOperational`除外）。

## いま社長ボール：プレビュー確認待ち
- プレビュー（自己完結・サンプルデータ・1プール優先順位表示）：Artifact **https://claude.ai/code/artifact/41c9d903-948d-4362-9a1c-8f224b0af07c**（元HTML＝スクラッチパッド `session-board-preview.html`）
- 社長に3点確認中：①並びロジック（要介護上・層内リスク順）で合っているか ②カードの根拠表示（週N・残来所N・欠席%）の粒度 ③他セクションの順番・見た目。要望があれば直して再提示（Artifactは同URL更新）。

## 残タスク（社長の方針：Phase 3→Phase 2の順、GAS配線は🔒鍵付き単独実行）
1. **Phase 3 session-board.html（描画専用・本番fetch配線）**：プレビュー確定後、承認レイアウトを実ファイル session-board.html へ移植。版ゲートは genba.html:4-23 を流用（shared.js不要の自己完結型）。fetch は `action=sessionBoard&date=` を1回叩くだけ。測定NはlocalStorage。github.io前提。
2. **Phase 2 board GAS `sessionBoard(e)`（🔒危険時間帯は避け・clasp pull突合必須）**：`gas/yawaragi-board/コード.js` に薄い `sessionBoard(e)` 追加＋doGet分岐1行。既存取得関数（getAttendance/getKeikakushoTargetUsers_/getOralPlansYear/getShienSokutei/getUsageStats）を叩き、Task 10の**確定データ契約**で input を組んで `sbBuildBoard_` を1回呼ぶ。judgesはsession-board-judges.jsのグローバルを渡す。**着手前に必ず `clasp pull` で本番突合**（過去、本番のみ機能を消しかけた再発防止・MEMORY runbook）。deploy は `clasp deploy -i "<既存ID>"` で同一URL維持。
3. **Phase 4 本番反映（社長承認要）**：portal台帳(getAppRegistry)登録＋`node scripts/bump-app-version.js <版>`（手編集禁止）＋SHA一致確認→社長OKで手push→`--verify`。
4. **Phase 5（後日）**：morningDigest要約行あと足し（同core流用・safe('chushi')の直後）。

## Phase 2 データ契約（`sbBuildBoard_` の input・Task 10に詳細）
`input = { year, month, today, attendance:{attendance:{am,pm}}, kaigoUsers[{name,category,planStart,planMonths,days,cancelled?}], kaigoDoneByKey{name:true}(当評価月にsokutei_date済), shienUsers[{name,care(=category写像),days}], shienLastByName{name:'YYYY-MM-DD'}, usageByKey{name:出席率U}(usage_statsから), oralUsers[{name,planStart,planEnd}], oralRecByKey{name:{moni1_date,moni2_date,houkoku_date,plan_date}}, oralSettings[{name,isTarget}], allUsers[{name,category,cancelled?}], bdUsers[{name,birthday:'M/D'}], bdStatusByKey{name:{photo,print,give}} }`。judges＝`{isHyoukaMonth, oralCycleAt}`（session-board-judges.jsのグローバル）。
- 誕生日status（§3.3）：既定＝sessionBoardがbirthday SYNCをUrlFetch。初版フォールバック＝撮影除外なし（bdStatusByKey空）。
- **落とし穴**：計画開始月の正本＝台帳「計画書開始/計画月数」（updatePlanStart＝getKeikakushoTargetUsers_同一列・キャッシュ無し自動連動）。ただし計画作成と開始月更新は非連動＝更新漏れ運用リスクあり（Phase 2解決不要・②要約行/リマインドで補完余地）。

## 運用ルール（このプロジェクト厳守）
- 純関数はTDD（`scripts/test-*.js`・素node・`ok(cond,label)`）。GAS改修前に必ず `clasp pull` 突合。本番push＝master・社長承認・`bump-app-version.js`経由（version.txt手編集禁止）・`--verify`で反映確認。
- 完了定義＝master反映＋版上げ＋本番反映証跡まで（ブランチ上PASSは未完）。孤立ブランチ検知 `node scripts/check-orphan-branches.js`。

## 直近コミット系譜（feat/asa-board）
Phase1: 名寄せ→出席→sokutei転記+要支援→要介護→judges移植(5B)→口腔モニ→体操/個訓→誕生日→交差/residue→集約→最終レビュー修正(isTarget/track)。Task4C: 優先順位純関数4本(216a9ac)→補強(ea74db8)→統合(ed32f6d)。docsは efad9c7 等。
