// test-sokutei-last-source.js
// 「前回測定日（r.last）」を2ソースの和で引く純関数 pickLastDate の検証。
//
// 背景（2026-07-29 社長が本番画面で踏んだ誤報）:
//   📝測定した（GAS: addSokuteiDone）は要介護でも分岐せず「測定記録」シートへ氏名キーで書き、
//   個訓シートの sokutei_date は永久に空のまま。ところが画面は
//     済の判定   … doneById（個訓）∪ doneByName（測定記録）の2ソースOR ← 正しい
//     前回測定   … lastById（個訓）だけ                              ← 非対称。これが原因
//   となっていたため、同じカードに「7/2 済」と「前回測定 なし」が同居した。
//   さらに planGapCheck の covered 判定は材料に r.last を使う（sokutei.html の rowPlanGap）ので、
//   測定記録シートにしか無い測定は covered を通れず無条件に gap へ落ち、
//   測ったばかりの人ほど赤くなる（予定月が実施月+周期へ飛び over が周期ちょうどになるため）。
//
// ここでは last を2ソースの和で引き、新しい方を採ることを検証する。
// 要支援側（lastShien / 926行）の挙動は変えない。GAS・shared.js も変えない。
//
// 実行: node scripts/test-sokutei-last-source.js

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
['normKey', 'ymMonthsBetween', 'planGapCheck', 'pickLastDate'].forEach(n => {
  vm.runInContext(extractFn(html, n), sandbox);
});
const { normKey, planGapCheck, pickLastDate } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    actual  =' + A + '\n    expected=' + E); }
}
function sec(t) { console.log('\n[' + t + ']'); }

// =====================================================================
// 材料。すべてダミー名。
//   byId  … 個訓シート由来（userIdキー）
//   byKey … 測定記録シート由来（正規化名キー）
// =====================================================================
const U1 = 'U1', N1 = 'ダミー甲';
const K1 = normKey(N1);

sec('1. 個訓のみに測定日がある');
eq(pickLastDate({ [U1]: '2026-06-10' }, {}, U1, N1), '2026-06-10', '個訓の日付を採る');

sec('2. 測定記録のみに測定日がある（今回の本命）');
eq(pickLastDate({}, { [K1]: '2026-07-02' }, U1, N1), '2026-07-02',
  '測定記録の日付を採る（従来は空になり「前回測定 なし」だった）');

sec('3. 両方にあり日付が違う → より新しい方を採る');
eq(pickLastDate({ [U1]: '2026-06-10' }, { [K1]: '2026-07-02' }, U1, N1), '2026-07-02', '測定記録の方が新しい');
eq(pickLastDate({ [U1]: '2026-07-20' }, { [K1]: '2026-07-02' }, U1, N1), '2026-07-20', '個訓の方が新しい');
eq(pickLastDate({ [U1]: '2026-07-02' }, { [K1]: '2026-07-02' }, U1, N1), '2026-07-02', '同日は同じ値');

sec('4. どちらにも無い');
eq(pickLastDate({}, {}, U1, N1), '', '空文字（＝未測定として base へ落ちる）');
eq(pickLastDate(null, null, U1, N1), '', 'null 渡しでも落ちない');

sec('5. 氏名の表記ゆれ（正規化キーの一致／不一致）');
eq(pickLastDate({}, { [normKey('ダミー甲')]: '2026-07-02' }, U1, 'ダミー　甲'), '2026-07-02',
  '全角スペース入りでも正規化して引ける');
eq(pickLastDate({}, { [normKey('ダミー甲')]: '2026-07-02' }, U1, 'ダミー甲 様'), '2026-07-02',
  '「様」付きでも正規化して引ける');
eq(pickLastDate({}, { [normKey('ダミー乙')]: '2026-07-02' }, U1, 'ダミー甲'), '',
  '別人の名前では引けない（取り違えを起こさない）');

sec('6. 同姓同名が居た場合の挙動');
// 測定記録シートは氏名キーのため、同姓同名は構造的に区別できない。
// これは既存の doneByName（済判定）と同じ制約で、本修正で新たに増やす риск ではない。
// ここでは「2人が同じ日付を共有する」ことを仕様として固定し、将来の変更で気づけるようにする。
{
  const byKey = { [normKey('ダミー同名')]: '2026-07-02' };
  const a = pickLastDate({}, byKey, 'UA', 'ダミー同名');
  const b = pickLastDate({}, byKey, 'UB', 'ダミー同名');
  eq([a, b], ['2026-07-02', '2026-07-02'], '同姓同名は同じ日付を共有する（氏名キーの既存制約）');
  // ただし個訓側（userIdキー）に日付があれば、そちらが優先されうる＝取り違えを個別に上書きできる
  eq(pickLastDate({ UB: '2026-07-25' }, byKey, 'UB', 'ダミー同名'), '2026-07-25',
    '個訓側に新しい日付があれば個人単位で正される');
}

// =====================================================================
// covered 判定との結合。ここが「赤が消えるか」の本丸。
// planGapCheck(opt): opt = { isKaigo, dueYm, lastYm, cycleMonths, chosenYm }
// 予定月(chosenYm)は測定すると「実施月+周期」へ飛ぶので 2026-10 を使う。
// =====================================================================
const CYC = 3;
function gap(lastYm, dueYm, chosenYm) {
  return planGapCheck({ isKaigo: true, dueYm: dueYm, lastYm: lastYm, cycleMonths: CYC, chosenYm: chosenYm || '2026-10' });
}

sec('7. 期限の月ちょうどに測定 → covered');
eq(gap('2026-07', '2026-07').kind, 'covered', '期限07・測定07（age=0）は covered');
eq(gap('2026-07', '2026-07').warn, false, '警告は出ない');

sec('8. 期限の前月に測定 → covered');
eq(gap('2026-06', '2026-07').kind, 'covered', '期限07・測定06（age=1）は covered');
eq(gap('2026-05', '2026-07').kind, 'covered', '期限07・測定05（age=2＝周期-1）は covered');

sec('9. 周期ぶん以上前の測定 → covered にならない');
eq(gap('2026-04', '2026-07').kind, 'gap', '期限07・測定04（age=3＝周期ちょうど）は gap');
eq(gap('2026-04', '2026-07').warn, true, '警告が出る');
eq(gap('2026-01', '2026-07').kind, 'gap', 'さらに古ければ当然 gap');

sec('10. 回帰の本丸: 測定記録にしか無い測定で赤が消える');
{
  // 社長が踏んだ実例と同じ形。要介護1・済 2026-07-02・期限 2026-07・予定月 2026-10・周期3。
  const lastFromBoth = pickLastDate({}, { [K1]: '2026-07-02' }, U1, N1);
  // 修正前は last が空 → lastYm も空 → 無条件に gap（＝嘘の赤）
  eq(gap('', '2026-07').kind, 'gap', '修正前の状態（last が空）は gap のまま＝これが誤報だった');
  // 修正後は測定記録から 2026-07 が引けて covered
  eq(gap(String(lastFromBoth).slice(0, 7), '2026-07').kind, 'covered', '2ソースの和で引けば covered になる');
  eq(gap(String(lastFromBoth).slice(0, 7), '2026-07').warn, false, '警告が消える');
}

sec('11. 要支援は対象外のまま（挙動を変えない）');
eq(planGapCheck({ isKaigo: false, dueYm: '2026-07', lastYm: '', cycleMonths: CYC, chosenYm: '2026-10' }).kind,
  'notKaigo', '要支援・事業対象者は計画書が無いので警告対象外');

console.log('\n==== ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + ' / ' + (pass + fail) + ' ====');
process.exit(fail ? 1 : 0);
