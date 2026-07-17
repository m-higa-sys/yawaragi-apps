# genba「前回お休み」バッジ 欠席理由表示 設計書

- 日付: 2026-07-17
- ブランチ: `feat/prev-absent-reason`（worktree `C:/tmp/wt-prev-absent-reason` / 起点 origin/master `2898989`）
- 目的: 前回欠席者のバッジに理由（体調／私用／不明）を出し、**声かけの入口を一目で決められる**ようにする

---

## 1. 現状調査の結果（着手前 measure・全て実バイト検証済み）

社長スペックの前提と実態に **3点のズレ**があり、指示②③は実装不要と判明した。

### 1.1 「前回お休み」はセッションボードに無い

| 対象 | 実態 |
|---|---|
| `genba.html` | **実体はここ**。`attRenderUser` 内 6879-6886行。判定補助は `attPrevScheduledDate`（6821行） |
| `session-board.html` | `前回お休み` `recentAbsences` とも **出現数 0**。無関係 |
| `yawaragi-board.html` | 同一コードの**複製が4箇所**（8416 / 8469-8474 / 8542行）。社長ボード |

→ 表示ロジックは **genba.html に閉じる**（スペック⑤の「セッションボードに閉じるのが理想」に対応する実態）。

### 1.2 reason は既に存在する（スペック②は充足済み・列追加不要）

single source は **`出欠変更` シートの E列（index 4）＝理由**。

```
コード.js:12694  getRecentAbsencesByUser()
  result[norm].push({ date: d, dow: dayChars[dow],
                      unit: String(data[i][2] || ''), reason: String(data[i][4] || '') });
```

この reason は既に `getUsageAlerts`（コード.js:12623 `recentAbsences: absDetail[norm] || []`）経由で
**genba のフロント `usageAlertMap[norm].recentAbsences[]` まで届いており**、
利用者モーダルでは既に表示済み（genba.html:7126）。

バッジ側（6883行）だけが `.some()` で日付一致を見つけながら **掴んだ reason をその場で捨てている**。

→ **欠席レコードへの reason フィールド追加は不要。捨てている値を拾うだけ。**

### 1.3 欠席登録UIは既に理由のタップ選択（スペック③は充足済み・手入力なし）

`genba.html:4446 ABS_REASONS` に **20項目**が定義済み。手入力は「その他」選択時のみ。

「その他」選択時に E列へ実際に保存される値（genba.html 実コード）:

```js
const reason = absState.reason === 'その他' ? (absState.reasonOther || 'その他') : absState.reason;
```

→ **E列 = 「既知20項目のいずれか」または「任意の自由文字列」**（空なら `'その他'`）。
→ 3ボタンを追加すると「体調不良」と「体調」の**二重入力**になり食い違いが発生するため採らない。

### 1.4 アイコン庫が無い

`genba.html` に Tabler Icons は**存在しない**（`<link>` タグ 0件 / `ti ti-` 使用 0件）。
指定の `ti-heartbeat` `ti-help-circle` は記述しても**表示されない**。
既存バッジは 🌼（前回お休み）🌱（利用再開）🔴🟡（利用率）と**全て絵文字で統一**されている。

→ 絵文字で代用し、既存の並びと見た目を揃える。色は指定値をそのまま使う。

---

## 2. 決定事項（社長判断）

| 論点 | 決定 | 理由 |
|---|---|---|
| 入力UI（③） | **触らない。マッピングのみ** | 既存20項目が稼働中。過去データが全て活き、既存挙動が完全に不変 |
| 「本人の意欲低下」 | **health** | 心身の不調として赤系で目立たせる。声かけの中身も体調と同じ。`unknown` は「記録が無い」の意味に保つ |
| 適用範囲 | **genba.html のみ** | 現場スタッフが声かけに使うのは genba。版ゲートの本番反映が1本で済む |
| アイコン | **絵文字** | 既存バッジと統一。外部CDN依存ゼロ |

---

## 3. アーキテクチャ

**genba.html 1ファイルに閉じる。** GAS・シート・欠席登録UI・他アプリは1バイトも触らない。

### データフロー（★の2箇所のみ新規）

```
出欠変更シート E列（理由／既知20項目 or 任意文字列）        ← 変更なし
  → GAS getRecentAbsencesByUser()   reason 付きで返却        ← 既存・変更なし
  → GAS getUsageAlerts()            recentAbsences に同梱     ← 既存・変更なし
  → genba usageAlertMap[norm].recentAbsences[]              ← 既存・もう届いている
  → attRenderUser が前回利用予定日で該当レコードを拾う（.some → .find・述語同一）
  → ★ absReasonCategory(reason)   → 'health' | 'personal' | 'unknown'
  → ★ absPrevAbsentView(category) → { label, bg, text, icon }
  → バッジHTML
```

---

## 4. 純関数1: `absReasonCategory(reasonText)`

**責務**: 出欠変更E列の生文字列を3分類に落とす。入力は任意文字列・null・undefined を許容。
**戻り値**: `'health' | 'personal' | 'unknown'` のみ。

| 分類 | 該当項目 | 数 |
|---|---|---|
| **health** | 体調不良／痛み（腰痛・膝痛等）／転倒／骨折／ケガ／感染症（コロナ・インフル等）／通院／入院／退院後の自宅療養／ワクチン接種／本人の意欲低下 | 11 |
| **personal** | ショートステイ中／他サービス利用／家族の都合／家族の体調不良／冠婚葬祭／天候不良／外出・旅行／私用 | 8 |
| **unknown** | その他 ／ 空文字 ／ null ／ undefined ／ **未知の任意文字列（＝「その他」自由入力の実体）** | 1 + ∀ |

`11 + 8 + 1 = 20` で `ABS_REASONS` を**過不足なく網羅**する。

**フォールバック規則**: 完全一致テーブルに載らない入力は**全て `unknown`**。
これにより「その他」の自由入力・将来 ABS_REASONS に項目が増えた場合・過去データの空欄が
すべて安全に `unknown`（黄・❓＝要確認）に落ち、表示が壊れない。

**マッチング**: 前後空白を除去した完全一致（`String(x || '').trim()`）。
部分一致は採らない（「家族の体調不良」が「体調不良」に誤マッチするのを防ぐため）。

---

## 5. 純関数2: `absPrevAbsentView(category)`

**責務**: 分類を表示属性に落とす。**責務分離**のため分類ロジックとは別関数にする。

| category | label | bg | text | icon |
|---|---|---|---|---|
| `health` | 前回休・体調 | `#FAECE7` | `#993C1D` | 🩺 |
| `personal` | 前回休・私用 | `#F1EFE8` | `#5F5E5A` | （なし・空文字） |
| `unknown` | 前回休・不明 | `#FAEEDA` | `#854F0B` | ❓ |

**フォールバック規則**: 未知の category は `unknown` の属性を返す（例外を投げない）。

---

## 6. 呼び出し側の差分（genba.html 6879-6886 のみ）

```js
// 現状
var prevAbsentBadge = '';
if (!isAbsent && ua && ua.weekdaysRaw && ua.recentAbsences && ua.recentAbsences.length) {
    var prevSchedDate = attPrevScheduledDate(ua.weekdaysRaw, attCurrentDate);
    if (prevSchedDate && ua.recentAbsences.some(function(a) { return a.date === prevSchedDate; })) {
        prevAbsentBadge = '<span class="att-prev-absent">🌼 前回お休み</span>';
    }
}

// 変更後
var prevAbsentBadge = '';
if (!isAbsent && ua && ua.weekdaysRaw && ua.recentAbsences && ua.recentAbsences.length) {
    var prevSchedDate = attPrevScheduledDate(ua.weekdaysRaw, attCurrentDate);
    var hit = prevSchedDate && ua.recentAbsences.find(function(a) { return a.date === prevSchedDate; });
    if (hit) {
        var v = absPrevAbsentView(absReasonCategory(hit.reason));
        prevAbsentBadge = '<span class="att-prev-absent" ' +
            'style="background:' + v.bg + ';color:' + v.text + ';">' +
            (v.icon ? v.icon + ' ' : '') + v.label + '</span>';
    }
}
```

**色の当て方**: 既存クラス `.att-prev-absent` は形状・余白・フォントの土台として残し、
`background` と `color` だけを純関数の戻り値（`v.bg` / `v.text`）から**インラインstyleで上書き**する。

- 純関数の契約（§5 の `{ label, bg, text, icon }`）をそのまま使い切れる。CSS側に色定義を二重管理しない。
- 既存の 🌱 利用再開バッジ（genba.html:6890）も同じインラインstyle方式であり、**現行コードの流儀を踏襲**する。
- CSS の追加・変更は**発生しない**（`.att-prev-absent` の既存の色指定はインラインstyleに常に負けるため無害）。

---

## 7. 既存挙動の不変性（回帰の起きない根拠）

1. **バッジが出る／出ない条件は一切変えない。**
   `.some(pred)` → `.find(pred)` は**述語が同一**であり、ヒット有無は同値。
   変わるのは「掴んだ物を捨てるか使うか」だけ。
2. **過去データは全て活きる。** 理由が空の古い欠席は `unknown`（黄・❓）で表示される。
   **マイグレーション不要**（列追加が無いため、そもそもデータ変換が発生しない）。
3. **書き込み経路をひとつも触らない。** 欠席登録・GAS・シートは無改修＝データ破壊のリスクがゼロ。
4. **他アプリ非干渉。** yawaragi-board.html / session-board.html は無改修のまま従来表示を維持。

---

## 8. テスト（TDD・RED先行）

`scripts/test-genba-prev-absent-reason.js`

既存流儀（`scripts/test-genba-absence-slots.js`）を踏襲し、**genba.html から出荷コードそのものを
波括弧バランスで抽出**して検証する（別ファイルに写した複製ではなく実物を検証する）。
未実装の状態では抽出関数が `throw` して落ちる＝**RED から入る**。

### テストケース

**`absReasonCategory`**
- health 11項目 それぞれ → `'health'`（11ケース）
- personal 8項目 それぞれ → `'personal'`（8ケース）
- `'その他'` → `'unknown'`
- `''` / `null` / `undefined` → `'unknown'`（3ケース）
- 未知の自由文字列（例 `'孫の運動会'`）→ `'unknown'`
- 前後空白付き（例 `'  体調不良  '`）→ `'health'`
- 部分一致の誤爆防止: `'家族の体調不良'` → `'personal'`（`'health'` にならないこと）

**`absPrevAbsentView`**
- 3分類 × `{ label, bg, text, icon }` の完全一致（3ケース）
- 未知 category（例 `'zzz'`）→ unknown の属性

**網羅性ガード**
- `ABS_REASONS`（20項目）を genba.html から抽出し、**全項目が3分類のいずれかに落ちること**を検証。
  将来 ABS_REASONS に項目が増えた際、この検証で気づける（unknown 落ちを検出）。

実行: `node scripts/test-genba-prev-absent-reason.js`

---

## 9. 触らないもの（明示）

| 対象 | 理由 |
|---|---|
| 📊 出欠変更シート | reason は E列に既存。**列追加なし**（スペック②は充足済み） |
| ⚙️ GAS `コード.js` | reason は既に返している。**無改修** |
| 📄 欠席登録UI（`ABS_REASONS`） | 20項目タップ選択が既に稼働（スペック③は充足済み） |
| 📄 `yawaragi-board.html` | 今回対象外。従来の 🌼 前回お休み のまま |
| 📄 `session-board.html` | 当該機能は元々存在しない |

---

## 10. 完了条件

1. `node scripts/test-genba-prev-absent-reason.js` **緑**
2. **社長承認**
3. `node scripts/bump-app-version.js <新版>` で版上げ（version.txt + `shared.js?v=` 同時・commit まで）
4. **`git push origin master` は社長の手**
5. `node scripts/bump-app-version.js --verify <版>` で**本番反映の証跡**を取得

**自己完了報告はしない。** 証跡なしの「反映しました」は報告として不成立（CLAUDE.md 完了定義）。

---

## 11. 検証上の注意（このセッションで実測）

- **ツール出力破損が生きている。** `コード.js` 12723行目を Read すると `\   ★沈黙不全ガード` と壊れて表示されたが、
  実体は `//   ★沈黙不全ガード` だった。**Read の表示を根拠にせず、node 実バイトで裏取りする。**
- **本番HTMLを実ブラウザで開いて検証しない**（file:// でも no-cors + keepalive で本番GASへ飛ぶ）。
  今回は純関数テストのみで、DOM検証が要る場合は jsdom + fetch 遮断で行う。
