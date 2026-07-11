# 伝達ボード 既読可視化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全員宛て伝達投稿の既読を可視化し（未読者の名前を主役に表示）、全員既読で完了ボタンが変化する仕組みを genba.html＋board GAS＋スプレッドシートに実装する。

**Architecture:** 伝達ボード専用の新シート「スタッフ」をマスタに、投稿時にサーバ側で対象者名（recipients）をスナップショット確定。既読は readBy 列にサーバ側 read-modify-write で1名ずつ増減（クライアントは配列全体を送らない＝同時上書き事故の再発防止）。フロントは recipients/readBy から未読チップと完了ボタン変化を描画。

**Tech Stack:** genba.html（バニラJS・版ゲート対象）／ board GAS（my-project・clasp管理・追記のみ）／ Google スプレッドシート（利用者台帳）／ テスト＝`scripts/test-*.js` の単体nodeスクリプト（extractFn 流儀）。

**設計doc:** `docs/superpowers/specs/2026-07-11-dengon-kidoku-design.md`

## 不変条件（全タスク共通・崩さない）
1. `recipients` は add_dengon_message でサーバ側確定。クライアントは計算・送信しない。
2. `isAllRead` は recipients と readBy の2つだけで判定（マスタ非参照）。
3. `mark_dengon_read` は押された名前が recipients に含まれるかをサーバ側で検証、含まなければ却下。

## 実装フェーズと順序
- **Phase A（本セッション・オフライン可）**: フロント純関数＋テスト。書込経路ではないので GAS 前でも安全。
- **Phase B（clasp再認証が必要）**: GAS シート＋5 action。書込の read-modify-write を UI 配線より先に用意（予約memory「mark_read先行」）。
- **Phase C（B完了後）**: フロント配線（マスタ取得・select刷新・既読チップ・mark/unmark・完了ボタン変化）。
- **Phase D**: 版上げ＋本番反映＋検証5項目。

---

## Phase A: フロント純関数（本セッションで実施）

新規4関数を genba.html に追加し、単体テストで検証する。宛先グループ定数はここで確定する。

**グループ定数（`to` 列の保存値と一致させる）:**
`'全員'` / `'全員・ドライバー除く'` / `'社員'` / `'相談員'` / `'看護師'`

### Task A1: dengonComputeRecipients_ + テスト土台

**Files:**
- Modify: `genba.html`（`dengonRequestedMD_` 関数の閉じ`}`直後、行10033付近に挿入）
- Test: `scripts/test-genba-dengon-kidoku.js`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-genba-dengon-kidoku.js` を新規作成：

```js
// 伝達ボード既読 純関数の実コード抽出テスト
// 対象: dengonComputeRecipients_ / dengonAddReadBy_ / dengonRemoveReadBy_ / dengonIsAllRead_
// 実行: node scripts/test-genba-dengon-kidoku.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
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
  extractFn('dengonComputeRecipients_') + '\n' +
  extractFn('dengonAddReadBy_') + '\n' +
  extractFn('dengonRemoveReadBy_') + '\n' +
  extractFn('dengonIsAllRead_') + '\n' +
  'sb.computeRecipients = dengonComputeRecipients_;' +
  'sb.add = dengonAddReadBy_; sb.remove = dengonRemoveReadBy_; sb.isAllRead = dengonIsAllRead_;'
)(sb);

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

const MASTER = [
  { name: '比嘉', role: '代表', employ: '−', active: true },
  { name: '勝又', role: '相談員', employ: '社員', active: true },
  { name: '星野', role: '介護', employ: '社員', active: true },
  { name: '下浦', role: '相談員', employ: 'パート', active: true },
  { name: '工藤', role: '相談員', employ: 'パート', active: true },
  { name: '髙山', role: '看護師', employ: 'パート', active: true },
  { name: '石井', role: '看護師', employ: 'パート', active: true },
  { name: '春山', role: '看護師', employ: 'パート', active: true },
  { name: '大久保', role: '介護', employ: 'パート', active: true },
  { name: '小野', role: 'ドライバー', employ: 'パート', active: true },
  { name: '林', role: 'ドライバー', employ: 'パート', active: true }
];
const cr = sb.computeRecipients;

// A1: 分母（指示書の実測対象）
ok(cr(MASTER, '全員').length === 11, 'A1-全員=11');
ok(cr(MASTER, '全員・ドライバー除く').length === 9, 'A1-ドライバー除く=9');
ok(cr(MASTER, '社員').length === 2, 'A1-社員=2');
ok(cr(MASTER, '相談員').length === 3, 'A1-相談員=3');
ok(cr(MASTER, '看護師').length === 3, 'A1-看護師=3');
// 比嘉の包含/除外
ok(cr(MASTER, '全員').indexOf('比嘉') !== -1, 'A1-比嘉は全員に入る');
ok(cr(MASTER, '全員・ドライバー除く').indexOf('比嘉') !== -1, 'A1-比嘉はドライバー除くに入る');
ok(cr(MASTER, '社員').indexOf('比嘉') === -1, 'A1-比嘉は社員に入らない');
ok(cr(MASTER, '相談員').indexOf('比嘉') === -1, 'A1-比嘉は相談員に入らない');
ok(cr(MASTER, '看護師').indexOf('比嘉') === -1, 'A1-比嘉は看護師に入らない');
// ドライバー除外の中身
ok(cr(MASTER, '全員・ドライバー除く').indexOf('小野') === -1, 'A1-小野は除外');
ok(cr(MASTER, '全員・ドライバー除く').indexOf('林') === -1, 'A1-林は除外');
// 在籍=false の除外
const M2 = MASTER.map(m => m.name === '石井' ? Object.assign({}, m, { active: false }) : m);
ok(cr(M2, '看護師').length === 2, 'A1-非在籍(石井)は看護師から除外');
ok(cr(M2, '全員').length === 10, 'A1-非在籍は全員からも除外');
// 個人宛て/未知グループ → []
ok(Array.isArray(cr(MASTER, '工藤')) && cr(MASTER, '工藤').length === 0, 'A1-個人名グループは空配列');
ok(cr(null, '全員').length === 0, 'A1-master不正は空配列');

console.log('dengon-kidoku core: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-genba-dengon-kidoku.js`
Expected: FAIL（`genba.html に function dengonComputeRecipients_ が無い（未実装＝RED）` で throw）

- [ ] **Step 3: 最小実装（genba.html に挿入）**

`dengonRequestedMD_` の閉じ`}`（行10033付近）の直後に挿入：

```js
// ===== 伝達ボード 既読: 純関数（テスト対象・副作用なし）=====
// 宛先グループ→対象者名を算出（マスタ動的・ハードコード禁止）。
// master: [{name, role, employ, active(boolean)}]。個人名/未知グループ/不正masterは [] を返す。
function dengonComputeRecipients_(master, group) {
    var list = Array.isArray(master) ? master.filter(function (m) { return m && m.active; }) : [];
    switch (group) {
        case '全員': return list.map(function (m) { return m.name; });
        case '全員・ドライバー除く': return list.filter(function (m) { return m.role !== 'ドライバー'; }).map(function (m) { return m.name; });
        case '社員': return list.filter(function (m) { return m.employ === '社員'; }).map(function (m) { return m.name; });
        case '相談員': return list.filter(function (m) { return m.role === '相談員'; }).map(function (m) { return m.name; });
        case '看護師': return list.filter(function (m) { return m.role === '看護師'; }).map(function (m) { return m.name; });
        default: return [];
    }
}
```

- [ ] **Step 4: PASS確認**

Run: `node scripts/test-genba-dengon-kidoku.js`
Expected: 該当分の A1 が全て PASS（addReadBy等はまだ未実装なので extractFn で throw する → まだ全体は失敗。A2で解消）

※注意: このテストは4関数すべてを extractFn するため、A2/A3 実装まで通らない。A1完了の確認は「A1系の FAIL が消える」ことを目視、または A2/A3 を続けて実装してから一括実行する。

- [ ] **Step 5: コミット（A3まで実装後）**

A2・A3 実装まで一括で進め、テスト全PASS後に1コミットする（下記 Task A3 Step5）。

### Task A2: dengonAddReadBy_ / dengonRemoveReadBy_

**Files:**
- Modify: `genba.html`（A1で挿入したブロックの続き）
- Test: `scripts/test-genba-dengon-kidoku.js`（アサーション追記）

- [ ] **Step 1: 失敗するテストを追記**

`console.log('dengon-kidoku core...` の直前に挿入：

```js
// A2: addReadBy（冪等・非破壊・順序保持）
const base = ['髙山', '石井'];
ok(sb.add(base, '春山').length === 3, 'A2-add新規で+1');
ok(sb.add(base, '髙山').length === 2, 'A2-add既存は冪等');
ok(base.length === 2, 'A2-add非破壊（元配列不変）');
ok(sb.add([], '工藤')[0] === '工藤', 'A2-空配列にadd');
ok(sb.add(null, '林').length === 1, 'A2-null許容');
// removeReadBy（冪等・非破壊）
ok(sb.remove(['髙山', '石井'], '髙山').length === 1, 'A2-remove存在で-1');
ok(sb.remove(['髙山', '石井'], '春山').length === 2, 'A2-remove非存在は不変');
ok(sb.remove(null, '林').length === 0, 'A2-null許容');
const b2 = ['髙山', '石井'];
sb.remove(b2, '髙山');
ok(b2.length === 2, 'A2-remove非破壊（元配列不変）');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-genba-dengon-kidoku.js`
Expected: FAIL（`dengonAddReadBy_ が無い`）

- [ ] **Step 3: 実装（A1ブロックの続きに挿入）**

```js
// 既読者配列に1名追加（冪等・非破壊・順序保持）。
function dengonAddReadBy_(readBy, name) {
    var arr = Array.isArray(readBy) ? readBy.slice() : [];
    if (name && arr.indexOf(name) === -1) arr.push(name);
    return arr;
}
// 既読者配列から1名除去（冪等・非破壊）。
function dengonRemoveReadBy_(readBy, name) {
    var arr = Array.isArray(readBy) ? readBy.slice() : [];
    return arr.filter(function (n) { return n !== name; });
}
```

- [ ] **Step 4: 確認（A3実装まで一括でPASS）**

Run: `node scripts/test-genba-dengon-kidoku.js`
Expected: A3未実装なら `dengonIsAllRead_ が無い` で throw。A3実装後に全PASS。

### Task A3: dengonIsAllRead_

**Files:**
- Modify: `genba.html`（続き）
- Test: `scripts/test-genba-dengon-kidoku.js`（追記）

- [ ] **Step 1: 失敗するテストを追記**（A2アサーションの直後）

```js
// A3: isAllRead（recipients と readBy のみで判定・不変条件2）
const rc = ['髙山', '石井', '春山'];
ok(sb.isAllRead(rc, ['髙山', '石井', '春山']) === true, 'A3-全員既読でtrue');
ok(sb.isAllRead(rc, ['髙山', '石井']) === false, 'A3-1名未読でfalse');
ok(sb.isAllRead(rc, ['髙山', '石井', '春山', '工藤']) === true, 'A3-readBy余剰でもtrue');
ok(sb.isAllRead([], ['髙山']) === false, 'A3-recipients空はfalse（個人宛て等）');
ok(sb.isAllRead(rc, []) === false, 'A3-readBy空はfalse');
ok(sb.isAllRead(rc, null) === false, 'A3-readBy null許容false');
```

- [ ] **Step 2: 失敗を確認**

Run: `node scripts/test-genba-dengon-kidoku.js`
Expected: FAIL（`dengonIsAllRead_ が無い`）

- [ ] **Step 3: 実装（続きに挿入）**

```js
// 全員既読判定：recipients が非空で、その全員が readBy に含まれる時のみ true。
// recipients 空（個人宛て等）は false＝完了ボタン変化を起こさない。マスタは参照しない（不変条件2）。
function dengonIsAllRead_(recipients, readBy) {
    if (!Array.isArray(recipients) || recipients.length === 0) return false;
    var read = Array.isArray(readBy) ? readBy : [];
    return recipients.every(function (n) { return read.indexOf(n) !== -1; });
}
```

- [ ] **Step 4: 全テストPASS確認**

Run: `node scripts/test-genba-dengon-kidoku.js`
Expected: `dengon-kidoku core: NN PASS / 0 FAIL`

- [ ] **Step 5: 既存テストのリグレッション確認＋コミット**

Run: `node scripts/test-genba-origin-guard.js` （既知の1 FAILは別トラック＝許容。悪化してないこと）
Run: `node scripts/test-genba-kesseki-box.js` （59 PASS / 0 FAIL 維持）

```bash
git add genba.html scripts/test-genba-dengon-kidoku.js
git commit -m "feat(dengon): 既読の純関数（宛先算出/readBy増減/全員既読判定）＋TDD"
```

---

## Phase B: GAS（clasp再認証が必要・別repo my-project）

> **前提**: 正本は `c:\dev\my-project\gas\yawaragi-board\コード.js`（clasp管理）。このワークツリーの `gas_yawaragiボード.gs` は古いミラーで触っても本番反映されない。**着手前に社長へ clasp 再認証（ブラウザ `clasp login`・invalid_rapt 解消）を依頼**。実装は既存165関数を触らず**追記のみ**。編集前に必ず `clasp pull` で本番と突合（過去、突合せず本番機能を消しかけた事故あり）。
>
> スプレッドシート＝利用者台帳 fileID `1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0`。

### Task B1: 新シート「スタッフ」作成＋11行投入
- [ ] 利用者台帳に新シート「スタッフ」。1行目ヘッダ `名前 / 職種 / 雇用区分 / 在籍`。2行目以降に設計doc A-1 の11行を投入（比嘉＝代表/−、以下同）。
- [ ] TZ罠回避：列は文字列書式、setValues で一括投入（appendRow のTZずれ回避＝ケアマネ提出物の教訓）。
- [ ] 検証：シートを開いて11行・比嘉の職種=代表/雇用=− を目視。

### Task B2: dengon_staff_master（GET/JSONP）
- [ ] doGet の action 分岐に `dengon_staff_master` を追記。参照実装：

```js
function handleDengonStaffMaster_() {
  var ss = SpreadsheetApp.openById('1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0');
  var sh = ss.getSheetByName('スタッフ');
  if (!sh) return { ok: false, error: 'スタッフシート無し', staff: [] };
  var vals = sh.getDataRange().getValues();
  var staff = [];
  for (var i = 1; i < vals.length; i++) {
    var name = String(vals[i][0] || '').trim();
    if (!name) continue;
    staff.push({
      name: name,
      role: String(vals[i][1] || '').trim(),
      employ: String(vals[i][2] || '').trim(),
      active: String(vals[i][3] || '').trim() === '在籍'
    });
  }
  return { ok: true, staff: staff };
}
```
- [ ] JSONP callback で返す（既存 dengonBoard と同じ respond 経路）。
- [ ] 検証：`?action=dengon_staff_master&callback=cb` を node(UTF-8) で叩き、11名・active:true を実測。

### Task B3: 宛先算出のサーバ側関数（recipients確定用）
- [ ] GAS内に純関数を追記（フロント dengonComputeRecipients_ とロジック一致）：

```js
function dengonResolveRecipients_(staff, group) {
  var GROUPS = ['全員', '全員・ドライバー除く', '社員', '相談員', '看護師'];
  if (GROUPS.indexOf(group) === -1) return []; // 個人宛て・社長宛て・未知 → 空
  var a = (staff || []).filter(function (m) { return m && m.active; });
  switch (group) {
    case '全員': return a.map(function (m) { return m.name; });
    case '全員・ドライバー除く': return a.filter(function (m) { return m.role !== 'ドライバー'; }).map(function (m) { return m.name; });
    case '社員': return a.filter(function (m) { return m.employ === '社員'; }).map(function (m) { return m.name; });
    case '相談員': return a.filter(function (m) { return m.role === '相談員'; }).map(function (m) { return m.name; });
    case '看護師': return a.filter(function (m) { return m.role === '看護師'; }).map(function (m) { return m.name; });
  }
  return [];
}
```

### Task B4: add_dengon_message 改修（recipients スナップショット保存）
- [ ] 「伝達ボード」タブに末尾2列 `recipients` / `readBy` を追加（ヘッダ行）。既存行は空セルのまま（互換）。
- [ ] add_dengon_message の行追記処理に、スタッフマスタを読み `dengonResolveRecipients_(staff, to)` で recipients を確定、`JSON.stringify(recipients)` を recipients 列へ、`'[]'` を readBy 列へ保存（不変条件1）。個人宛て・社長宛ては recipients=`'[]'`。
- [ ] 検証：グループ宛て投稿→当該行 recipients に対象者名JSON、個人宛て→`[]` を実測。

### Task B5: mark/unmark_dengon_read（GET/JSONP・read-modify-write）
- [ ] 参照実装（id で行特定→recipients照合→readBy増減→read-back）：

```js
function handleMarkDengonRead_(id, name, remove) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000); // 同時書き込み直列化
  try {
    var ss = SpreadsheetApp.openById('1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0');
    var sh = ss.getSheetByName('伝達ボード');
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var idCol = head.indexOf('id'), rcCol = head.indexOf('recipients'), rbCol = head.indexOf('readBy');
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][idCol]) !== String(id)) continue;
      var recipients = [];
      try { recipients = JSON.parse(vals[i][rcCol] || '[]'); } catch (e) {}
      if (!remove && recipients.indexOf(name) === -1) {
        return { ok: false, error: '対象外の既読（recipients に無い）' }; // 不変条件3
      }
      var readBy = [];
      try { readBy = JSON.parse(vals[i][rbCol] || '[]'); } catch (e) {}
      if (remove) { readBy = readBy.filter(function (n) { return n !== name; }); }
      else if (readBy.indexOf(name) === -1) { readBy.push(name); }
      sh.getRange(i + 1, rbCol + 1).setValue(JSON.stringify(readBy));
      SpreadsheetApp.flush();
      // read-back 検証
      var back = [];
      try { back = JSON.parse(sh.getRange(i + 1, rbCol + 1).getValue() || '[]'); } catch (e) {}
      return { ok: true, readBy: back };
    }
    return { ok: false, error: 'id 不在: ' + id };
  } finally { lock.releaseLock(); }
}
```
- [ ] doGet に `mark_dengon_read`（remove=false）/ `unmark_dengon_read`（remove=true）を追記。
- [ ] 検証：mark→シート readBy に名前追加、unmark→消去、recipients外の名前は ok:false を実測。

### Task B6: dengonBoard / dengonHistory に recipients/readBy を同梱
- [ ] 両 action の各 item に `recipients`（JSON.parse・既定[]）と `readBy`（同）を追加。既存行（列空）は `[]` になること。
- [ ] clasp push → clasp deploy（同一 scriptId・URL維持）。デプロイ番号を記録。
- [ ] 検証：`?action=dengonBoard` の item に recipients/readBy が入る。既存投稿は両方 [] を実測。

---

## Phase C: フロント配線（Phase B 完了後）

### Task C1: マスタ取得＋宛先select刷新
**Files:** Modify `genba.html`
- [ ] `dengonStaffMaster` グローバル変数を追加（既定 `[]`）。
- [ ] `dengonLoad` 冒頭で `dengon_staff_master`（JSONP）を取得しキャッシュ→取得後に select と staff select を再描画。
- [ ] 宛先 select（行2158-2165）を刷新：`全員(11)` / `全員・ドライバー除く(9)` / `社員(2)` / `相談員(3)` / `看護師(3)` / 特定スタッフ(individual=active全員)。人数は `dengonComputeRecipients_(dengonStaffMaster, group).length` で動的表示（保存値の起源ではない・不変条件1）。特定スタッフの option はマスタ active 全員（比嘉含む）。
- [ ] 検証：select の各グループ人数が 11/9/2/3/3。

### Task C2: 既読チップ描画（グループ宛てのみ）
**Files:** Modify `genba.html`（`dengonRender`・行9970-10001）
- [ ] item の `recipients`/`readBy` を使い、`recipients.length > 0` のカードにチップ列を追加。未読（recipients − readBy）は赤系チップ＋先頭に「未読: 名前・名前」を名前主役で表示。既読チップは薄色。
- [ ] 個人宛て（recipients 空）はチップを出さない。
- [ ] 検証：グループ投稿にチップ表示、個人投稿は非表示。

### Task C3: mark/unmark 配線（確認ダイアログ・サーバ確定後再描画）
**Files:** Modify `genba.html`
- [ ] `dengonMarkRead(id, name)`：`confirm('◯◯さんとして既読にしますか?')`→ JSONP GET `mark_dengon_read`→ ok で `dengonLoad()` 再描画。楽観更新しない。
- [ ] `dengonUnmarkRead(id, name)`：`confirm('既読を取り消しますか?')`→ `unmark_dengon_read`→ 再描画。
- [ ] チップ onclick を未読→mark / 既読→unmark に配線。
- [ ] 検証：タップ→シート readBy 反映→再描画で色反転。取り消しも実測。

### Task C4: 完了ボタン変化
**Files:** Modify `genba.html`（`dengonRender` の完了ボタン部）
- [ ] `dengonIsAllRead_(recipients, readBy)` が true の時、「完了にする」→「✅ 全員既読・完了にする」＋色濃く。false は従来表示。
- [ ] 未読が残っても押下は従来通り可能（`dengonAskConfirm`→`dengonComplete` 経路は不変）。
- [ ] 検証：全員既読でボタン変化、未読残でも押せる。

### Task C5: 互換フォールバック
**Files:** Modify `genba.html`
- [ ] recipients が空だがグループ宛て（`to` がグループ名）の既存投稿は、`dengonComputeRecipients_(dengonStaffMaster, x.to)` で算出フォールバックし「全員未読」で描画（移行期のみ）。readBy 空は全員未読で正常表示。
- [ ] 検証：recipients空の既存グループ投稿が壊れず全員未読表示。

---

## Phase D: リリース（版ゲート）

### Task D1: 版上げ＋本番反映＋検証
- [ ] genba.html 作業を全コミット済みにする。fresh pull・クリーン確認。
- [ ] `node scripts/bump-app-version.js <新版>`（version.txt と shared.js?v= 同時更新・手編集禁止）。
- [ ] 社長承認のうえ `git push origin master`（FF）。
- [ ] `node scripts/bump-app-version.js --verify <版>` で本番反映をポーリング確認（時間切れは成功扱いにしない）。
- [ ] 本番 github.io の genba.html で検証5項目を一次情報で実測：
  1. 各宛先の分母 11/9/2/3/3
  2. 既読タップ→ readBy に名前
  3. 取り消し→ readBy から消える
  4. 全員既読→ボタン変化
  5. 既存投稿（readBy空）が壊れず表示

---

## Self-Review（作成者チェック）
- **Spec coverage**: スタッフマスタ(B1)・宛先拡張(B3/C1)・既読機能(B5/C2/C3)・完了ボタン変化(C4)・既存互換(B6/C5)・検証5項目(D1)＝spec全節に対応タスクあり。
- **Placeholder**: `<新版>` はbump時確定（意図的）。他はコード実体を記載。
- **Type consistency**: `dengonComputeRecipients_`/`dengonAddReadBy_`/`dengonRemoveReadBy_`/`dengonIsAllRead_` はA/C全タスクで同名・同引数。GAS側 `dengonResolveRecipients_` はロジック一致の別名（サーバ/クライアント別実行環境のため意図的に別関数）。recipients/readBy は列名・JSONキー・item プロパティで一貫。
