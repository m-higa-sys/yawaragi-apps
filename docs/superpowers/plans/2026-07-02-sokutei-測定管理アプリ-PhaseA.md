# sokutei.html 測定管理アプリ Phase A 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 測定の優先順位（利用者側）と実施バランス（スタッフ側）を3タブで見える化する sokutei.html を、既存 GAS action のみ（GAS変更ゼロ）で作る。要介護分先行・要支援は Phase B。

**Architecture:** 単一HTML＋fetch（teirei.html と同型）。優先度純関数は `scripts/test-sokutei-priority.js`（my-project）と二重持ちTDD。利用率は usage_stats（Task A2 で実測検証・不可なら来館者のみ monthly_usage 並列6本に縮退）。

**設計書:** `docs/superpowers/specs/2026-07-02-sokutei-測定管理アプリ-design.md`（§3 優先度ロジック・§4 画面が正本）

---

## Task A1: 優先度純関数テスト＋実装（TDD・テストが正本）

**Files:** Create `C:\Users\mh\OneDrive\デスクトップ\my-project\scripts\test-sokutei-priority.js`

- [ ] 純関数を実装しテストを書く（teirei の test-teirei-tasks.js と同じ自己完結形式・'use strict'・eq()ヘルパ・exit code）:
  - `sokuteiCycleMonths_(care)` → 要介護*=3、要支援*/事業対象*=4（care文字列の前方一致・不明は4）
  - `sokuteiDueDate_(baseDateStr, care)` → base+サイクル月（YYYY-MM-DD文字列演算・月末丸め: 3/31+3ヶ月=6/30）
  - `sokuteiRemaining_(dueDateStr, todayStr)` → 日数差（負=超過）
  - `sokuteiTier_(care, remaining)` → 0:要介護×remaining<0 / 1:要介護×remaining<=30 / 2:要支援等×remaining<0 / 3:その他
  - `sokuteiBadge_(care, remaining)` → 'red':要介護超過 or remaining<=7 / 'yellow':remaining<=30 or 要支援等超過 / 'white'
  - `sokuteiUsageRate_(months)` → months=[{scheduled,attended}...]（直近3ヶ月分）。**scheduled>0 の月だけ**でΣattended/Σscheduled。全月 scheduled=0 なら **1**（ペナルティなし）
  - `sokuteiRemainingVisits_(daysStr, todayStr)` → 利用曜日文字列（例'月水金'）から今日**より後**の当月該当日数
  - `sokuteiSort_(rows)` → tier昇順→E=R×U昇順→氏名かな順。rows=[{name,care,remaining,R,U,...}]
- [ ] **必須テストケース**（発注完了条件）: ①要介護×期限超過が最上位 ②同tier内で「週1(R小)×利用率低(U小)」が「週5×利用率高」より上 ③scheduled=0月が分母から除外される ④全月データ無しでU=1 ⑤月末丸め（1/31+3ヶ月=4/30） ⑥要支援超過(tier2)は要介護接近(tier1)より下
- [ ] `node scripts/test-sokutei-priority.js` → ALL PASS・exit 0 → コミット `test(sokutei): 優先度純関数テスト+実装`

## Task A2: usage_stats の実測（利用率の取得方式確定）

- [ ] `curl -s "<yawaragiボードexec URL>?action=usage_stats" -L`（パラメタ違いも試す: `&yearMonth=2026-06`）。返り値に**全利用者×月別の 予定数/欠席(or実来館)** があるか実レスポンスで確認。
- [ ] 判定を報告: (a)全員一括で直近3ヶ月の scheduled/attended 相当が組める → 主案採用 / (b)組めない → タブ1は attendance の来館者のみ monthly_usage を**並列6本ずつ**×3ヶ月で取得（タブ2の E 列は「—」表示に縮退）。**判定結果と実レスポンス構造を Task A3 のプロンプトに引き継ぐ。**

## Task A3: sokutei.html 実装

**Files:** Create `c:\dev\yawaragi-apps\sokutei.html`

- [ ] 設計書§3§4 に従い実装。参照実装: `teirei.html`（fetch/カード/ピルの流儀・no-storeメタ）、`個別機能訓練計画書チェック.html`（getKeikakushoYear の呼び方: fetchYear(fy)+fetchYear(fy+1) の2年分マージ・records の sokutei_date/sokutei_by の読み方・MEASURER_EXCLUDE=['代表','小野','林']）。
- [ ] データフロー: 起動時に attendance(今日)+user_list+staff_list+getKeikakushoYear(今年度・前年度)+利用率データ（A2の方式）を並列 fetch → 純関数で優先度計算 → 3タブ描画。
- [ ] タブ1: 来館予定者を sokuteiSort_ 順。各行=氏名/介護度/前回測定日/残り日数(⚠超過)/残りチャンスE(小数1桁)/バッジ🔴🟡⚪。**測定済み（当サイクル内）・欠席者は灰色で下**（社長回答②）。
- [ ] タブ2: 全対象者（要介護のみ・Phase Bで要支援追加）を期限昇順。次回来館予定日（利用曜日から）。要介護度フィルタ。
- [ ] タブ3: 期間切替[1ヶ月|2ヶ月|3ヶ月]（getKeikakushoYear records の sokutei_date を期間でフィルタし sokutei_by 集計）。スタッフ別 件数・シェア%・最終測定日・**0件スタッフも表示**（staff_list−除外3名 全員分の行）・多い順。**dataviz指針: バーは単一色(#4272D8系1色)・凡例なし・div幅%の細身角丸バー・値は行内テキスト（バー色文字禁止）・グリッドなし**。「※データ起点 2026/6/15（Phase1開始）」注記。
- [ ] 純関数はテストファイルから**同一コード転記**（awk diff で突合）。localStorage 不使用。no-store メタ。要支援タブ表示は「紙台帳データ化後に表示されます（Phase B）」の1行注記。
- [ ] 検証: JS抽出→`node --check`／純関数 awk diff 突合／実 API を curl して返り値キーとコードの参照キーの一致確認（attendance/user_list/getKeikakushoYear/staff_list）。コミット `feat(sokutei): 測定管理アプリ（3タブ・要介護分）`

## Task A4: 2段レビュー

- [ ] spec: 設計書§3§4 と発注完了条件（優先度順・週1×低利用率が上位・%の期間切替・0件表示・灰色残し・起点注記）との突合
- [ ] quality: teirei 品質レビューと同観点＋XSS（esc() 通し漏れ）＋API呼び出し回数（起動時 fetch 本数が過剰でないか）

## Task A5: 🔒社長承認 → master push → 実測突合

- [ ] 停止して承認依頼（差分サマリ: sokutei.html 新規のみ・既存ファイル変更ゼロ）
- [ ] 承認後: 隔離WT(C:\tmp)→cherry-pick→ff push→fresh fetch grep→github.io curl 200 確認
- [ ] **実測報告**（発注完了条件）: ①実データで要介護×超過が最上位に並ぶスクリーン相当の出力 ②スタッフ%を1つの期間で**手計算突合**（getKeikakushoYear records から該当期間の sokutei_by を数え、画面の%と一致） ③テスト ALL PASS の実出力

## Task A6: portal 導線

- [ ] アプリ台帳SSへの行追加手段を確認（GAS action にあるか）。無ければ追加内容（アプリ名=測定管理/カテゴリ/URL=https://m-higa-sys.github.io/yawaragi-apps/sokutei.html/icon=📏/表示順）を提示して**社長に1行追加を依頼**。追加後 portal.html 実表示を curl/getAppRegistry で確認。

## Phase B（別計画・列構成確定＋用紙写真後）

シート「要支援測定記録」＋getShienSokutei/addShienSokutei（読み戻し検証）→ 🔒clasp push承認 → 紙データ投入 → sokutei.html に要支援統合表示＋ワンタップ記録UI。
