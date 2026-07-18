# seikyu-board（月次 利用者請求集計ビュー）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リハブの請求情報CSV（複数月）を放り込むと、縦=利用者・横=月のマトリクスで「誰がどの月で未入金か」を赤で炙り出す、GASなし単一HTMLアプリを作る。

**Architecture:** 全ロジックを `seikyu-board.html` 内の純関数（`sbDecode` / `sbToRows` / `sbParseLine` / `sbResolveColumns` / `sbExtractRows` / `sbMergeMonths` / `sbClassify`）に集約し、DOM描画はそれらを呼ぶだけの薄い配線にする。純関数は `scripts/test-seikyu-board.js` が `seikyu-board.html` から関数本文を抽出（既存 `test-furikae-tracker.js` 方式）して Node 単体テストで担保。POSTゼロの純表示のため実ブラウザ検証はしない。

**Tech Stack:** Vanilla HTML/CSS/JS（外部依存なし）、`TextDecoder('shift-jis')`、Node（テストランナー）、匿名化フィクスチャ生成に PowerShell `GetEncoding(932)`。

**設計書:** `docs/superpowers/specs/2026-07-18-seikyu-board-design.md`

---

## 前提・重要な制約（着手前に必ず読む）

- **公開リポジトリ**（`m-higa-sys/yawaragi-apps`）。実利用者名・被保険者番号を**絶対にコミットしない**。フィクスチャは匿名化必須。
- **匿名化の対応表（実名↔仮名・実番号↔連番）を一切ファイルに書き出さない。** 生成スクリプト内のメモリで完結させる。
- 純関数は `seikyu-board.html` 内に `function sbXxx(...) {...}` として**トップレベル宣言**で置く（テストが名前で本文抽出するため。アロー代入・メソッド short-hand にしない）。
- 各純関数は**自己完結**（他のトップレベル定数・変数に依存しない）。小計名リスト等は関数内にインライン。
- テスト実行: `node scripts/test-seikyu-board.js`（PASS=exit 0 / FAIL=exit 1）。
- コミットはタスク単位で頻繁に。本体 `C:\dev\yawaragi-apps` は master 固定（CLAUDE.md）。この作業は master 上で進めて可（新規ファイルのみ・他ブランチと衝突しない）。

## File Structure

| ファイル | 役割 | 種別 |
|---|---|---|
| `seikyu-board.html` | アプリ本体（純関数群＋薄いDOM描画＋D&D取込） | Create |
| `scripts/test-seikyu-board.js` | 純関数の Node 単体テスト（HTMLから抽出・フィクスチャ照合） | Create |
| `scripts/gen-seikyu-fixtures.js` | 実CSV→匿名化UTF-8生成（対応表は残さない） | Create |
| `scripts/gen-seikyu-fixtures.ps1` | 匿名化UTF-8→SJIS(CP932)変換 | Create |
| `scripts/fixtures/seikyu/*.csv` | 匿名化SJISフィクスチャ（3旧/4/5/6月） | Create（生成物・コミット） |

## 確定アサート値（実データ・匿名化で保持）

| 月フィクスチャ | 個人 | unpaid🔴 | pending🟡 | exempt⬜ | paid🟩 | 小計除外 |
|---|---|---|---|---|---|---|
| `fixture-2026-03-kakuteimae.csv`（全空欄） | 115 | 0 | 110 | 5 | 0 | 9 |
| `fixture-2026-04.csv` | 118 | 2 | 0 | 5 | 111 | 9 |
| `fixture-2026-05.csv` | 116 | 2 | 0 | 4 | 110 | 9 |
| `fixture-2026-06-hikiotoshimae.csv`（全未入金） | 111 | 106 | 0 | 5 | 0 | 9 |

⚠️ **これらは実データ固定値。フィクスチャ元CSVを差し替えたら期待値も必ず更新すること。**

---

### Task 1: 匿名化フィクスチャの生成とコミット

**Files:**
- Create: `scripts/gen-seikyu-fixtures.js`
- Create: `scripts/gen-seikyu-fixtures.ps1`
- Create: `scripts/fixtures/seikyu/fixture-2026-03-kakuteimae.csv`（生成物）
- Create: `scripts/fixtures/seikyu/fixture-2026-04.csv`（生成物）
- Create: `scripts/fixtures/seikyu/fixture-2026-05.csv`（生成物）
- Create: `scripts/fixtures/seikyu/fixture-2026-06-hikiotoshimae.csv`（生成物）

**元CSV（ローカルのみ・コミットしない）:** `C:/Users/mh/Downloads/` 配下
- 3旧: `サービス提供年月2026年03月の請求情報_202604121040.csv`
- 4月: `サービス提供年月2026年04月の請求情報_202607180624.csv`
- 5月: `サービス提供年月2026年05月の請求情報_202607180624.csv`
- 6月: `サービス提供年月2026年06月の請求情報_202607180616.csv`

- [ ] **Step 1: 生成スクリプト（node・匿名化UTF-8出力）を書く**

`scripts/gen-seikyu-fixtures.js`:

```js
// 実CSV(SJIS)→匿名化UTF-8 を出力する。対応表(実名↔仮名/実番号↔連番)は一切書き出さない（メモリ完結）。
// 保持: サービス提供年月・全金額列・支払方法・入金状況・行構造（メタ/ヘッダ/小計行）。
// 差替: 利用者名→"利用者NNN"、被保険者番号→"9"+連番、証記載保険者名→"見本市"、証記載保険者番号→"999999"。
// 出力先: scratch の UTF-8 一時ファイル（この後 .ps1 が SJIS へ変換）。
const fs = require('fs');
const path = require('path');

const SRC_DIR = process.env.SEIKYU_SRC_DIR || 'C:/Users/mh/Downloads';
const OUT_DIR = process.argv[2] || path.join(__dirname, 'fixtures', 'seikyu', '_utf8_tmp');

const JOBS = [
  ['サービス提供年月2026年03月の請求情報_202604121040.csv', 'fixture-2026-03-kakuteimae.csv'],
  ['サービス提供年月2026年04月の請求情報_202607180624.csv', 'fixture-2026-04.csv'],
  ['サービス提供年月2026年05月の請求情報_202607180624.csv', 'fixture-2026-05.csv'],
  ['サービス提供年月2026年06月の請求情報_202607180616.csv', 'fixture-2026-06-hikiotoshimae.csv'],
];

function parseLine(l) {
  const o = []; let c = '', q = false;
  for (let i = 0; i < l.length; i++) { const ch = l[i];
    if (q) { if (ch === '"') { if (l[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; } }
  o.push(c); return o;
}
function csvField(v) { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function idxOf(header, label) { const i = header.indexOf(label); if (i < 0) throw new Error('列なし: ' + label); return i; }

// 全ファイル横断で実被保険者番号→連番を安定採番（メモリのみ・保存しない）
const hkenMap = new Map();
function fakeHken(real) {
  const key = String(real || '').trim();
  if (!key) return '';
  if (!hkenMap.has(key)) hkenMap.set(key, '9' + String(hkenMap.size + 1).padStart(9, '0'));
  return hkenMap.get(key);
}
// 実被保険者番号→仮名（連番と一致させ横断追跡を保つ）
function fakeName(real) {
  const key = String(real || '').trim();
  const seq = hkenMap.has(key) ? (Array.from(hkenMap.keys()).indexOf(key) + 1) : 0;
  return '利用者' + String(seq).padStart(3, '0');
}

// 実番号は sort 済み順で採番して決定的にする（＝差替時に diff が安定）
function prescan(files) {
  const all = new Set();
  files.forEach(([src]) => {
    const txt = new TextDecoder('shift-jis').decode(fs.readFileSync(path.join(SRC_DIR, src)));
    const lines = txt.split(/\r\n|[\r\n]/).filter(x => x.length);
    const header = parseLine(lines[1]); const hi = idxOf(header, '被保険者番号'); const ni = idxOf(header, '利用者名');
    for (let r = 2; r < lines.length; r++) { const a = parseLine(lines[r]);
      const nm = String(a[ni] || '').trim(); if (['総額', '保険外のみ', ''].includes(nm)) continue;
      const h = String(a[hi] || '').trim(); if (h) all.add(h); }
  });
  Array.from(all).sort().forEach(h => fakeHken(h)); // sort順で採番確定
}

fs.mkdirSync(OUT_DIR, { recursive: true });
prescan(JOBS);

for (const [src, outName] of JOBS) {
  const txt = new TextDecoder('shift-jis').decode(fs.readFileSync(path.join(SRC_DIR, src)));
  const lines = txt.split(/\r\n|[\r\n]/).filter(x => x.length);
  const header = parseLine(lines[1]);
  const C = {
    name: idxOf(header, '利用者名'), hken: idxOf(header, '被保険者番号'),
    hknName: idxOf(header, '証記載保険者名'), hknNo: idxOf(header, '証記載保険者番号'),
  };
  const out = [lines[0], lines[1]]; // メタ行・ヘッダ行はそのまま（個人情報なし）
  for (let r = 2; r < lines.length; r++) {
    const a = parseLine(lines[r]);
    const nm = String(a[C.name] || '').trim();
    if (!['総額', '保険外のみ', ''].includes(nm)) {
      const realHken = a[C.hken];
      a[C.name] = fakeName(realHken);
      a[C.hken] = fakeHken(realHken);
      if (a[C.hknName] !== undefined) a[C.hknName] = '見本市';
      if (a[C.hknNo] !== undefined) a[C.hknNo] = '999999';
    }
    out.push(a.map(csvField).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, outName), out.join('\r\n') + '\r\n', 'utf8');
  console.log('生成(UTF-8):', outName, '行', out.length);
}
console.log('※ 対応表は保存していません（メモリ完結）。次に .ps1 で SJIS 変換してください。');
```

- [ ] **Step 2: SJIS変換スクリプト（PowerShell・CP932）を書く**

`scripts/gen-seikyu-fixtures.ps1`:

```powershell
# UTF-8 一時ファイル群を Shift_JIS(CP932) に変換して scripts/fixtures/seikyu/ へ出力する。
$src = Join-Path $PSScriptRoot 'fixtures/seikyu/_utf8_tmp'
$dst = Join-Path $PSScriptRoot 'fixtures/seikyu'
$sjis = [System.Text.Encoding]::GetEncoding(932)
Get-ChildItem -Path $src -Filter '*.csv' | ForEach-Object {
  $text = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText((Join-Path $dst $_.Name), $text, $sjis)
  Write-Output ("SJIS化: " + $_.Name)
}
Remove-Item -Recurse -Force $src
Write-Output "完了（UTF-8一時ファイルは削除しました）"
```

- [ ] **Step 3: 生成を実行**

Run（Bash）: `node scripts/gen-seikyu-fixtures.js`
Expected: `生成(UTF-8): fixture-2026-03-kakuteimae.csv 行 126` 等が4本出る。

Run（PowerShell）: `powershell -ExecutionPolicy Bypass -File scripts/gen-seikyu-fixtures.ps1`
Expected: `SJIS化: fixture-2026-0X.csv` が4本 ＋ `完了`。

- [ ] **Step 4: 生成物の妥当性を確認（SJISで読めて件数が保持されているか）**

Run（Bash）:
```bash
node -e '
const fs=require("fs");
for(const f of ["fixture-2026-03-kakuteimae","fixture-2026-04","fixture-2026-05","fixture-2026-06-hikiotoshimae"]){
  const b=fs.readFileSync("scripts/fixtures/seikyu/"+f+".csv");
  const t=new TextDecoder("shift-jis").decode(b);
  const n=t.split(/\r\n|[\r\n]/).filter(x=>x.length).length;
  const hasReal=/伊熊|伊藤|川島|町田/.test(t); // 実名が残っていないこと
  console.log(f, "行数", n, "実名混入", hasReal);
}'
```
Expected: 各ファイルの行数が元と一致（3旧=126, 4月=129, 5月=127, 6月=122 程度）／**実名混入 false**（4本とも）。

- [ ] **Step 5: コミット**

```bash
git add scripts/gen-seikyu-fixtures.js scripts/gen-seikyu-fixtures.ps1 scripts/fixtures/seikyu/
git commit -m "test(seikyu-board): 匿名化SJISフィクスチャ生成（実名/被保険者番号を差替・対応表は残さない）"
```

---

### Task 2: アプリ骨組み ＋ テストランナー ＋ sbParseLine（TDD）

**Files:**
- Create: `seikyu-board.html`
- Create: `scripts/test-seikyu-board.js`

- [ ] **Step 1: 失敗するテストを書く（テストランナー土台＋sbParseLine）**

`scripts/test-seikyu-board.js`:

```js
// seikyu-board 純関数テスト（実コード抽出方式・test-furikae-tracker.js と同流儀）
// 実行: node scripts/test-seikyu-board.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'seikyu-board.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('seikyu-board.html に ' + sig + ' が無い（未実装＝RED）');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

const sb = {};
new Function('sb',
  extractFn('sbParseLine') +
  '\nsb.parseLine = sbParseLine;'
)(sb);

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eqArr(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ===== A. sbParseLine（引用符・カンマ・二重引用符）=====
ok(eqArr(sb.parseLine('a,b,c'), ['a', 'b', 'c']), 'A1: 単純3列');
ok(eqArr(sb.parseLine('"x,y",z'), ['x,y', 'z']), 'A2: 引用符内カンマ');
ok(eqArr(sb.parseLine('"a""b",c'), ['a"b', 'c']), 'A3: 二重引用符エスケープ');
ok(eqArr(sb.parseLine('a,,c'), ['a', '', 'c']), 'A4: 空フィールド');
ok(eqArr(sb.parseLine(''), ['']), 'A5: 空行→[""]');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: FAIL（`seikyu-board.html` が無い or `sbParseLine` が無い という例外で落ちる）

- [ ] **Step 3: seikyu-board.html 骨組みと sbParseLine を実装**

`seikyu-board.html`（骨組み。以降のタスクで `<script>` 内に関数を足していく）:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>請求集計ビュー - yawaragi</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; color: #222; }
  .drop-zone { border: 3px dashed #3498db; border-radius: 16px; padding: 24px; text-align: center; background: #eaf4fd; margin-bottom: 16px; cursor: pointer; }
  .note { font-size: 13px; color: #555; background: #fffbe6; border: 1px solid #ffe58f; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: right; font-size: 13px; }
  th { background: #f5f5f5; }
  td.name { text-align: left; white-space: nowrap; }
  .st-unpaid  { background: #ffd6d6; }
  .st-pending { background: #fff3bf; color: #7a6a00; }
  .st-paid    { background: #eaffea; }
  .st-exempt  { background: #f0f0f0; color: #999; }
  .st-unknown { outline: 2px solid #e03131; font-weight: bold; }
</style>
</head>
<body>
<h1>💴 請求集計ビュー</h1>
<div class="note" id="note">CSVを放り込むと利用者×月で表示します。</div>
<div class="drop-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
  <p>ここに請求情報CSVをドラッグ＆ドロップ（複数月まとめて可）</p>
  <input type="file" id="fileInput" accept=".csv" multiple style="display:none">
</div>
<div id="summary"></div>
<div id="tableWrap"></div>

<script>
// ===== 純関数群（Node テストが名前で抽出。トップレベル function 宣言・自己完結）=====

function sbParseLine(line) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur);
  return out;
}

// ===== DOM 配線（以降のタスクで実装）=====
</script>
</body>
</html>
```

- [ ] **Step 4: PASS を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（`[OK] 5 passed, 0 failed`）

- [ ] **Step 5: コミット**

```bash
git add seikyu-board.html scripts/test-seikyu-board.js
git commit -m "feat(seikyu-board): 骨組み＋sbParseLine（引用符対応CSVパーサ・TDD）"
```

---

### Task 3: sbDecode ＋ sbToRows（SJIS＋NEL改行）（TDD）

**Files:**
- Modify: `seikyu-board.html`（`<script>` に2関数追加）
- Modify: `scripts/test-seikyu-board.js`

- [ ] **Step 1: 失敗するテストを追記**

`scripts/test-seikyu-board.js` の `new Function(...)` の抽出に追加:

```js
new Function('sb',
  extractFn('sbParseLine') +
  extractFn('sbDecode') +
  extractFn('sbToRows') +
  '\nsb.parseLine = sbParseLine; sb.decode = sbDecode; sb.toRows = sbToRows;'
)(sb);
```

`process.exit` の直前に追記:

```js
// ===== B. sbDecode（SJIS）＋ sbToRows（メタ行/ヘッダ行を含む全行）=====
const fx5 = fs.readFileSync(path.join(__dirname, 'fixtures', 'seikyu', 'fixture-2026-05.csv'));
const txt5 = sb.decode(fx5);
ok(txt5.indexOf('被保険者番号') >= 0, 'B1: SJISフィクスチャがデコードできヘッダ語を含む');
ok(txt5.indexOf('') === -1 && /利用者001|利用者/.test(txt5), 'B2: 仮名にデコードされている');
const rows5 = sb.toRows(txt5);
ok(rows5[1][0] === '事業所名', 'B3: rows[1] が本ヘッダ行（先頭=事業所名）');
ok(Array.isArray(rows5[0]) && rows5.length > 100, 'B4: 全行が2次元配列で得られる');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: FAIL（`sbDecode が無い` 例外）

- [ ] **Step 3: 実装（`sbParseLine` の下に追記）**

```js
function sbDecode(buf) {
  // buf: ArrayBuffer | Uint8Array | Node Buffer。SJIS(CP932)前提。
  return new TextDecoder('shift-jis').decode(buf);
}

function sbToRows(text) {
  // 改行は CRLF / LF / CR 混在に対応。空行は落とす。各行を引用符対応でフィールド配列に。
  return text.split(/\r\n|[\r\n]/).filter(function (x) { return x.length; }).map(sbParseLine);
}
```

- [ ] **Step 4: PASS を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（9 passed）

- [ ] **Step 5: コミット**

```bash
git add seikyu-board.html scripts/test-seikyu-board.js
git commit -m "feat(seikyu-board): sbDecode(SJIS)＋sbToRows（改行混在対応・TDD）"
```

---

### Task 4: sbResolveColumns（列名→index・必須欠落は例外）（TDD）

**Files:**
- Modify: `seikyu-board.html`
- Modify: `scripts/test-seikyu-board.js`

- [ ] **Step 1: 失敗するテストを追記**

抽出に `extractFn('sbResolveColumns') +` を追加し `sb.resolve = sbResolveColumns;`。アサート追記:

```js
// ===== C. sbResolveColumns（位置でなく列名一致）=====
const header5 = rows5[1];
const col5 = sb.resolve(header5);
ok(header5[col5.hken] === '被保険者番号', 'C1: hken 列を名前で解決');
ok(header5[col5.riyou] === '利用者請求額総額（3+4-5+6+7+8-9）', 'C2: 利用者請求額 列を解決');
ok(header5[col5.jihi1] === '7保険外サービス費（税抜）', 'C3: 自費税抜 列を解決');
ok(header5[col5.jihi2] === '8保険外サービス費（消費税額）', 'C4: 自費消費税 列を解決');
ok(header5[col5.nyukin] === '入金状況', 'C5: 入金状況 列を解決');
let threw = false;
try { sb.resolve(['関係ない列', 'ダミー']); } catch (e) { threw = true; }
ok(threw, 'C6: 必須列が無ければ例外（黙って壊れない）');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: FAIL（`sbResolveColumns が無い`）

- [ ] **Step 3: 実装**

```js
function sbResolveColumns(headerFields) {
  var find = function (label) {
    var i = headerFields.indexOf(label);
    if (i < 0) throw new Error('必須列が見つかりません: ' + label);
    return i;
  };
  return {
    tsuki: find('サービス提供年月'),
    hken: find('被保険者番号'),
    name: find('利用者名'),
    riyou: find('利用者請求額総額（3+4-5+6+7+8-9）'),
    jihi1: find('7保険外サービス費（税抜）'),
    jihi2: find('8保険外サービス費（消費税額）'),
    pay: find('支払方法'),
    nyukin: find('入金状況')
  };
}
```

- [ ] **Step 4: PASS を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（15 passed）

- [ ] **Step 5: コミット**

```bash
git add seikyu-board.html scripts/test-seikyu-board.js
git commit -m "feat(seikyu-board): sbResolveColumns（列名一致・必須欠落は例外・TDD）"
```

---

### Task 5: sbIsSubtotalRow ＋ sbNormalize ＋ sbExtractRows（値ベース除外）（TDD）

**Files:**
- Modify: `seikyu-board.html`
- Modify: `scripts/test-seikyu-board.js`

- [ ] **Step 1: 失敗するテストを追記**

抽出に3関数追加：`extractFn('sbIsSubtotalRow') + extractFn('sbNormalize') + extractFn('sbExtractRows') +` と `sb.isSub = sbIsSubtotalRow; sb.normalize = sbNormalize; sb.extract = sbExtractRows;`。アサート追記:

```js
// ===== D. sbIsSubtotalRow（値ベース）=====
ok(sb.isSub('総額') === true, 'D1: 総額→除外');
ok(sb.isSub('保険外のみ') === true, 'D2: 保険外のみ→除外');
ok(sb.isSub('') === true, 'D3: 空→除外');
ok(sb.isSub(' 総額 ') === true, 'D4: 前後空白trimして判定');
ok(sb.isSub('利用者001') === false, 'D5: 個人名→残す');

// ===== E. sbExtractRows（5月フィクスチャ：個人116・小計除外9・自費合算）=====
const recs5 = sb.extract(rows5);
ok(recs5.length === 116, 'E1: 5月 個人行116（総額/保険外のみ/空の9行を値ベース除外）');
// ⚠️ 実データ事実: 自費のみ利用者(保険外)は被保険者番号を持たず空になり得る（4/5/6月に各1件・利用者000）。
// よって「hken必須」は誤り。必須は氏名のみ。名寄せは hken 空を name でフォールバックする（Task 7）。
ok(recs5.every(r => r.name), 'E2: 全個人行に氏名（被保険者番号は保険外のみ客で空になり得るため必須にしない）');
const withJihi = recs5.find(r => r.jihi > 0);
ok(!!withJihi && typeof withJihi.riyou === 'number', 'E3: riyou は数値・jihi は税抜+消費税の合算');

// ===== F. sbNormalize（境界の数値化）=====
const col = sb.resolve(rows5[1]);
const fakeRow = []; fakeRow[col.tsuki]='202605'; fakeRow[col.hken]='9000000001';
fakeRow[col.name]='利用者001'; fakeRow[col.riyou]='2,920'; fakeRow[col.jihi1]='120';
fakeRow[col.jihi2]='0'; fakeRow[col.pay]='口座振替'; fakeRow[col.nyukin]='未入金';
const nrec = sb.normalize(fakeRow, col);
ok(nrec.riyou === 2920, 'F1: "2,920"→2920（カンマ除去して数値化）');
ok(nrec.jihi === 120, 'F2: jihi=税抜120+消費税0=120');
ok(nrec.nyukin === '未入金', 'F3: 入金状況を保持');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: FAIL（`sbIsSubtotalRow が無い`）

- [ ] **Step 3: 実装**

```js
function sbIsSubtotalRow(name) {
  return ['総額', '保険外のみ', ''].indexOf(String(name || '').trim()) >= 0;
}

function sbNormalize(fields, col) {
  var num = function (v) { var n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10); return isNaN(n) ? 0 : n; };
  return {
    tsuki: String(fields[col.tsuki] || '').trim(),
    hken: String(fields[col.hken] || '').trim(),
    name: String(fields[col.name] || '').trim(),
    riyou: num(fields[col.riyou]),
    jihi: num(fields[col.jihi1]) + num(fields[col.jihi2]),
    pay: String(fields[col.pay] || '').trim(),
    nyukin: String(fields[col.nyukin] || '').trim()
  };
}

function sbExtractRows(rows) {
  if (!rows || rows.length < 2) throw new Error('行が不足（メタ行＋ヘッダ行が必要）');
  var col = sbResolveColumns(rows[1]);
  var out = [];
  for (var r = 2; r < rows.length; r++) {
    var f = rows[r];
    if (!f || f.length < 3) continue;
    if (sbIsSubtotalRow(f[col.name])) continue;
    out.push(sbNormalize(f, col));
  }
  return out;
}
```

- [ ] **Step 4: PASS を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（23 passed）

- [ ] **Step 5: コミット**

```bash
git add seikyu-board.html scripts/test-seikyu-board.js
git commit -m "feat(seikyu-board): sbExtractRows（値ベース小計除外＋正規化・5月116人・TDD）"
```

---

### Task 6: sbClassify（5状態・境界4ケース）（TDD）

**Files:**
- Modify: `seikyu-board.html`
- Modify: `scripts/test-seikyu-board.js`

- [ ] **Step 1: 失敗するテストを追記**

抽出に `extractFn('sbClassify') +` と `sb.classify = sbClassify;`。アサート追記:

```js
// ===== G. sbClassify（5状態＋空・評価順による排他）=====
ok(sb.classify(null) === 'empty', 'G1: 行なし→empty');
ok(sb.classify({ riyou: 2920, nyukin: '未入金' }) === 'unpaid', 'G2: 請求>0×未入金→unpaid');
ok(sb.classify({ riyou: 3197, nyukin: '入金済' }) === 'paid', 'G3: 請求>0×入金済→paid');
ok(sb.classify({ riyou: 4535, nyukin: '' }) === 'pending', 'G4: 請求>0×空欄→pending');
// 境界4ケース
ok(sb.classify({ riyou: 0, nyukin: '未入金' }) === 'exempt', 'G5境界: 請求0×未入金→exempt（赤にしない）');
ok(sb.classify({ riyou: 0, nyukin: '' }) === 'exempt', 'G6境界: 請求0×空欄→exempt');
ok(sb.classify({ riyou: 0, nyukin: '入金済' }) === 'exempt', 'G7: 請求0×入金済→exempt');
ok(sb.classify({ riyou: 5000, nyukin: '保留' }) === 'unknown', 'G8境界: 請求>0×想定外値→unknown');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: FAIL（`sbClassify が無い`）

- [ ] **Step 3: 実装**

```js
function sbClassify(cell) {
  if (!cell) return 'empty';
  var riyou = cell.riyou;
  var nyukin = String(cell.nyukin || '').trim();
  if (riyou === 0) return 'exempt';        // 請求0は入金状況を問わず対象外（生活保護等）
  if (nyukin === '') return 'pending';     // 請求確定前＝判定不能
  if (nyukin === '未入金') return 'unpaid'; // ここに来る時点で riyou>0 保証
  if (nyukin === '入金済') return 'paid';
  return 'unknown';                         // 想定外の入金状況値
}
```

- [ ] **Step 4: PASS を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（31 passed）

- [ ] **Step 5: コミット**

```bash
git add seikyu-board.html scripts/test-seikyu-board.js
git commit -m "feat(seikyu-board): sbClassify（5状態・請求0×未入金→exempt境界・TDD）"
```

---

### Task 7: sbMergeMonths（被保険者番号キー・横断）（TDD）

**Files:**
- Modify: `seikyu-board.html`
- Modify: `scripts/test-seikyu-board.js`

- [ ] **Step 1: 失敗するテストを追記**

抽出に `extractFn('sbMergeMonths') +` と `sb.merge = sbMergeMonths;`。アサート追記:

```js
// ===== H. sbMergeMonths（4月・5月を横断結合）=====
const rows4 = sb.toRows(sb.decode(fs.readFileSync(path.join(__dirname, 'fixtures', 'seikyu', 'fixture-2026-04.csv'))));
const recs4 = sb.extract(rows4);
const merged = sb.merge([recs4, recs5]);
ok(eqArr(merged.months, ['202604', '202605']), 'H1: months が昇順（左=古い）');
// 4月にも5月にも居る人は1行に横断結合される
const both = merged.people.find(p => p.months['202604'] && p.months['202605']);
ok(!!both, 'H2: 同一被保険者番号が複数月に跨って1人1行に結合');
ok(merged.people.length >= 116, 'H3: 人数は各月の和集合以上');
// 小計行が名寄せに混入しない（総額/保険外のみ という名前の人が居ない）
ok(merged.people.every(p => !sb.isSub(p.name)), 'H4: 小計行(総額/保険外のみ)が名寄せに混入していない');
// ⚠️ 実データ事実: 自費のみ利用者(利用者000)は被保険者番号が空。dropせず name フォールバックで1人として保持する。
const jihiOnly = merged.people.find(p => !p.hken && p.name);
ok(!!jihiOnly, 'H4b: 被保険者番号が空の自費のみ利用者も name キーで保持される（dropしない）');
// 同一(番号×月)の重複は加算
const dupA = [{ tsuki: '202605', hken: '9000000009', name: '利用者009', riyou: 100, jihi: 10, pay: '口座振替', nyukin: '未入金' },
              { tsuki: '202605', hken: '9000000009', name: '利用者009', riyou: 200, jihi: 20, pay: '口座振替', nyukin: '未入金' }];
const mDup = sb.merge([dupA]);
ok(mDup.people[0].months['202605'].riyou === 300, 'H5: 同一(番号×月)複数行→請求額を加算(100+200)');
ok(mDup.people[0].months['202605'].jihi === 30, 'H6: 自費も加算(10+20)');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: FAIL（`sbMergeMonths が無い`）

- [ ] **Step 3: 実装**

```js
function sbMergeMonths(recordArrays) {
  var byKey = {};       // hken -> { hken, name, months: { tsuki: cell } }
  var monthsSet = {};
  recordArrays.forEach(function (recs) {
    recs.forEach(function (rec) {
      var k = rec.hken || ('__noid_' + rec.name);
      if (!byKey[k]) byKey[k] = { hken: rec.hken, name: rec.name, months: {} };
      monthsSet[rec.tsuki] = true;
      var cell = byKey[k].months[rec.tsuki];
      if (!cell) {
        byKey[k].months[rec.tsuki] = { tsuki: rec.tsuki, riyou: rec.riyou, jihi: rec.jihi, pay: rec.pay, nyukin: rec.nyukin };
      } else {
        cell.riyou += rec.riyou;  // 同一(番号×月)複数行→加算（実データは重複ゼロ・堅牢性で残す）
        cell.jihi += rec.jihi;
      }
      if (rec.name) byKey[k].name = rec.name;
    });
  });
  var months = Object.keys(monthsSet).sort();
  var people = Object.keys(byKey).map(function (k) { return byKey[k]; });
  return { people: people, months: months };
}
```

- [ ] **Step 4: PASS を確認**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（37 passed）

- [ ] **Step 5: コミット**

```bash
git add seikyu-board.html scripts/test-seikyu-board.js
git commit -m "feat(seikyu-board): sbMergeMonths（被保険者番号キー横断・重複加算・TDD）"
```

---

### Task 8: フィクスチャ統合テスト（全4月の状態別件数）（TDD）

**Files:**
- Modify: `scripts/test-seikyu-board.js`

- [ ] **Step 1: 失敗する（＝厳密な件数の）統合テストを追記**

`process.exit` の直前に追記:

```js
// ===== I. 統合：各フィクスチャの状態別件数（実データ固定値・差替時は更新）=====
function loadRecs(name) {
  return sb.extract(sb.toRows(sb.decode(fs.readFileSync(path.join(__dirname, 'fixtures', 'seikyu', name)))));
}
function tally(recs) {
  var t = { unpaid: 0, pending: 0, exempt: 0, paid: 0, unknown: 0 };
  recs.forEach(function (r) { t[sb.classify(r)]++; });
  return t;
}
const t3 = tally(loadRecs('fixture-2026-03-kakuteimae.csv'));
const t4 = tally(loadRecs('fixture-2026-04.csv'));
const t5 = tally(loadRecs('fixture-2026-05.csv'));
const t6 = tally(loadRecs('fixture-2026-06-hikiotoshimae.csv'));

// 3月旧（全空欄・請求確定前）：pending=110 / exempt=5 / unpaid=0 / paid=0 ← 空欄=pending の核心
ok(loadRecs('fixture-2026-03-kakuteimae.csv').length === 115, 'I1: 3旧 個人115');
ok(t3.pending === 110 && t3.exempt === 5 && t3.unpaid === 0 && t3.paid === 0,
   'I2: 3旧 pending110/exempt5/unpaid0/paid0（誰も赤にならない）: ' + JSON.stringify(t3));

// 4月（引落し後）：unpaid=2 / exempt=5 / paid=111 / pending=0
ok(loadRecs('fixture-2026-04.csv').length === 118, 'I3: 4月 個人118');
ok(t4.unpaid === 2 && t4.exempt === 5 && t4.paid === 111 && t4.pending === 0,
   'I4: 4月 unpaid2/exempt5/paid111/pending0: ' + JSON.stringify(t4));

// 5月（引落し後）：unpaid=2 / exempt=4 / paid=110 / pending=0
ok(loadRecs('fixture-2026-05.csv').length === 116, 'I5: 5月 個人116');
ok(t5.unpaid === 2 && t5.exempt === 4 && t5.paid === 110 && t5.pending === 0,
   'I6: 5月 unpaid2/exempt4/paid110/pending0: ' + JSON.stringify(t5));

// 6月（請求確定済・引落し前・全未入金）：unpaid=106 / exempt=5 / pending=0 / paid=0
ok(loadRecs('fixture-2026-06-hikiotoshimae.csv').length === 111, 'I7: 6月 個人111');
ok(t6.unpaid === 106 && t6.exempt === 5 && t6.pending === 0 && t6.paid === 0,
   'I8: 6月 unpaid106/exempt5/pending0/paid0: ' + JSON.stringify(t6));
```

- [ ] **Step 2: 実行してPASSを確認**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（45 passed）。もし件数が合わなければ Task 1 の生成物とロジックのどちらがズレたか `JSON.stringify` 出力で切り分け。

- [ ] **Step 3: コミット**

```bash
git add scripts/test-seikyu-board.js
git commit -m "test(seikyu-board): 4フィクスチャの状態別件数を実データ固定値でアサート"
```

---

### Task 9: DOM配線（取込・描画・ソート・注意書き）※純関数を呼ぶだけの薄い層

**Files:**
- Modify: `seikyu-board.html`（`<script>` 末尾の「DOM 配線」区画）

> このタスクのコードは純関数を呼び出すだけの薄いUI層。ロジックは Task 2〜8 の純関数に集約済みでテスト担保されている。UI自体は社長の目視のみ（POSTゼロ・実ブラウザ検証はしない方針）。

- [ ] **Step 1: 取込・描画配線を実装（「DOM 配線」コメントの下に追記）**

```js
var sbFiles = []; // { label, recs }

function sbSetupDrop() {
  var dz = document.getElementById('dropZone');
  var input = document.getElementById('fileInput');
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.style.background = '#d4e9f7'; });
  dz.addEventListener('dragleave', function () { dz.style.background = ''; });
  dz.addEventListener('drop', function (e) { e.preventDefault(); dz.style.background = ''; sbHandleFiles(e.dataTransfer.files); });
  input.addEventListener('change', function (e) { sbHandleFiles(e.target.files); });
}

function sbHandleFiles(fileList) {
  var arr = Array.prototype.slice.call(fileList);
  var pending = arr.length;
  if (!pending) return;
  arr.forEach(function (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var recs = sbExtractRows(sbToRows(sbDecode(e.target.result)));
        var tsuki = recs.length ? recs[0].tsuki : file.name;
        sbFiles.push({ label: tsuki, recs: recs });
      } catch (err) {
        alert('取込失敗（' + file.name + '）: ' + err.message);
      }
      pending--;
      if (pending === 0) sbRender();
    };
    reader.readAsArrayBuffer(file);
  });
}

function sbYen(n) { return '¥' + (n || 0).toLocaleString(); }
function sbPayIcon(pay) { return pay === '口座振替' ? '🏦' : (pay === '現金' ? '💵' : (pay === '振込' ? '🏧' : '')); }

function sbRender() {
  var merged = sbMergeMonths(sbFiles.map(function (f) { return f.recs; }));
  var months = merged.months;
  // 未入金がある人を上へ（主目的）。pending は赤の下。次に名前順。
  var hasUnpaid = function (p) { return months.some(function (m) { return sbClassify(p.months[m]) === 'unpaid'; }); };
  var hasPending = function (p) { return months.some(function (m) { return sbClassify(p.months[m]) === 'pending'; }); };
  merged.people.sort(function (a, b) {
    var au = hasUnpaid(a) ? 0 : (hasPending(a) ? 1 : 2), bu = hasUnpaid(b) ? 0 : (hasPending(b) ? 1 : 2);
    if (au !== bu) return au - bu;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });

  // サマリ（未入金の人数・合計額）
  var unpaidPeople = merged.people.filter(hasUnpaid);
  var unpaidSum = 0;
  unpaidPeople.forEach(function (p) { months.forEach(function (m) { if (sbClassify(p.months[m]) === 'unpaid') unpaidSum += p.months[m].riyou; }); });
  document.getElementById('summary').innerHTML =
    '<p><strong>未入金の利用者: ' + unpaidPeople.length + '人 / 合計 ' + sbYen(unpaidSum) + '</strong></p>';
  document.getElementById('note').textContent =
    '入金状況が空欄の月＝請求確定前は「—（判定前）」表示で入金判定しません。「未入金」は引落し失敗 or 引落し待ちを含みます。確定した入金/未入金は引落し後のCSVで反映されます。';

  // マトリクス
  var labelOf = { unpaid: '未入金', pending: '—（判定前）', paid: '入金済', exempt: '対象外', unknown: '要確認', empty: '' };
  var html = '<table><thead><tr><th>利用者</th>';
  months.forEach(function (m) { html += '<th>' + m.slice(0, 4) + '/' + m.slice(4) + '</th>'; });
  html += '</tr></thead><tbody>';
  merged.people.forEach(function (p) {
    html += '<tr><td class="name">' + p.name + '</td>';
    months.forEach(function (m) {
      var cell = p.months[m];
      var st = sbClassify(cell);
      var txt = cell ? (st === 'exempt' ? '—' : sbYen(cell.riyou)) : '';
      var jihi = (cell && cell.jihi) ? '<div style="font-size:11px;color:#888">自費' + sbYen(cell.jihi) + '</div>' : '';
      var icon = cell ? sbPayIcon(cell.pay) : '';
      var title = cell ? labelOf[st] : '';
      html += '<td class="st-' + st + '" title="' + title + '">' + txt + ' ' + icon + jihi + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('tableWrap').innerHTML = html;
}

sbSetupDrop();
```

- [ ] **Step 2: 純関数テストが依然PASSすることを確認（UI追記でHTMLの関数抽出が壊れていないか）**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（45 passed のまま）

- [ ] **Step 3: 社長へ目視確認を依頼（実ブラウザでの動作確認は社長が実施）**

報告文（クロコ→社長）に含める:「`seikyu-board.html` を github.io で開き、Downloadsの請求情報CSV（3・4・5月）を放り込んで、①未入金の人が上に赤で並ぶ ②3月旧（空欄）を入れると赤でなく『—（判定前）』になる、をご確認ください」。
※ クロコは実ブラウザ検証をしない（memory: 本番htmlを実ブラウザで検証するな）。

- [ ] **Step 4: コミット**

```bash
git add seikyu-board.html
git commit -m "feat(seikyu-board): D&D取込・マトリクス描画・未入金上位ソート・注意書き（純関数配線）"
```

---

### Task 10: 仕上げ（全テスト通し＋孤立ブランチ確認＋本番配信手順の提示）

**Files:** なし（確認とコミットのみ）

- [ ] **Step 1: 全テスト通し**

Run: `node scripts/test-seikyu-board.js`
Expected: PASS（`[OK] 45 passed, 0 failed`）

- [ ] **Step 2: フィクスチャに実個人データが無いことを最終確認**

Run（Bash）:
```bash
git grep -nE "伊熊|伊藤|川島|町田|大久保|0000[0-9]{6}" -- scripts/fixtures/seikyu/ || echo "実名/実番号なし=OK"
```
Expected: `実名/実番号なし=OK`

- [ ] **Step 3: 孤立ブランチ確認（CLAUDE.md 必須）**

Run: `node scripts/check-orphan-branches.js`
Expected: 本作業由来の未反映ブランチが無い（master 上で作業のため）。

- [ ] **Step 4: 本番配信手順を社長へ提示（版ゲート不要・push は社長の手で）**

- 版ゲート（version.txt bump）は**不要**（新規ファイル・no-store系でなく単発配信・POSTゼロ）。
- 提示のみ:
  ```bash
  git push origin master
  ```
  push 後、`git rev-parse HEAD` = `origin/master` 一致を確認。github.io の `seikyu-board.html` が配信されたら社長が目視確認（Task 9 Step 3）。
- クロコは push を実行しない（本番書き込みは社長）。

---

## Self-Review（この計画の点検結果）

**1. 仕様カバレッジ（design.md 各節 → タスク対応）**
- §3 入力仕様（SJIS/2行目ヘッダ/列名一致）→ Task 3・4 ✅
- §4-3 値ベース除外 → Task 5（sbIsSubtotalRow・E1で116人=9行除外）✅
- §4-4 名寄せ加算 → Task 7（H5/H6）✅
- §4-5 classify 5状態・境界 → Task 6（G5〜G8）✅
- §5 表示（マトリクス/ソート/配色/注意書き）→ Task 9 ✅
- §6 テスト（3・4・5・6月＋3旧・境界4）→ Task 6・8 ✅
- §8 注意書き一般化（死亡限定にしない）→ Task 9 Step1（note文言）✅
- §9 furikae住み分け → v1は連携せず（本計画に連携タスクなし＝スコープ通り）。リンク導線は将来分として本計画では未実装（design §9-2はv1で導線のみ可だが、YAGNIで最小構成優先。必要なら別途）。※下記「スコープ判断」参照。
- §10 スコープ外（手入力永続化・月またぎ一括回収・furikae連携）→ タスクなし＝正 ✅

**スコープ判断:** design §9-2 は「🔴セルに furikae リンク導線を置く」を許容。v1最小構成として本計画では**未実装**とし、コア（発見の鏡）完成後に社長判断で追加する。単なる `<a href="furikae.html">` 1本のため、必要なら Task 9 に追記可能（データは渡さない・画面遷移のみ）。

**2. プレースホルダscan:** TBD/TODO/「適切に処理」等なし。各コードステップは実コードを記載 ✅

**3. 型/名称の一貫性:** 純関数名（sbDecode/sbToRows/sbParseLine/sbResolveColumns/sbIsSubtotalRow/sbNormalize/sbExtractRows/sbMergeMonths/sbClassify）はタスク間で一致。cell の形 `{tsuki,hken?,riyou,jihi,pay,nyukin}`、col の形 `{tsuki,hken,name,riyou,jihi1,jihi2,pay,nyukin}` を全タスクで統一 ✅
