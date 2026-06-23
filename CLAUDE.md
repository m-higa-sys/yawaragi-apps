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
