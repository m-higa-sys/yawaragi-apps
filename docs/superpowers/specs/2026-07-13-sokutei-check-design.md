# セッションボード 測定チェック 設計書（2026-07-13・社長確定）

セッションボードの「今日やる（測定）」カードに実施チェックを付け、既存の測定正本に直接書き込む。二重持ちはしない。

- 対象フロント: `session-board.html`（版ゲート自己完結・genba型）
- 対象GAS: board GAS（正本 = my-project / clasp管理。repoミラー = `gas/yawaragi-board/コード.js`）
- 関連純関数: `gas/yawaragi-board/session-board-core.js`（`sb*_`）
- ステータス: **設計確定・Phase 1（要支援）実装中 / Phase 2（要介護）はPhase 1本番確認後**

---

## 1. 書き込み先（実測確定）

| 区分 | シート | action | 測定日列 | 測定者列 | source列 |
|---|---|---|---|---|---|
| 要支援・事業対象 | 要支援測定記録（7列） | `addShienSokutei` | 3列目 sokutei_date | 4列目 sokutei_by | **5列目 source（現状'app'固定）** |
| 要介護 | 個別機能訓練計画書記録（16列） | `updateKeikakusho`（記録は新`recordKaigoSokutei`） | **13列目 sokutei_date** | **14列目 sokutei_by** | **無し（ログのoperator列のみ）** |

要支援測定記録 列: `[1 name, 2 care, 3 sokutei_date, 4 sokutei_by, 5 source, 6 note, 7 createdAt]`（コード.js:2898, 13737-13738）
個別機能訓練計画書記録 列: `[1 userId, 2 name, 3 year, 4 month, 5 kyoumi_date, 6 seikatsu_date, 7 keikaku_date, 8 updated_at, 9 blocked_reason, 10 hyouka_pdf_date, 11 hyouka_print_date, 12 keikaku_sent_date, 13 sokutei_date, 14 sokutei_by, 15 output_by, 16 tasseido_date]`（コード.js:13818-13823, 2130）

> ⚠️ 実装時に列番号を必ずシート定義（ensure*Sheet_）で再確認してから setValue すること。

---

## 2. 調査サマリ（A〜E・実測 file:line 根拠つき）

### A. 測定者名簿 — 追記不要
- 両アプリとも GAS `action=staff_list`（`getStaffListFromShiftSheet()` = シフトSS「スタッフ」A列・コード.js:3721-3737）を起動時fetch、クライアントで `MEASURER_EXCLUDE=['代表','小野','林']` を除外（sokutei.html:93,507 / 個別機能訓練計画書チェック.html:714,744）。
- 同一名簿。**セッションボードも同パターン流用**（GAS追記ゼロ）。「8名」= 全件−3。

### B. addShienSokutei（コード.js:2878-2913）
- 引数 `name`/`date`/`by(→sokutei_by)`/`note`。GET/POST両対応（e.parameter）。
- **source は5列目に'app'リテラル固定**（2898）→ 取消判定に「セッションボード」を入れるには **source引数追加が必須**。
- **append-only・重複検証なし**（2899）。

### C. updateKeikakusho（コード.js:2120-2233）★裏取り済
- **当月行なし → 部分行を appendRow 新規作成**（2161-2176。他フィールド空の行ができ計画書チェックアプリで乖離表示）→ 「当月行なしはチェック不可」の安全仕様は正当。
- **1回1フィールドのみ**（field/value単一）→ sokutei_date と sokutei_by の同時書込不可（updateKeikakusho×2は非atomic）。
- **record にsource列なし**（区別はログoperatorのみ）→ 要介護の取消は初版不可。
- 重複＝無条件上書き・拒否なし（LockService 10秒直列 2137）。

### D. 二重防止
- サーバは現状どちらも拒否しない（要支援=重複行 / 要介護=上書き）。**サーバガードを追加**して「同サイクル記録は2つできない」を守る。

### E. リストからの消え方（非対称）
- **要介護**: `sbMeasureKaigo_` が当評価月 sokutei_date 済みを `return` で除外＝**自然に消える**（session-board-core.js:136, kaigoDoneByKey コード.js:15393-15403）。
- **要支援**: `sbMeasureShien_` は全件 `.map` で返す＝**消えず**、`unmeasured=false`・`remaining`大で「余裕があれば」へ**降格するだけ**（session-board-core.js:91-104）。
- mark_dengon_read の GAS は my-project/clasp管理でrepoに無い。応答 `{ok, readBy}` は設計書＋フロント推定（genba.html:10089 `dengonUpdateCardReadBy_` が単一カード差替、フォールバックで全件再取得）。
- `session-board.html` の `render()`（289-364）は `DATA` から #board 全体を組み直す。**単一カード更新 = DATA変更 → render()**（2往復目を作らない）。

---

## 3. 確定要件（社長決定・変更不可）

1. **測定者の記録は必須**。フロー: チェックtap → 測定者を選ぶ → 「◯◯さんが△△様の測定を実施。記録しますか?」→ 確定。測定者を選ばず日付だけ書く経路は作らない。
2. **楽観更新しない**。サーバ確定後に再描画。送信中表示＋連打防止（伝達ボードと同型）。
3. **チェック可能なのは「今日を表示中」のときだけ**。過去・未来（日付ナビ）はチェックボタン無効化＋「今日に戻ってチェックしてください」表示。
4. **取消は「セッションボード発・当日中」のみ**。sokutei.html / 計画書チェックアプリが書いた記録はセッションボードから消せない。
5. **要介護で当月行が無い人はチェック不可** →「計画書チェックアプリで当月行を作成してください」表示。
6. **要介護の取消は初版では作らない**（source列が無いため安全側）。

### 二重ガードの粒度（社長修正・重要／非対称）
- **【記録】source を問わず、同月同人が既に記録済みなら拒否**（全ソース横断。例「今月は実施済みです」）。目的は「同じサイクルに記録が2つできない」こと。
- **【取消】source='セッションボード' かつ date=today の行のみ削除可**（自分の分だけ）。

### 要支援の消え方（社長修正・重要）
- チェック後、DATAから**除去せず**、DATA上で**測定済みにして** `render()`。`sbMeasureShien_` と同じ状態（`unmeasured=false`・測定日=today）にし、測定プール内で「余裕があれば」側へ**降格**させる。
- ＝チェック直後の姿と次回fetchの姿を一致させる（「今消えたのに翌日低優先で復活」の不整合を作らない）。**GASプールは触らない**。

---

## 4. Phase 1（要支援パス）設計

### 4.1 GAS（board GAS・additive-only）
1. **addShienSokutei に `source` 引数を追加**（既定 `'app'` 維持・後方互換）。
   - `var asSource = (e.parameter.source || 'app');` を導入し、5列目に格納（現状のリテラル'app'を置換）。sokutei.html は従来通り source 無し送信 → 'app'。セッションボードは `source='セッションボード'` を送る。
2. **記録の重複ガード（source横断）**を addShienSokutei に追加。
   - 書込前に「要支援測定記録」を走査し、**同月（同一 name × 当月 sokutei_date）が既にあれば拒否** `{ ok:false, error:'already_done', message:'今月は実施済みです' }`。
   - 判定は純関数化（`shienAlreadyMeasuredThisMonth_(records, name, ym)`）してTDD。GAS本体はシート読取→純関数呼び出し。
   - ※ sokutei.html 側の既存書込にもこのガードが乗る（全ソース横断の要件so意図通り。ただし sokutei.html の現行UXを壊さないか実装時に確認：同月2回目を弾く挙動になる。要件上は正しい）。
3. **cancelSessionSokutei 新設**（新action）。
   - 引数 `name`・`date`（today）。**source='セッションボード' かつ date一致 かつ name一致 の行のみ削除**。他sourceの行は削除しない（サーバが範囲強制）。
   - 当日以外の date は拒否（`error:'not_today'`）。
   - 削除は末尾から走査し該当1行 deleteRow。純関数 `findCancelableShienRow_(records, name, date)` でTDD。

### 4.2 フロント（session-board.html）
- **測定者picker**: 起動時に `action=staff_list` を1回fetch → `state.staff`、`MEASURER_EXCLUDE=['代表','小野','林']` 除外（sokutei/計画書と同一パターン）。sessionBoard本体fetchとは別JSONP。
- **チェックフロー**: 測定カードに「実施」ボタン → tap で測定者選択モーダル（名簿pull）→ 選択後「◯◯さんが△△様の測定を実施。記録しますか?」確認 → 確定で `addShienSokutei`（name/date=today/by=測定者/source='セッションボード'）を送信。
- **送信中表示＋連打防止**: ボタンを「⟳ 記録中…」にしてdisable（伝達ボード `dengonChipProcessing_` と同型）。
- **today-onlyゲート**: `curDate === todayYMD()` のときのみ実施ボタン活性。過去・未来では無効化＋「今日に戻ってチェックしてください」。（curDate は日付ナビで既に保持済み）
- **サーバ確定後に反映（2往復目なし）**: 成功応答で DATA.sokutei の該当行を測定済み化（`unmeasured=false`, `last=today`, `remaining` を大きい正へ）→ **measurePool で測定済み行を「余裕があれば」側へ回して** `render()`。楽観更新はしない（応答 ok を待つ）。想定外応答は `fetchBoard(curDate,true)` にフォールバック。
- **取消ボタン**: 当日・当該行が「セッションボード発（source='セッションボード'）」のときのみ表示 → `cancelSessionSokutei` → 成功で DATA該当行を未測定へ戻して render()。
  - ※ フロントが「この行がセッションボード発か」を知るには、記録直後はローカルに `justChecked{key:true}` を持てば当日中は判別可。fetch跨ぎの取消可否は、sessionBoard応答に「当日セッションボード発の測定済みkey」を載せるのが理想（Phase 1内で board入力に軽量追加 or 初版はローカル状態のみで「記録した本人のセッション中だけ取消可」に割り切る→社長確認）。**初版はローカル justChecked のみで当日中取消**とし、リロード後取消はPhaseで拡張（下記オープン）。

### 4.3 純関数（TDD対象）
- GAS: `shienAlreadyMeasuredThisMonth_(records, name, ym)` / `findCancelableShienRow_(records, name, date)`
- フロント: `canCheck(track, curDate, todayYMD, kaigoRowExists)` / `canCancel(row, curDate, todayYMD, justChecked)` / `demoteMeasured(sokuteiRows, key, today)`（測定済み化＋降格の並べ替え）

### 4.4 トークン認証台帳（enforce=OFF待機中プロジェクトへ先行登録）
`feat/gas-token-auth` の「JSONP/no-cors 経路ギャップ分析台帳」に**3行追加**（enforce ON日の漏れ防止）:
- source付き `addShienSokutei`（write）
- `cancelSessionSokutei`（write/delete）
- `recordKaigoSokutei`（write・Phase 2）
→ 別ブランチ成果物so、該当台帳ドキュメントに追記（本Phaseで場所を特定し追記 or Issue化）。

### 4.5 鍵
既存 board write と同水準（**追加鍵なし・genba型origin-guard踏襲**）。測定記録はPII性低め。

---

## 5. Phase 2（要介護パス）設計 ※Phase 1本番確認後

### 5.1 GAS
- **recordKaigoSokutei 新設**（atomic）:
  - 当月行（userId×year×month）が**在る時のみ**書く。無ければ `{ ok:false, error:'no-row' }`。
  - **sokutei_date（13列）と sokutei_by（14列）を1リクエストでatomicに書込**。
  - **測定者必須をサーバ担保**（by空なら `error:'no_measurer'`）。
  - **測定済み（当月 sokutei_date 非空）なら拒否** `error:'already_done'`。
  - updateKeikakusho×2 の非atomicは**禁止**（1本目成功/2本目失敗で測定者欠落＝要件1をレース1回で破る）。
- **board入力に「当月行の有無」フラグ追加**（`sessionBoardBuildInput_`）→ フロントが「当月行なし＝チェック不可」を事前判定（部分行を作らせない）。

### 5.2 フロント
- 同フロー。当月行なしは実施ボタン無効＋「計画書チェックアプリで当月行を作成してください」。
- **取消ボタンなし**（source列が無いため初版不可）。
- 記録成功で該当行は `sbMeasureKaigo_` 相当（当月測定済み）＝DATAから測定済み化して today圏外へ（要介護はGAS側でも次回自然消滅）。

---

## 6. 完了定義（各Phase）
clasp pull突合 → additive（削除0行を数字で証明）→ `clasp deploy -i "<既存ID>"`（URL維持）→ 版bump（session-board.html は version.txt 直参照ゲート）→ `--verify` で本番反映確認 → 本番配信物grepでマーカー在中確認。
- 純関数（canCheck/canCancel/重複判定/降格）は TDD（RED→GREEN）。UIは jsdom（既存 test-session-board-html.js 方式）。GASデータは素node。
- **本番push/deploy/版bump は社長承認の手push**（version.txt手編集禁止）。

## 7. オープン（実装中に社長確認）
- 要支援の**リロード後取消**: 初版は「記録した本人のセッション中（ローカルjustChecked）だけ当日取消可」に割り切る案。fetch跨ぎ取消を可能にするなら sessionBoard応答に「当日セッションボード発の測定済みkey」を載せる軽量追加が要る。→ 初版はローカルのみで進め、必要なら拡張。
- 重複ガードが **sokutei.html の同月2回目書込** も弾く点（全ソース横断の帰結）。要件上は正しいが、sokutei.html 運用で同月2回測定するケースが無いか実装時に一応確認。
