> 【出荷済み・記録用】本番GASに適用済み（口腔機能向上記録の moni1_date/moni2_date/houkoku_date 列追加）。本番GAS現物で該当コード在を確認済み（2026-07-13時点）。当初想定deploy=請求繁忙明けの11日以降。以下は適用当時の staged diff の記録（原本は wt-oral-plan の untracked `oral2-gas-additive.staged.md`・作成 2026-07-05）。

# 口腔② GAS列追加 staged diff（未適用・請求繁忙期1-10日を外して11日以降に clasp deploy）

対象: `gas/yawaragi-board/コード.js`（board GAS正本）。**additive のみ**（口腔機能向上記録に 12/13/14列を右追加）。
適用前提: `clasp pull` で本番と突合（memory教訓）→ 下記4点＋朝報を適用 → `clasp push -f` → `clasp deploy -i "<既存ID>"`（新規作成禁止・URL維持）。
アンカー一致方式（行番号ズレに強い）。既存1-11列・既存データ・他エンドポイントは不変。

---

## Diff A — ensureOralPlansSheets_ 新規作成分（11→14列）
### before
```js
    recordSheet.getRange(1, 1, 1, 11).setValues([[
      'userId', 'year', 'month', 'plan_date',
      'sent_to_cm', 'sent_date', 'memo', 'createdBy', 'updatedAt', 'eval_result', 'sent_by'
    ]]);
    recordSheet.setFrozenRows(1);
    recordSheet.getRange(1, 1, 1, 11).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
```
### after
```js
    recordSheet.getRange(1, 1, 1, 14).setValues([[
      'userId', 'year', 'month', 'plan_date',
      'sent_to_cm', 'sent_date', 'memo', 'createdBy', 'updatedAt', 'eval_result', 'sent_by',
      'moni1_date', 'moni2_date', 'houkoku_date'
    ]]);
    recordSheet.setFrozenRows(1);
    recordSheet.getRange(1, 1, 1, 14).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
```

## Diff A2 — 既存シートの migration（読み幅14＋3列を eval_result/sent_by と同型で追加）
### before
```js
    var oralHdr = recordSheet.getRange(1, 1, 1, Math.max(recordSheet.getLastColumn(), 11)).getValues()[0];
```
### after
```js
    var oralHdr = recordSheet.getRange(1, 1, 1, Math.max(recordSheet.getLastColumn(), 14)).getValues()[0];
```
### 追加（既存 sent_by migration ブロックの直後に挿入）
```js
    // マイグレーション: 口腔②列（moni1_date/moni2_date/houkoku_date）を additive 追加（2026-07・口腔②）
    if (oralHdr.indexOf('moni1_date') === -1) {
      recordSheet.getRange(1, 12).setValue('moni1_date');
      recordSheet.getRange(1, 12).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (oralHdr.indexOf('moni2_date') === -1) {
      recordSheet.getRange(1, 13).setValue('moni2_date');
      recordSheet.getRange(1, 13).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (oralHdr.indexOf('houkoku_date') === -1) {
      recordSheet.getRange(1, 14).setValue('houkoku_date');
      recordSheet.getRange(1, 14).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
```

## Diff B — getOralPlansYear の records マッピングに3フィールド追加
### before（opRecords.push の末尾2行）
```js
          eval_result: String(orow[9] || ''),
          sent_by: String(orow[10] || '')
        });
```
### after
```js
          eval_result: String(orow[9] || ''),
          sent_by: String(orow[10] || ''),
          moni1_date: opFmtDate_(orow[11]),
          moni2_date: opFmtDate_(orow[12]),
          houkoku_date: opFmtDate_(orow[13])
        });
```

## Diff C — updateOralPlan の whitelist ＋ 新規行テンプレ
### before（whitelist）
```js
      var uoFieldAllowed = { plan_date: 4, sent_to_cm: 5, sent_date: 6, memo: 7, eval_result: 10, sent_by: 11 };  // 1-indexed column
```
### after
```js
      var uoFieldAllowed = { plan_date: 4, sent_to_cm: 5, sent_date: 6, memo: 7, eval_result: 10, sent_by: 11, moni1_date: 12, moni2_date: 13, houkoku_date: 14 };  // 1-indexed column
```
### before（新規行テンプレ・11要素）
```js
          var uoNewRow = [uoUserId, uoYear, uoMonth, '', false, '', '', uoOperator || '', uoNow, '', ''];
```
### after（14要素）
```js
          var uoNewRow = [uoUserId, uoYear, uoMonth, '', false, '', '', uoOperator || '', uoNow, '', '', '', '', ''];
```

---

## 朝報 diff（getOralUnsubmitted_ ＋ morningDigest safe('oralSoufu')）— 未適用

### 新規関数（getKeikakushoUnsubmitted_ の口腔版・純ロジック同型）
```js
// 口腔 ケアマネ未提出（口腔②・カットオフ後）: 節目月(3/6/9/12)で (plan_date or houkoku_date) 作成済み かつ 未送付。
// 計画書＋結果報告書は1送付でまとめる → 1レコード1件。カットオフ以降のみ（過去バックログ除外）。
var ORAL_SOUFU_CUTOFF = '2026-07-11'; // ※HTML側 ORAL_SOUFU_CUTOFF と同値。稼働日で確定。
function getOralUnsubmitted_() {
  function _has(v) { return !!(v && String(v).trim()); }
  function _iso(v) { if (!v) return ''; if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd'); return String(v).trim().slice(0, 10); }
  function _onOrAfter(v) { var d = _iso(v); return d && d >= ORAL_SOUFU_CUTOFF; }
  var sheets = ensureOralPlansSheets_();
  var values = sheets.recordSheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var userId = String(row[0] || '');
    var year = parseInt(row[1], 10) || 0, month = parseInt(row[2], 10) || 0;
    if ([3, 6, 9, 12].indexOf(month) < 0) continue;
    var planDate = row[3];        // plan_date(4列)
    var sentToCm = !!row[4];      // sent_to_cm(5列)
    var houkoku = row[13];        // houkoku_date(14列)
    if ((_onOrAfter(planDate) || _onOrAfter(houkoku)) && !sentToCm) {
      list.push({ userId: userId, name: userId, year: year, month: month, date: _iso(houkoku) || _iso(planDate) });
    }
  }
  return { count: list.length, list: list, cutoff: ORAL_SOUFU_CUTOFF };
}
```

### morningDigest に1行追加（既存 safe('keikakushoSoufu', …) の直後に挿入）
```js
  // 口腔 ケアマネ未提出（口腔②・計画書＋結果報告書を1送付でまとめ）
  safe('oralSoufu', function () { return getOralUnsubmitted_(); });
```
表示（morning-digest 消費側）: 「口腔ケアマネ未提出：{oralSoufu.count}件」。

---

## 無影響確認（適用後に実測すること）
- 既存 updateOralPlan(plan_date/sent_to_cm/eval_result/sent_by)・updateOralConfig・getOralPlans(月次)・scanOralSendFolder_ は列≤11のindex参照 → 右追加で不変。
- teishutsu は oral.users のみ読む（records無関係）→ 無影響。oral.html②③/①oral-record（別GAS）も既存fieldのみ → 無影響。
- ensureOralPlansSheets_ は冪等（存在すれば列有無だけ検査）。
- 適用検証: `?action=getOralPlansYear&year=2026` の records に moni1_date/moni2_date/houkoku_date キーが出ること／updateOralPlan で moni1_date 書込→再GETで反映を curl(node UTF-8) で実測。
