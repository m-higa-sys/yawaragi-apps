# 電算 結果Excel取込リマインド（morningDigest・終わるまで方式）設計書

- 作成: 2026-07-06（クロコ）
- 発端: 社長指示「結果ExcelのDL＆取込忘れを morningDigest で催促し、取り込むまで居座り、取り込んだら自動で消す」
- 状態: **設計確定（2026-07-06 社長承認・案B/前月M-1固定/マーカー内部フラグの3点合意）→ 実装計画へ。push/deploy はトラッカー本番化と同じ承認フロー（go-live順序）**
- 関連: [[project_振替不能トラッカー-ゲートA完了]] / [[2026-07-02-月次定例タスク-morningDigest統合-design]]

---

## 1. 目的

電算からの結果Excel（`YYYYMMDD_kekka.xls`）のDL＆振替不能トラッカーへの取込を忘れると、
**振替不能そのものが検知されない**（入口が人力依存）。morningDigest で取込を催促し、
**取り込むまで毎朝居座り、取り込んだら自動で消える**（終わるまで方式・手動完了不要）。

## 2. 発火タイミングの根拠（実データ実測・2026-07-06）

Downloads の過去 kekka を実測（振替日→初回DL）:

| 振替日 | 初回DL | 差 |
|---|---|---|
| 2026-03-27 | 2026-04-04 | +8日 |
| 2026-04-27 | 2026-05-03 | +6日 |
| 2026-05-27 | 2026-06-16 | +20日（まとめ取りの遅延・外れ値） |

- 振替日＝毎月27日固定。結果DL可能＝**振替日+6〜8日＝翌月上旬（3〜4日ごろ）**。
- サンプル3ヶ月の傾向のため、発火日は**設定値で調整可能**にする（既定 startDay=3）。

## 3. 現状アーキテクチャ（調査結果・2026-07-06実測）

| 要素 | 実体 |
|---|---|
| morningDigest 本体 | `my-project/gas/yawaragi-board/コード.js`（板GAS・`safe('name', fn)` で12セクション） |
| 当日変数 | `dateStr`（`YYYY-MM-DD`・`e.parameter.date` 上書き可） |
| 年またぎヘルパ | `_digestNextYm_(dateStr)`（翌月版が実在・前月版はこれを鏡写し） |
| 表示側 | `my-project/scripts/morning-digest.ps1`（セクション個別描画） |
| 純関数の二重持ち | `my-project/scripts/test-morning-digest.js`（`foldFurikaeByMonth_` 等を同一実装でテスト） |
| furikae データ到達 | 板GASは既に `DIGEST_FURIKAE_URL`（furikae専用GAS `?action=getFurikae`）を UrlFetch し `d.records` を取得済み |
| トラッカー | `yawaragi-apps` furikae.html（feat/furikae-funou-tracker・ゲートB承認待ち・未prod）。書込は cloudSync 単一ファネル |

### 3-1. 実測で確定した制約（設計の分岐点）

- getFurikae のトップレベルキーは **`records` と `nextId` のみ**（`importedMonths` 等の blob フィールドは round-trip **しない**）。
- cloudSync の POST payload も `{records, nextId}` 決め打ち（furikae.html:651）。
- furikae 専用GAS のソースは**リポジトリ未収録（ドリフト・gas-source-git-sync 未完）**。触ると clasp再認証＋ドリフト解消が必要。
- **∴ records[] が唯一確実に round-trip する実証済みチャネル**。マーカーは records に載せる（案B）。

### 3-2. 穴の実在確認

`processExcelFile` の不能0件パス（furikae.html:494-497）は `data` に何も保存せず・同期もせず `return`。
**成功のみの月は痕跡ゼロ** → 「records有無」だけでは永久に未取込判定（＝素朴案の欠陥）。

## 4. 方式比較

| 案 | 仕組み | furikae GAS改修 | 判定 |
|---|---|---|---|
| A: blobフィールド | `data.importedMonths[]` 追加＋cloudSync/getFurikae改修 | **必須**（未収録GAS本体＋clasp再認証＋ドリフト解消）＝重い/リスク大 | `d.importedMonths.includes(X)` |
| **B: records内センチネル（採用）** | 不能0件の月に「取込済マーカー行」1件を records に push（内部フラグ） | **不要**（records は実証済みround-trip） | `records.some(r=>r.month===X)` |
| C: records有無のみ | 改修なし | 不要 | 0件の月を永久未取込判定＝**却下（§3-2の穴）** |

**→ 案B採用**（社長承認 2026-07-06）。未収録の furikae GAS 本体に一切触れず、板GAS（リポジトリ内）＋表示ps1＋トラッカー小改修で完結。

## 5. データモデル：取込済マーカー（トラッカー側・feat branch）

`processExcelFile` を改修し、**不能0件パスでも痕跡を残す**。

### 5-1. マーカー行の形

```js
{ id: data.nextId++, month: month, isImportMarker: true, status: '回収済',
  name: '(取込済マーカー)', reason: '取込済み・不能0件', amount: 0,
  customerId: '', hikiotoshiDate: hikiotoshiDate, createdAt: today }
```

- `isImportMarker: true` が**内部フラグ**（社長合意①）。morningDigest の取込済み判定のためだけに読む隠しデータ。
- `status: '回収済'` にすることで、既存 `foldFurikaeByMonth_` が元々集計から落とす（未解決件数を汚さない・二重の安全）。

### 5-2. 追加ロジック（冪等）

- `month` の解決をファイル名（`hikiotoshiMonth`）から**前倒し**し、不能0件の早期returnより前で確定。
- **冪等条件**: `!data.records.some(r => r.month === month)` の時だけマーカーを push。
  - 不能ありの月は実レコードが痕跡 → マーカー不要（`some` が真でスキップ）。
  - 同一0件月の再取込 → マーカー既存 → スキップ（幽霊行の重複を防ぐ）。
- push 後 `saveData(data)` → 既存 cloudSync（無改修）で records として同期。

### 5-3. マーカーの除外範囲（社長合意①・「幽霊行・件数ズレを出さない」）

**表示・件数集計・fold・伝達ボード件数・actionable判定の全部から除外**する。除外を入れる箇所（実装時に全数当たる）:

- `renderMonth` / 月別行描画（画面に幽霊行を出さない）
- `initMonthSelect` / `monthSelect`（マーカーだけの月をタブに出さない＝将来 0件月がタブ化しないよう確認）
- `fnkActionableCount`（要対応件数に混ぜない）
- `fnkNotifyBoard` / `fnkActionableCount` 経由の伝達ボード通知（件数のみ通知を汚さない）
- `fnkGoushanCandidates`（翌月合算・回収済候補の走査対象から除外）
- CSV/印刷/エクスポート等、records を走査する全箇所

> テストの「除外」「冪等」検証が番人。マーカーが1箇所でも漏れたら RED。

## 6. 判定ロジック（板GAS純関数・前月M-1固定）

`test-morning-digest.js` に二重持ち（既存慣習）。

```js
// 前月版（_digestNextYm_ の鏡写し・年またぎ対応）
function _digestPrevYm_(dateStr) {
  var y = parseInt(dateStr.slice(0, 4), 10), m = parseInt(dateStr.slice(5, 7), 10);
  var py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return py + '-' + ('0' + pm).slice(-2);
}

// 取込リマインド判定。null=催促なし（居座らない）、object=催促
function furikaeImportReminder_(records, dateStr, startDay) {
  var day = parseInt(dateStr.slice(8, 10), 10);
  if (day < startDay) return null;                       // 翌月上旬前は静観
  var target = _digestPrevYm_(dateStr);                  // 対象＝前月(振替日=前月27日)分・M-1固定
  var imported = (records || []).some(function (r) { return r.month === target; });
  if (imported) return null;                             // 取込済（実レコード or マーカー）→自動消滅
  return {
    month: target,
    message: '電算から結果Excel(kekka.xls)をDL → 振替不能トラッカーに取込（' + target + '分・未取込）'
  };
}
```

- **対象月は前月 M-1 固定**（社長合意②）。1月発火→前年12月分の年またぎを正しく処理（`_digestPrevYm_` の境界）。
- 実データ突合: 3月batch(振替日3/27)は4月にDL＝当月4月から見て前月3月＝M-1。整合。
- **前月しか見ない**ため、機能導入前の過去の全成功月が誤催促を生まない（探索は常に直前1ヶ月）。

## 7. 板GAS セクション追加（additive）

`morningDigest(e)` の `safe('furikae', ...)` の直後に追加:

```js
var FURIKAE_IMPORT_START_DAY = 3; // 翌月この日から催促（振替日27+6〜8日≒翌月上旬・運用調整可）

safe('furikaeImport', function () {
  var d = JSON.parse(UrlFetchApp.fetch(DIGEST_FURIKAE_URL, { muteHttpExceptions: true }).getContentText());
  return furikaeImportReminder_(d.records || [], dateStr, FURIKAE_IMPORT_START_DAY);
});
```

- 既存 `DIGEST_FURIKAE_URL` を再利用（getFurikae は既に叩いている・新規外部呼び出しを増やさない）。
- 返却は `null`（催促なし）or `{month, message}`。`safe` により失敗時も他セクションに波及しない。

## 8. 表示 ps1 追記（additive）

既存「3. 口座振替 未解決」ブロックの直後:

```powershell
# 3-b. 電算 結果Excel 取込リマインド（終わるまで方式）
$fi = $s.furikaeImport
if ($fi -and $fi.month) { WL "[!!] 電算 結果Excel未取込: $($fi.message)" Red }
```

- ダイジェスト表面化の閾値（`$sum` 計算・89-102行付近）にも「$fi.month があれば +1」を加え、未取込がある朝は必ず表面化。

## 9. テスト（TDD）

### 9-1. 板GAS純関数（`test-morning-digest.js` に追記）
- `_digestPrevYm_`: 通常月（2026-06→2026-05）／**1月境界（2026-01→2025-12）**。
- `furikaeImportReminder_`:
  - day < startDay → null（静観）
  - 対象月の records あり → null（取込済・実レコード）
  - 対象月のマーカーあり（status:回収済） → null（0件月の取込済）
  - 対象月 records なし → 催促オブジェクト（message に対象月を含む）
  - 年またぎ（2026-01-05, startDay=3 → 2025-12 を対象に判定）

### 9-2. トラッカー（既存 furikae テスト拡張）
- 不能0件取込 → マーカー1件が該当月に追加される。
- 冪等: 同月再取込／不能ありの月 → マーカーを追加しない（重複ゼロ）。
- 除外: `fnkActionableCount` がマーカーを数えない。`foldFurikaeByMonth_` 相当がマーカーを未解決に数えない。（§5-3 の各除外点をユニットで固定）

## 10. go-live 順序（設計不変・承認フロー）

- マーカー（トラッカー）は feat branch に載せ、**トラッカー本番化と同時**にリリース（未prod ゆえ「マーカー無しで成功取込」の隙間は発生しない）。
- 板GASリマインドは**トラッカー本番化と同時か後**にデプロイ（先行すると取込先が無い状態で催促してしまう）。
- 板GAS＝clasp（社長承認後・[[clasp-gas-deploy-url-iji]]）、furikae＝版ゲート＋承認。
- **繁忙期(10-12日)とはズレる（翌月上旬発火）**ため morningDigest 不介入方針に適合。
- **2リポジトリにまたがる**: `yawaragi-apps`（furikae.html＋本設計書＋トラッカーテスト）／`my-project`（板GASコード.js＋morning-digest.ps1＋test-morning-digest.js）。

## 11. 変更ファイル一覧

| リポジトリ | ファイル | 変更 |
|---|---|---|
| yawaragi-apps (feat) | furikae.html | §5 マーカー追加＋除外（processExcelFile 他） |
| yawaragi-apps (feat) | scripts/test-furikae-*.js | §9-2 マーカー/冪等/除外テスト |
| yawaragi-apps (feat) | docs/.../2026-07-06-furikae-kekka-import-remind-design.md | 本設計書 |
| my-project | gas/yawaragi-board/コード.js | §6 純関数＋§7 セクション |
| my-project | scripts/test-morning-digest.js | §9-1 純関数テスト |
| my-project | scripts/morning-digest.ps1 | §8 表示 |
