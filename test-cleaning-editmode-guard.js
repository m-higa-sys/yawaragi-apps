// cleaning.html 編集モードガードの挙動テスト
// 目的: STATE.editMode=true の間、renderTasks / refreshLog / loadIntervalLastDates が
//       #taskContainer を上書きしない（編集UIを壊さない）ことを behavioral に検証する。
//
// 実行: node test-cleaning-editmode-guard.js
//
// 手法: cleaning.html から対象関数のソースを抽出し、vm + Proxy で未定義ヘルパを
//       自動スタブしたサンドボックスで実行。container.innerHTML が保持されるか観測する。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, 'cleaning.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

// --- 対象関数のソースを波括弧マッチで抽出 ---
function extractFn(src, header) {
  const start = src.indexOf(header);
  if (start === -1) throw new Error('関数が見つからない: ' + header);
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// --- 未定義識別子を no-op でスタブするサンドボックス ---
function makeSandbox(STATE, container) {
  const real = {
    STATE: STATE,
    console: console,
    JSON: JSON,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Array: Array,
    Object: Object,
    Math: Math,
    Date: Date,
    Set: Set,
    Promise: Promise,
    RegExp: RegExp,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    document: {
      getElementById: function () { return container; },
      hidden: false,
      body: { classList: { add() {}, remove() {}, contains() { return false; } } }
    },
    window: { scrollY: 0, scrollTo() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }
  };
  const stub = function () { return ''; };
  const handler = {
    has() { return true; }, // すべての自由変数を「解決済み」に見せる
    get(target, prop) {
      if (prop === Symbol.unscopables) return undefined;
      if (prop in real) return real[prop];
      return stub; // 未知ヘルパは値''を返す no-op 関数
    },
    set(target, prop, val) { real[prop] = val; return true; }
  };
  return new Proxy(real, handler);
}

function runRenderTasks(editMode) {
  const src = extractFn(HTML, 'function renderTasks()');
  const container = { innerHTML: 'SENTINEL_EDIT_UI' };
  const STATE = { editMode: editMode, tasks: [], log: [], taskLastDates: {}, monthlyStats: {} };
  const sandbox = makeSandbox(STATE, container);
  const code = 'with (sandbox) { ' + src + ' renderTasks(); }';
  const fn = new Function('sandbox', code);
  try { fn(sandbox); } catch (e) { /* 本文がスタブで例外→ガード未通過の証拠として扱う */ container.__threw = e.message; }
  return container;
}

console.log('== renderTasks editMode ガード ==');

// red の狙い: ガード未実装だと editMode=true でも本文が走り innerHTML が SENTINEL でなくなる
const editing = runRenderTasks(true);
ok('editMode=true では #taskContainer を上書きしない（SENTINEL保持）',
   editing.innerHTML === 'SENTINEL_EDIT_UI');

// 過剰ブロック検知: editMode=false では本文へ進む（SENTINELのままではない or 例外で本文到達）
const normal = runRenderTasks(false);
ok('editMode=false では本文へ進む（ガードで止めない）',
   normal.innerHTML !== 'SENTINEL_EDIT_UI' || !!normal.__threw);

console.log('== refreshLog / loadIntervalLastDates 冒頭ガードの静的確認 ==');
// 最初の実行文が editMode 早期リターンであること（コメント行は許容し、コメント除去して判定）
function firstStatementIsEditGuard(fnSrc) {
  const body = fnSrc.slice(fnSrc.indexOf('{') + 1);
  const stripped = body.replace(/\/\/[^\n]*\n/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return /^\s*if\s*\(\s*STATE\.editMode\s*\)\s*return\s*;/.test(stripped);
}
const refreshSrc = extractFn(HTML, 'async function refreshLog()');
ok('refreshLog 冒頭(最初の実行文)に editMode 早期リターンがある',
   firstStatementIsEditGuard(refreshSrc));
const intervalSrc = extractFn(HTML, 'async function loadIntervalLastDates()');
ok('loadIntervalLastDates 冒頭(最初の実行文)に editMode 早期リターンがある',
   firstStatementIsEditGuard(intervalSrc));

console.log('\n結果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
