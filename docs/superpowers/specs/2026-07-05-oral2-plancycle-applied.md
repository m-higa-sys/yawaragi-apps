> 【出荷済み・記録用】本番GAS@310で適用済み（口腔②個人サイクル化・commit cd582e1）。以下は適用当時の staged diff の記録（原本は wt-oral-plan の untracked `oral2-plancycle-gas-additive.staged.md`・作成 2026-07-05）。

# 口腔② 個人サイクル化 GAS staged diff（未適用・11日以降 clasp deploy）

対象: `gas/yawaragi-board/コード.js`（board GAS正本・現行=@308相当）。**additive のみ**（口腔機能向上**設定**シートに plan_start / plan_end を右追加、書込枝と読取相乗りを追加）。記録シート(14列)・updateOralPlan whitelist は**不変更**。
適用前提: **`clasp pull` で本番と実突合**（memory教訓・repo stale の可能性）→ 下記3点を適用 → `clasp push -f` → `clasp deploy -i "<既存ID>"`（新規作成禁止・URL維持）。アンカー一致方式（行番号ズレに強い）。
基準: 現行 config シート = `['userId','is_target','started_at','updatedAt','eval_anchor']`（5列）。→ `plan_start`(6) `plan_end`(7) を additive。

---

## Diff A — ensureOralPlansSheets_ config シート（新規作成 5→7列）
### before（アンカー: configSheet 新規作成）
```js
    configSheet.getRange(1, 1, 1, 5).setValues([['userId', 'is_target', 'started_at', 'updatedAt', 'eval_anchor']]);
    configSheet.setFrozenRows(1);
    configSheet.getRange(1, 1, 1, 5).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
```
### after
```js
    configSheet.getRange(1, 1, 1, 7).setValues([['userId', 'is_target', 'started_at', 'updatedAt', 'eval_anchor', 'plan_start', 'plan_end']]);
    configSheet.setFrozenRows(1);
    configSheet.getRange(1, 1, 1, 7).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
```

## Diff A2 — 既存 config シートの migration（eval_anchor migration ブロックの直後に挿入）
### before（アンカー: eval_anchor migration の読み幅）
```js
    var cfgHdr = configSheet.getRange(1, 1, 1, Math.max(configSheet.getLastColumn(), 4)).getValues()[0];
    if (cfgHdr.indexOf('eval_anchor') === -1) {
      configSheet.getRange(1, 5).setValue('eval_anchor');
      configSheet.getRange(1, 5).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
```
### after（読み幅7へ拡張＋plan_start/plan_end を additive）
```js
    var cfgHdr = configSheet.getRange(1, 1, 1, Math.max(configSheet.getLastColumn(), 7)).getValues()[0];
    if (cfgHdr.indexOf('eval_anchor') === -1) {
      configSheet.getRange(1, 5).setValue('eval_anchor');
      configSheet.getRange(1, 5).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    // マイグレーション: 口腔②個人サイクル列（plan_start=計画作成/節目アンカー YYYY-MM / plan_end=イレギュラー終了 YYYY-MM）2026-07
    if (cfgHdr.indexOf('plan_start') === -1) {
      configSheet.getRange(1, 6).setValue('plan_start');
      configSheet.getRange(1, 6).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (cfgHdr.indexOf('plan_end') === -1) {
      configSheet.getRange(1, 7).setValue('plan_end');
      configSheet.getRange(1, 7).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
```

## Diff B — updateOralConfig に plan_start / plan_end の受理と書込を追加
既存 `updateOralConfig`（コード.js:3125〜）は is_target(2列)/started_at(3列)/eval_anchor(5列) を書く。同型で plan_start(6列)/plan_end(7列) を足す。
### before（パラメータ受理・アンカー: ocEvalAnchor の直後）
```js
      var ocEvalAnchor = (e && e.parameter && e.parameter.evalAnchor !== undefined) ? String(e.parameter.evalAnchor).trim() : null;
```
### after
```js
      var ocEvalAnchor = (e && e.parameter && e.parameter.evalAnchor !== undefined) ? String(e.parameter.evalAnchor).trim() : null;
      var ocPlanStart  = (e && e.parameter && e.parameter.planStart  !== undefined) ? String(e.parameter.planStart).trim()  : null;
      var ocPlanEnd    = (e && e.parameter && e.parameter.planEnd    !== undefined) ? String(e.parameter.planEnd).trim()    : null;
```
### before（バリデーション・アンカー: evalAnchor 検証の直後）
```js
      if (ocEvalAnchor !== null && ocEvalAnchor !== '' && !/^\d{4}-\d{2}$/.test(ocEvalAnchor)) {
        return respond({ ok: false, error: 'invalid evalAnchor (YYYY-MM)' }, callback);
      }
```
### after（plan_start/plan_end も YYYY-MM 検証。空文字はクリア許可）
```js
      if (ocEvalAnchor !== null && ocEvalAnchor !== '' && !/^\d{4}-\d{2}$/.test(ocEvalAnchor)) {
        return respond({ ok: false, error: 'invalid evalAnchor (YYYY-MM)' }, callback);
      }
      if (ocPlanStart !== null && ocPlanStart !== '' && !/^\d{4}-\d{2}$/.test(ocPlanStart)) {
        return respond({ ok: false, error: 'invalid planStart (YYYY-MM)' }, callback);
      }
      if (ocPlanEnd !== null && ocPlanEnd !== '' && !/^\d{4}-\d{2}$/.test(ocPlanEnd)) {
        return respond({ ok: false, error: 'invalid planEnd (YYYY-MM)' }, callback);
      }
```
### 空判定ガードも plan_start/plan_end を含める
#### before
```js
      if (ocIsTargetRaw === null && !ocStartedAt && ocEvalAnchor === null) {
        return respond({ ok: false, error: 'invalid params (isTarget/startedAt/evalAnchor required)' }, callback);
      }
```
#### after
```js
      if (ocIsTargetRaw === null && !ocStartedAt && ocEvalAnchor === null && ocPlanStart === null && ocPlanEnd === null) {
        return respond({ ok: false, error: 'invalid params (isTarget/startedAt/evalAnchor/planStart/planEnd required)' }, callback);
      }
```
### 書込（新規行 appendRow ＋ 既存行 setValue の2箇所に列6/7を足す）
新規行テンプレ（現在 5要素 `[ocUserId, ocNewIsTarget, ocNewStartedAt, ocNow, ocNewAnchor]`）→ 7要素へ:
```js
          ocSheet.appendRow([ocUserId, ocNewIsTarget, ocNewStartedAt, ocNow,
            (ocEvalAnchor === null ? '' : ocEvalAnchor),
            (ocPlanStart === null ? '' : ocPlanStart),
            (ocPlanEnd   === null ? '' : ocPlanEnd)]);
```
既存行更新側（eval_anchor を列5に setValue しているブロックの並びに追加）:
```js
          if (ocPlanStart !== null) ocSheet.getRange(ocRowIdx, 6).setValue(ocPlanStart);
          if (ocPlanEnd   !== null) ocSheet.getRange(ocRowIdx, 7).setValue(ocPlanEnd);
```
※ 実適用時は既存の eval_anchor 更新分岐（`if (ocEvalAnchor !== null) ... getRange(ocRowIdx,5)`）の直後に上記2行を置く。clasp pull 後に該当行を実確認してから挿入（アンカー突合）。

## Diff C — getOralTargetUsers_ / getOralPlansYear に planStart / planEnd 相乗り
`getOralTargetUsers_`（コード.js:12810〜）は config から startedAt/evalAnchor を読んで user に付与済み。同型で planStart/planEnd を読む。
### config 読取（configMap 構築部・startedAt/evalAnchor を読んでいる箇所）に追加
```js
        // 既存: startedAt, evalAnchor を読む箇所に並べて
        planStart: (function (v) { return v ? String(v).trim() : ''; })(cfgRow[5]),   // plan_start(6列)
        planEnd:   (function (v) { return v ? String(v).trim() : ''; })(cfgRow[6])    // plan_end(7列)
```
### user オブジェクト付与（`evalAnchor: cfg.evalAnchor || ''` の直後）
```js
      evalAnchor: cfg.evalAnchor || '',
      planStart: cfg.planStart || '',
      planEnd: cfg.planEnd || '',
```
→ `getOralPlansYear` は `users: opUsers` をそのまま返すので、追加マッピング不要でフロントに `planStart`/`planEnd` が届く（既存 startedAt/evalAnchor と同経路）。

---

## 無影響確認（適用後に実測）
- 既存 updateOralConfig（is_target/started_at/eval_anchor）・updateOralPlan・getOralPlans(月次)・teishutsu・oral.html②③・①oral-record（別GAS）は列≤5参照 or records 参照 → 右追加で不変。
- ensureOralPlansSheets_ は冪等（列有無だけ検査）。既存データ非破壊。
- 検証: `?action=getOralPlansYear&year=2026` の users に planStart/planEnd キーが出ること／`updateOralConfig?userId=…&planStart=2026-09` 書込→再GETで反映を node(UTF-8) で実測／既存 evalAnchor/startedAt が壊れないこと。

## ★適用前チェックリスト
- [ ] `clasp pull` で本番@308と repo コード.js を突合（差分あれば本diffのアンカー行を実コードに合わせ直す）
- [ ] 繁忙期(1-10日)を外した日に実施
- [ ] push→deploy は既存ID維持（`clasp deploy -i`）
- [ ] フロント（ANCHORS撤去＋oralCyclerole＋12ヶ月グリッド）は別作業・別GO
