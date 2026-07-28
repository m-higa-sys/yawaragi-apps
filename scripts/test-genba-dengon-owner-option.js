// 伝達ボード「社長」宛オプションのjsdom統合テスト（2026-07-29）
//
// 守る失敗モード:
//   dengonRenderToSelect_() は sel.innerHTML = html で宛先selectを丸ごと作り直す。
//   静的HTMLに <option value="社長"> を足しただけだと、スタッフマスタ読み込み時に
//   消えてしまい to==='社長' を一度も生成できない（＝notify@メールが永久に飛ばない）。
//   静的HTML側とJS再構築側の両方に入っていることを実測で担保する。
//
// value は文字列 '社長' 完全一致であること。サーバ側 addDengonMessage が
//   String(data.to).trim() === '社長'
// で判定するため、'社長(0)' のように人数が付くと発火しない。
//
// 実行: node scripts/test-genba-dengon-owner-option.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: ['C:/tmp/node_modules', 'C:/tmp'] }));
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name + '(';
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

const MASTER = [
  { name: '比嘉', role: '代表', employ: '−', active: true },
  { name: '勝又', role: '相談員', employ: '社員', active: true },
  { name: '髙山', role: '看護師', employ: 'パート', active: true },
  { name: '退職者', role: '介護', employ: 'パート', active: false },
];

const FN = ['dengonComputeRecipients_', 'dengonRenderToSelect_', 'escapeHtml'];

const dom = new JSDOM('<!DOCTYPE html><body><select id="dengon-to"></select></body>');
const sb = {};
const src = FN.map(extractFn).join('\n') + '\n' +
  'var dengonStaffMaster = MASTER;\n' +
  'sb.renderSelect = dengonRenderToSelect_;';
new Function('sb', 'document', 'MASTER', src)(sb, dom.window.document, MASTER);
const doc = dom.window.document;

let pass = 0, fail = 0;
function ok(cond, label, extra) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.error('  [FAIL] ' + label + (extra ? ' :: ' + extra : '')); } }

// ===== 検証1: 静的HTML（JS実行前・マスタ取得失敗時のフォールバック） =====
const staticSel = html.slice(html.indexOf('<select id="dengon-to"'));
const staticBlock = staticSel.slice(0, staticSel.indexOf('</select>'));
ok(staticBlock.indexOf('<option value="社長">社長</option>') !== -1, '検証1-静的HTMLに社長オプションがある');
ok(staticBlock.indexOf('社長') < staticBlock.indexOf('全員'), '検証1-静的HTMLで社長が全員より上（最上部）');

// ===== 検証2: JS再構築後も社長が残る（本丸） =====
sb.renderSelect();
const sel = doc.getElementById('dengon-to');
const opts = Array.from(sel.querySelectorAll('option'));
const values = opts.map(o => o.value);
ok(values.indexOf('社長') !== -1, '検証2-再構築後も社長オプションが残る', values.join(','));
ok(values[0] === '社長', '検証2-再構築後も最上部', values[0]);

// ===== 検証3: value は '社長' 完全一致（人数が付かない） =====
const ownerOpt = opts.find(o => o.value === '社長');
ok(ownerOpt && ownerOpt.value === '社長', '検証3-valueが社長ちょうど');
ok(ownerOpt && ownerOpt.textContent === '社長', '検証3-表示も社長ちょうど（人数なし）', ownerOpt && ownerOpt.textContent);
ok(String('社長').trim() === '社長', '検証3-trim後もサーバ判定と一致');

// ===== 検証4: 既存の宛先が壊れていない（additive担保） =====
ok(values.some(v => v === '全員'), '検証4-全員が残る');
ok(values.some(v => v === '全員・ドライバー除く'), '検証4-ドライバー除くが残る');
ok(values.some(v => v === '社員'), '検証4-社員が残る');
ok(values.some(v => v === '相談員'), '検証4-相談員が残る');
ok(values.some(v => v === '看護師'), '検証4-看護師が残る');
const grpTexts = opts.filter(o => o.value !== '社長' && !o.closest('optgroup')).map(o => o.textContent);
ok(grpTexts.every(t => /\(\d+\)$/.test(t)), '検証4-既存グループの人数表示は従来どおり', grpTexts.join(','));

// ===== 検証5: 特定スタッフ枠は従来どおり（activeのみ） =====
const indiv = Array.from(sel.querySelectorAll('optgroup[label="特定スタッフ"] option')).map(o => o.value);
ok(indiv.length === 3, '検証5-特定スタッフはactive3名', 'n=' + indiv.length);
ok(indiv.indexOf('退職者') === -1, '検証5-非activeは出ない');
ok(indiv.indexOf('社長') === -1, '検証5-社長は特定スタッフ枠には入らない');

// ===== 検証6: 二重描画しても社長は1つだけ（冪等） =====
sb.renderSelect();
sb.renderSelect();
const again = Array.from(doc.getElementById('dengon-to').querySelectorAll('option')).map(o => o.value);
ok(again.filter(v => v === '社長').length === 1, '検証6-再描画しても社長は1つ', 'n=' + again.filter(v => v === '社長').length);

console.log('genba-dengon-owner-option: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
