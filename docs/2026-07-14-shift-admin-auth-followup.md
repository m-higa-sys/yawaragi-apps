# シフト希望 管理者認可 — 宿題（follow-up）

2026-07-14 実装した管理者セッション認可（`admin-session-core.js` + `コード.js` 配線 + `shift.html`/`画面.html` フロント）の残課題。

## 1. JSONP → POST 化（トークンをURLに乗せない）
現状、フロントは JSONP(GET) でGASを叩くため、**管理者セッショントークンがURLクエリに乗る**（サーバのアクセスログ・ブラウザ履歴に残り得る）。
- 今回は **許容**（トークンは短命=4時間スライディング＋HTTPSで転送保護）。
- 恒久対応：管理者API（`getAllDataAdmin`/`getBossRests`/`addBossRest`/`removeBossRest`/`approveCondition`/`rejectCondition`）を **POST(doPost) 経由**に切り替え、トークンを**リクエストボディ**で送る。
  - 制約：GASのCORS事情でfetch POSTは `no-cors` になりがち。`furikae-fubi` で使った **form-iframe方式**（`7581e84` 参照）や `text/plain` ボディが選択肢。
  - 読み取り系(getAllDataAdmin/getBossRests)もPOST化するとJSONP前提のフロントを要改修。

## 2. アクセスログ（access-log-core.js 流用）
現状、認可の試行は `Logger.log` のみ。板GASの `access-log-core.js` を流用し、
`アクセスログ`シートへ `action / token_status(valid|missing|expired) / enforce / 時刻` を追記する恒久ログを検討。

## 3. enforce の維持
`ADMIN_TOKEN_ENFORCE=ON` を **OFFに戻さない**こと（OFF放置＝無防備）。板GASで enforce=OFF のまま放置した前例あり。

## 4. 管理者PIN自体の強度
`verifyAdminPin` は設定シートの平文PINと文字列比較。PINは短い数字列so総当たり耐性は低い。
将来的にレート制限（連続失敗でロック）やPINの定期変更を検討。

## メモ
- トークン保存＝CacheService（TTL 4時間・スライディング）。立ち退き時はPIN再入力（`requireAdminReauth`）。
- ゲート対象に `autoConfirmAll` を含むが、現状これはAPI action未露出（内部関数）so実効はdoGet/handleActionの他actionのみ。
