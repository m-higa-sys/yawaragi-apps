# 禁忌・運動制限管理機能 設計書

対象：yawaragi-apps / セッションボード連携
作成日：2026-07-14
元仕様：`~/Downloads/kinki-spec.md`（2026-07-14）＋ブレスト訂正（機器軸化・2フェーズ・別アプリ）

---

## 0. ブレストで確定した方針（元仕様からの変更点）

| # | 決定 | 理由 |
|---|---|---|
| D1 | **2フェーズ分割**でリリース | 大機能を塩漬けにしない（CLAUDE.md 完了定義：本番反映まで） |
| D2 | UIは**別アプリ `kinki.html`**（版ゲート自己完結） | セッションボード本番@320を汚さず独立verify |
| D3 | `userId` = **利用者名**（台帳にID列が無い既存規約に従う） | コード.js 11857/13543/14276行で確立済み。ボード（氏名ベース）とそのまま突合 |
| D4 | `getKinkiForSession` は **sessionBoard とは別アクション** | 本番sessionBoardのレスポンスを変えず独立verify |
| D5 | **部位/動作を削除**し `targetEquipment[]`（機器・11種・任意・複数選択）に一本化 | 機能訓練型デイの現場動線＝「この機器を使わせてよいか」。全面禁忌者は当事業所の対象外 |
| D6 | **機器別ビュー**を追加（P1）。機器ごとに制限者一覧、機器未指定は「機器指定なし」へ | 機器担当スタッフが機器の前で即確認できる |
| D7 | **氏名join失敗を沈黙させない**（必須・D3とセット）。突合できない禁忌を `unmatched[]` で返し赤字警告 | 禁忌は安全系データ。「バッジが出ないだけ・無音」は今回の事故と同じ結果になる。突合ミスは可・気づけないのが駄目 |
| D8 | **他利用者を参照する条件を作らない**（設計原則）。禁忌は本人の身体に対する制限のみ | 使用順・他利用者との関係は禁忌の対象外。将来の拡張要求への歯止めとして明文化 |
| D9 | **genba.html（配置登録）にも導線をP1で追加**。ボタン1個→機器別ビュー | 判断の瞬間（配置を組む場）に届かないと意味がない |

### 機器タグの位置づけ（重要）
`targetEquipment` は**補助タグ**であり、正本は `label` + `detail`。配置登録で早く気づくための機器紐付けにすぎず、登録者が付け忘れる可能性がある。**機器タグが漏れても、セッションボードのバッジからは全禁忌が必ず見える設計とする**（バッジは機器タグの有無に依存しない）。

---

## 1. 背景と目的（元仕様§1）

医師からの運動制限指示（多くはケアマネ・家族・本人経由の口頭）が現場に届かず、禁忌動作が実施されてしまう事故が発生している。

**設計原則**
- 禁忌情報は「利用日の動線上」に必ず出す。計画書の中だけに書かない。
- 出典（医師文書／口頭／家族）で遵守の強弱をつけない。登録されたものは全て守る。
- 出典は「後から照会・確認するため」に記録する。
- 一目でわかる短文バッジ + タップで詳細モーダル。
- 制限の解除・見直しを放置させない（終わるまで方式）。
- **物理削除しない。** 解除は `status = released` で表現し履歴を全件残す。

---

## 2. アーキテクチャ（既存3層に準拠）

| 層 | 実装 | 既存の同型 |
|---|---|---|
| 純関数コア | `gas/yawaragi-board/kinki-core.js`（Node/jsdomでTDD先行） | `session-board-core.js` / `sokutei-check-core.js` |
| GAS配線 | `gas/yawaragi-board/コード.js` に `action=kinki*` を **additive** 追加 | `sessionBoard` 追加時と同じ（本番pull突合必須） |
| フロント（機能） | `kinki.html`（新規・版ゲート自己完結） | `oral-*.html` / `furikae.html` |
| フロント（バッジ／警告） | `session-board.html` に**最小改修**（バッジ描画＋unmatched赤字警告＋kinki.htmlへ導線） | — |
| フロント（配置導線） | `genba.html`（配置登録）に**ボタン1個追加**（差分10行未満・既存カンバンDOM不変）→ `kinki.html?view=equipment&date=YYYY-MM-DD` | — |

### データフロー
```
[登録] kinki.html --POST createKinki--> コード.js --> 禁忌シート追記(status=active)
[表示] session-board.html --GET getKinkiForSession(date)--> {matched:{氏名→active禁忌[]}, unmatched:[…]}
        --> 氏名横バッジ ＋ unmatched>0 なら上部に赤字「⚠️ 突合できない禁忌が○件あります」
[導線] genba.html [禁忌・制限を表示]ボタン --> kinki.html?view=equipment&date=YYYY-MM-DD（機器別ビュー）
[詳細] バッジtap --> kinki.html?user=氏名 --GET getKinkiByUser--> 詳細モーダル / 機器別ビュー / 履歴
[解除] kinki.html --POST releaseKinki--> status=released（物理削除なし・履歴保持）
```

---

## 3. データ構造

### 3.1 禁忌マスタ（Google Sheets: `禁忌`・自動作成／冪等）

| 列 | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ○ | `knk_` + 一意ID |
| `userId` | string | ○ | 利用者ID＝**利用者名**（既存規約） |
| `type` | enum | ○ | `permanent`（恒久禁忌） / `temporary`（期限付き制限） |
| `level` | enum | ○ | `forbid`（🚫禁止） / `caution`（⚠️要注意） |
| `label` | string | ○ | **バッジ表示文（15字以内）** 例：`右膝 深屈曲NG` |
| `detail` | text | | 詳細・具体的内容（自由記述） |
| `targetEquipment` | string | | **対象機器の配列をJSON文字列で保存**（任意・複数可・**補助タグ**）。空＝機器に紐づかない制限。付け忘れてもバッジには全禁忌が出る（正本は label+detail） |
| `sourceType` | enum | ○ | `doctor_doc` / `doctor_oral` / `caremgr` / `family` / `self` |
| `sourceName` | string | ○ | 情報元氏名・続柄 例：`長男 比嘉様` |
| `receivedAt` | date | ○ | 受領日 |
| `receivedBy` | string | ○ | 受けた職員 |
| `background` | text | | 経緯メモ |
| `reviewDate` | date | | 見直し予定日（`temporary` のみ・必須） |
| `status` | enum | ○ | `active` / `released` |
| `releasedAt` | date | | 解除日 |
| `releaseReason` | string | | 解除理由（プリセット選択値） |
| `releaseNote` | text | | 解除理由の補足（自由記述） |
| `releaseSource` | string | | 解除の指示元（氏名・続柄・口頭/文書） |
| `releasedBy` | string | | 解除操作した職員 |
| `createdAt` | datetime | ○ | |
| `updatedAt` | datetime | ○ | |

> 元仕様の `bodyPart` / `motion` は D5 により**廃止**。

### 3.2 選択肢マスタ

**対象機器（targetEquipment・11種・任意・複数選択）**
```
干渉波 / WB / 足温器 / 滑車 / バイク / 足裏マッサージ器 /
下肢マッサージ器 / ヒップアブダクション / チェストプレス / レッグカール / レッグプレス
```
- 空の場合は機器に紐づかない制限（血圧・移乗等）→ 機器別ビューでは「機器指定なし」セクションに表示。
- 「歩行 / 徒手 / 立位 / 全般」は選択肢に**入れない**（それらが全面禁忌の利用者は当事業所の対象外）。

**出典（sourceType）**

| 値 | 表示 |
|---|---|
| `doctor_doc` | 医師（文書） |
| `doctor_oral` | 医師（口頭伝達） |
| `caremgr` | ケアマネ経由 |
| `family` | 家族 |
| `self` | 本人 |

※ バッジの見た目は sourceType で変えない（意図的な設計）。

---

## 4. 解除理由プリセット（元仕様§3）

```
[ 医師より運動制限解除の指示 ]
[ 症状改善により制限解除 ]
[ 術後経過良好・主治医許可 ]
[ 骨折治癒・荷重制限解除 ]
[ 期間満了（一時的制限の終了） ]
[ 制限内容の変更（新規登録し直し） ]
[ 誤登録・重複の取り消し ]
[ その他（手入力） ]
```
- `制限内容の変更` → 解除処理後そのまま新規登録画面へ遷移（履歴を切らない）。※このプリセット自体はP1、遷移フローの完全版はP2で仕上げてよい。
- `その他` を選んだ場合のみ `releaseNote` を必須にする。

---

## 5. UI仕様

### 5.1 セッションボード（バッジ表示・最小改修）
利用者名の横に `status = active` のバッジのみ表示。
```
比嘉 太郎  🚫右膝 深屈曲NG  🚫ペースメーカー
田中 花子  ⚠️血圧180で中止
```
- `forbid` → 🚫赤系 / `caution` → ⚠️黄系
- 文言は `label`（15字）のみ。経緯・背景は出さない。
- タップ → `kinki.html?user=氏名`（詳細モーダル）
- **1日分を1回のAPIコール**（`getKinkiForSession`）で取得。
- **unmatched 警告（D7・必須）**：`getKinkiForSession` が返す `unmatched[]`（台帳と氏名突合できなかった `active` 禁忌）が1件以上なら、ボード上部に赤字で「⚠️ 突合できない禁忌が○件あります」を表示。無音で消さない。P2で morningDigest にも同様通知（終わるまで方式）。

### 5.2 kinki.html：詳細モーダル
内容 / 対象機器 / 情報元 / 受領 / 受けた職員 / 経緯 / 見直し予定 を表示。下部に `[解除する][期限を延ばす][編集]`。
- **恒久禁忌（`permanent`）**：`[解除する]` を**DOMごと出さない**（disabledではなく非描画）。`見直し予定` 欄も出さない。
- 下に「過去の制限（解除済み）」を折りたたみ表示。

### 5.3 kinki.html：機器別ビュー（P1・新規）
機器11種ごとに、その機器を `targetEquipment` に含む `active` 制限を持つ利用者を一覧。`targetEquipment` 空の制限は末尾「機器指定なし」セクション。
```
■ レッグプレス     比嘉太郎🚫 / 田中花子⚠️
■ バイク           （なし）
…
■ 機器指定なし     山田一郎🚫（血圧180で中止）
```

### 5.4 kinki.html：登録画面（利用者名から2タップ到達）
入力順：
1. 種別（`恒久禁忌`/`期限付き制限`）
2. レベル（`🚫禁止`/`⚠️要注意`）
3. **対象機器**（11種から複数選択・任意）
4. **バッジ文言**（15字以内・必須／文字数カウンタ）
5. 詳細（自由記述）
6. 情報元（出典タップ＋氏名・続柄）
7. 受領日（既定=今日）／受けた職員（既定=ログイン者）
8. 経緯（自由記述・任意）
9. 見直し予定日（`temporary` のみ・必須）

### 5.5 kinki.html：解除画面
1. 解除理由（プリセット）
2. 補足（`その他` 選択時のみ必須）
3. **解除の指示元**（氏名・続柄・口頭/文書）…必須
4. 解除日（既定=今日）

登録時と同じ粒度で残す。

### 5.6 genba.html（配置登録）への導線（D9・P1）
- 配置登録画面に「**禁忌・制限を表示**」ボタンを**1個だけ**追加（差分10行未満）。
- 押下で `kinki.html?view=equipment&date=YYYY-MM-DD`（機器別ビュー）へ遷移。
- **既存カンバンDOM／save_haichi 周辺には一切触らない。** 機器別ビューの実装は kinki.html 側に持つ（genba.html は導線のみ）。
- genba.html は版ゲート対象＆origin書込ガードがあるため、ボタン追加は表示専用リンクに限定（POST/書込を増やさない）。

### 5.7 設計原則：他利用者を参照しない（D8・不変条件）
- 禁忌レコードに、**他の利用者を参照する項目・条件を作らない**。
- 禁忌は**本人の身体に対する制限のみ**を扱う。
- 使用順・他利用者との関係（「Aさんの後は使わせない」等）は禁忌の**対象外**。将来この種の拡張要求が来ても、本アプリのデータモデルには入れない（別機能として切り出す）。

---

## 6. 見直しリマインド（終わるまで方式・**P2**）
`type=temporary` かつ `status=active` かつ `reviewDate<=今日` を morningDigest に出し続ける。
処理3択：`[期限を延ばす][解除する][恒久禁忌に変更する]`。いずれか処理するまで消えない。
登録時の**伝達ボード自動投稿**（既読必須にしない）もP2。

---

## 7. GAS API

| 関数 | 用途 | フェーズ |
|---|---|---|
| `getKinkiForSession(date)` | その日の全員分 `active` 禁忌を氏名キーで一括取得（N+1回避）。`{matched:{氏名→[]}, unmatched:[…]}` を返す（**D7**：台帳と突合できない禁忌を必ず表面化） | P1 |
| `getKinkiByUser(userId)` | 利用者の `active` 禁忌 | P1 |
| `getKinkiHistory(userId)` | `released` を含む全履歴 | P1 |
| `createKinki(payload)` | 新規登録 | P1 |
| `updateKinki(id, payload)` | 編集 | P1 |
| `releaseKinki(id, payload)` | 解除（`status=released`・物理削除なし） | P1 |
| `getPendingReviews()` | 見直し期限超過分＋unmatched（morningDigest用・終わるまで方式） | P2 |
| `extendReview(id, newDate)` | 見直し日の延長 | P2 |
| `createKinki` の伝達ボード自動投稿 | 登録周知 | P2 |

---

## 8. 純関数コア（`kinki-core.js`・TDD対象）

| 関数 | 責務 |
|---|---|
| `knkValidatePayload_(payload)` | 必須項目・label15字・temporaryのreviewDate必須・解除その他時releaseNote必須を検証 |
| `knkFilterActive_(records)` | `status==='active'` 抽出 |
| `knkGroupByUser_(records)` | 氏名（正規化）→ active禁忌配列 |
| `knkGroupByEquipment_(records, EQUIP_LIST)` | 機器→制限者配列＋「機器指定なし」 |
| `knkDetectUnmatched_(kinkiList, userList)` | **D7**：台帳の氏名集合と突合できない `active` 禁忌を抽出（無音化防止・TDD対象） |
| `knkCanRelease_(rec)` | `permanent` は `false`（解除ボタン非描画判定） |
| `knkBadgeStyle_(level)` | `forbid`→🚫赤 / `caution`→⚠️黄 |
| `knkLabelWithinLimit_(label)` | 15字以内判定 |
| `knkParseEquipment_(cell)` / `knkStringifyEquipment_(arr)` | シートセル(JSON文字列)⇄配列 |

氏名正規化はセッションボードの `sbNormalizeName_` と同一規約を用いる（突合ズレ防止）。

---

## 9. フェーズ計画

### P1（現場で登録も解除も完結）
- 禁忌シート自動作成（冪等）
- GAS：`getKinkiForSession` / `getKinkiByUser` / `getKinkiHistory` / `createKinki` / `updateKinki` / `releaseKinki`
- GAS：`getKinkiForSession` は `{matched, unmatched}` を返す（D7）。コアに `knkDetectUnmatched_`。
- `kinki.html`：詳細モーダル／機器別ビュー／登録／解除／履歴折りたたみ／恒久解除ボタン非描画
- `session-board.html`：バッジ描画＋unmatched赤字警告の最小改修
- `genba.html`：機器別ビューへの導線ボタン1個追加（差分10行未満・カンバンDOM不変）
- **リリース物（版ゲート対象4点）**：kinki.html新規＋GAS additive＋session-board.html改修＋genba.html導線。版bump＋verify必須。portal台帳にkinki.html登録。

### P2（放置防止＋周知）
- `getPendingReviews` / `extendReview` ＋ morningDigest「見直し期限」セクション（終わるまで方式）
- 恒久禁忌への変更フロー、`制限内容の変更`→新規登録遷移の完全版
- 登録時の伝達ボード自動投稿

---

## 10. 実装上の注意（元仕様§7＋本プロジェクト固有）
- **確定事項**：`level` は 🚫`forbid` / ⚠️`caution` の**2種のまま**（運用配慮 `support` は今回スコープ外）。`targetEquipment` は**任意**（空→機器別ビューの「機器指定なし」）。
- **D7（無音化防止）**：氏名突合できない禁忌は必ず `unmatched[]` で表面化しボード赤字警告。突合ミスは可・気づけないのが不可。
- **D8（他利用者非参照）**：禁忌は本人身体の制限のみ。他利用者を参照する条件はモデルに入れない。
- **物理削除は絶対にしない。** すべて `status` で表現し履歴を残す。
- 恒久禁忌の解除ボタンは**レンダリングしない**（フロント条件分岐・`knkCanRelease_`）。
- `label` は15字ハードリミット（maxlength＋カウンタ）。
- セッションボードは1日分を1回のAPIコールで取得。
- ケアズ（旧システム）への転記・同期は行わない。**本アプリを唯一の正とする**。
- コード.js改修前に必ず `clasp pull` で本番突合（本番のみの関数を消さない・memory `clasp-gas-deploy-url-iji`）。
- clasp操作はBashを `dangerouslyDisableSandbox:true` で（memory `project_gmail新着チェック`）。
- 作業は最新 origin/master から切った専用worktreeで（本体master固定）。

---

## 11. 運用ルール（アプリ外・元仕様§8）
- 制限を聞いた職員が、その日のうちに登録する。
- 出典が家族・本人であっても、登録された制限は全て守る。
- 登録・解除は職種を問わず誰でも可能（記録が残ることが重要）。
