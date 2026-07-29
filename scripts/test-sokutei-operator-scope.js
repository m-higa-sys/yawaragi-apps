// test-sokutei-operator-scope.js
// 「測定だけ毎回名前を選ぶ／他は名前を求めない」の検証。
//
// 背景（2026-07-30 社長決定）:
//   清掃アプリで「未選択を強制する」方式を実運用したが、前の人のまま他の人が打って破られた。
//   時間で失効させる案は「Aさんが測ってすぐBさんが測る」形に効かないので採らない。
//   毎回選ばせるのが確実。ただし全操作に適用すると24件連続スライドで48タップ増え、
//   現場が必ず雑になる（一番上を押す事故＝清掃アプリと同型）。だから適用先を分ける。
//     測定   … 運営指導で問われる記録の要件。1日数件なので毎回選んでも負担が小さい → 毎回選ぶ
//     その他 … 内部管理で記録義務がない。24件連続でやる作業 → 名前を求めない
//   名前を記録しないのはいい加減ではなく誠実。いま起きているのは「間違った名前が残る」ことで、
//   これは名前が無いより悪い。
//
// by に入れる値は空欄ではなく人でない固定値にする。実測根拠:
//   予定月シートの updatedBy は init が57件（人でない固定値の前例あり）、空欄は0件。
//   空にすると「取得漏れ・未設定」と区別できず、後から見て理由が読めない。
//
// 実行: node scripts/test-sokutei-operator-scope.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
function extractConst(src, name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*[^;]+;');
  const m = src.match(re);
  if (!m) throw new Error('const ' + name + ' が無い（未実装＝RED）');
  return m[0];
}

const sandbox = { console, String, Number, Object, Array, Math, JSON, parseInt, RegExp };
vm.createContext(sandbox);
vm.runInContext(extractConst(html, 'SYSTEM_OPERATOR'), sandbox);
['checkOperator', 'actionNeedsOperator', 'byParamFor'].forEach(n => { vm.runInContext(extractFn(html, n), sandbox); });
// const は sandbox オブジェクトに載らない（コンテキストのレキシカルスコープに入る）ので式で取り出す
const SYSTEM_OPERATOR = vm.runInContext('SYSTEM_OPERATOR', sandbox);
const byParamFor = (a, o) => vm.runInContext('byParamFor(' + JSON.stringify(a) + ',' + JSON.stringify(o) + ')', sandbox);
const actionNeedsOperator = a => vm.runInContext('actionNeedsOperator(' + JSON.stringify(a) + ')', sandbox);
const { checkOperator } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    actual  =' + A + '\n    expected=' + E); }
}
function sec(t) { console.log('\n[' + t + ']'); }

const STAFF = ['ダミー甲', 'ダミー乙', 'ダミー丙'];

sec('0. 人でない固定値');
eq(typeof SYSTEM_OPERATOR, 'string', 'SYSTEM_OPERATOR は文字列');
eq(SYSTEM_OPERATOR.length > 0, true, '空文字にはしない（空は「取得漏れ」と区別できない）');
eq(STAFF.indexOf(SYSTEM_OPERATOR) < 0, true, 'スタッフ名と衝突しない');

sec('1. 測定を未選択で確定 → ブロックされる');
eq(actionNeedsOperator('addSokuteiDone'), true, '測定は操作者が必須');
eq(checkOperator('', STAFF).ok, false, '未選択は通さない');
eq(checkOperator('', STAFF).reason, 'unselected', '理由は未選択');
eq(byParamFor('addSokuteiDone', ''), '', '測定で未選択なら by は空のまま返す（呼び出し側が止める）');
eq(byParamFor('addSokuteiDone', '   '), '', '空白だけも空として扱う');

sec('2. 測定を選択して確定 → その名前が記録される');
eq(checkOperator('ダミー甲', STAFF).ok, true, '選択済みは通る');
eq(byParamFor('addSokuteiDone', 'ダミー甲'), 'ダミー甲', '測定は選んだ人名がそのまま by になる');
eq(byParamFor('addSokuteiDone', ' ダミー乙 '), 'ダミー乙', '前後の空白は落とす');

sec('3. スライド・予定月変更・戻す・出力チェック → 名前を求めない');
['slideYotei', 'undoSlideYotei', 'setYotei', 'setSokuteiOutput'].forEach(a => {
  eq(actionNeedsOperator(a), false, a + ' は操作者を要求しない');
  eq(byParamFor(a, ''), SYSTEM_OPERATOR, a + ' は未選択でも固定値が入る（人名にはならない）');
});

sec('4. ★前の人の名前が入らないこと（今回の問題の本体）');
// 直前の測定でプルダウンに名前が残っていても、他の操作へは絶対に漏らさない
['slideYotei', 'undoSlideYotei', 'setYotei', 'setSokuteiOutput'].forEach(a => {
  eq(byParamFor(a, 'ダミー甲'), SYSTEM_OPERATOR, a + ' は人名を渡されても固定値に潰す');
});
eq(byParamFor('slideYotei', 'ダミー甲') === 'ダミー甲', false, 'スライドに人名が漏れない');

sec('5. スタッフ一覧が空で返ってきた場合');
// 一覧が取れないのは staff_list の障害。ここで止めると測定そのものができない。
eq(checkOperator('ダミー甲', []).ok, true, '一覧が空でも名前があれば通す（業務を止めない）');
eq(checkOperator('ダミー甲', null).ok, true, '一覧が null でも通す');
eq(checkOperator('', []).ok, false, '一覧が空でも未選択は通さない');

sec('6. 選択肢に無い名前が値に入っていた場合');
eq(checkOperator('ダミー丁', STAFF).ok, false, '一覧に無い名前は通さない');
eq(checkOperator('ダミー丁', STAFF).reason, 'unknown', '理由は不明な操作者');
eq(checkOperator(SYSTEM_OPERATOR, STAFF).ok, false, '固定値を測定者として使わせない');

sec('7. ソースの実配線');
{
  const body = n => extractFn(html, n);
  // 測定だけゲートが残っていること
  eq(body('submitRecord').indexOf('requireOperator(') >= 0, true, '📝測定した にゲートがある');
  // 他の4経路からゲートが外れていること
  ['slideToNextMonth', 'undoSlide', 'pickYm', 'toggleOutput'].forEach(n => {
    eq(body(n).indexOf('requireOperator(') < 0, true, n + ' からゲートを外した（名前を求めない）');
  });
  // 記録が終わったら選択をリセットすること
  eq(/resetOperatorSelect\(|recordStaffSelect'\)\.value = ''/.test(body('submitRecord')), true,
    '記録後に選択をリセットしている（次の測定で必ず選び直しになる）');
  // モーダルを開くたびに未選択から始まること
  eq(/resetOperatorSelect\(|\.value = ''/.test(body('openRecordModal')), true,
    'モーダルを開くたびに未選択から始まる');
  // 他経路は operatorName() を送らないこと
  eq(body('callYotei').indexOf('operatorName()') < 0, true, 'callYotei が操作者名を送らない');
  // 上部の常時表示は外し、直前の記録の表示に置き換わっていること
  eq(html.indexOf('いま ') < 0 || html.indexOf('として操作しています') < 0, true,
    '「いま○○さんとして操作しています」は撤去した（毎回選ぶ方式では意味を失う）');
  eq(html.indexOf('直前に ') >= 0, true, '「直前に○○さんとして記録しました」に置き換えた');
}

sec('8. 読み取り操作にはゲートを入れていないこと');
['showTab', 'load', 'goDate', 'renderAll', 'toggleUfDay', 'setCareFilter'].forEach(n => {
  let body = '';
  try { body = extractFn(html, n); } catch (e) { body = ''; }
  if (!body) { pass++; console.log('  PASS ' + n + ' は関数として存在しない（対象外）'); return; }
  eq(body.indexOf('requireOperator(') < 0, true, n + ' にゲートを入れていない');
});

console.log('\n==== ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + ' / ' + (pass + fail) + ' ====');
process.exit(fail ? 1 : 0);
