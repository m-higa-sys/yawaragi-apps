# 月次定例タスク自動リマインド＋morningDigest統合 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 月次定例業務（けあ蔵DL・電算・国保連伝送・社労士/税理士提出）の未完状態を GAS が持ち、完了するまで毎朝の morningDigest に期限順で出続ける仕組みを作る。

**Architecture:** シフト公開リマインド（実証済み）の一般化。「定例タスクマスタ」＋「定例タスク完了記録」の2シートを表示時に動的判定（トリガーレス）。純関数はテストと二重持ちTDD。完了APIは書き込み後読み戻し検証。UIは teirei.html（GitHub Pages・admin.html導線のみ）。

**Tech Stack:** Google Apps Script（yawaragiボード統合GAS）／Node.js（純関数テスト）／PowerShell 5.1（morning-digest.ps1）／素のHTML+fetch（teirei.html）

**設計書:** `docs/superpowers/specs/2026-07-02-月次定例タスク-morningDigest統合-design.md`（承認済み・§8確定）

---

## 前提知識（ゼロコンテキスト向け）

### 作業場所は3箇所ある
| 記号 | 場所 | 役割 |
|---|---|---|
| **R1** | `C:\Users\mh\OneDrive\デスクトップ\my-project`（gitリポジトリ） | GAS正本 `gas/yawaragi-board/コード.js`（13,300行超・「本番の鏡」運用）、`scripts/morning-digest.ps1`、テスト群 |
| **R2** | `c:\dev\yawaragi-apps`（gitリポジトリ・GitHub Pages=本番配信） | `teirei.html`（新規）、`admin.html`（リンク追加）、docs |
| **R3** | `C:\Users\mh\.claude\skills\朝の報告\SKILL.md`（git外） | 朝の報告スキルへの1行追記 |

### GAS の叩き方（本番 exec URL・変更禁止）
```
EXEC = https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec
```
- GET `EXEC?action=morningDigest` のように叩く。レスポンスはJSON。
- **`clasp push -f` だけでは本番URLに反映されない**。必ず `clasp deploy -i "AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw" -d "説明"` で既存デプロイIDの版を上げる（**新規デプロイ作成は禁止＝URLが変わり全アプリが壊れる**）。
- clasp は 3.3.0+Node v24 で動作確認済み（2026-07-02実測）。`clasp -v` の出力は信用せず動作で判断。認証切れ（invalid_rapt）なら社長に `clasp login` を依頼して停止。
- **🔒 clasp push/deploy は社長の明示承認後のみ**（Task 1.3 と 3.3 の承認ゲート厳守）。

### 既存コードの流儀（必ず合わせる）
- 純関数は `scripts/test-*.js` と GAS 本体に**同一実装を二重持ち**し `node` でテスト（例: `scripts/test-morning-digest.js`）。
- 完了系 action は**書き込み→`SpreadsheetApp.flush()`→読み戻し→verified:true の時だけ ok**（`completePendingTaskAction_` 参照・コード.js 5992行付近）。
- doGet の action 分岐は `if (e && e.parameter && e.parameter.action === 'xxx') {...}` の羅列（コード.js 803行〜）。
- `respond(data, callback)`（5547行）が JSONP/JSON を返す共通ヘルパ。日付パラメタは既存 `_shiftDateParam_(e)` を流用。
- **「終わるまで方式」厳守**: 日付経過での自動消滅は禁止。完了記録の行が書かれた時だけ消える。dueDay 超過は urgency='overdue'（⚠⚠）になるだけで消えない。

### ツール出力の罠（このリポジトリ固有）
- bash/git の stdout が偽値を吐くことがある。**成否は exit code、内容確認は Read 直読**。push 後の突合は fresh fetch + grep。

---

## Phase 0: GAS鏡同期（朝報告残タスク gas-source-git-sync の消化・着手前必須）

### Task 0.1: R1 の未コミット分（シフト公開リマインド実装）をコミット

**Files:**
- Commit: `gas/yawaragi-board/コード.js`（+183行・shift系関数一式）
- Commit: `scripts/morning-digest.ps1`（+14行・shift表示ブロック）
- Commit: `scripts/test-shift-digest.js`（未追跡）

- [ ] **Step 1: 差分がシフト実装のみであることを確認**

```bash
cd "/c/Users/mh/OneDrive/デスクトップ/my-project"
git diff --stat
git diff -- "gas/yawaragi-board/コード.js" | grep "^+" | grep -E "function |var [A-Z_]+" 
```
Expected: `コード.js +183行 / morning-digest.ps1 +14行` のみ。関数は shiftBand_/shiftLabelInfo_/shiftDecision_/readShiftState_/applyShiftHeal_/_digestShift_/setupShiftState_/completeShiftAction_/shiftStatusAction_/resetShiftStateAction_/_shiftDateParam_ と `safe('shift',...)`。
**それ以外の差分が混ざっていたら停止して報告**（別セッションのWIPの可能性）。

- [ ] **Step 2: コミット**

```bash
git add "gas/yawaragi-board/コード.js" scripts/morning-digest.ps1 scripts/test-shift-digest.js
git commit -m "chore(gas): シフト公開リマインド実装を鏡へ追従（2026-06-22本番反映済み分のコミット漏れ解消）"
git log --oneline -1
```
Expected: コミット成功・SHA表示。

### Task 0.2: 一時ディレクトリへ clasp pull し本番と鏡の一致を確認

**Files:**
- Create（一時）: `C:\tmp\gas-pull-teirei\`（作業後削除）

- [ ] **Step 1: 一時ディレクトリで本番を取得**

```bash
mkdir -p /c/tmp/gas-pull-teirei && cd /c/tmp/gas-pull-teirei
cp "/c/Users/mh/OneDrive/デスクトップ/my-project/gas/yawaragi-board/.clasp.json" .
clasp pull
ls
```
Expected: `コード.js`（および absence-*-core.js 等・appsscript.json）が落ちてくる。
認証エラー（invalid_rapt 等）なら**停止して社長に `clasp login` を依頼**。

- [ ] **Step 2: 本番と鏡（R1）を diff**

```bash
diff <(sed 's/\r$//' "/c/tmp/gas-pull-teirei/コード.js") <(sed 's/\r$//' "/c/Users/mh/OneDrive/デスクトップ/my-project/gas/yawaragi-board/コード.js") | head -50
echo "DIFF_LINES=$(diff <(sed 's/\r$//' "/c/tmp/gas-pull-teirei/コード.js") <(sed 's/\r$//' "/c/Users/mh/OneDrive/デスクトップ/my-project/gas/yawaragi-board/コード.js") | wc -l)"
```
Expected: `DIFF_LINES=0`（改行コード差を除いて一致）。
**差分があれば**: 本番のみの変更＝R1へ取り込んで `chore(gas): 本番取り込み@<版>` でコミット。鏡のみの変更（シフト以外）＝内容を報告して判断を仰ぐ（勝手に push しない）。

- [ ] **Step 3: 一時ディレクトリを削除**

```bash
cd /c/dev/yawaragi-apps && rm -rf /c/tmp/gas-pull-teirei
```

### Task 0.3: gas-source-git-sync を完了マーク

- [ ] **Step 1: 完了APIを叩く（既存action・push不要）**

```bash
curl -s "https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec?action=completePendingTask&id=gas-source-git-sync" -L
```
Expected: `{"ok":true,"id":"gas-source-git-sync","completed":true,...,"verified":true}`。
`verified:true` でなければ成功扱いにしない（再実行 or 報告）。

---

## Phase 1: GAS実装（純関数TDD→転記→承認後デプロイ）

### Task 1.1: 純関数テスト＋実装を書く（テストファイルが正本）

**Files:**
- Create: `C:\Users\mh\OneDrive\デスクトップ\my-project\scripts\test-teirei-tasks.js`

- [ ] **Step 1: テストファイルを作成（純関数実装＋テスト同居・自己完結）**

```js
// test-teirei-tasks.js — 月次定例タスクの純関数テスト（GAS コード.js と二重持ち・こちらが正本）
// 実行: node scripts/test-teirei-tasks.js
'use strict';

// ===== 純関数（コード.js へ同一コードを転記する） =====
// task: {id,title,freq,months,startDay,dueDay,...}, ym: 'YYYY-MM'
function teireiAppliesToMonth_(task, ym) {
  var freq = String(task.freq || 'monthly');
  if (freq === 'monthly') return true;
  var m = parseInt(String(ym).slice(5, 7), 10);
  var months = String(task.months || '').split(',')
    .map(function (s) { return parseInt(s, 10); })
    .filter(function (n) { return !isNaN(n); });
  if (!months.length) return false; // quarterly/yearly で months 未指定は出さない（設定ミスを黙って毎月出すより安全）
  return months.indexOf(m) !== -1;
}
// day: 今日の日(1-31)。表示前=hidden／期限超過=overdue（消さない・⚠⚠）／期限3日前〜=warn
function teireiUrgency_(startDay, dueDay, day) {
  if (day < startDay) return 'hidden';
  if (day > dueDay) return 'overdue';
  if (dueDay - day <= 3) return 'warn';
  return 'normal';
}
// tasks: マスタ配列（enabled除外済み）, doneKeys: ['taskId|YYYY-MM',...], dateStr: 'YYYY-MM-DD'
// 返り値: 当月対象タスク全件（done/hidden含む・UI用）を dueDay 昇順で。
function teireiDecision_(tasks, doneKeys, dateStr) {
  var ym = String(dateStr).slice(0, 7);
  var day = parseInt(String(dateStr).slice(8, 10), 10);
  var out = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!teireiAppliesToMonth_(t, ym)) continue;
    var done = doneKeys.indexOf(t.id + '|' + ym) !== -1;
    var urgency = teireiUrgency_(t.startDay, t.dueDay, day);
    out.push({
      id: t.id, title: t.title, startDay: t.startDay, dueDay: t.dueDay,
      source: t.source || '', dest: t.dest || '', note: t.note || '',
      done: done, urgency: urgency,
      show: (!done && urgency !== 'hidden') // 「終わるまで方式」: 消えるのは done の時だけ。overdue でも出す。
    });
  }
  out.sort(function (a, b) { return (a.dueDay - b.dueDay) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  return out;
}

// ===== テスト =====
var failures = 0;
function eq(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log('  OK ' + label); }
  else { failures++; console.log('  NG ' + label + '\n     actual=' + a + '\n     expect=' + e); }
}
function mk(over) { // テスト用タスク生成
  var base = { id: 't1', title: 'T', freq: 'monthly', months: '', startDay: 1, dueDay: 10, source: '', dest: '', note: '' };
  for (var k in over) base[k] = over[k];
  return base;
}

console.log('teireiAppliesToMonth_');
eq('monthly は常に対象', teireiAppliesToMonth_(mk({}), '2026-07'), true);
eq('quarterly 一致月', teireiAppliesToMonth_(mk({ freq: 'quarterly', months: '1,4,7,10' }), '2026-07'), true);
eq('quarterly 不一致月', teireiAppliesToMonth_(mk({ freq: 'quarterly', months: '1,4,7,10' }), '2026-08'), false);
eq('yearly 一致月', teireiAppliesToMonth_(mk({ freq: 'yearly', months: '4' }), '2026-04'), true);
eq('yearly 不一致月', teireiAppliesToMonth_(mk({ freq: 'yearly', months: '4' }), '2026-07'), false);
eq('months 空の quarterly は出さない', teireiAppliesToMonth_(mk({ freq: 'quarterly', months: '' }), '2026-07'), false);
eq('months ゴミ混入は無視', teireiAppliesToMonth_(mk({ freq: 'quarterly', months: '7,x' }), '2026-07'), true);

console.log('teireiUrgency_');
eq('開始日前は hidden', teireiUrgency_(20, 25, 19), 'hidden');
eq('開始日当日は normal', teireiUrgency_(20, 25, 20), 'normal');
eq('期限4日前は normal', teireiUrgency_(1, 10, 6), 'normal');
eq('期限3日前は warn', teireiUrgency_(1, 10, 7), 'warn');
eq('期限当日は warn', teireiUrgency_(1, 10, 10), 'warn');
eq('期限翌日は overdue', teireiUrgency_(1, 10, 11), 'overdue');
eq('月末でも overdue のまま（自動消滅しない）', teireiUrgency_(1, 10, 31), 'overdue');

console.log('teireiDecision_');
var tasks = [
  mk({ id: 'late', startDay: 20, dueDay: 25 }),
  mk({ id: 'early', startDay: 1, dueDay: 10 }),
  mk({ id: 'q', freq: 'quarterly', months: '1,4,7,10', startDay: 1, dueDay: 25 }),
];
var d1 = teireiDecision_(tasks, [], '2026-07-05');
eq('dueDay 昇順ソート', d1.map(function (t) { return t.id; }), ['early', 'late', 'q']);
eq('開始前タスクは show=false', d1.filter(function (t) { return t.id === 'late'; })[0].show, false);
eq('開始済みタスクは show=true', d1.filter(function (t) { return t.id === 'early'; })[0].show, true);
eq('quarterly 対象月は含まれる', d1.some(function (t) { return t.id === 'q'; }), true);
var d2 = teireiDecision_(tasks, ['early|2026-07'], '2026-07-05');
eq('当月完了済みは show=false', d2.filter(function (t) { return t.id === 'early'; })[0].show, false);
eq('当月完了済みは done=true', d2.filter(function (t) { return t.id === 'early'; })[0].done, true);
var d3 = teireiDecision_(tasks, ['early|2026-06'], '2026-07-05');
eq('先月の完了は当月に効かない（月次自動再出現）', d3.filter(function (t) { return t.id === 'early'; })[0].show, true);
var d4 = teireiDecision_(tasks, [], '2026-07-12');
eq('期限超過でも show=true（終わるまで方式）', d4.filter(function (t) { return t.id === 'early'; })[0].show, true);
eq('期限超過は urgency=overdue', d4.filter(function (t) { return t.id === 'early'; })[0].urgency, 'overdue');
var d5 = teireiDecision_(tasks, [], '2026-08-05');
eq('quarterly 非対象月は一覧に出ない', d5.some(function (t) { return t.id === 'q'; }), false);

console.log(failures === 0 ? '\nALL PASS' : '\nFAILURES: ' + failures);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: テスト実行（全パス確認）**

```bash
cd "/c/Users/mh/OneDrive/デスクトップ/my-project" && node scripts/test-teirei-tasks.js
```
Expected: `ALL PASS`・exit 0。落ちたら実装（テストファイル内の純関数）を直す。

- [ ] **Step 3: コミット**

```bash
git add scripts/test-teirei-tasks.js
git commit -m "test(teirei): 月次定例タスク純関数（appliesToMonth/urgency/decision）テスト+実装"
```

### Task 1.2: コード.js へ GAS 実装を追加

**Files:**
- Modify: `C:\Users\mh\OneDrive\デスクトップ\my-project\gas\yawaragi-board\コード.js`
  - (a) doGet に action 4本（1048行付近 `morningDigest` 分岐の直後）
  - (b) morningDigest 関数に `safe('teirei', ...)`（`safe('shift', ...)` の直後・5833行付近）
  - (c) ファイル末尾付近（shift 実装ブロックの後）に teirei 実装一式

- [ ] **Step 1: doGet に action 分岐を追加**

`if (e && e.parameter && e.parameter.action === 'morningDigest') {...}` ブロックの**直後**に挿入:

```js
  if (e && e.parameter && e.parameter.action === 'teireiList') {
    return respond(teireiListAction_(SpreadsheetApp.openById(SS_ID), _shiftDateParam_(e)), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'completeTeirei') {
    return respond(completeTeireiAction_(SpreadsheetApp.openById(SS_ID), e.parameter.id, e.parameter.month, e.parameter.note), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'uncompleteTeirei') {
    return respond(uncompleteTeireiAction_(SpreadsheetApp.openById(SS_ID), e.parameter.id, e.parameter.month), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'setupTeireiSheets') {
    return respond(setupTeireiSheets_(SpreadsheetApp.openById(SS_ID)), e.parameter.callback);
  }
```

- [ ] **Step 2: morningDigest に teirei セクションを追加**

`safe('shift', function () { ... });` の**直後**に挿入:

```js
  // 月次定例タスク（終わるまで方式・完了記録でのみ消える・2026-07-02）
  // 設計書: docs/superpowers/specs/2026-07-02-月次定例タスク-morningDigest統合-design.md (yawaragi-apps)
  safe('teirei', function () {
    return _digestTeirei_(ss, dateStr);
  });
```

- [ ] **Step 3: teirei 実装一式をファイル末尾付近（shift ブロックの後）に追加**

```js
// =============================================================
// 月次定例タスク リマインド（2026-07-02）
//   シフト公開リマインドの一般化: マスタ＋完了記録(taskId×YYYY-MM)の2シートを
//   表示時に動的判定（トリガーレス）。「終わるまで方式」＝日付経過で消えない・
//   完了記録の行が書かれた時だけ消え、翌月また自動で出る。
//   純関数3つは scripts/test-teirei-tasks.js と同一実装（二重持ち・あちらが正本）。
// =============================================================
var TEIREI_MASTER_SHEET = '定例タスクマスタ';
var TEIREI_MASTER_HEADER = ['id', 'title', 'freq', 'months', 'startDay', 'dueDay', 'source', 'dest', 'note', 'enabled'];
var TEIREI_DONE_SHEET = '定例タスク完了記録';
var TEIREI_DONE_HEADER = ['taskId', 'month', 'doneAt', 'by', 'note'];
// 初期シード（設計書§8確定版・既存idはスキップ＝冪等）
var TEIREI_SEED = [
  { id: 'kokuhoren-densou', title: '国保連請求確定→けあ蔵伝送（10日17:00・受付完了まで確認）', freq: 'monthly', months: '', startDay: 1, dueDay: 10, source: 'リハブ 国保連請求管理→けあ蔵 伝送ファイル登録', dest: 'Drive 請求業務証跡', note: '国保連最終は10日24:00（最後の砦）。11日以降リハブ変更不可' },
  { id: 'kinmu-csv', title: 'タスクマン（朝野さん）へ勤務実績CSV送付', freq: 'monthly', months: '', startDay: 1, dueDay: 10, source: 'ケアズ CSVエクスポート', dest: 'ChatWork', note: '研修時間は勤務時間へ手加算・有給残なしの休みは欠勤登録' },
  { id: 'densan-furikae', title: '電算 口座振替7ステップ（結果DL→リハブ取込→請求書→全銀出力→UP）', freq: 'monthly', months: '', startDay: 10, dueDay: 17, source: '電算 DSK口座振替サービス＋リハブ 利用者請求', dest: 'Drive 請求業務証跡', note: '正確な締切=振替日の8営業日前正午（reference_電算スケジュール2026.md・朝の報告が毎朝明示）。入金明細DL=①結果データDLに含む（2026-07-02判定）' },
  { id: 'carezou-tsuchisho', title: 'けあ蔵: 支払決定額通知書・内訳書DL', freq: 'monthly', months: '', startDay: 20, dueDay: 25, source: 'けあ蔵 国保伝送メニュー→通知文書（配信20〜23日）', dest: 'Drive 経理・月次書類\\{年}年{月}月分\\', note: 'アシタエ⑦⑧-1⑧-2の元データ' },
  { id: 'carezou-shoguu', title: 'けあ蔵: 処遇改善加算等お知らせDL→社労士（朝野さん）転送', freq: 'monthly', months: '', startDay: 20, dueDay: 25, source: 'けあ蔵（配信21〜23日頃・実績 R8年4月審査分=5/21）', dest: 'Drive 社労士提出用_YYYYMM', note: '社長回答2026-07-02: ⚠は25日までに未完なら（21日固定にしない）' },
  { id: 'ashitae-package', title: 'アシタエ12ファイル（前月サービス分）をChatWorkで送付', freq: 'monthly', months: '', startDay: 20, dueDay: 25, source: 'Drive 月別フォルダ（対応表=請求フロー_月次チェックリスト_v4.md）', dest: 'ChatWork 篠崎彰人先生ルーム', note: '領収書3区分は含めない（四半期の別タスク）' },
  { id: 'ryoshusho-3kubun', title: '領収書3区分（現金/クレカ/通帳）の原本を四半期分まとめて提出', freq: 'quarterly', months: '1,4,7,10', startDay: 1, dueDay: 25, source: '領収書原本（3ヶ月分）', dest: 'アシタエへ郵送/手渡し', note: '提出月は仮確定（2026-07-02）。違っていれば months を修正' }
];

// --- 純関数（scripts/test-teirei-tasks.js と同一実装・二重持ち）---
function teireiAppliesToMonth_(task, ym) {
  var freq = String(task.freq || 'monthly');
  if (freq === 'monthly') return true;
  var m = parseInt(String(ym).slice(5, 7), 10);
  var months = String(task.months || '').split(',')
    .map(function (s) { return parseInt(s, 10); })
    .filter(function (n) { return !isNaN(n); });
  if (!months.length) return false; // quarterly/yearly で months 未指定は出さない（設定ミスを黙って毎月出すより安全）
  return months.indexOf(m) !== -1;
}
function teireiUrgency_(startDay, dueDay, day) {
  if (day < startDay) return 'hidden';
  if (day > dueDay) return 'overdue';
  if (dueDay - day <= 3) return 'warn';
  return 'normal';
}
function teireiDecision_(tasks, doneKeys, dateStr) {
  var ym = String(dateStr).slice(0, 7);
  var day = parseInt(String(dateStr).slice(8, 10), 10);
  var out = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!teireiAppliesToMonth_(t, ym)) continue;
    var done = doneKeys.indexOf(t.id + '|' + ym) !== -1;
    var urgency = teireiUrgency_(t.startDay, t.dueDay, day);
    out.push({
      id: t.id, title: t.title, startDay: t.startDay, dueDay: t.dueDay,
      source: t.source || '', dest: t.dest || '', note: t.note || '',
      done: done, urgency: urgency,
      show: (!done && urgency !== 'hidden') // 「終わるまで方式」: 消えるのは done の時だけ。overdue でも出す。
    });
  }
  out.sort(function (a, b) { return (a.dueDay - b.dueDay) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  return out;
}

// --- I/O（GAS固有）---
// month セルは日付型に化けることがある（シートの自動解釈）→ 'yyyy-MM' 文字列へ正規化。
function teireiMonthKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
}
// マスタを読む（enabled=TRUE の行だけ）。シート無し/空は []。
function readTeireiMaster_(ss) {
  var sheet = ss.getSheetByName(TEIREI_MASTER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var id = String(r[0] || '').trim();
    if (!id) continue;
    if (!isDone_(r[9])) continue; // enabled（isDone_ はチェックボックス/文字列を真偽正規化する既存関数）
    out.push({
      id: id, title: String(r[1] || ''), freq: String(r[2] || 'monthly'), months: String(r[3] || ''),
      startDay: parseInt(r[4], 10) || 1, dueDay: parseInt(r[5], 10) || 28,
      source: String(r[6] || ''), dest: String(r[7] || ''), note: String(r[8] || '')
    });
  }
  return out;
}
// 完了記録を 'taskId|yyyy-MM' キー配列で読む。シート無しは []。
function readTeireiDoneKeys_(ss) {
  var sheet = ss.getSheetByName(TEIREI_DONE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    var month = teireiMonthKey_(values[i][1]);
    if (id && month) out.push(id + '|' + month);
  }
  return out;
}
// morningDigest 用セクション（show=true のみ・dueDay 昇順）。
function _digestTeirei_(ss, dateStr) {
  var all = teireiDecision_(readTeireiMaster_(ss), readTeireiDoneKeys_(ss), dateStr);
  var tasks = all.filter(function (t) { return t.show; });
  var overdue = 0;
  tasks.forEach(function (t) { if (t.urgency === 'overdue') overdue++; });
  return {
    month: String(dateStr).slice(0, 7),
    count: tasks.length,
    overdueCount: overdue,
    tasks: tasks.map(function (t) {
      return { id: t.id, title: t.title, dueDay: t.dueDay, urgency: t.urgency, source: t.source, dest: t.dest };
    })
  };
}
// 一覧アクション（UI用・hidden/done 含む全件）。
function teireiListAction_(ss, dateStr) {
  return {
    ok: true, date: dateStr, month: String(dateStr).slice(0, 7),
    tasks: teireiDecision_(readTeireiMaster_(ss), readTeireiDoneKeys_(ss), dateStr)
  };
}
// 初期セットアップ：2シート作成＋ヘッダ＋シード（既存idスキップ＝冪等）＋enabled列チェックボックス＋month列を文字列書式に。
function setupTeireiSheets_(ss) {
  var master = ss.getSheetByName(TEIREI_MASTER_SHEET);
  if (!master) {
    master = ss.insertSheet(TEIREI_MASTER_SHEET);
    master.getRange(1, 1, 1, TEIREI_MASTER_HEADER.length).setValues([TEIREI_MASTER_HEADER]);
    master.getRange(1, 1, 1, TEIREI_MASTER_HEADER.length).setFontWeight('bold');
    master.setFrozenRows(1);
  }
  var values = master.getDataRange().getValues();
  var existing = {};
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    if (id) existing[id] = true;
  }
  var added = [];
  TEIREI_SEED.forEach(function (t) {
    if (existing[t.id]) return;
    master.appendRow([t.id, t.title, t.freq, t.months, t.startDay, t.dueDay, t.source, t.dest, t.note, true]);
    added.push(t.id);
  });
  var last = master.getLastRow();
  if (last >= 2) master.getRange(2, 10, last - 1, 1).insertCheckboxes(); // enabled 列
  var done = ss.getSheetByName(TEIREI_DONE_SHEET);
  var doneCreated = false;
  if (!done) {
    done = ss.insertSheet(TEIREI_DONE_SHEET);
    done.getRange(1, 1, 1, TEIREI_DONE_HEADER.length).setValues([TEIREI_DONE_HEADER]);
    done.getRange(1, 1, 1, TEIREI_DONE_HEADER.length).setFontWeight('bold');
    done.setFrozenRows(1);
    doneCreated = true;
  }
  done.getRange('B:B').setNumberFormat('@'); // month を '2026-07' のまま保持（日付化防止）
  return { ok: true, master: TEIREI_MASTER_SHEET, done: TEIREI_DONE_SHEET, added: added, doneCreated: doneCreated };
}
// 完了アクション：冪等／id無効は明示／書込後に読み直して検証。成功したフリをしない。
function completeTeireiAction_(ss, id, month, note) {
  var taskId = String(id || '').trim();
  if (!taskId) return { ok: false, error: 'missing_id' };
  var ym = String(month || '').trim() || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: 'bad_month', month: ym };
  var known = readTeireiMaster_(ss).some(function (t) { return t.id === taskId; });
  if (!known) return { ok: false, error: 'no_such_id', id: taskId };
  var sheet = ss.getSheetByName(TEIREI_DONE_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet' };
  if (readTeireiDoneKeys_(ss).indexOf(taskId + '|' + ym) !== -1) {
    return { ok: true, id: taskId, month: ym, completed: true, alreadyDone: true, verified: true };
  }
  sheet.appendRow([taskId, ym, Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), 'api', String(note || '')]);
  SpreadsheetApp.flush();
  if (readTeireiDoneKeys_(ss).indexOf(taskId + '|' + ym) === -1) {
    return { ok: false, error: 'verify_failed', id: taskId, month: ym, verified: false };
  }
  return { ok: true, id: taskId, month: ym, completed: true, alreadyDone: false, verified: true };
}
// 完了取消（誤操作の戻し）：該当行を削除→読み直しで消えたことを検証。
function uncompleteTeireiAction_(ss, id, month) {
  var taskId = String(id || '').trim();
  var ym = String(month || '').trim() || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  if (!taskId) return { ok: false, error: 'missing_id' };
  var sheet = ss.getSheetByName(TEIREI_DONE_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet' };
  var values = sheet.getDataRange().getValues();
  var rowNum = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === taskId && teireiMonthKey_(values[i][1]) === ym) { rowNum = i + 1; break; }
  }
  if (rowNum === -1) return { ok: false, error: 'no_such_record', id: taskId, month: ym };
  sheet.deleteRow(rowNum);
  SpreadsheetApp.flush();
  if (readTeireiDoneKeys_(ss).indexOf(taskId + '|' + ym) !== -1) {
    return { ok: false, error: 'verify_failed', id: taskId, month: ym, verified: false };
  }
  return { ok: true, id: taskId, month: ym, uncompleted: true, verified: true };
}
```

- [ ] **Step 4: 純関数の転記同一性を確認**

```bash
cd "/c/Users/mh/OneDrive/デスクトップ/my-project"
awk '/^function teireiAppliesToMonth_/,/^}/' scripts/test-teirei-tasks.js > /c/tmp/teirei-a.txt
awk '/^function teireiAppliesToMonth_/,/^}/' "gas/yawaragi-board/コード.js" | sed 's/\r$//' > /c/tmp/teirei-b.txt
diff /c/tmp/teirei-a.txt /c/tmp/teirei-b.txt && echo SAME_1
awk '/^function teireiUrgency_/,/^}/' scripts/test-teirei-tasks.js > /c/tmp/teirei-a.txt
awk '/^function teireiUrgency_/,/^}/' "gas/yawaragi-board/コード.js" | sed 's/\r$//' > /c/tmp/teirei-b.txt
diff /c/tmp/teirei-a.txt /c/tmp/teirei-b.txt && echo SAME_2
awk '/^function teireiDecision_/,/^}/' scripts/test-teirei-tasks.js > /c/tmp/teirei-a.txt
awk '/^function teireiDecision_/,/^}/' "gas/yawaragi-board/コード.js" | sed 's/\r$//' > /c/tmp/teirei-b.txt
diff /c/tmp/teirei-a.txt /c/tmp/teirei-b.txt && echo SAME_3
node scripts/test-teirei-tasks.js
```
Expected: SAME_1/SAME_2/SAME_3 が全部出て、テスト `ALL PASS`。

- [ ] **Step 5: コミット**

```bash
git add "gas/yawaragi-board/コード.js"
git commit -m "feat(teirei): 月次定例タスクGAS実装（2シート動的判定・action4本・morningDigest teireiセクション）"
```

### Task 1.3: 🔒【社長承認ゲート】デプロイ→実機検証

**社長の明示承認を得てから進む。承認前に clasp push しない。**

- [ ] **Step 1: push→既存デプロイIDで版上げ**

```bash
cd "/c/Users/mh/OneDrive/デスクトップ/my-project/gas/yawaragi-board"
clasp push -f
clasp deploy -i "AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw" -d "teirei月次定例タスク追加"
```
Expected: push成功＋deploy成功（`- AKfycbwo1UGx... @<新版>` 表示）。新規デプロイ作成は禁止。

- [ ] **Step 2: シート初期化（1回だけ）**

```bash
curl -s "https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec?action=setupTeireiSheets" -L
```
Expected: `{"ok":true,...,"added":["kokuhoren-densou","kinmu-csv","densan-furikae","carezou-tsuchisho","carezou-shoguu","ashitae-package","ryoshusho-3kubun"],...}`（2回目実行なら added:[] ＝冪等確認を兼ねる）。

- [ ] **Step 3: 実機検証（一覧→完了→読み戻し→取消→digest）**

```bash
EXEC="https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec"
# (1) 一覧: 7件返る・dueDay昇順
curl -s "$EXEC?action=teireiList" -L
# (2) テスト完了→verified:true
curl -s "$EXEC?action=completeTeirei&id=kinmu-csv&month=2099-01" -L
# (3) 冪等: 再実行→alreadyDone:true
curl -s "$EXEC?action=completeTeirei&id=kinmu-csv&month=2099-01" -L
# (4) 存在しないid→no_such_id
curl -s "$EXEC?action=completeTeirei&id=zzz-none" -L
# (5) テストデータ掃除→verified:true
curl -s "$EXEC?action=uncompleteTeirei&id=kinmu-csv&month=2099-01" -L
# (6) digest に teirei が出る
curl -s "$EXEC?action=morningDigest" -L | head -c 3000
```
Expected: 各コメントどおり。(6) で `"teirei":{"month":"...","count":N,...}` がある。month=2099-01 を使うのは当月の実データを汚さないため。(5) の掃除まで必ずやる。
**検証が1つでも落ちたら成功と報告しない。**

---

## Phase 2: morning-digest.ps1＋朝の報告スキル

### Task 2.1: morning-digest.ps1 に teirei 表示＋シグナル加算

**Files:**
- Modify: `C:\Users\mh\OneDrive\デスクトップ\my-project\scripts\morning-digest.ps1`

- [ ] **Step 1: Get-DigestSignal に加算行を追加**

`$sum += [int]$s.monitoringExpiring.count` の行の**直後**に追加:

```powershell
  if ($s.teirei -and $s.teirei.PSObject.Properties.Match('count').Count) { $sum += [int]$s.teirei.count }
```

- [ ] **Step 2: シフト表示ブロック（`# 10. シフト`）の直後・`WL ("=" * 48)` の前に表示ブロックを追加**

```powershell
# 11. 月次定例タスク（終わるまで方式・完了記録でのみ消える・期限順）
$tr = $s.teirei
if ($tr) {
  $trTasks = @($tr.tasks)
  if ($trTasks.Count -gt 0) {
    WL "[!] 月次定例タスク 未完 $($trTasks.Count) 件（期限順）" Yellow
    foreach ($t in $trTasks) {
      $mark = ''
      if ($t.urgency -eq 'overdue') { $mark = '[!!] 超過 ' }
      elseif ($t.urgency -eq 'warn') { $mark = '[!] ' }
      WL "   - $mark$($t.title)（〜$($t.dueDay)日）"
    }
  } else {
    WL "[OK] 月次定例タスク: 当月分すべて完了 or 対象期間外"
  }
}
```
※ teirei セクション不在（GAS未デプロイ）でも `if ($tr)` で無害にスキップされる。

- [ ] **Step 3: 実行確認**

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\mh\OneDrive\デスクトップ\my-project\scripts\morning-digest.ps1"
```
Expected: 「月次定例タスク 未完 N 件（期限順）」ブロックが出る（当日日付により件数は変わる。7/2 なら kokuhoren-densou・kinmu-csv・ryoshusho-3kubun が候補）。エラーで止まらないこと。

- [ ] **Step 4: 版確認＋コミット**

```bash
cd "/c/Users/mh/OneDrive/デスクトップ/my-project"
wc -c scripts/morning-digest.ps1   # OneDrive巻き戻り対策: 変更後のバイト数を記録しておく
grep -c "月次定例タスク" scripts/morning-digest.ps1   # Expected: 2以上
git add scripts/morning-digest.ps1
git commit -m "feat(teirei): morning-digest.ps1 に月次定例タスク表示+シグナル加算"
```

### Task 2.2: 朝の報告スキルへ追記

**Files:**
- Modify: `C:\Users\mh\.claude\skills\朝の報告\SKILL.md`（git外・OneDrive巻き戻り注意）

- [ ] **Step 1: Step 4（今日の締切リマインド）セクションの末尾に追記**

```markdown
#### 📅 月次定例タスク（morningDigest sections.teirei・終わるまで方式）

- morning-digest.ps1 の「月次定例タスク」ブロックをそのまま報告に含める（期限順・[!!]超過は先頭で強調）。
- 社長が「〇〇やった」と完了報告したら `EXEC?action=completeTeirei&id=<taskId>` を叩き、`verified:true` を確認してから「消しました」と言う（idは teireiList で確認）。
- 誤って完了にした場合は `uncompleteTeirei&id=<taskId>&month=YYYY-MM`。
- タスクの追加・日付変更はスプレッドシート「定例タスクマスタ」を直接編集（enabled チェックでON/OFF）。
- 国保連・電算UPは既存カウントダウン（本Step上部）と両方に出る＝過剰リマインド容認（社長決定 2026-07-02）。
```

- [ ] **Step 2: 追記の確認**

```bash
grep -c "月次定例タスク" "/c/Users/mh/.claude/skills/朝の報告/SKILL.md"
```
Expected: 1以上。

---

## Phase 3: 管理UI（teirei.html）＋admin.html リンク

### Task 3.1: teirei.html を新規作成

**Files:**
- Create: `c:\dev\yawaragi-apps\teirei.html`

- [ ] **Step 1: ファイル作成（完全コード）**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>📅 月次定例タスク（社長用）</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif; background: #f0f4f8; min-height: 100vh; padding: 16px; }
h1 { text-align: center; color: #2c3e50; font-size: 1.4em; margin-bottom: 4px; }
.subtitle { text-align: center; color: #7f8c8d; font-size: 0.85em; margin-bottom: 16px; }
.wrap { max-width: 720px; margin: 0 auto; }
.card { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; border-left: 6px solid #b0bec5; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.card.normal { border-left-color: #42a5f5; }
.card.warn { border-left-color: #ffa726; background: #fff8ef; }
.card.overdue { border-left-color: #ef5350; background: #fdeeee; }
.card.done { border-left-color: #66bb6a; opacity: .55; }
.card.hidden-task { border-left-color: #cfd8dc; opacity: .55; }
.title { font-weight: 700; color: #2c3e50; margin-bottom: 4px; }
.meta { font-size: .8em; color: #607d8b; line-height: 1.5; }
.due { font-weight: 700; }
.due.overdue-t { color: #c62828; }
.due.warn-t { color: #e65100; }
.row { display: flex; align-items: center; gap: 10px; }
.row .info { flex: 1; }
button { border: none; border-radius: 8px; padding: 10px 14px; font-size: .9em; font-weight: 700; cursor: pointer; white-space: nowrap; }
.btn-done { background: #43a047; color: #fff; }
.btn-undo { background: #eceff1; color: #546e7a; }
button:disabled { opacity: .5; cursor: wait; }
.pill { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: .78em; font-weight: 700; }
.pill.ok { background: #e8f5e9; color: #2e7d32; }
.pill.ng { background: #ffebee; color: #c62828; }
#status { text-align: center; color: #7f8c8d; padding: 20px; }
.section-label { font-size: .85em; font-weight: 700; color: #78909c; margin: 14px 0 6px; }
</style>
</head>
<body>
<h1>📅 月次定例タスク</h1>
<div class="subtitle" id="monthLabel">— 完了するまで毎朝出ます（終わるまで方式）—</div>
<div class="wrap">
  <div id="status">読み込み中…</div>
  <div id="list"></div>
</div>
<script>
const GAS = 'https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec';
let currentMonth = '';

function esc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

async function load() {
  const status = document.getElementById('status');
  status.textContent = '読み込み中…';
  try {
    const res = await fetch(GAS + '?action=teireiList', { redirect: 'follow' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'teireiList failed');
    currentMonth = data.month;
    document.getElementById('monthLabel').textContent = data.month + ' — 完了するまで毎朝出ます（終わるまで方式）';
    render(data.tasks);
    status.textContent = '';
  } catch (err) {
    status.textContent = '読み込み失敗: ' + err.message + '（リロードしてください）';
  }
}

function render(tasks) {
  const list = document.getElementById('list');
  const active = tasks.filter(t => t.show);
  const doneList = tasks.filter(t => t.done);
  const hiddenList = tasks.filter(t => !t.done && !t.show);
  let html = '';
  if (active.length === 0) html += '<div class="card done"><div class="title">🎉 当月の表示中タスクはすべて完了</div></div>';
  for (const t of active) html += cardHtml(t, 'active');
  if (hiddenList.length) {
    html += '<div class="section-label">⏳ まだ表示期間前（' + hiddenList.length + '件）</div>';
    for (const t of hiddenList) html += cardHtml(t, 'hidden');
  }
  if (doneList.length) {
    html += '<div class="section-label">✅ 当月完了済み（' + doneList.length + '件）</div>';
    for (const t of doneList) html += cardHtml(t, 'done');
  }
  list.innerHTML = html;
}

function cardHtml(t, mode) {
  const cls = mode === 'done' ? 'done' : (mode === 'hidden' ? 'hidden-task' : t.urgency);
  const dueCls = t.urgency === 'overdue' ? 'overdue-t' : (t.urgency === 'warn' ? 'warn-t' : '');
  const dueMark = t.urgency === 'overdue' ? '⚠⚠ 期限超過 ' : (t.urgency === 'warn' ? '⚠ ' : '');
  const btn = mode === 'done'
    ? '<button class="btn-undo" onclick="undoTask(\'' + t.id + '\', this)">戻す</button>'
    : (mode === 'active' ? '<button class="btn-done" onclick="completeTask(\'' + t.id + '\', this)">完了</button>' : '');
  return '<div class="card ' + cls + '" id="card-' + t.id + '">'
    + '<div class="row"><div class="info">'
    + '<div class="title">' + esc(t.title) + '</div>'
    + '<div class="meta"><span class="due ' + dueCls + '">' + dueMark + '期限: 毎月' + t.dueDay + '日</span>'
    + (t.source ? ' ／ 在り処: ' + esc(t.source) : '')
    + (t.dest ? ' ／ 保存先: ' + esc(t.dest) : '')
    + (t.note ? '<br>' + esc(t.note) : '') + '</div>'
    + '<div id="pill-' + t.id + '"></div>'
    + '</div>' + btn + '</div></div>';
}

async function completeTask(id, btn) {
  btn.disabled = true;
  const pill = document.getElementById('pill-' + id);
  pill.innerHTML = '<span class="pill">保存中…</span>';
  try {
    const res = await fetch(GAS + '?action=completeTeirei&id=' + encodeURIComponent(id) + '&month=' + encodeURIComponent(currentMonth) + '&note=' + encodeURIComponent('teirei.html'), { redirect: 'follow' });
    const data = await res.json();
    if (data.ok && data.verified) {
      pill.innerHTML = '<span class="pill ok">✓ 完了を記録し読み戻し検証OK</span>';
      setTimeout(load, 900);
    } else {
      pill.innerHTML = '<span class="pill ng">✗ 検証失敗（' + esc(data.error || 'unknown') + '）— もう一度押してください</span>';
      btn.disabled = false;
    }
  } catch (err) {
    pill.innerHTML = '<span class="pill ng">✗ 通信失敗 — もう一度押してください</span>';
    btn.disabled = false;
  }
}

async function undoTask(id, btn) {
  btn.disabled = true;
  const pill = document.getElementById('pill-' + id);
  pill.innerHTML = '<span class="pill">取消中…</span>';
  try {
    const res = await fetch(GAS + '?action=uncompleteTeirei&id=' + encodeURIComponent(id) + '&month=' + encodeURIComponent(currentMonth), { redirect: 'follow' });
    const data = await res.json();
    if (data.ok && data.verified) {
      pill.innerHTML = '<span class="pill ok">✓ 取消し読み戻し検証OK</span>';
      setTimeout(load, 900);
    } else {
      pill.innerHTML = '<span class="pill ng">✗ 取消失敗（' + esc(data.error || 'unknown') + '）</span>';
      btn.disabled = false;
    }
  } catch (err) {
    pill.innerHTML = '<span class="pill ng">✗ 通信失敗</span>';
    btn.disabled = false;
  }
}

load();
</script>
</body>
</html>
```

- [ ] **Step 2: ローカル動作確認（GAS は Task 1.3 デプロイ済み前提）**

teirei.html をブラウザで開き（`file:///c:/dev/yawaragi-apps/teirei.html` で可・GETのみなのでオリジン非依存）:
- 一覧が出る（当日日付相当の表示・期限順）
- どれか1件「完了」→ 緑ピル「✓ 完了を記録し読み戻し検証OK」→ 再読込で完了済みセクションへ移動
- 「戻す」→ 緑ピル → 未完に戻る

の3点を確認。**確認後は必ず「戻す」でテスト完了を掃除する。**

### Task 3.2: admin.html に導線を追加

**Files:**
- Modify: `c:\dev\yawaragi-apps\admin.html`（139-143行「🏖️ 社長専用」セクション）

- [ ] **Step 1: 有給管理ボタンの隣に追加**

変更前:
```html
  <div class="apps">
    <a class="app-btn" href="yukyu.html"><span class="icon">🏖️</span>有給管理</a>
  </div>
```
変更後:
```html
  <div class="apps">
    <a class="app-btn" href="yukyu.html"><span class="icon">🏖️</span>有給管理</a>
    <a class="app-btn" href="teirei.html"><span class="icon">📅</span>月次定例タスク</a>
  </div>
```

### Task 3.3: コミット→🔒【社長承認ゲート】master push→本番確認

- [ ] **Step 1: コミット（作業ブランチ）**

```bash
cd /c/dev/yawaragi-apps
git add teirei.html admin.html
git commit -m "feat(teirei): 月次定例タスク管理UI（完了チェック+読み戻し検証ピル）とadmin導線"
```

- [ ] **Step 2: 🔒 社長承認を得てから master へ反映**

teirei.html/admin.html は no-store のため version.txt 版ゲート（bump-app-version.js）は不要。隔離 worktree（C:\tmp\ 配下）で origin/master へ cherry-pick → ff push（docs反映と同じ手順・ただし**本番アプリ配信なので承認必須**）:

```bash
git fetch origin master
git worktree add /c/tmp/wt-teirei-app origin/master
cd /c/tmp/wt-teirei-app
git cherry-pick <Step1のSHA>
git push origin HEAD:master; echo "PUSH_EXIT=$?"
cd /c/dev/yawaragi-apps && git worktree remove /c/tmp/wt-teirei-app --force
```
Expected: PUSH_EXIT=0。

- [ ] **Step 3: 本番反映確認（fresh fetch + 実URL）**

```bash
git fetch origin master && git show origin/master:teirei.html | grep -c "teireiList"   # Expected: 1以上
curl -s "https://m-higa-sys.github.io/yawaragi-apps/teirei.html" | grep -c "月次定例タスク"   # Expected: 1以上（Pages反映に数分かかることあり・時間切れを成功にしない）
```

---

## 完了条件（設計書§11・全部揃って完了）

1. `teireiList` / `morningDigest.sections.teirei` に当月の未完タスクが常に出る（Task 1.3 (1)(6) で実証）
2. `morning-digest.ps1` の出力に未完タスクが期限順・⚠付きで出る（Task 2.1 Step 3 で実証）
3. teirei.html で完了チェック（読み戻し検証ピル）でき、完了が翌朝のダイジェストから消える（Task 3.1 Step 2 ＋ 翌朝の朝の報告で最終確認）
4. `node scripts/test-teirei-tasks.js` 全パス（Task 1.1-1.2 で実証）
5. 朝報告残タスク `gas-source-git-sync` が完了済み（Task 0.3）

## 報告ルール

- 各承認ゲート（Task 1.3・Task 3.3 Step 2）は**承認を得るまで進まない**。
- 完了報告は「fresh fetch/clone 後の origin/master への grep」「curl の実レスポンス」「node テストの exit 0」を根拠に。**「非ハング+exit 0」だけを成功の証拠にしない**。検証が落ちたら落ちたと報告する。
