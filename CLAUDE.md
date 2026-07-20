# CLAUDE.md — yawaragi-apps プロジェクト固有指示

このファイルはグローバル `~/.claude/CLAUDE.md` の読み込み順4番目として、毎セッション強制ロードされる関所。

## 本番版上げ（キャッシュ自動更新ゲート）のハードルール

本番（GitHub Pages / master push）へ genba.html 等を配信し、利用者端末で確実に最新版へ切り替えるには `version.txt` の版上げが必要。**以下を厳守する**（過去、手作業で事故った再発防止）。

1. **版上げは必ず `node scripts/bump-app-version.js <新版>` 経由で行う。**
   - 例: `node scripts/bump-app-version.js 2026-06-23-04`
   - version.txt と genba.html の `shared.js?v=` を**同一コミットで同時更新**し、add+commit まで自動で行う（design.md §9 準拠）。

2. **version.txt を手で編集しない／手で `git add` しない。**
   - version.txt には過去 **assume-unchanged フラグ**が立っていて `git add` が**エラーも出さず黙って効かない**罠があった（2026-06-23 にこれで本番反映が長時間ハマった）。スクリプトがフラグ正常化を担保する。手作業は罠を再発させる。詳細は memory: `version-txt-assume-unchanged-trap`。

3. **スクリプトは実 push しない（案A）。**
   - bump は commit までで停止し、SHA と「pushコマンド」「verifyコマンド」を提示する。
   - 本番 push は**社長承認のうえ手動で** `git push origin master`。
   - push 後は必ず `node scripts/bump-app-version.js --verify <版>` で本番反映をポーリング確認する（時間切れは成功扱いにしない）。
   - push 前後で `git rev-parse HEAD` と `origin/master` の SHA 一致を確認する。

4. **実行は fresh pull 済み・対象ファイルがクリーンな状態で。**
   - スクリプトは「対象に実変更あり（dirty）」「origin/master より behind（diverged）」なら**実行拒否**する。先に `git pull --ff-only origin master` 等で揃え、genba.html の作業中コードはコミット/退避してから bump すること。

> 要するに: **本番版上げ＝スクリプト1コマンド → 社長OKで手push → verify**。version.txt を素手で触らない。

## ブランチ運用のハードルール（2026-07-13 「ブランチ回転台」事故の再発防止）

**根本原因（reflog証拠あり）**: 本体ディレクトリ `C:\dev\yawaragi-apps` を「ブランチ回転台」として使い、タスクごとに本体で `git checkout` していた。07-12〜13 で `session-board → session-board-datenav → month-board → month-board-on-prod → kobetsu-status-view → kobetsu-grid-badge` と連続切替。これが**版番号衝突・作業取り違え・未コミット取りこぼし**の温床になった。同日に実際に起きた事故3件: ①版番号 `-62` が dengon 既読改修と**衝突**（push弾かれて発覚）②掃除中に別セッションが `feat/sokutei-check-shien` を**並行追加**③docs push が **non-FF 拒否** → リベースで解消。**以下を厳守する。**

1. **本体は master 固定。**
   - `C:\dev\yawaragi-apps` 本体で `git checkout <feature>` してはならない。本体は常に master を指す。

2. **機能タスクは専用worktreeで。**
   - `git worktree add C:/tmp/wt-<name> -b feat/<name> origin/master`
   - 必ず**最新の origin/master から切る**（`git fetch` 後・先祖返り防止）。

3. **着手前ゲート。**
   - セッション開始時、本体が master 以外を指していたら**報告して止まる**（`git rev-parse --abbrev-ref HEAD` ≠ master なら中断）。`node scripts/check-orphan-branches.js` と併せて二重の網。

4. **版番号は現 origin/master 起点で。**
   - `bump-app-version.js` は必ず `git fetch` 済み・最新 origin/master 上で実行。push直前にも**再 fetch して番号が空いているか再確認**（`-62` 衝突の再発防止）。連番飛びは先祖返りシグナル。

5. **push が弾かれたら（non-FF）はリベース。**
   - non-FF は**正常**＝他セッションが master を進めた証拠。必ず `git rebase origin/master` して再push。**`--force` は絶対に使わない**（他セッションの成果を消す）。

6. **枝の寿命。**
   - master に反映されたブランチは即 `git branch -d`（＋対応 worktree も `git worktree remove`）。反映済みの棚卸しを溜めない。安全削除 `-d` が拒否＝未反映のサインso、`-D` 強制の前に中身を確認する。

7. **本番書き込みは社長の手で。**
   - `git push origin master` / `clasp deploy` は社長が実行。クロコは直前で止まって pushコマンドと verify 手順を提示する。

> 要するに: **本体=master固定・機能=専用worktree(最新origin/master起点)・push弾かれたらリベース(force厳禁)・反映後は即掃除・本番書込は社長**。

## 修正タスクの完了定義（2026-07-02 伊藤直29件事故の再発防止）

**完了＝master反映＋版上げ（版ゲート対象アプリのみ）＋本番反映確認まで。**

1. **ブランチ上で実装完成・テストPASSは「完了」ではない。**
   - 実害: 6/25の範囲展開バグ修正（7e5e09b・テスト14 PASS）が `fix/range-pattern-filter` ブランチに孤立してmaster未反映のまま「修正済み」扱いになり、7/2に同一人物・同一操作で同じ事故が再発した。
2. **完了報告には必ず本番反映の証跡を含める。**
   - genba系（版ゲートあり）: `node scripts/bump-app-version.js --verify <版>` の成功出力。
   - no-storeアプリ（yawaragi-board 等）: push後の `git rev-parse HEAD` = `origin/master` 一致＋本番配信物（github.io）の実コードに変更が含まれることの確認。
   - 証跡なしの「反映しました」は報告として不成立。
3. **版番号の連番飛び（例: -02の次が翌週の-01）は先祖返りのシグナル。** 見つけたら即 `git log` で系譜を確認する。

## セッション開始時の孤立ブランチ検知（毎セッション必須）

セッション開始時（最初の作業に入る前）に必ず実行する:

```
node scripts/check-orphan-branches.js
```

- origin/master 未マージのローカルブランチと、メイン以外のワークツリーを一覧警告する。
- 警告が出たら放置せず、各項目を「master反映する／削除する／残す理由を memory に記録する」のいずれかに倒す。
- 朝の報告スキル Step 4.72 でも同スクリプトを実行する（二重の網）。

## 秘密情報（トークン等）流出の再発防止ハードルール（2026-07-14 LINEトークン2回目流出の教訓）

**背景**: LINEチャネルアクセストークンが公開repo（GitHub `m-higa-sys/yawaragi-apps`）に平文コミットされ2回流出。2回目は `c93db3f`「本番GASスナップショット取込」(2026-07-03) で再混入。旧トークンと**同一値**だったため GitGuardian が沈黙（既知値は重複扱いで再通知しない）し、**3ヶ月気づかれなかった**。以下を厳守する。

1. **秘密は必ず Script Properties。コードは参照のみ。**
   - `PropertiesService.getScriptProperties().getProperty('KEY')` で読む。トークン/シークレットの**平文直書きは厳禁**。値はGAS画面で社長が直接入力し、クロコは値を受け取らない。

2. **本番GASスナップショットをrepoに取り込む前に、必ず秘密スキャンして除去する。**
   - `clasp pull` した本番コードに平文トークンが残っていないかを**取込コミット前に確認**。pre-commit hook（`scripts/hooks/pre-commit`）が走る状態でコミットする。これが今回の再混入経路（本番コード側に平文が残ったままスナップショット化）の封鎖策。

3. **トークン再発行時は、そのトークンを使う全GAS・全ファイル・全コピーを洗い出してから交換する。1箇所直して終わりにしない。**
   - 実例: yawaragi社内チャネルの1トークンを **板GAS / gas_LINE通知.gs / インク管理 / シフト希望LINE実装版 / 複製GAS(`1_n-UuWw…`)** が共用していた。repo・マイドライブ・バックアップ・複製プロジェクトまで棚卸ししてから交換する。

4. **pre-commit hook が一次防衛線。GitGuardian を当てにしない。**
   - 有効化（clone毎に1回）: `git config core.hooksPath scripts/hooks`
   - hook は gitleaks があれば `gitleaks protect --staged`、無ければ正規表現フォールバックで**平文トークンを含むコミットをブロック**する。
   - **GitGuardian は同一値の再出現時に沈黙する**ため検知を当てにしない（今回まさに3ヶ月沈黙）。GitGuardianは補助網。

5. **Property キー名がプロジェクトで不統一**（板/インク=`LINE_TOKEN`、本番webhook `1Pyoag…`=`CHANNEL_ACCESS_TOKEN`）。差し替え時は各プロジェクトの**実キー名を確認**してから設定する。

## このリポジトリについて

リハビリデイサービスやわらぎ（地域密着型通所介護・埼玉県東松山市高坂）の業務Webアプリ群「yawaragi-apps」。

- 構成: **HTML単体アプリ群（1機能＝1ファイル）＋ Google Apps Script ＋ Google Sheets**
- 共通ライブラリ: `shared.js`（UserStore / AttStore）
- リモート: `m-higa-sys/yawaragi-apps`（**PUBLIC**。ゆえに秘匿情報の混入は即流出＝上章のハードルールが効く）
- 利用者は現場の介護職員。社長（比嘉学）が唯一の意思決定者。

## 🔒鍵ブロック（作業開始時に必須）

握る共有資源を作業開始時に宣言する。**握る鍵だけ**を書き、握らない鍵は書かない。ゼロなら「🔒握る鍵：なし（全面並行OK）」の1行。**危険時間帯も併記する。**

| 鍵 | 衝突条件 |
|---|---|
| 🔢版 | `version.txt`。全体で1個。版ゲート対象アプリの編集で握る |
| 📄ファイル〈名前〉 | 同名ファイルのみ衝突 |
| ⚙️GAS | board GAS の clasp push/deploy・clasp認証。付随資源は ＋〈資源名〉 |
| 📊シート〈名前〉 | 同一シートの**構造変更**のみ衝突 |

鍵を握るのは**書き込みの瞬間だけ**（版消費／push／deploy／シート構造変更／同一ファイル書込）。設計・編集・読取は並行自由。

## 並行セッションの隔離（上「ブランチ運用」の補足）

- 並行セッションは**独立した git worktree** で隔離する。置き場所は **OneDrive外**（例: `C:\tmp\wt-xxx`）。OneDrive配下は同期が噛んで壊れる。
- 共有作業ツリーの直接使用は**単独セッション時のみ**。
- **他セッションのブランチには触れない**（過去にブランチ奪取が2回発生）。

### 版番号（version.txt）が衝突したら

1. 自分の版commitを**破棄**し、次の版番号へ**振り直す**（相手の版を消しにいかない）
2. 隔離ワークツリーから `origin/master` へ **cherry-pick** して **FF push**
3. push前後で `branch tip == origin/master` の **SHA一致を実測確認**する

## GAS 運用

- **`clasp push` は必ず本番を `clasp pull` してから。** いきなり push しない（本番側の手直しを踏み潰す）。
- GASの変更は原則 **additive**。既存関数の破壊的変更を避ける。
- board GAS の **clasp認証枠は全体で1個**。別プロジェクトのGASは別枠。

### 正本ファイル一覧（clasp管理下のGAS）

**`gas/<プロジェクト>/` 配下だけが正本。**`.clasp.json` の rootDir が指すディレクトリの中身がそのまま `clasp push` で本番へ送られる。ここに無いファイルは、どれだけ本物に見えても本番に繋がっていない。

| GASプロジェクト | 正本 |
|---|---|
| yawaragi-board（板GAS） | `gas/yawaragi-board/コード.js` |
| shift-kibou（シフト希望GAS） | **`gas/shift-kibou/コード.js`** |
| riyousha-daichou-api（利用者台帳API） | `gas/riyousha-daichou-api/コード.gs` |
| yukyu-kanri（有給管理） | `gas/yukyu-kanri/コード.js` |

- yawaragi-board の正しいソースは **`origin/master` の `gas/yawaragi-board/`**。古いブランチやルート直下のスタブ（`gas_yawaragiボード.gs`＝廃止済み墓標）は使わない。
- **シフト希望GASの正本は `gas/shift-kibou/コード.js`。** `gas/gas_シフト希望.gs` は本番未接続の古いバックアップだったため 2026-07-20 に削除した（実害: 指示書がこちらを対象に指定し、直しても本番に1バイトも届かないところだった）。
- `gas/` **直下**の単体 `.gs`（`gas_出勤送迎表.gs` 等）は、clasp管理ディレクトリを持たないGASの手動コピー。**編集しても本番へは自動反映されない**。触る前に、対応する `gas/<プロジェクト>/` が存在しないかを必ず確認する。

## 実装の原則

1. **測ってから動く。** 憶測で直さない。まず現状を読む・ログを見る。
2. **単一の正（single source of truth）。** 同じ情報を2箇所に持たせない。
3. **純粋関数はTDD。** 先にテストを書き、失敗を確認してから実装する。
4. **既存機能を壊さない。** 指示にない箇所は触らない。
5. 版ゲート（`version.txt` ポーリング＋キャッシュバスター）対象アプリの編集は **🔢版**を握る。
6. 全アプリに共有トークン認証＋アクセスログあり。新規アプリも同じ方式に揃える。

## 報告のしかた

- 各ブロックの先頭に **【誰→誰】** を明記する（例: 【クロコ→社長】）
- 完了報告には、完了条件のチェック結果（**実測値**）を含める
- できなかったこと・不確かなことを**隠さず先に**書く
- 社長に選択させるときは、**おすすめ＋理由**を先に書く

### 時刻の明記

- 報告の冒頭に、必ず**現在日時を実測して**書く（`Get-Date` 等で取得。例: 2026-07-19 05:12）
- 期限・締切・残り時間に関わる判断は、推測ではなく**実測時刻を根拠**にする
- チャット側のクロには時計がない。**クロコが書いた時刻が唯一の基準**になる

### クロとの役割分担

- クロコは**事実**を報告する（実データ・数値・状態・エラー・実測結果）
- クロコは**優先順位づけをしない**。「今日はこれからやるべき」の判断は**クロの担当**
- 逆にクロは数値の再掲をしない。両方がやると同じ内容が二重に報告され、朝が長くなる
- ただし「これをやらないと後続が止まる」という**依存関係は報告してよい**（優先順位ではなく事実のため）

## 用語

| 語 | 意味 |
|---|---|
| クロ | 仕様設計・指示書作成を担当するClaude（チャット側） |
| クロコ | 実装を担当するClaude Code（このリポジトリ側） |
| 社長 | 比嘉学。最終決定者 |
| 版ゲート | `version.txt` ポーリングによるキャッシュバスター機構 |
| 鍵 | 並行作業で衝突する共有資源のマーク |
