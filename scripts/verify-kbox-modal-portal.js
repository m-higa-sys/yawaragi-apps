// 欠席box モーダル ポータル化の「実測」ハーネス（2026-07-07）
// 実インシデント: box改修-25の移設でbox本体は#tab-attendanceへ移したが、モーダル3つ
// (#kbox-preview-modal/#kbox-summary-modal/#kbox-help-modal)を#tab-absence(display:none)に置き去り。
// 祖先がdisplay:noneのため子にblockを立てても不可視→出席予定タブから内容確認/まとめて送信/使い方が
// 開けなかった。対策=各openでモーダルをbody直下へ退避(ポータル)してからdisplay:block。
//
// このハーネスは genba.html から【実コード】の kbOpenPreview/kbOpenSummary/kbShowHelp を抽出し、
// 「モーダルが display:none の祖先(#tab-absence相当)配下に居る」初期状態から open を実駆動して、
// 開いた後に modal.display==='block' かつ parentNode===document.body（＝不可視祖先の外へ退避済み）を実測する。
// 実行: node scripts/verify-kbox-modal-portal.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name, optional) {
  let start = html.indexOf('function ' + name + '(');
  if (start < 0) { if (optional) return ''; throw new Error('genba.html に function ' + name + '( が無い'); }
  if (html.slice(start - 6, start) === 'async ') start -= 6;
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  for (let j = braceStart; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.log('  [FAIL] ' + label); } }

// ---- 最小DOM（parentNode付き・appendChildで再親化） ----
function makeNode(id, tag) {
  return {
    id: id || '', tagName: tag || 'DIV', style: {}, _children: [], parentNode: null,
    textContent: '', innerHTML: '', value: '',
    appendChild(c) {
      if (c.parentNode) { const a = c.parentNode._children, i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
      c.parentNode = this; this._children.push(c); return c;
    },
  };
}

function buildEnv() {
  const reg = {};
  const body = makeNode('body', 'BODY');
  const tabAbsence = makeNode('tab-absence');   // display:none の祖先タブ（置き去り先）
  const root = makeNode('root'); root.appendChild(tabAbsence);
  // モーダルは初期状態で #tab-absence 配下（＝実バグの再現）
  ['kbox-preview-modal', 'kbox-summary-modal', 'kbox-help-modal'].forEach(id => { const n = makeNode(id); tabAbsence.appendChild(n); reg[id] = n; });
  // モーダル内部要素・box要素
  ['kbox-pv-title', 'kbox-pv-to', 'kbox-pv-body', 'kbox-pv-to-warn', 'kbox-sum-count', 'kbox-sum-list'].forEach(id => { reg[id] = makeNode(id); });
  const document = { getElementById: id => reg[id] || null, body };
  return { document, body, tabAbsence, reg };
}

function bind(env, extraGlobals) {
  const src = [
    extractFn('kbShowModal_', true),   // 修正後に存在（RED時は空）
    extractFn('kbFormatDate_'), extractFn('kbBuildBody_'), extractFn('kbEsc_'),
    extractFn('kbCollectSendTargets_'), extractFn('kbOpenPreview'), extractFn('kbOpenSummary'), extractFn('kbShowHelp'),
    extractFn('kbRenderSumOperators_', true), extractFn('kbSelectSumOperator_', true),   // 2026-07-08: サマリー内 操作者選択
  ].filter(Boolean).join('\n\n');
  const argNames = ['document', 'kbState', 'absReceptionist', 'showToast'].concat(Object.keys(extraGlobals || {}));
  const argVals = [env.document, extraGlobals.kbState, extraGlobals.absReceptionist, function () {}].concat();
  // kbEditing はモジュール内 let。ここでは src 内で宣言される想定でなく、関数外変数なので prelude で用意
  // 2026-07-08: サマリー内 操作者選択の追加に伴い kbSumOperator / getStaff / EXCLUDED_STAFF を用意
  const body = 'let kbEditing = null;\nlet kbSumOperator = "";\n' + src + '\n\nreturn { kbOpenPreview, kbOpenSummary, kbShowHelp };';
  const factory = new Function('document', 'kbState', 'absReceptionist', 'showToast', 'getStaff', 'EXCLUDED_STAFF', body);
  return factory(env.document, extraGlobals.kbState, extraGlobals.absReceptionist, function () {},
    () => ['比嘉', '星野', '勝又', '下浦', '工藤'], ['比嘉']);
}

const kbState = {
  items: [{ name: '利用者066', email: 'utsukushinosato.pc36@gmail.com', cmStaff: '大野勝己', cmOffice: '事業所16', care: '要介護', unit: '午後', date: '2026-07-07', reason: '私用', toOverride: '', customBody: '', cls: { kind: 'mail', done: false } }],
  checked: { '利用者066': true },
};

console.log('■ 3モーダルは出席予定タブ表示中も body 直下へ退避して可視化される');

// kbOpenPreview（内容を見る）
(function () {
  const env = buildEnv();
  const api = bind(env, { kbState, absReceptionist: '勝又' });
  const modal = env.reg['kbox-preview-modal'];
  ok(modal.parentNode === env.tabAbsence, 'P0: 初期はモーダルが#tab-absence(display:none相当)配下＝バグ再現');
  api.kbOpenPreview('利用者066');
  ok(modal.style.display === 'block', 'P1: 内容を見る→ display:block');
  ok(modal.parentNode === env.document.body, 'P2(★): 内容を見る→ モーダルが body 直下へ退避（不可視祖先の外＝可視）');
})();

// kbOpenSummary（まとめて送信）
(function () {
  const env = buildEnv();
  const api = bind(env, { kbState, absReceptionist: '勝又' });
  const modal = env.reg['kbox-summary-modal'];
  api.kbOpenSummary();
  ok(modal.style.display === 'block', 'S1: まとめて送信→ display:block');
  ok(modal.parentNode === env.document.body, 'S2(★): まとめて送信→ モーダルが body 直下へ退避');
})();

// kbShowHelp（使い方）
(function () {
  const env = buildEnv();
  const api = bind(env, { kbState, absReceptionist: '勝又' });
  const modal = env.reg['kbox-help-modal'];
  api.kbShowHelp();
  ok(modal.style.display === 'block', 'H1: 使い方→ display:block');
  ok(modal.parentNode === env.document.body, 'H2(★): 使い方→ モーダルが body 直下へ退避');
})();

// 冪等性: 既に body 直下なら二重移動しない
(function () {
  const env = buildEnv();
  const api = bind(env, { kbState, absReceptionist: '勝又' });
  const modal = env.reg['kbox-preview-modal'];
  api.kbOpenPreview('利用者066');
  const childrenAfter1 = env.document.body._children.filter(c => c === modal).length;
  api.kbOpenPreview('利用者066');
  const childrenAfter2 = env.document.body._children.filter(c => c === modal).length;
  ok(childrenAfter1 === 1 && childrenAfter2 === 1, 'I1: 再オープンでも body 直下に1つ（冪等・二重移動なし）');
})();

console.log('\n実測ハーネス(modal portal): ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
