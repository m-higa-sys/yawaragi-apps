// 「今やること」を動詞1つに決める純関数テスト（teishutsu 2タブ化・2026-08-06）
// 実行: node scripts/test-collect-verb.js
//
// 設計（社長決定）:
//   スタッフが開いて3秒で「自分が何をすればいいか」分かる画面にする。
//   1案件につき動詞は必ず1つ。内部用語（status/docType/対象月/繰越/保留）は画面に出さない。
//
//   make    計画書を作る               … 計画書がまだ（個訓 keikaku_date／通所 plan_date が空）
//   sign    サインをもらう             … 計画書はできている
//   pdf     PDFにしてフォルダに入れる   … サイン済みの申告（揃った）はあるがPDFが無い
//   send    送る                      … PDFが在る／送付済でない揃った案件 → 送るタブへ
//   done    完了                      … 送付済（どちらのタブにも出さない）
//   unknown 情報が足りません            … 計画書の作成状況が分からない（黙って消さない）
//
// ★判定材料が無い書類（通所モニ・通所評価・口腔・測定）は planCreated が不明so unknown になる。
//   何件出るかは実データで測って報告する（隠して0件に見せない）。

const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }
const v = (status, planCreated, pdfMatch) => core.sbCollectVerb_(status, planCreated, pdfMatch).verb;

// ===== A. 4つの動詞が一意に決まる =====
eq(v('', false, ''), 'make', 'A1: 計画書がまだ → 計画書を作る');
eq(v('', true, ''), 'sign', 'A2: 計画書はできている → サインをもらう');
eq(v('揃った', true, ''), 'pdf', 'A3: サイン済みの申告あり・PDFが無い → PDFにしてフォルダに入れる');
eq(v('揃った', true, 'strong'), 'send', 'A4: PDFが在る → 送る（送るタブへ）');
eq(v('送付済', true, 'strong'), 'done', 'A5: 送付済 → どちらのタブにも出さない');

// ===== B. PDFが在れば「揃った」未押下でも送る段階 =====
eq(v('', true, 'strong'), 'send', 'B1: PDFが在れば揃った未押下でも送る段階');
eq(v('保留', true, 'strong'), 'send', 'B2: 保留でもPDFが在れば送る段階');
// weak（氏名は当たったが書類名が読めない）は確定させない＝送るへ飛ばさない
eq(v('', true, 'weak'), 'sign', 'B3: weakは確定扱いにしない（まだ集めるタブ）');
eq(v('揃った', true, 'weak'), 'pdf', 'B4: 揃った＋weak は「PDFにして入れる」のまま');

// ===== C. 保留は「保留」と出さず、やることを出す =====
eq(v('保留', false, ''), 'make', 'C1: 保留でも計画書がまだなら「計画書を作る」');
eq(v('保留', true, ''), 'sign', 'C2: 保留でも計画書があるなら「サインをもらう」');

// ===== D. 判定できないものは黙って消さない =====
eq(v('', undefined, ''), 'unknown', 'D1: 計画書の作成状況が不明 → 情報が足りません');
eq(v('', null, ''), 'unknown', 'D2: null も同じ');
eq(v('', undefined, 'strong'), 'send', 'D3: 材料不明でもPDFが在れば送る段階');
eq(v('揃った', undefined, ''), 'pdf', 'D4: 材料不明でも揃った申告があればPDF段階');

// ===== E. 画面に出す文言（内部用語を出さない）=====
const r = core.sbCollectVerb_('', false, '');
eq(r.label, '計画書を作る', 'E1: 動詞のラベル');
ok(/^[^a-z]*$/.test(core.sbCollectVerb_('', true, '').label), 'E2: ラベルに英字の内部用語が混ざらない');
eq(core.sbCollectVerb_('揃った', true, '').label, 'PDFにしてフォルダに入れる', 'E3: PDF段階の言い方');
eq(core.sbCollectVerb_('', true, '').label, 'サインをもらう', 'E4: サイン段階の言い方');
eq(core.sbCollectVerb_('', undefined, '').label, '情報が足りません', 'E5: 不明のときの言い方');
['status', 'docType', '保留', '繰越', '対象月'].forEach(function (w) {
  const all = ['', '保留', '揃った', '送付済'].map(function (s) {
    return core.sbCollectVerb_(s, true, '').label + core.sbCollectVerb_(s, false, '').label;
  }).join('');
  ok(all.indexOf(w) < 0, 'E6: ラベルに内部用語「' + w + '」が出ない');
});

// ===== F. 集めるタブ／送るタブの振り分け =====
eq(core.sbIsCollectVerb_('make'), true, 'F1: make は集めるタブ');
eq(core.sbIsCollectVerb_('sign'), true, 'F2: sign は集めるタブ');
eq(core.sbIsCollectVerb_('pdf'), true, 'F3: pdf は集めるタブ');
eq(core.sbIsCollectVerb_('unknown'), true, 'F4: unknown も集めるタブ（別枠で出す）');
eq(core.sbIsCollectVerb_('send'), false, 'F5: send は送るタブ');
eq(core.sbIsCollectVerb_('done'), false, 'F6: done はどちらにも出さない');

// ===== G. 並び順（やることの緊急度）=====
// 計画書がまだ＝一番手前の工程so上。次にサイン、最後にPDF化。情報不足は最後。
ok(core.SB_VERB_ORDER.make < core.SB_VERB_ORDER.sign, 'G1: make が sign より上');
ok(core.SB_VERB_ORDER.sign < core.SB_VERB_ORDER.pdf, 'G2: sign が pdf より上');
ok(core.SB_VERB_ORDER.pdf < core.SB_VERB_ORDER.unknown, 'G3: unknown は最後');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
