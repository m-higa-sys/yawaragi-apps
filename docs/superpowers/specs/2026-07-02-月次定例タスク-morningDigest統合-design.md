# 月次定例タスク自動リマインド＋morningDigest統合 設計書

- 作成: 2026-07-02（クロコ）
- 発端: クロ→クロコ指示書「月次定例タスクの自動生成＋朝ダイジェスト統合」
- 状態: **設計のみ・社長レビュー待ち。実装未着手（GAS push は社長承認後のみ）**

---

## 1. 目的

社長の月次定例業務（けあ蔵DL・電算DL・国保連伝送・社労士/税理士提出等）の抜け漏れをゼロにする。
「覚えておく」「チェックリストを能動的に開く」運用を廃止し、**完了するまで毎朝出続ける仕組み**に埋め込む。

## 2. 現状調査の結果（クロの前提とのズレ含む）

| クロ指示書の前提 | 実際 |
|---|---|
| morningDigest は8フィールド固定 | **既に12セクション**（intakeFollowup/sougeiOps/furikae/kubun/scheduled/longLeave/keikakushoBlocked/monitoringExpiring/monthlyDocs/pendingTasks/keikakushoSoufu/shift）。セクション追加は `safe('name', fn)` 1ブロックで確立パターン |
| 月次タスクの未完状態を持つ仕組みが無い | **shift セクション（2026-06-22）が単一タスクについて既に実現済み**＝「終わるまで方式・月次自動再出現・完了は completeShift＋読み戻し検証・シートのチェックボックス保険」。今回はこれの**複数タスクへの一般化** |
| 初期データは社長ヒアリングで確定 | `請求フロー_月次チェックリスト_v4.md`（マイドライブ\仕事\keepfitlife\経理・月次書類\）に日付根拠がほぼ全部ある。ヒアリングは残る数点のみ（§8） |

- 正本GAS: `my-project/gas/yawaragi-board/コード.js`（yawaragiボード統合バックエンド・13,336行）
- 表示側: `my-project/scripts/morning-digest.ps1`（朝の報告スキルが実行・空応答ガード付き）
- ⚠️ 前提作業: 朝報告残タスク `gas-source-git-sync`「本番GAS↔リポジトリのズレ解消・**次回GAS作業の着手前に必須**」が未完のまま残っている。本件実装の Phase 0 に組み込む（§9）。

## 3. 方式比較（3案）

### 案A（クロ原案）: 毎月1日トリガーで当月タスク行を生成
マスタ→毎月1日の時間主導トリガーで「月次タスク」シートへ当月行をコピー。状態は行の未完/完了。

- 長所: 月ごとの行が明示的でスプレッドシート上の見た目が分かりやすい。
- 短所: **トリガー故障＝その月まるごと漏れる**（抜け漏れゼロが目的なのに単一障害点を新設する自己矛盾）。トリガーの設置・監視・権限という運用対象が増える。月跨ぎのゴミ行整理も必要。

### 案B（推奨）: シフト方式の一般化＝動的判定＋完了記録
シートは「**定例タスクマスタ**」（定義）と「**定例タスク完了記録**」（taskId×YYYY-MM の完了ログ）の2枚だけ。
morningDigest/一覧APIが呼ばれるたびに「当月に出るべきタスク − 当月完了記録」を**その場で計算**する。

- 長所: **トリガー不要＝故障モードが存在しない**。「毎月1日に生成される」より強く「**常に当月の未完タスクが存在する**」。shift セクションで実証済みのパターン（月キー完了→翌月自然に再出現、セルフヒール不要）。完了記録シートがそのまま履歴になる。
- 短所: クロの完了条件「毎月1日に行が生成される」と字面が違う（要件の本質＝毎月自動で当月タスクが出る、はより強く満たす）。当月のメモは完了記録側に書く。

### 案C: 朝の報告スキルの記述強化のみ（GAS変更なし）
- 不採用: 完了状態を持てず「社長がやったと言ったら打ち切り」がセッションを跨ぐと消える——まさに現状の弱点そのもの。

**→ 案Bを推奨。以下は案B前提の設計。**

## 4. データモデル（GASシート2枚・冪等セットアップ）

### シート「定例タスクマスタ」
| 列 | 内容 | 例 |
|---|---|---|
| id | 半角英数スラッグ（不変キー） | `carezou-tsuchisho` |
| title | タスク名 | けあ蔵: 支払決定額通知書・内訳書DL |
| freq | `monthly` / `quarterly` / `yearly` | monthly |
| months | 適用月CSV（monthlyは空欄=全月） | `1,4,7,10` |
| startDay | この日から表示（1-28） | 20 |
| dueDay | 期限日（超過で⚠⚠） | 25 |
| source | データの在り処 | けあ蔵 国保伝送メニュー→通知文書 |
| dest | 保存先 | Drive `経理・月次書類\{年}年{月}月分\` |
| note | 備考（正確な締切ルール等） | — |
| enabled | 有効フラグ（チェックボックス） | TRUE |

### シート「定例タスク完了記録」
| 列 | 内容 |
|---|---|
| taskId | マスタのid |
| month | `YYYY-MM`（この月について完了） |
| doneAt | `YYYY-MM-DD HH:mm:ss` |
| by | 完了経路（`app` / `api` / `manual`） |
| note | メモ（任意） |

- 完了＝**行の追加**（appendRow・既存 (taskId,month) があれば冪等スキップ）。取消＝該当行の削除（uncomplete action）。
- シート直編集の保険: 完了記録に taskId と month を手書きで1行足せば翌朝から消える（チェックボックス方式よりさらに単純）。

## 5. 判定ロジック（純関数・`scripts/test-teirei-tasks.js` と二重持ちTDD）

```
appliesToMonth_(task, ym)   … freq/months から当月対象かを判定
teireiUrgency_(task, day)   … day < startDay → 'hidden' 相当（表示しない）
                              day > dueDay   → 'overdue'（⚠⚠）
                              dueDay - day <= 3 → 'warn'（⚠）
                              それ以外 → 'normal'
teireiDecision_(tasks, doneRows, dateStr)
  → 当月対象 && enabled && day>=startDay && 未完了 の一覧を dueDay 昇順で返す
```

- 営業日計算はしない（8営業日前正午のような可変締切は startDay/dueDay の**固定日近似＋note に正確ルール**。電算UP締切の正確な日付は既存の朝の報告ルール「毎朝必ず締切日を明示」が引き続き一次情報 `reference_電算スケジュール2026.md` で担保する。二重化であり矛盾ではない）。

## 6. API（doGet action・既存パターン準拠）

| action | 内容 |
|---|---|
| `teireiList` | 当月の全対象タスク＋状態（未完/完了/hidden）を返す（UI用） |
| `completeTeirei&id=<id>[&month=YYYY-MM][&note=]` | 完了記録に行追加→**flush→読み戻し検証**（verified:true の時だけ ok。completePendingTask と同じ流儀） |
| `uncompleteTeirei&id=<id>&month=` | 完了記録から該当行削除（誤操作の戻し） |
| `setupTeireiSheets` | シート2枚作成＋ヘッダ＋初期マスタseed（既存idスキップ＝冪等） |

### morningDigest への追加
```js
safe('teirei', function () { return _digestTeirei_(ss, dateStr); });
// → { tasks:[{id,title,dueDay,urgency,source,dest}...], count, overdueCount }  ※dueDay昇順
```
- `morning-digest.ps1`: teirei セクションの表示ブロックを追加（期限順・warn/overdue は ⚠/⚠⚠ を先頭に）。`Get-DigestSignal` に teirei.count を加算（コールドスタート空応答＝全0との判別がむしろ効きやすくなる）。
- ps1 は teirei セクション不在でも壊れない書き方にする（GAS 先行デプロイ・ps1 後追いでも安全）。

## 7. 管理UI

- 新規 `teirei.html` を yawaragi-apps（GitHub Pages）に追加し、**admin.html（社長用・全部載せ）にリンクを1個追加**。
- スタッフ非表示の担保＝URL非共有＋admin.html 導線のみ（admin.html 自体と同じ秘匿レベル。genba.html 等スタッフ導線には一切載せない）。
- 機能: 当月タスク一覧（期限順・未完は上・完了は下にグレー）／完了チェック→**書き込み後読み戻し検証のピル表示**（既存方式準拠）／完了取消。
- no-store ヘッダ（version.txt 版ゲート不要のアプリ群と同じ扱い）。
- クロコ経由の完了も可能: 社長が「けあ蔵の通知書DLした」と言えばクロコが `completeTeirei` を叩く運用（伝達ボード完了と同じ）。

## 8. 初期マスタ（v4チェックリスト根拠・🔍=社長確認事項）

| id | タスク | freq | start | due | 根拠 |
|---|---|---|---|---|---|
| `kokuhoren-densou` | 国保連請求確定→けあ蔵伝送（10日17:00） | monthly | 1 | 10 | v4 Phase1 |
| `kinmu-csv` | タスクマン（朝野さん）へ勤務実績CSV送付 | monthly | 1 | 10 | v4 関連送付 |
| `densan-furikae` | 電算口座振替7ステップ（結果DL→リハブ取込→請求書→全銀出力→UP） | monthly | 10 | 17 | v4 Phase2 ※dueは近似・正確な締切は電算スケジュール表（note明記） |
| `carezou-tsuchisho` | けあ蔵: 支払決定額通知書・内訳書DL→Drive月別フォルダ | monthly | 20 | 25 | v4 Phase3（20〜23日） |
| `carezou-shoguu` | けあ蔵: 処遇改善加算等お知らせDL→社労士（朝野さん）転送 🔍 | monthly | 20 | 25 | クロ指示書（21日頃）。v4に記載なし |
| `ashitae-package` | アシタエ12ファイル（前月サービス分）をChatWorkで送付 | monthly | 20 | 25 | v4 Phase4（翌月25日目標） |
| `ryoshusho-3kubun` | 領収書3区分の原本提出（四半期・months=1,4,7,10 🔍） | quarterly | 1 | 25 | v4 四半期セクション（提出月は目安） |

### 🔍 社長確認事項（レビュー時に確定したい）
1. **処遇改善加算等お知らせ**: 実際の配信時期は毎月21日頃で合っているか。保存先フォルダ名（クロ案「社労士提出用_YYYYMM」）はどこに作るか。
2. **月初5点セット**（通帳記帳・現金出納帳・勤務形態一覧表等）をマスタに入れるか。既存の「月初5点セット」スキルと二重リマインドになるため、**初期は入れない**を推奨（欲しければ後からマスタに行追加するだけ）。
3. クロ指示書の「電算システム: 入金明細DL」は `densan-furikae` の①（結果データDL）に含まれる認識でよいか（別タスクに割るか）。
4. 領収書四半期の提出月は 1・4・7・10月（四半期末の翌月）でよいか。
5. 年次タスク（介護経営DB 4月・浄水カートリッジ 6/12月等）を初期投入するか（freq=yearly は仕組みとして対応済み。これも後から行追加可）。

## 9. 既存機能との棲み分け

| 既存 | 性質 | 本件との関係 |
|---|---|---|
| 朝の報告 Step4 締切カウントダウン | スキル記述ベース・**状態なし**・10日前ルール＋電算毎朝明示 | 当面共存。国保連・電算は両方に出る（過剰リマインド容認）。teirei 側は完了で消える。将来 Step4 の定例部分を teirei 準拠に整理可能（本件スコープ外） |
| monthlyDocs（月次書類そろえ・12日スキャン） | Downloads の**ファイル存在**チェック | 「モノが揃ったか」の検品。本件は「行動をやったか」。別物として共存 |
| pendingTasks（伝達ボード 宛先=社長） | **単発**タスク | 本件は**繰り返し**タスク。混ぜない |
| shift セクション | 単一の月次タスク専用実装 | 本件のひな型。**統合はしない**（動いているものを触らない）。 |
| 月初5点セット・国保連伝送・電算請求等のスキル | 操作ガイド | ガイドはスキル、未完状態の正本は teirei。役割分担 |

## 10. 実装制約（クロ指示書＋既存ハードルール）

- **Phase 0（必須前提）**: `clasp pull` で本番GASを取得し、本番↔リポジトリのズレを解消してから着手（朝報告残タスク `gas-source-git-sync` の消化を兼ねる）。clasp は 2.4.2 固定（3.x alpha は Node22 要求でハング）。clasp 認証切れは社長に `clasp login` 依頼。
- git worktree は `C:\tmp\` 配下。正本コピー禁止。
- **GAS push（clasp push→`clasp deploy -i` 既存デプロイID指定）は社長の明示承認後のみ**。push だけでは exec URL に反映されない点に注意。
- 純関数は `scripts/test-teirei-tasks.js` に二重持ちで TDD（既存 test-morning-digest.js / test-shift-digest.js と同じ流儀）。
- teirei.html の GitHub Pages 反映は no-store のため版ゲート（bump-app-version.js）不要。ただし master push は承認フロー準拠。
- 完了報告は fresh clone 後の origin/master への grep 確認をもって行う。
- morning-digest.ps1 は OneDrive 巻き戻り事故歴あり→変更後は実バイト数/grep で版確認。

## 11. 完了条件（クロ指示書の読み替え含む）

1. ~~毎月1日に当月タスクが自動生成される~~ → **常に**当月の未完タスクが `teireiList` / `morningDigest.sections.teirei` に出る（案Bの帰結・トリガーレスでより強い保証）。
2. `morning-digest.ps1` の出力に未完タスクが**期限順**で出る。期限3日前〜超過は先頭⚠付き。
3. teirei.html で完了チェック（読み戻し検証ピル）でき、翌朝のダイジェストから消える。翌月また自動で出る。
4. 純関数テスト `node scripts/test-teirei-tasks.js` が全パス。

## 12. フェーズ分割（実装計画の骨子・承認後に writing-plans で詳細化）

- **Phase 0**: 本番GAS↔リポジトリ同期（gas-source-git-sync 消化）
- **Phase 1**: GAS＝シート2枚＋純関数＋API4本＋morningDigest teirei セクション（テスト先行）
- **Phase 2**: morning-digest.ps1 表示追加＋朝の報告スキルへの1行追記（teirei セクションを読む）
- **Phase 3**: teirei.html＋admin.html リンク追加（GitHub Pages）
- 各 Phase 末に社長確認ゲート。GAS deploy と master push はそれぞれ承認後。
