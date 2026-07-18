---
name: release
description: yawaragi-apps を本番へ反映するときの手順。HTMLアプリの版上げ（version.txt）と GAS の clasp push/deploy の2系統を、事前ゲート→実行→本番反映の実測確認まで通す。「本番に上げて」「リリース」「版を上げて」「デプロイ」「clasp push」「本番反映」等で使う。
---

# リリース手順（本番反映）

**前提**: 判断基準・禁止事項の根拠は `CLAUDE.md` にある。ここは**手順だけ**を書く。矛盾したら CLAUDE.md が優先。

**大原則**: 本番書き込み（`git push origin master` / `clasp deploy`）は**社長が実行する**。クロコは直前で止まり、コマンドと verify 手順を提示する。

## 0. リリース系統の判定（最初にこれ）

| 変更したもの | 系統 | 進む先 |
|---|---|---|
| `genba.html`（版ゲート対象） | **A. 版上げ** | §2 |
| その他のHTMLアプリ（no-store配信） | **B. push のみ** | §3 |
| `gas/*/` 配下 | **C. GAS** | §4 |
| docs / scripts のみ | **B. push のみ** | §3 |

A と C の両方に触れた場合は **C（GAS）を先に**反映し、動作を確認してから A の版を上げる（版だけ進んで裏が古い状態を作らない）。

## 1. 事前ゲート（全系統共通・省略不可）

```bash
git rev-parse --abbrev-ref HEAD          # → master でなければ報告して中断
node scripts/check-orphan-branches.js    # 孤立ブランチ警告を潰す
git fetch origin
git status --porcelain                   # 対象外ファイルが混ざっていないか
git log --oneline origin/master..HEAD    # 何を上げるのかを列挙して社長に提示
```

- `master` 以外を指していたら**そこで止まる**。
- テストがあるものは先に走らせ、**PASS の実出力**を報告に載せる（`node scripts/test-*.js`）。

## 2. 系統A: 版上げ（version.txt）

**対象は `version.txt` と `genba.html` の2ファイルのみ**（スクリプトが `shared.js?v=` を自動同期する）。

### 2-1. 版番号を決める

```bash
cat version.txt        # 現在値（例: 2026-07-04-72）
git fetch origin && git show origin/master:version.txt   # ← 必ず origin 側も見る
```

書式は `YYYY-MM-DD-NN`。`NN` は origin/master の現値の**次の番号**。連番飛びは先祖返りのシグナルなので、飛んでいたら `git log` で系譜を確認してから進む。

### 2-2. bump（commit まで。push はしない）

```bash
node scripts/bump-app-version.js <新版>
```

- version.txt を手で編集したり手で `git add` してはいけない（assume-unchanged の罠）。**必ずこのスクリプト経由**。
- スクリプトは dirty / behind なら**実行を拒否**する。拒否されたら先に `git pull --ff-only origin master` と作業中コードの退避を済ませる。
- 実行後、commit SHA・push コマンド・verify コマンドが表示される。**ここで止まって社長に提示する。**

### 2-3. push（社長が実行）

push 直前に**再 fetch して版番号がまだ空いているか確認**する（他セッションとの衝突防止）。

```bash
git fetch origin && git show origin/master:version.txt   # 自分の版と衝突していないこと
git push origin master
```

**弾かれたら（non-FF）**: 他セッションが master を進めた正常な状態。`git rebase origin/master` して再 push。**`--force` は絶対に使わない。**
**版番号が衝突していたら**: 自分の版commitを破棄して次の番号へ振り直す（相手の版を消しにいかない）。

### 2-4. 本番反映の実測確認（省略不可）

```bash
node scripts/bump-app-version.js --verify <版>
```

- 本番 `https://m-higa-sys.github.io/yawaragi-apps/version.txt` を **3秒間隔・最大60回（約3分）**ポーリングする。
- **時間切れは成功扱いにしない**（exit 1）。失敗したらそう報告する。
- 併せて SHA 一致も実測する:

```bash
git rev-parse HEAD && git rev-parse origin/master   # 2つが一致すること
```

## 3. 系統B: push のみ（版ゲート外のアプリ・docs）

版ゲートを持たないアプリは no-store 配信のため版上げ不要。ただし**反映証跡は必要**。

```bash
git push origin master                              # 社長が実行
git rev-parse HEAD && git rev-parse origin/master   # SHA一致を実測
```

さらに、本番配信物（github.io）の実コードに変更が入っていることを確認する。証跡なしの「反映しました」は報告として不成立。

## 4. 系統C: GAS（clasp）

### 4-1. 対象プロジェクト（実測: `.clasp.json`）

| ディレクトリ | scriptId | 備考 |
|---|---|---|
| `gas/yawaragi-board/` | `1pJN4vjIRM9NMGxco42PjogRcjg1R3zY6AgjDKXNWqHLlXtcuw5lYTPSz` | 統合バックエンド。**正本はここ**（ルート直下の `gas_*.gs` スタブや古いブランチは使わない） |
| `gas/riyousha-daichou-api/` | `1YpEBFjtE9ZM9U27YT4UdJMzihtlj55djPtMsku8HKDQrderHfRo0e-bh` | |
| `gas/shift-kibou/` | `1ls7KnC7jRCDXoWEuak4m-hrYUPF_2Geezw_gP9sKMa_uT8jXdlR0iQE8` | |
| `gas/gyomu-check/` | `18lKQqkoKNZ0Q-64IJ_TUkIGSrTzS4bfEYzvafN85mGeQsa1KY3O1qott` | 未コミット（git未追跡） |

いずれも `rootDir` は `.`。**`.clasp.json` にデプロイIDは入っていない。**

> **【要確認】デプロイID**: `clasp deploy -i <既存ID>` に渡すIDは `.clasp.json` から取得できない。docs 配下には `AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw` が最多出現するが、**どのプロジェクトのどのデプロイかを本スキルでは断定していない**（過去に「利用者台帳API」という誤ラベルの実例あり）。実行前に必ず `clasp deployments` かGAS画面で**現物を確認**すること。

### 4-2. 手順

```bash
cd gas/yawaragi-board

clasp pull                    # ← 必ず先。いきなり push しない
git diff                      # 本番側の手直しが降ってきていないか突合
```

- `clasp pull` の差分は**本番にだけ存在する変更**。踏み潰す前に中身を読む。
- 差分に**平文トークンが混ざっていたら、コミットする前に除去**して Script Properties 参照へ直す（`PropertiesService.getScriptProperties().getProperty('KEY')`）。pre-commit hook が動く状態でコミットする。
- 変更は原則 **additive**。既存関数の破壊的変更を避ける。

```bash
clasp push                                  # 社長承認後
clasp deploy -i <既存デプロイID> -d "<説明>"  # ← 新規作成しない。URLが変わると全アプリが壊れる
```

- **`clasp deploy`（`-i` なし）は禁止**。新規デプロイになりURLが変わる。
- clasp コマンドがサンドボックスで失敗する場合は `dangerouslyDisableSandbox: true` で実行する。
- board GAS の **clasp認証枠は全体で1個**。並行セッションと衝突するので ⚙️GAS の鍵を握る。

### 4-3. 反映確認

デプロイ後、実際のエンドポイントを1本叩いて応答を確認する。GAS は**デプロイしないと Web アプリに反映されない**（`clasp push` だけでは本番は変わらない）。

> **【要確認】GAS の版上限**: デプロイ版が200に達すると `clasp deploy` が失敗する。その場合の削除はGAS画面左「🕐履歴」からの**社長のUI操作が必要**。

## 5. 完了報告に必ず載せるもの

- **何を上げたか**: `git log --oneline` の該当範囲
- **SHA一致の実測**: `git rev-parse HEAD` と `git rev-parse origin/master` の実出力
- **版ゲート対象なら**: `--verify` の**成功出力そのもの**
- **GASなら**: デプロイIDと、エンドポイント応答の確認結果
- **できなかったこと・不確かなこと**を隠さず先に書く

「反映しました」だけは報告として成立しない。**実測値を貼る。**

## 6. やってはいけないこと（早見）

| ❌ | 理由 |
|---|---|
| `version.txt` を手編集 / 手で `git add` | assume-unchanged で黙って無視される |
| `git push --force` | 他セッションの成果を消す |
| `clasp push` を pull なしで | 本番側の手直しを踏み潰す |
| `clasp deploy` を `-i` なしで | URLが変わり全アプリ停止 |
| 本番HTMLを実ブラウザで開いて検証 | `file://` でも本番GASへPOSTが飛び、実データを壊す |
| verify の時間切れを成功扱い | 未反映のまま「完了」と誤報告する |
| 社長の承認なしに push / deploy | 本番書き込みは社長の手で |
