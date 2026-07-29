// test-sokutei-operator-gate.js
// 「誰として操作しているか」を確実にするための純関数の検証。
//
// 背景（2026-07-30 社長決定）:
//   シートの updatedBy は本人確認をしていない。operatorName() が返す
//   recordStaffSelect の現在値をそのまま GAS へ送り、GAS 側は Session.getActiveUser() を
//   一切見ずに書いている。しかも fillStaffSelect() は選択肢が空のときだけ中身を作り
//   値をリセットしないため、前の人の選択が残り続ける。
//   実害: 2026-07-29 20:13-20:17 の26件が、直前の測定記録で選ばれた名前のまま
//   全部その人の名義で記録された。誰が操作したかの記録として信用できず、
//   運営指導で操作履歴を問われたときに答えられない。人を疑う材料にもなってしまう。
//
// 直すのは人ではなく記録の仕組み。
// ★2026-07-30 追記: 当初は「未選択を既定にして全書き込みをブロック（B）＋常時表示（C）」で入れたが、
//   清掃アプリで同型の方式が実運用で破られた実績があり、方式を変えた。
//   いまは「測定だけ毎回測定者を選ぶ／他の操作は名前を求めない」。
//   このファイルは checkOperator の境界値と、ゲートの適用範囲・読み取り不干渉だけを見る。
//   方式そのものの検証は scripts/test-sokutei-operator-scope.js が正。
// ★読み取り操作（タブ切替・絞り込み・日付ナビ）は絶対にブロックしない。
// ★過去の updatedBy は書き換えない。今後の記録だけが正しくなればよい。
//
// 実行: node scripts/test-sokutei-operator-gate.js

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

const sandbox = { console, String, Number, Object, Array, Math, JSON, parseInt, RegExp };
vm.createContext(sandbox);
['checkOperator'].forEach(n => { vm.runInContext(extractFn(html, n), sandbox); });
const { checkOperator } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    actual  =' + A + '\n    expected=' + E); }
}
function sec(t) { console.log('\n[' + t + ']'); }

// ダミーのスタッフ一覧（実データは使わない）
const STAFF = ['ダミー甲', 'ダミー乙', 'ダミー丙'];

sec('1. 未選択のまま書き込み操作 → ブロックされる');
eq(checkOperator('', STAFF).ok, false, '空文字は通さない');
eq(checkOperator('', STAFF).reason, 'unselected', '理由は未選択');
eq(checkOperator(null, STAFF).ok, false, 'null も通さない');
eq(checkOperator(undefined, STAFF).ok, false, 'undefined も通さない');
eq(checkOperator('   ', STAFF).ok, false, '空白だけも通さない');
eq(checkOperator('　', STAFF).ok, false, '全角空白だけも通さない');

sec('2. 選択済み → 通る');
eq(checkOperator('ダミー甲', STAFF).ok, true, '一覧にある名前は通る');
eq(checkOperator('ダミー甲', STAFF).name, 'ダミー甲', '名前をそのまま返す');
eq(checkOperator(' ダミー乙 ', STAFF).ok, true, '前後の空白は落として判定する');
eq(checkOperator(' ダミー乙 ', STAFF).name, 'ダミー乙', 'trim した名前を返す');

sec('3. スタッフ一覧が空で返ってきた場合');
// 一覧が取れないのは staff_list の障害。ここで業務を止めると測定そのものができない。
// 名前が入っていれば通す＝「一覧で照合できない」ことを理由に現場を止めない。
eq(checkOperator('ダミー甲', []).ok, true, '一覧が空でも名前があれば通す（業務を止めない）');
eq(checkOperator('ダミー甲', null).ok, true, '一覧が null でも通す');
eq(checkOperator('', []).ok, false, '一覧が空でも未選択は通さない');

sec('4. 選択肢に無い名前が値に入っていた場合');
eq(checkOperator('ダミー丁', STAFF).ok, false, '一覧に無い名前は通さない');
eq(checkOperator('ダミー丁', STAFF).reason, 'unknown', '理由は不明な操作者');
// プレースホルダの value は空文字なので、選ばれていれば必ず未選択側に落ちる
eq(checkOperator('（操作する人を選んでください）', STAFF).reason, 'unknown',
  'プレースホルダの表示文字がそのまま値になっていたら弾く（value は空文字であるべき）');

// 5. 常時表示（C案）は 2026-07-30 に廃止。測定を毎回選ぶ方式へ変えたため
//    「いま○○さんとして操作しています」が意味を失い、operatorLabel ごと撤去した。
//    置き換えた「直前に○○さんとして記録しました」と適用範囲は
//    scripts/test-sokutei-operator-scope.js が受け持つ。

sec('6. 書き込み5経路すべてにゲートが入っているか（ソースの実配線）');
// 純関数だけ通っても、呼び出し側に入っていなければ意味がない。
// requireOperator() が各入口の冒頭にあることをソース上で確認する。
{
  const gate = 'requireOperator(';
  const fnBody = n => extractFn(html, n);
  const has = n => fnBody(n).indexOf(gate) >= 0;
  // 2026-07-30: ゲートは測定だけに絞った（他は名前を求めない＝社長決定）
  eq(has('submitRecord'), true, '📝測定した にゲートがある');
  eq(has('slideToNextMonth'), false, '📅来月へ にはゲートを掛けない');
  eq(has('undoSlide'), false, '戻す にはゲートを掛けない');
  eq(has('pickYm'), false, '予定▾の月選択 にはゲートを掛けない');
  eq(has('toggleOutput'), false, '🖨／📄 出力チェック にはゲートを掛けない');
}

sec('7. 読み取り操作にはゲートを入れていないこと（現場を止めない）');
{
  const gate = 'requireOperator(';
  const readOnly = ['showTab', 'load', 'goDate', 'applyAllFilters', 'renderAll'];
  readOnly.forEach(n => {
    let body = '';
    try { body = extractFn(html, n); } catch (e) { body = ''; }
    if (!body) { pass++; console.log('  PASS ' + n + ' は関数として存在しない（対象外）'); return; }
    eq(body.indexOf(gate) < 0, true, n + ' にゲートを入れていない（見るだけは自由）');
  });
}

console.log('\n==== ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + ' / ' + (pass + fail) + ' ====');
process.exit(fail ? 1 : 0);
