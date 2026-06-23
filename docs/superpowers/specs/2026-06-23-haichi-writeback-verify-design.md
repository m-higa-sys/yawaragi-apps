# 配置クラウド保存 ライトバック検証（④）設計

- 作成日: 2026-06-23
- 対象: `genba.html`（フロントのみ）
- 関連記憶: genba-haichi-gas-sync / deploy-github-pages-crlf
- 状態: 設計確定（社長承認 2026-06-23）。実装可。**本番push・clasp deployは別途承認まで実施しない。**

## 1. 背景

2026-06-23、6/23午前の配置が `localStorage`（github.io）にもクラウドA1にも残らず消失した。
配置のクラウド保存は次の構造を持つ:

- 書込: `haichiCloudSave(d)` → 2秒デバウンス → `_postHaichiToCloud()` が local全体を **no-cors fetch** でPOST（投げっぱなし）。
- GAS `save_haichi` はA1セルを送られたJSONで丸ごと上書き（サーバー側マージ・空ガード無し）。

**no-cors は応答本文を読めず、送信完了＝成功とは限らない。** 現状の「保存しました」表示は *送れただけ* で、
クラウドへ実際に反映されたかも、正しいオリジンに保存されたかも保証していない。6/23はこの「保証なし表示」が
社長に保存成功と誤認させた。

## 2. 目的

配置入力後、**クラウドに実際に反映されたことを読み直して確認**し、結果を正直にUIへ出す。
no-cors の楽観的「保存しました」を廃止し、`保存✓（確認済み）` / `未保存：再送` / `確認できず：再確認` の
3状態で実態を伝える。これにより「保存したつもりで消えていた」を検知可能にする。

## 3. スコープ

- **対象**: `genba.html` のフロント実装のみ。
- **非対象（別便）**: ①GASサーバー側マージ ②GAS空ガード ③ローカル未送日検知・再送。いずれもGAS手反映を伴うため本設計に含めない。
- **配信**: 本番push（github.io）・clasp deployは社長承認後にのみ実施。

## 4. データフロー

```
入力 → autoSave → setAssignment → saveData
  ├ localStorage.setItem('yawaragi_haichi', …)              （同期・即時）
  └ haichiCloudSave(d)
       ├ showSaveStatus('saving','保存中…')
       ├ _verifyKey = getAssignmentKey(currentDate, currentUnit)   ← 検証対象キーを記録
       └ 2秒デバウンス → _postHaichiToCloud()
            ├ POST(no-cors) で local全体を送信
            ├ _verifyExpected = stableStringify(getData().assignments[_verifyKey])  ← 送信値スナップショット
            ├ showSaveStatus('verifying','確認中…')          （←「保存しました」は廃止）
            └ 検証デバウンス: HAICHI_VERIFY_DELAY_MS(6秒)後 → haichiCloudVerify(_verifyKey, _verifyExpected, cb)
                 ├ 'match'    → showSaveStatus('verified','保存✓ 確認済み')   （1.5秒で自動消滅）
                 ├ 'mismatch' → showSaveStatus('unsaved','未保存：再送')       ＋再送ボタン
                 └ 'error'    → showSaveStatus('unconfirmed','確認できず：再確認') ＋再確認ボタン
```

**不変条件**: 検証は `localStorage` を一切書き換えない。読む→照合→判定を返すのみ。
（既存 `haichiCloudLoad` はクラウド優先でローカルを上書きするため、検証に流用してはならない。
検証中に編集が走るとローカルの未送信編集をクラウド値で上書きし、6/23と同型の消失を再発させる。）

## 5. N秒の値 ＝ POST送出から 6 秒（`HAICHI_VERIFY_DELAY_MS = 6000`、安全域 5〜8s）

誤検知（実際は保存済みなのに「未保存」と表示）を避けるための安全側設定。

- GAS `doPost` 受理 → `A1.setValue` → Sheets反映: 通常1〜3秒。コールドスタート・同時実行ロック・反映遅延で数秒ぶれる。
- 検証読込（JSONP）の往復: 1〜2秒。
- 内訳: 書込中央値〜2s ＋ 反映ばらつき余裕2s ＋ 読込往復2s ≒ **6s**。
- 3〜4秒だと「書込確定前」を `mismatch` と誤検知し、社長が最も嫌う誤誘導になる。
- 8sは保守上限・5sは下限。中央の **6sを既定**。定数化し後から調整可能にする。

## 6. 多重検証（連続入力）＝ 最後だけ・二段デバウンス

- 連続入力では各 `haichiCloudSave` が**送信デバウンス(2s)をリセット** → 最後の入力2秒後に **1回だけPOST**（既存挙動）。
- **検証タイマー（`_verifyTimer`）も同様にリセット** → 最後のPOST送出の6秒後に **1回だけ検証**。
- 中間状態は検証しない。POSTは毎回local全体を送るため、最後の1回の検証で最新の確定状態を担保できる。
- `_verifyKey` / `_verifyExpected` は常に**最後の送信時点**の値で上書きする。

## 7. `haichiCloudVerify` インターフェース

```js
// 検証専用・非破壊（localStorageに書き戻さない）。haichiCloudLoadのJSONP機構を流用するが setItem は呼ばない。
// key          : 検証する配置キー（例 '2026-06-23_am'）
// expectedJson : 送信時のそのキー値を stableStringify した文字列
// cb(result)   : 'match' | 'mismatch' | 'error'
//   match    = クラウドに同キーが在り、値が expectedJson と一致（stableStringifyで正規化比較）
//   mismatch = キー無し or 値不一致（＝クラウド未反映）
//   error    = 読込失敗（タイムアウト8s・通信不良・success:false・JSONパース失敗）
function haichiCloudVerify(key, expectedJson, cb) { … }

// キー順序差による誤不一致を防ぐ正規化stringify（比較の両辺に適用）
function stableStringify(value) { … }  // オブジェクトのキーを再帰的にソートしてJSON化
```

**`stableStringify` が必須な理由**: 送信値とGAS往復後の値は `JSON.parse`/`JSON.stringify` を経るためキー順が
変わり得る。素の文字列比較だと順序差で誤って `mismatch` になる。両辺をキーソートして比較し、内容一致を正しく判定する。

**比較の確実性**: `_verifyExpected` も `stableStringify` で生成し、クラウド側も取得後に `stableStringify` して比較する
（生成・比較の両辺で同じ正規化を通すことで、順序・空白の差異を排除）。

## 8. 状態遷移（既存 `save-status` ピルの拡張）

| 状態 | 表示 | 色（既存流用） | 消滅 | ボタン |
|---|---|---|---|---|
| saving | 保存中… | 黄＋スピナー | — | — |
| verifying | 確認中… | 黄＋スピナー | — | — |
| verified | 保存✓ 確認済み | 緑(done相当) | 1.5秒自動 | — |
| unsaved | 未保存：再送 | 赤(error相当) | 残る | 再送（`retryHaichiSave` → POST再送 → 再検証） |
| unconfirmed | 確認できず：再確認 | **橙（新規1色）** | 残る | 再確認（`reverifyHaichi` → 検証のみ再実行・再送はしない） |

- 既存CSS（saving黄 / done緑 / error赤）を流用。**新規CSSは橙(unconfirmed)1色のみ**。
- `showSaveStatus(state,message)` に `verifying` / `verified` / `unsaved` / `unconfirmed` を追加。
- 再送 `retryHaichiSave`（既存）: `_postHaichiToCloud()` を再実行（送信→verifying→6秒後再検証）。
- 再確認 `reverifyHaichi`（新規）: POSTせず `haichiCloudVerify(_verifyKey, _verifyExpected, cb)` のみ再実行。

## 9. 実装ステップ（genba.html）

1. **CSS**: `.save-status.unconfirmed`（橙: 例 `background:#fff4e5; color:#9a5b00; border:1px solid #f0c27a;`）を `save-status` 群に追加。
2. **定数/状態変数**: `HAICHI_VERIFY_DELAY_MS = 6000`、`_verifyKey`、`_verifyExpected`、`_verifyTimer` を配置ストレージ節に追加。
3. **`stableStringify(value)`**: 純粋関数として追加（再帰キーソート）。
4. **`haichiCloudVerify(key, expectedJson, cb)`**: `haichiCloudLoad` の JSONP 機構を複製し、**`localStorage.setItem` を呼ばない**。取得 cloud.assignments[key] を `stableStringify` して `expectedJson` と比較し `match`/`mismatch`、失敗時 `error` を `cb`。
5. **`haichiCloudSave(d)`**: `_verifyKey = getAssignmentKey(currentDate, currentUnit)` を記録（既存の saving 表示・送信デバウンスは維持）。
6. **`_postHaichiToCloud()`**: 送信後に `_verifyExpected` を記録、`showSaveStatus('verifying','確認中…')` に変更（旧 `done`「保存しました」を廃止）、`_verifyTimer` をリセットして6秒後に検証発火。catch時は `showSaveStatus('error','保存できませんでした')`（送信失敗）を維持。
7. **`showSaveStatus`**: 新状態の分岐を追加（verifying=スピナー / verified=✓緑1.5秒 / unsaved=赤＋再送 / unconfirmed=橙＋再確認）。
8. **`reverifyHaichi()`**: 新規。`showSaveStatus('verifying','確認中…')` → `haichiCloudVerify` 再実行。
9. version.txt の版番号を bump（`2026-06-23-02` → `-03`）。**push は承認後。**

## 10. 動作確認（実装後）

- **stableStringify**: キー順の異なる同値オブジェクト2つが同一文字列になること、異なる値は異なることを Node で検証。
- **判定ロジック**: `match`/`mismatch`/`error` の分岐を、cloud値のパターン（一致 / キー無し / 値違い / 読込null）で机上＋抽出テスト。
- **挿入確認**: 追加関数・定数・CSS・状態分岐が genba.html に入ったことを grep で確認。
- **実機目視**（push前にローカルで可能な範囲）: 配置入力 → 「保存中…→確認中…」の遷移が出ること。`verified`/`unsaved`/`unconfirmed` の実遷移はクラウド往復を伴うため、本番反映後に本番URLで確認する。
- 本番URL（github.io）以外では⑤バナーが先に出るため、検証も本番URLで行う。

## 11. 非スコープ・注意

- GAS（`save_haichi`）は本設計で変更しない。根治（A1全置換廃止・サーバー側マージ・空ガード）は①②で別便・GAS手反映。
- 検証はあくまで「クラウド反映の確認」。書込の冪等性・全置換リスクそのものは①②で対処する。
- `localStorage` はオリジン単位。本検証は同一オリジン（本番URL）運用が前提（⑤バナーで担保）。
