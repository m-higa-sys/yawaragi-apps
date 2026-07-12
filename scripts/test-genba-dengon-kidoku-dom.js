// 伝達ボード既読 PhaseC フロント配線のjsdom統合テスト（宛先select人数/既読チップ描画/完了ボタン変化）
// 実行: node scripts/test-genba-dengon-kidoku-dom.js
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

const FN = ['escapeHtml', 'dengonComputeRecipients_', 'dengonAddReadBy_', 'dengonRemoveReadBy_',
  'dengonIsAllRead_', 'dengonIsGroupTo_', 'dengonEffectiveRecipients_', 'dengonUnread_',
  'dengonReadChipsHtml_', 'dengonRequestedMD_', 'dengonTodayStr_', 'dengonDeadlineBadge_',
  'dengonRender', 'dengonRenderToSelect_', 'dengonChipProcessing_'];

const dom = new JSDOM('<!DOCTYPE html><body><select id="dengon-to"></select><div id="dengon-list"></div></body>');
const sb = {};
const src = FN.map(extractFn).join('\n') + '\n' +
  'var dengonStaffMaster = MASTER;\n' +
  'sb.render = dengonRender; sb.renderSelect = dengonRenderToSelect_; sb.processing = dengonChipProcessing_;';
new Function('sb', 'document', 'MASTER', src)(sb, dom.window.document, MASTER);
const doc = dom.window.document;

let pass = 0, fail = 0;
function ok(cond, label, extra) { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.error('  [FAIL] ' + label + (extra ? ' :: ' + extra : '')); } }

// ===== 検証1: 宛先selectの人数 11/9/2/3/3 =====
sb.renderSelect();
const sel = doc.getElementById('dengon-to');
const optTexts = Array.from(sel.querySelectorAll('option')).map(o => o.textContent);
ok(optTexts.some(t => t === '全員(11)'), '検証1-全員(11)', optTexts.join(','));
ok(optTexts.some(t => t === '全員・ドライバー除く(9)'), '検証1-ドライバー除く(9)');
ok(optTexts.some(t => t === '社員(2)'), '検証1-社員(2)');
ok(optTexts.some(t => t === '相談員(3)'), '検証1-相談員(3)');
ok(optTexts.some(t => t === '看護師(3)'), '検証1-看護師(3)');
const indivOpts = Array.from(sel.querySelectorAll('optgroup[label="特定スタッフ"] option'));
ok(indivOpts.length === 11, '検証1-特定スタッフ11名', 'n=' + indivOpts.length);

// ===== 検証2: 看護師宛て投稿 → チップ髙山・石井・春山の3人だけ =====
sb.render([{ id: 'db_test1', to: '看護師', from: '比嘉', body: 'テスト', deadline: '', createdAt: '', recipients: ['髙山', '石井', '春山'], readBy: [] }]);
const list = doc.getElementById('dengon-list');
const card1 = list.querySelector('.dengon-card[data-id="db_test1"]');
const chips1 = card1.querySelectorAll('.dengon-chips button');
ok(chips1.length === 3, '検証2-チップ3人', 'n=' + chips1.length);
const chipNames = Array.from(chips1).map(b => b.textContent);
ok(JSON.stringify(chipNames) === JSON.stringify(['髙山', '石井', '春山']), '検証2-髙山石井春山', chipNames.join(','));
ok(card1.innerHTML.indexOf('未読: 髙山・石井・春山') !== -1, '検証2-未読ラベルに名前主役');
// mark用onclickが載っている
ok(Array.from(chips1).every(b => b.getAttribute('onclick').indexOf('dengonMarkRead') === 0), '検証2-未読チップはmark配線');

// ===== 検証5: 全員既読 → 完了ボタンが「✅ 全員既読・完了にする」に変化 =====
sb.render([{ id: 'db_test2', to: '看護師', from: '比嘉', body: 'テスト', deadline: '', createdAt: '', recipients: ['髙山', '石井', '春山'], readBy: ['髙山', '石井', '春山'] }]);
const card2 = list.querySelector('.dengon-card[data-id="db_test2"]');
const normalBtn = card2.querySelector('.dg-normal button');
ok(normalBtn.textContent.trim() === '✅ 全員既読・完了にする', '検証5-完了ボタン変化', normalBtn.textContent);
ok(card2.innerHTML.indexOf('✅ 全員既読') !== -1, '検証5-全員既読ラベル');
// 既読チップはunmark配線
const chips2 = card2.querySelectorAll('.dengon-chips button');
ok(Array.from(chips2).every(b => b.getAttribute('onclick').indexOf('dengonUnmarkRead') === 0), '検証5-既読チップはunmark配線');

// ===== 検証6: 既存投稿（recipients空・to=全員）→ 全員未読で壊れず表示 =====
sb.render([{ id: 'db_old', to: '全員', from: '社長', body: '既存投稿', deadline: '', createdAt: '', recipients: [], readBy: [] }]);
const cardOld = list.querySelector('.dengon-card[data-id="db_old"]');
const chipsOld = cardOld.querySelectorAll('.dengon-chips button');
ok(chipsOld.length === 11, '検証6-recipients空グループはフォールバック11名', 'n=' + chipsOld.length);
ok(cardOld.innerHTML.indexOf('未読: ') !== -1, '検証6-全員未読表示');

// ===== 検証7: 個人宛て投稿にはチップが出ない =====
sb.render([{ id: 'db_indiv', to: '比嘉', from: '勝又', body: '個人宛て', deadline: '', createdAt: '', recipients: [], readBy: [] }]);
const cardIndiv = list.querySelector('.dengon-card[data-id="db_indiv"]');
ok(cardIndiv.querySelectorAll('.dengon-chips').length === 0, '検証7-個人宛てはチップ無し');
// 社長宛ては dengonRender が除外（従来仕様）
sb.render([{ id: 'db_owner', to: '社長', from: '勝又', body: '社長宛て', deadline: '', createdAt: '', recipients: [], readBy: [] }]);
ok(list.querySelector('.dengon-card[data-id="db_owner"]') === null, '検証7b-社長宛ては板に出さない（従来）');

// ===== 処理中UX: dengonChipProcessing_（連打防止＋動きのある表示）=====
const pb = doc.createElement('button');
pb.innerHTML = '髙山';
sb.processing(pb, true);
ok(pb.disabled === true, '処理中-チップをdisabled化（連打防止）');
ok(pb.innerHTML.indexOf('送信中') !== -1, '処理中-「送信中…」表示');
ok(pb.innerHTML.indexOf('dengon-spin') !== -1, '処理中-スピナー要素在中（動きのある表示）');
sb.processing(pb, false);
ok(pb.disabled === false, '解除-押せる状態に戻る');
ok(pb.innerHTML === '髙山', '解除-元のラベルに復元');
sb.processing(null, true);
ok(true, '処理中-null（btn無し）でも落ちない');

console.log('\ndengon-kidoku DOM: ' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
