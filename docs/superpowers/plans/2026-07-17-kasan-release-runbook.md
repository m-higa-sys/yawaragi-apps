# kasan.html リリース手順（社長の手で実行）

- 作成: 2026-07-18
- 対象ブランチ: `feat/kasan-app`（worktree `C:/tmp/wt-kasan`）
- 本番書き込み（clasp push / deploy / master push / シート投入）は**すべて社長の手で1手ずつ**。

## 0. 前提（着手前チェック）

- [ ] 全テスト緑を実測で確認済み:
  - `node scripts/test-kasan-core.js` → **44 passed**
  - `node scripts/test-kasan-html.js` → **56 passed**
  - （版ゲート byte 一致テストは `test-kasan-html.js` に統合済み。別ファイルは無い）
- [ ] **clasp 操作は Bash サンドボックス無効で実行**（memory: `dangerouslyDisableSandbox` 必須）
- [ ] clasp 認証が有効（切れていたら `clasp login` を先に。`~/.clasprc.json` の更新時刻で確認）

## 🔴 1. GASへ push（本番現物ベースのステージング方式・git から push しない）

### なぜこの方式か（2026-07-17 実測確認・2026-07-18 も踏襲）

**git の `gas/yawaragi-board/` を直接 `clasp push` してはならない。** 生きている機能を同時に壊す:

| 本番にあって git に無いもの | git から push すると |
|---|---|
| `access-log-core.js` / `mailcheck-core.js` / `token-auth-core.js` | 3ファイルごと消える |
| `lastMailcheckAction_` / `setMailcheckAction_` | 朝報告のメール起点が死ぬ（@326 で反映済み） |
| `DENGON_MIGRATE_SEED` が 6件（repo は 4件） | 伝達ボード2件が消える |
| 平文 LINE_TOKEN（本番に実在） | 除去される。Script Properties に値が無ければ LINE通知が死ぬ |

> ⚠️ 2026-07-18 追記: LINEトークンは再発行済み（旧トークン401で無効化確認）。**本番コード.js 6031-6032 はまだ旧平文のまま＝board GAS のLINE通知は現在停止中**。トークン是正（Property新値＋2行のgetProperty化）は kasan とは別トラックだが、**同じ コード.js を触る**ので、是正が先に入ると本ステージングの pull 内容が変わる。push 前に `grep -n "getScriptProperties().getProperty('LINE_TOKEN')" コード.js` で現状を確認すること（memory: `reference_本番board-gas-平文LINE_TOKENドリフト`）。

**逆に、git の worktree で `clasp pull` してもならない。** 本番の平文トークンが git に落ち、
commit すれば 2026-07-14 と同じ経路で**3度目のトークン流出**になる（pre-commit hook は
gitleaks 未導入の正規表現フォールバックで、防げる保証がない）。

→ **git の外の使い捨てdirで、本番現物に kasan の追加だけを載せて push する**（memory の R1復旧 `/c/tmp/recovery-clasp` と同じ方式）。

### 手順

```bash
# (1) git の外にステージングdirを作り、本番現物を pull（サンドボックス無効で）
S="C:/tmp/kasan-staging"
rm -rf "$S" && mkdir -p "$S" && cd "$S"
cp /c/tmp/wt-kasan/gas/yawaragi-board/.clasp.json .
cp /c/tmp/wt-kasan/gas/yawaragi-board/.claspignore . 2>/dev/null || true
clasp pull                      # ← 本番現物（平文トークン・mailcheck・dengon6件を含む）

# (2) 本番現物であることを確認（ここが土台）
grep -c "lastMailcheckAction_" コード.js                       # 1以上＝mailcheck が居る
ls mailcheck-core.js access-log-core.js token-auth-core.js     # 3つとも在る

# (3) kasan の追加物（新規ファイル）だけを載せる
cp /c/tmp/wt-kasan/gas/yawaragi-board/kasan-core.js .           # 追加のみ
```

**(4) `コード.js` への追記は手作業で行う。** git の `コード.js` で**上書きしてはならない**。
`/c/tmp/wt-kasan/gas/yawaragi-board/コード.js` から kasan の追加ブロック2箇所をコピーして、
ステージングの `コード.js` の対応位置へ貼る:
- doGet 分岐（`if (e && e.parameter && e.parameter.action === 'kasan') { return kasan(e); }` の3行）
- `var KASAN_SHEET` 〜 `function kasan(e){…}` の追加ブロック（`KASAN_MASTER_SEED` / `setupKasanMaster` / `kasanAuthOk_` / `kasan` を含む）

```bash
# (5) 追加が載り、本番の既存物が全部残っていることを確認
cd "$S"
grep -c "action === 'kasan'" コード.js       # 1＝doGet分岐が載った
grep -c "setupKasanMaster" コード.js         # 1以上＝seed関数が載った
grep -c "lastMailcheckAction_" コード.js     # 1以上＝mailcheck がまだ居る（消していない）
node --check コード.js && node --check kasan-core.js && echo "構文OK"

# (6) push（社長の手で）
clasp push
```

**(7) push 後、ステージングdirは必ず消す**（平文トークンをディスクに残さない）:
```bash
rm -rf "C:/tmp/kasan-staging"
```

> **宿題（別トラック）**: この「git と本番が乖離したまま」の状態そのものが根本問題。
> 平文トークンの Script Properties 化と、mailcheck / access-log / token-auth の git 反映を
> 済ませれば、この危険なステージング作業は不要になる（memory: `reference_本番board-gas-平文LINE_TOKENドリフト`）。

## 2. シードを投入（GASエディタで実行）

1. GASエディタを開く（板GAS所有＝`m-higa@keepfitlife.com`。URLに `?authuser=` を付ける）
2. 関数 `setupKasanMaster` を選び「実行」（引数なしで動く）
3. 戻り値 `added` が **28件**、`totalRows` が **28** であることを確認
   - 内訳: 基本情報7・運営体制3・地域区分5・加算13（介護給付8・総合事業5）
4. スプレッドシート「kasan_master」タブを目視:
   - コード列が `781241`（**左寄せ＝テキスト**）。右寄せ（＝数値化）ならテキスト書式が効いていない
   - 事業所番号が `1173300995` のまま（指数表記・小数になっていない）
5. **再実行して冪等を確認**: `added` が **0件**、`totalRows` は **28のまま**

## 3. デプロイ（URL維持・社長の手で）

```
clasp deploy -i AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw
```

★**新規デプロイを作らない**（`clasp deploy` を引数なしで叩くと新URLができ、全アプリが壊れる）。
★200版上限で弾かれたら memory `reference_gas-200版上限-deploy不可-runbook`（削除は社長のUI操作）。

## 4. エンドポイント実測

ブラウザで開く（`callback` 必須・無いと動かない）:
```
https://script.google.com/macros/s/AKfycbwo…/exec?action=kasan&callback=cb
```
確認: `cb({"ok":true,…})` が返り、加算が **介護給付8件・総合事業5件**、`系統不明` が **0件**。

## 5. master反映と版上げ

```
cd /c/tmp/wt-kasan
git fetch origin
git rebase origin/master          # non-FFは正常＝他セッションが master を進めた証拠。--force は絶対に使わない
node scripts/test-kasan-core.js && node scripts/test-kasan-html.js   # rebase後に再度全緑を確認
node scripts/bump-app-version.js 2026-07-04-71
```

★版番号は **日付プレフィックス `2026-07-04` 固定**。今日の日付にしない。
　bumpスクリプトの検証は `/^[0-9A-Za-z._-]+$/` だけで**誤った版番号を素通しさせる**。
　push直前に `git fetch` し直して `-71` が空いているか再確認（`-62` 衝突の再発防止・連番飛びは先祖返りシグナル）。

```
git push origin feat/kasan-app:master        # 社長の手で
node scripts/bump-app-version.js --verify 2026-07-04-71   # 時間切れは成功扱いにしない
```

## 6. アプリ台帳へ登録（コード変更不要）

社長専用SS（ScriptProperties `APPREGISTRY_SS_ID`）の「アプリ台帳」シートに1行append:

| 列 | 値 |
|---|---|
| アプリ名 | 加算・事業所情報 |
| カテゴリ | （既存の並びに合わせる） |
| 説明 | やわらぎの加算13件と事業所基本情報。ケアマネ対応用にサービスコード併記 |
| スタッフ用URL | https://m-higa-sys.github.io/yawaragi-apps/kasan.html |
| 公開区分 | staff |
| icon | 📋 |
| 表示順 | （カテゴリ内の末尾） |

→ portal.html は `getAppRegistry?scope=staff` から自動生成されるので、**1行足せば自動で載る**。

## 7. 完了確認（証跡3点）

- [ ] `bump-app-version.js --verify 2026-07-04-71` が成功
- [ ] `?action=kasan&callback=cb` が加算13件（介護給付8・総合事業5）を返す
- [ ] portal に「加算・事業所情報」タイルが出て、開くと4カード表示される
      （地域区分の「未取得」・加算 A66100 の「未確認」が警告色で出ることも目視）

## ロールバック

- GAS: `clasp deploy -V <前のバージョン番号>`
- HTML: `git revert <SHA>` → 版を1つ上げて再push
- シート: `kasan_master` タブを削除（他機能から参照されていないので影響なし）

## スコープ外（v1でやらない・未解決）

- 総合事業の単価・嵐山町/川島町の級地（未取得＝画面に「未取得」警告色表示）
- 総合事業 A66100 の処遇改善加算率（介護給付12.7%と同率か未確認＝「未確認」警告色表示）
- 体制届の期限管理（`最終確認日` 列だけ確保・UI未使用）
- トークン認証（版ゲートのみ＝案A。全アプリ横並びで別トラック）

いずれもシートのセルを直すだけで解消（デプロイ・版上げ不要）。
