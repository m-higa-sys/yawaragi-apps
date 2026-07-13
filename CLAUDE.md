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
