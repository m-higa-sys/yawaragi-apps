# CLAUDE.md — yawaragi-apps プロジェクト固有指示

このファイルはグローバル `~/.claude/CLAUDE.md` の読み込み順4番目として、毎セッション強制ロードされる関所。

## 応答は日本語（恒久・2026-07-09 社長確定）

- **すべての応答は日本語で行う。** 英語に戻らない。説明・コメント・報告も日本語。
- 技術用語・コード識別子（関数名・ファイル名・フラグ等）は原語のまま可。
- 日本語の濁点・半濁点・特殊文字は正しく表記する（ASCII代替に置換しない）。

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
