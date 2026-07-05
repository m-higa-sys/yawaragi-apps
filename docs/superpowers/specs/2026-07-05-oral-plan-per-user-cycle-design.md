# 口腔②oral-plan.html「個人ごとサイクル」移植設計（調査＋設計のみ・未実装）

作成: 2026-07-05 ／ 状態: **設計確定待ち・実装/GAS/push なし** ／ 移植元お手本: 個別機能訓練計画書チェック.html + shared.js §I

## 0. 結論サマリ（先に3行）
1. **制度上、口腔加算の計画/評価は「利用者ごとの計画作成月起点で3ヶ月周期」が正しい**。現行の3/6/9/12全員一律は近似（制度の縛りではない）。→ 作り替え方針は妥当。
2. 個訓のお手本は **`diff%3`（planStart起点の月差）方式**。口腔も `isOralEvalMonth`（現行 startedAt 3ヶ月毎）を planStart 起点の `diff%3` に差し替えるだけで同型移植できる。
3. **per-userアンカーの受け皿は口腔GASに既存**（口腔機能向上設定シート＝userId/is_target/started_at/eval_anchor、`updateOralConfig`で書込可）。plan_start はここに足すのが最小改修（利用者台帳を触らない）。

---

## 1. 制度確認（最優先・切り分け結果）

| 論点 | 制度上 | 現行アプリ |
|------|-------|-----------|
| 計画作成の起点 | 利用開始時に把握→**利用者ごとに計画作成** | 全員一律で近似 |
| 再評価・見直しの周期 | **概ね3ヶ月ごと**（長さは3ヶ月固定） | 3ヶ月周期＝OK |
| 節目が何月か | **固定されない**（利用者ごとの計画作成月起点） | ❌ 3/6/9/12カレンダー固定＝近似 |
| モニタリング | 毎月（計画に基づき実施） | モニ①②で対応 |
| LIFE提出(Ⅱ) | 少なくとも3月に1回 | 別管理 |

**→ 周期の長さ（3ヶ月）は制度固定。起点（何月か）は利用者ごとで自由。** カレンダー固定3/6/9/12は制度要件ではなく現行の近似実装。
出典: rehab.cloud/mag/2668, TOPPAN lifesensing wan_contents05, kaigo.intertrust まもる君クラウド。

---

## 2. 移植元（個訓）の個人サイクル実装（実測）

### 2.1 planStart の持ち方
- **user単位**（record単位ではない）。`state.users[].planStart` + `planMonths`（HTML:692-700）。DOMは氏名セル `data-planstart`。
- 保存先＝**利用者台帳シート**の列名検索（`findCol(header, ['計画書開始'])` / `['計画月数']`・コード.js:2252/2256/13265）。
- 書込action `updatePlanStart`（コード.js:2222-2290）: `value`=YYYY-MM（`/^\d{4}-\d{2}$/`検証）、`planMonths`=1-12任意。

### 2.2 サイクル計算式（shared.js §I・`diff`方式）
```js
// 計画月: diff = planStart からの月差。既定L=3 → diff>=0 かつ diff%3===0（0,3,6,9…）
function isPlanMonth(planStart, planMonths, year, month){ ... diff>=0 && diff%3===0 ... }
// 評価月: 既定L=3 → diff>=2 かつ diff%3===2（2,5,8…＝次計画月の前月）。加えて diff===-1（前サイクル最終評価）
function isHyoukaMonth(planStart, planMonths, year, month){ ... }
// 開始前ガード: diff<0 は一切描画しない
function isBeforePlanStart(planStart, year, month){ return diff<0; }
```
- **要支援/要介護での周期分岐なし**（個訓は要介護のみ抽出・サイクル差はplanMonthsのみ）。
- **個訓に isMoniMonth は無い**（モニタリングは別概念）。

### 2.3 グリッド描画（重要）
- **見出しは全員一律の固定枠**（年度4月〜翌3月 × SUB_COLS＝計画/評価の2列・固定カレンダーグリッド）。
- 個人ごとは**セル単位の出し分け**：各セルの中身を `isPlanMonth(u.planStart,…)` / `isHyoukaMonth(…)` で判定。開始前は `-`。データ有りセルは非該当月でも常時表示（planStart移動で過去分が消えない）。
- 「今月やること」専用ビューは無いが、`updateStats` が当年月に `isPlanMonth/isHyoukaMonth` で今月該当をカウント。

**→ 移植の肝：口腔も『3/6/9/12の4アンカー列』を捨て、個訓と同じ『固定12ヶ月カレンダーグリッド＋セル単位で planStart 判定』に変える。**

---

## 3. 口腔②への移植設計

### 3.1 サイクル純関数（inline・shared.js非読込の現行方針を踏襲）
口腔②は shared.js を読まずインライン純関数で回している（現状 `isOralSendMonth` 等）。同様に inline で追加：

```js
// plan_start P(YYYY-MM=計画作成/節目月アンカー)起点、口腔の3ヶ月サイクル役割を返す純関数。
// r0=節目(報告/計画) / r1=モニ① / r2=モニ② / 'none'=開始前 or 終了後。
// 現行 isOralSendMonth の startedAt ゲート＋3/6/9/12固定を、これで置換する。
function oralCycleRole(planStart, planEnd, year, month) {
  const m = String(planStart || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return 'none';                                  // 未設定は非該当（従来の全員一律をやめる）
  const P = parseInt(m[1],10)*12 + (parseInt(m[2],10)-1);
  const T = year*12 + (month-1);
  if (T < P) return 'none';                               // 開始前ガード（個訓 isBeforePlanStart 相当）
  if (planEnd) { const e = String(planEnd).match(/^(\d{4})-(\d{2})$/);
    if (e) { const E = parseInt(e[1],10)*12 + (parseInt(e[2],10)-1); if (T > E) return 'none'; } }
  const r = (T - P) % 3;                                  // 0=節目, 1=モニ①, 2=モニ②
  return r === 0 ? 'setsume' : (r === 1 ? 'moni1' : 'moni2');
}
```
検証（P=2026-06 例）: 6月→setsume / 7月→moni1 / 8月→moni2 / 9月→setsume … 現行の「節目-2=モニ①, 節目-1=モニ②, 節目=報告/計画」と月割りが一致。

### 3.2 固定見出し撤去 → 12ヶ月カレンダーグリッド
- 現行 `ANCHORS=[3,6,9,12]`（4サイクル×4サブ列）を撤去。
- 個訓同型：年度12ヶ月（4月〜翌3月）を列に。各(利用者×月)セルで `oralCycleRole` を評価し、
  - `setsume` → 報告＋計画の2チップ（当月）
  - `moni1` → モニ①（実施日）／`moni2` → モニ②
  - `none` → `-`（データ有れば表示）
- 「今月やること」フォーカスは per-user role でグルーピング（当月 role=setsume の人／moni1の人…を集約）。

### 3.3 plan_start / plan_end の持ち場（★設計分岐・要社長判断）
| 案 | 置き場 | 長所 | 短所 | 個訓との同型 |
|----|-------|------|------|------------|
| **A（推奨）** | 口腔機能向上**設定**シート（既存）に `plan_start` `plan_end` 列を additive | oral専用configで完結・`updateOralConfig`に相乗り・利用者台帳を汚さない | 個訓は台帳保存なので置き場が違う | △（式は同型・保存先だけ口腔流） |
| B | 利用者台帳に `口腔計画書開始` 列（`findCol`） | 個訓と完全同型 | 全アプリ共有の台帳を触る・列増殖 | ◎ |
| C | 口腔機能向上**記録**シート15/16列（per-node） | 第4弾の器(計画ダイアログ)と直結 | アンカーは本来per-userで、node保存は概念不一致 | ✕ |

**推奨=案A**：口腔は個訓と違い専用configシート（口腔機能向上設定）を既に持つ。ここに `plan_start`（YYYY-MM）と `plan_end`（YYYY-MM・イレギュラー終了）を足すのが最小改修かつ意味的に正しい（per-userアンカー）。既存 `eval_anchor` 列があるので **`eval_anchor` を plan_start として流用する余地もある**（新列を作らず既存を意味付け直す・要社長確認）。
※ 第4弾で計画ダイアログに置いた開始/終了の「器」は、案A採用なら保存先を `updateOralConfig` に配線し直す（今は器のみ・未保存なので競合なし）。

---

## 4. リハブ「次回作成期限」→ plan_start 初回投入の段取り

- リハブの「次回作成期限」＝**次の計画作成期限＝次の節目月**。
- `oralCycleRole` は任意の節目月をアンカーにして周期的（diff%3）なので、**次回作成期限の月をそのまま plan_start に入れてよい**（逆算不要）。
  - 例: リハブ「次回作成期限 2026-09」→ `plan_start = 2026-09`。6月・7月・8月は自動で setsume(過去)/moni1/moni2 に割れる。
- 段取り:
  1. 社長がリハブ次回作成期限一覧をスクショで渡す
  2. クロコがOCR/読取で「氏名→次回作成期限(YYYY-MM)」を抽出・突合表を提示（社長確認）
  3. 確認後、`updateOralConfig(userId, plan_start=YYYY-MM)` を全員分バッチ投入（冪等・1人1行）
  - ※読むのは「次回作成期限（＝節目月）」。開始月から逆算する必要はない。

---

## 5. データ設計（11日デプロイ前提・今日は設計のみ・staged別ファイル）

staged diff: `oral2-plancycle-gas-additive.staged.md`（本ファイルと同ディレクトリ想定・別出力）。要点：
- 口腔機能向上設定シート: `plan_start` `plan_end`（+任意 `plan_months`）を additive 追加（ensureOralPlansSheets_ の config 側 migration）。
- `updateOralConfig`: plan_start/plan_end の書込枝を追加（既存 eval_anchor と同型・YYYY-MM検証）。
- `getOralPlansYear`: user に `planStart`/`planEnd` を相乗り（既存 startedAt/evalAnchor と同じ経路）。
- フロント（別作業）: `ANCHORS`固定撤去 → `oralCycleRole` ＋12ヶ月グリッド。updateOralPlan の record 書込（moni/報告/計画の日付）は**現状のまま**（whitelist変更不要）。
- **本番アンカー突合**: 適用前に `clasp pull` で @308 本番と実突合（memory教訓）。本diffは repo コード.js（record14列・config5列 eval_anchor 済み）を基準にアンカー一致方式で記述。

---

## 6. 作業見積り（実装フェーズ・別GO）

| 工程 | 内容 | 目安 |
|------|------|------|
| A. GAS列追加 | config に plan_start/plan_end・updateOralConfig枝・getOralPlansYear相乗り＋clasp pull突合→push→deploy（11日以降） | 0.5〜1日 |
| B. サイクル作り替え | `oralCycleRole`インライン化・ANCHORS撤去・12ヶ月グリッド・フォーカスper-user化・第4弾器の保存配線 | 1〜1.5日 |
| C. 初回投入 | リハブスクショ→氏名×次回作成期限 抽出→突合表→バッチ`updateOralConfig` | 0.5日（人数・スクショ枚数次第） |
| D. 検証 | jsdom（役割割当/開始前ガード/終了ガード/12ヶ月描画/フォーカス）＋本番反映3点セット＋初回投入の実データ突合 | 0.5日 |
| **合計** | | **約2.5〜3.5日**（GASデプロイは11日以降・繁忙期回避） |

---

## 7. 未確定・要社長判断
1. **plan_start の置き場**（案A推奨／既存 eval_anchor 流用可否）
2. **plan_months（可変サイクル長）を口腔に持たせるか** → 制度は3ヶ月固定なので既定3・可変不要を推奨（個訓はデイ計画都合で可変）
3. 第4弾の「横並び4列」レイアウトは per-user 12ヶ月グリッドに置き換わる（別レイアウト）＝第4弾は中間形。移行時に一本化。
4. 初回投入の対象範囲（全113名か算定対象のみか）
