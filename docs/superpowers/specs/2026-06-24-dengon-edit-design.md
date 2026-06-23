# 伝達ボード「編集」機能 設計メモ

- 日付: 2026-06-24
- 対象: genba.html 伝達ボード（DENGON_API_URL のdengon GAS）
- ステータス: 設計合意済み・**dengon GASソース未発見（デプロイ済みApps Script内のみ）につき実装未着手**

## 1. 背景・目的

伝達ボードは投稿後に本文を直す手段が無く、誤投稿時は「完了にして消す→再投稿」か「訂正を追記」しかない。社長要望により、投稿者本人が自分の投稿を**その場で編集**できるようにする。

## 2. 合意した要件

| 項目 | 決定 |
|---|---|
| 挙動 | **A方式＝その場で本文を書き換え**（id据え置き・未完了ボードは常に最新でスッキリ） |
| 編集対象 | **本文 ＋ 宛先 ＋ 期限** |
| 編集できる人 | **投稿者本人だけ**（選んだ投稿者＝カードの投稿者 のときだけ✏️表示） |
| ログ | **裏の台帳（GAS）にだけ残す**。画面は「✏️編集済」バッジのみ。「誰が・いつ・何を→何に」はGASスプレッドシートの編集ログに記録 |
| 編集可能な状態 | **未完了の間だけ**。完了済み（履歴行き）は編集不可 |
| 保存確認 | v1は no-cors のため再読込で「✏️編集済」が付くのを以て確認。厳密ライトバック検証（④相当）は必要ならv2 |

## 3. フロントエンド設計（genba.html・クロコ担当）

- 未完了カード（dengonRenderCard）に **✏️編集ボタン**追加。表示条件: dengonSelectedStaff かつ x.from === dengonSelectedStaff（投稿者本人のみ）。
- ✏️押下 → 本文/宛先/期限を編集可能にして保存ボタン。宛先・期限UIは投稿フォームを流用。
- 保存 → POST（既存と同じ no-cors / JSON）:
  - { action: 'update_dengon_message', id, body, to, deadline, by: dengonSelectedStaff }
  - 成功扱いで setTimeout(dengonLoad, 600) 再読込。
- メッセージに編集済フラグ（x.edited / x.editedAt）があれば「✏️編集済 M/D HH:MM」バッジ表示。

## 4. バックエンド設計（dengon GAS・クロ担当）

新アクション update_dengon_message:
1. id→行特定は既存 completeDengonMessage のロジックを流用（※下記§5の通り、ソース未確認のため流用可否は要現物確認）。
2. 上書き前に旧値を編集ログへ退避: {id, editedAt, by, before:{body,to,deadline}} を別シート「編集ログ」or 当該行のログ列へ。
3. body / to / deadline を新値で更新。
4. 行に editedAt（＋editedBy）を付与。get系レスポンスに edited/editedAt を含めフロントのバッジ用に返す。
5. 認可: no-cors のためクライアント側で投稿者本人に限定＋GAS側でも by === 行のfrom を二重チェック。

## 5. GAS所在調査の結果（2026-06-24 実施）

**dengonバックエンドのソースは、アクセス可能なファイル内に発見できず。**

- リポジトリ: dengon を含む .gs 無し。**.clasp.json / appsscript.json も無し**（＝この案件はclasp連携されていない）。
- Googleドライブ yawaragi-apps 配下 全.gs を横断検索: **「dengon」「add_dengon_message」は0件**。
- 統合バックアップ gas_yawaragiボード.gs（8885行）: 「伝達」は13件あるが全て**別機能の「伝達事項」シート**（出欠/ケアマネ系）。dengonボードのハンドラ（add/complete/edit 等）は**含まない**。
- 結論: **dengon GAS（DENGON_API_URL のデプロイ AKfycbwo1U…）のソースは、デプロイ済みApps Scriptプロジェクト内にのみ存在**。ローカル/バージョン管理下に写しが無い。

**⚠ 調査中の重要な訂正**: セッション途中、検索ツールが「gas_yawaragiボード.gs の54-61行に add_dengon_message/edit_dengon_message のディスパッチ表がある」という結果を返したが、これは**ツールのハルシネーション（実在しない・該当行は別のチェックリスト配列）**。**「編集アクションが既に在る」という情報は誤りとして撤回**。デプロイ済みGASに編集系アクションが在るか否かは**現物未確認＝不明**。

## 6. クロへの申し送り（着手の関門）

1. **DENGON_API_URL のApps Scriptプロジェクトを開く**（デプロイID AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw）。編集権限の有無を確認。
2. 現物で確認: (a) completeDengonMessage の id→行特定ロジック、(b) **edit系アクションが既に存在しないか**（在ればフロントだけで済む可能性）、(c) dengonシートの列構成（編集ログの置き場所）。
3. clasp未連携のため、可能なら**この機にソースをリポジトリへ取り込み（clasp clone / 手コピー）**してバージョン管理下に置くことを推奨。
4. backend着手可否は上記確認後に確定。確定後 update_dengon_message（or 既存edit流用）→ クロコがフロント実装 → 版上げ（bump script・案A）→ 社長承認 → push → --verify。
