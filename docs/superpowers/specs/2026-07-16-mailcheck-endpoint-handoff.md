# mailcheck endpoint（最終メール報告日時の永続保持）実装ハンドオフ

- 日付: 2026-07-16
- ブランチ: `feat/mailcheck-endpoint`（worktree `C:/tmp/wt-mailcheck`・origin/master `0383ee4` 起点）
- コミット: `b2d96dd`（実装）→ `f431c90`（流儀修正）
- 版: **不要**（版ゲート内HTML編集ではない。HTML/version.txt 無変更）

## 何を作ったか
朝報告でメールを読むとき、「軽く開いて既読にした」「1日忘れた」場合でも前回報告以降のメールを取りこぼさないための **「前回メール報告日時」を永続保持する土台**。

- **保存先**: ScriptProperties キー `LAST_MAILCHECK_AT`（ISO8601 UTC）
- **GET `action=last_mailcheck`**: 最終報告日時を返す。未設定なら既定=24h前。
  返り値 `{ ok, lastMailcheck(ISO), isDefault, defaultHours, epochSec }`。`epochSec` は Gmail `after:` 用。
- **`action=set_mailcheck`**: 日時を「今」に更新（`?at=ISO` で明示指定可）。read-back検証つき。
  返り値 `{ ok, lastMailcheck, previous, epochSec }`。
- 起点は「既読/未読」ではなく **「届いた日時」**。前進は自動でなく、**社長の完了合図で set を叩いた時だけ**（忘れても翌朝へ持ち越し）。

## 変更ファイル（161追加・0削除／純additive）
1. `gas/yawaragi-board/mailcheck-core.js`（新規・純ロジック正本）
   - `MAILCHECK_PROP` / `MAILCHECK_DEFAULT_HOURS` / `mcIsValidIso_` / `mcToIso_` / `mcResolveLastCheck_` / `mcComputeSetValue_`
2. `gas/yawaragi-board/コード.js`（+49・0削除）
   - doGet に routing 2本追加（completeNewMail routing の直後）
   - ハンドラ 2本追加（checkNewMail の直前）。**純関数は内包せず core を呼ぶだけ**（intake-auth-core と同流儀。rootDir="." で core も push されるため内包すると二重宣言になる）
3. `scripts/test-mailcheck-core.js`（新規・node test 22 PASS）

## ローカル検証済み（証跡）
- `node scripts/test-mailcheck-core.js` → **22 passed, 0 failed**
- `node --check コード.js` / `mailcheck-core.js` → 構文OK
- diff: コード.js **49追加0削除**、hunkは 1165行(doGet) と 13290行(checkNewMail手前)＝**morningDigest本体(6878-)非接触**
- 二重宣言なし: コード.jsに純関数定義0/呼出のみ、coreに定義各1

## ⚠️ 未検証（本番デプロイ後に社長＋クロで実測すること）
GAS実行時挙動（PropertiesService読み書き）はローカル不可。デプロイ後に下記を実測:
- [ ] GET `?action=last_mailcheck` が日時JSONを返す（初回は `isDefault:true`・24h前）
- [ ] `?action=set_mailcheck` で `lastMailcheck` が「今」に更新（再GETで前進確認）
- [ ] morningDigest（`?action=morningDigest`）の既存フィールドが従来通り返る（退行なし）

## 本番反映手順（社長の手・clasp操作は dangerouslyDisableSandbox 必須）
**⚠️ 本番 コード.js はドリフトあり（dengon等 repo未反映の関数を本番のみ保持）。naive な `clasp push` は本番専用コードを消す危険。必ず pull 突合してから。**

1. `git fetch` して origin/master 最新確認（このブランチを rebase）
2. clasp プロジェクト `gas/yawaragi-board`（scriptId `1pJN4vjIRM9NMGxco42P...`）で **`clasp pull` 先行** → 本番 コード.js を取得
3. 本番 コード.js と origin/master(0383ee4) を diff → **本番専用ドリフトを把握**
4. 本ブランチの **49行additiveブロック**（routing 2本＋ハンドラ2本）を本番snapshotへ graft＋ `mailcheck-core.js` を新規追加
   - アンカーは本番に存在: `completeNewMail` routing（2026-07-14デプロイ済）と `function checkNewMail`
5. `clasp push` → **`clasp deploy -i <既存デプロイID>`（URL維持・新規作成禁止）**
6. push前後で本番コードに `lastMailcheckAction_` / `setMailcheckAction_` / `MAILCHECK_PROP` が含まれることを確認
7. 上記「未検証」チェックリストを実測

## Gmail検索クエリ設計（endpointの返り値の使い方・in:inbox限定にしない）
last_mailcheck の `epochSec` を Gmail `after:` に入れて検索する。**`in:inbox` で絞らない**
（バウンス=Delivery Status Notification/mailer-daemon や yawaragi自動送信メールはINBOXラベルに入らず取りこぼす。実測: 利用者064様の欠席連絡が reha-staff@wakabanooka.jp に 550 User Unknown で不達をinbox検索が見落とした）。

- **クエリA（全体スイープ・inbox限定しない）**: `after:{epochSec} -in:chats`
  ※コネクタ search_threads は既定で inbox+archive+sent を含む（in:inbox で絞らなければケアマネ宛送信/バウンスも対象）
- **クエリB（不達・バウンス検出＝最重要シグナル・別枠で必ず出す）**:
  `after:{epochSec} (from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification" OR subject:"Undelivered" OR subject:"Mail delivery failed" OR subject:"配信不能" OR "User Unknown" OR "550")`
- 運用: 朝報告で GET last_mailcheck → A/B を検索 → 本文は get_thread → 報告。社長「メール確認OK」の合図で set_mailcheck を叩いて日時を前進。

## 鍵
⚙️GAS（yawaragi-board clasp push/deploy）＋ ScriptProperties `LAST_MAILCHECK_AT`。版不要。
board GAS push/deploy・doGet編集を伴う他セッションとは並行NG（片方待ち）。
