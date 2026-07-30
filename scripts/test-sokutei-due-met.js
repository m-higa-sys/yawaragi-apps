// test-sokutei-due-met.js
// 測定の期限を「まだ満たされていない最初の評価月」にする（2026-07-30・案C）。
//
// 背景（本番実測 2026-07-30）:
//   7/14 に測定を済ませた方のカードに「測定期限 2026-07」と出ていた。7月の期限はもう
//   満たされており、次に測るのは10月（＝次の評価月）。同じ状態が22名に出ていた。
//   原因は nextDueYm が isHyoukaMonth の返す最初の評価月をそのまま期限にしていたこと。
//   「その月の測定がもう済んでいるか」を1バイトも見ていなかった。
//
// クロの最初の仮説（planStart月の計画書が作成済みなら planStart+2）は実測0名で効かなかった。
//   リハブで作った計画書が個訓シートに記録されていないため（keikaku_date が空）。この材料は使わない。
//   使うのは既にある「前回測定日」だけ。API追加なし・GAS改修なし・shared.js 無変更。
//
// ★満たされたかの数え方は既存の covered（planGapCheck）と同じにそろえる。新しい数え方を作らない。
// ★前回測定が無い人（新規の方）は1ヶ月も動かさない。ここが崩れると本物の期限が消える。
// 実行: node scripts/test-sokutei-due-met.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');
const open = html.indexOf('<script>');
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open));
const shared = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
const yoteiSrc = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'yotei-core.js'), 'utf8');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

const ctx = { console, String, Number, Object, Array, Math, JSON, parseInt, RegExp };
vm.createContext(ctx);
vm.runInContext([
  extractFn(shared, 'isPlanMonth'),
  extractFn(shared, 'isHyoukaMonth'),
  extractFn(yoteiSrc, '_yoteiParseYm_'),
  extractFn(yoteiSrc, '_yoteiFmtYm_'),
  extractFn(yoteiSrc, 'ymAdd'),
  extractFn(script0, 'ymMonthsBetween'),
  extractFn(script0, 'nextPlanYm'),
  extractFn(script0, 'dueMetBy'),
  extractFn(script0, 'nextDueYm'),
  extractFn(script0, 'nextPlanStartYm'),
  extractFn(script0, 'planGapCheck'),
  extractFn(script0, 'isKaigoCare'),
  extractFn(script0, 'rowPlanGap')
].join('\n\n'), ctx);

// planStart=2026-07 / 3ヶ月 → 評価月は 2026-06（開始前月）・2026-09・2026-12・2027-03 …
// planStart=2026-08 / 3ヶ月 → 評価月は 2026-07（開始前月）・2026-10・2027-01 …  ← 社長が踏んだ形
const PS7 = '2026-07', PS8 = '2026-08';

// =====================================================================
sec('1. dueMetBy: 「その評価月の測定はもう済んでいるか」を covered と同じ数え方で見る');
eq(ctx.dueMetBy('2026-07', '2026-07-14', 3), true, '★評価月ちょうどに測定＝満たされた（社長が踏んだ形）');
eq(ctx.dueMetBy('2026-07', '2026-06-10', 3), true, '★評価月の前月の測定も有効（covered と同じ境界）');
eq(ctx.dueMetBy('2026-07', '2026-05-10', 3), true, '周期3なら2ヶ月前まで有効（境界の内側）');
eq(ctx.dueMetBy('2026-07', '2026-04-10', 3), false, '★3ヶ月前は周期を外れる（境界の外側）');
eq(ctx.dueMetBy('2026-07', '2026-08-10', 3), false, '評価月より後の測定は「その月を満たした」ことにしない（age<0）');
eq(ctx.dueMetBy('2026-07', '', 3), false, '★前回測定が無ければ満たされていない（新規の方の期限を消さない）');
eq(ctx.dueMetBy('2026-07', null, 3), false, 'null でも同じ');
eq(ctx.dueMetBy('2026-07', 'こわれた日付', 3), false, '壊れた日付は満たされていない扱い');
eq(ctx.dueMetBy('2026-07', '2026-04-10', 4), true, '周期4なら3ヶ月前まで有効（要支援の周期でも同じ式）');
eq(ctx.dueMetBy('2026-07', '2026-05-10', null), true, '周期が空なら既定3');
eq(ctx.dueMetBy('', '2026-07-14', 3), false, '評価月が空なら満たされていない');
// covered と同じ数え方であること自体を突き合わせる（新しい数え方を発明していない）
[['2026-09', '2026-07-14', 3], ['2026-09', '2026-06-14', 3], ['2026-09', '2026-05-14', 3], ['2026-12', '2026-09-01', 3]]
  .forEach(([due, last, cyc]) => {
    const covered = ctx.planGapCheck({ isKaigo: true, dueYm: due, lastYm: last.slice(0, 7), cycleMonths: cyc, chosenYm: '2099-12' }).kind === 'covered';
    eq(ctx.dueMetBy(due, last, cyc), covered, '★covered と同じ判定になる（' + due + ' / 前回 ' + last.slice(0, 7) + '）');
  });

// =====================================================================
sec('2. 前回測定が無い人（新規の方）の期限は1ヶ月も動かない ← 絶対に守る');
[['2026-07'], ['2026-08'], ['2026-09'], ['2026-10'], ['2026-11'], ['2026-12'], ['2027-01']].forEach(([from]) => {
  const before = ctx.nextPlanYm(PS7, 3, from, ctx.isHyoukaMonth, 24);
  eq(ctx.nextDueYm(PS7, 3, from, '', 3), before, 'planStart=' + PS7 + ' / ' + from + ' 起点：前回測定なしなら従来と同じ ' + before);
});
eq(ctx.nextDueYm(PS8, 3, '2026-07', '', 3), '2026-07', '★前月枝も動かさない（測っていないなら7月が期限のまま）');
eq(ctx.nextDueYm(PS8, 3, '2026-07', null, 3), '2026-07', 'null でも同じ');
eq(ctx.nextDueYm(PS8, 3, '2026-07'), '2026-07', '★第4引数を省いた既存の呼び出しは1バイトも挙動が変わらない');
eq(ctx.nextDueYm(PS7, 3, '2026-07'), '2026-09', '既存の呼び出し（+2枝）も従来どおり');

sec('3. 前月枝（planStart−1）で、その月に測定済み → 次の評価月へ進む');
eq(ctx.nextDueYm(PS8, 3, '2026-07', '2026-07-14', 3), '2026-10',
  '★社長が踏んだ形：7/14に測ったので7月の期限は満たされ、次は10月');
eq(ctx.nextDueYm(PS8, 3, '2026-07', '2026-06-20', 3), '2026-10',
  '前月（6月）の測定でも7月は満たされる（covered と同じ数え方）');
eq(ctx.nextDueYm(PS8, 3, '2026-07', '2026-04-20', 3), '2026-07',
  '★3ヶ月前の測定では7月は満たされない＝期限は7月のまま');

sec('4. +2枝（計画期間の最終月）で、その月に測定済み → 次の評価月へ進む');
eq(ctx.nextDueYm('2026-05', 3, '2026-07', '2026-07-03', 3), '2026-10',
  '★本番の20名の形：planStart=2026-05 の評価月7月を7/3の測定で満たし、次は10月');
eq(ctx.nextDueYm('2026-05', 3, '2026-07', '2026-07-03', 3) === '2026-10', true, '（再掲）10月へ進む');
eq(ctx.nextDueYm('2026-05', 3, '2026-07', '2026-10-05', 3), '2026-07',
  '★未来日の測定（10月）では7月の期限は満たされない＝7月のまま（age<0 を満たしたことにしない）');
eq(ctx.nextDueYm('2026-05', 3, '2026-10', '2026-10-05', 3), '2027-01', '10月に測れば次の期限は2027-01');

sec('5. 2つ先まで満たされている場合は、満たされていない月まで飛ぶ');
// 周期を長く取ると複数の評価月が1回の測定で満たされる（変則データの受け皿）
// 周期7 = 7/3の測定が 2026-07〜2027-01（6ヶ月先）まで有効。評価月は 7月・10月・2027-01・2027-04
eq(ctx.nextDueYm('2026-05', 3, '2026-07', '2026-07-03', 7), '2027-04',
  '★周期7なら7月・10月・2027-01 まで満たされ、最初に満たされないのは2027-04');

sec('6. 24ヶ月ぶん全部満たされていても止まる（無限ループにならない・従来値へ倒す）');
const allMet = ctx.nextDueYm('2026-05', 3, '2026-07', '2026-07-03', 600);
eq(allMet, '2026-07', '★打ち切り後は従来の「最初の評価月」を返す（判断材料が異常なときに期限を消さない）');
ok(typeof allMet === 'string', '文字列を返して終わる（ハングしない）');

sec('7. 年またぎ');
// planStart=2026-11 の評価月は 2026-10（開始前月）・2027-01・2027-04
eq(ctx.nextDueYm('2026-11', 3, '2026-12', '2026-12-05', 3), '2027-04',
  '★12/5の測定で 2027-01 の期限が満たされ、次は2027-04（年をまたいで先へ進む）');
eq(ctx.nextDueYm('2026-11', 3, '2026-12', '', 3), '2027-01',
  '前回測定なしなら従来どおり（2026-12は評価月ではない・2027-01が期限）');
eq(ctx.nextDueYm('2026-11', 3, '2026-12', '2026-09-20', 3), '2027-01',
  '★4ヶ月前（9月）の測定では2027-01は満たされない＝年をまたぐ期限がそのまま残る');
eq(ctx.nextDueYm('2027-01', 3, '2026-12', '2026-12-05', 3), '2027-03',
  '★開始前月が年またぎでも、満たされていれば次の評価月へ');
eq(ctx.nextDueYm('2027-01', 3, '2026-12', '', 3), '2026-12', '測っていなければ2026-12のまま');

sec('8. 壊れた入力・変則周期でも落ちない');
eq(ctx.nextDueYm('', 3, '2026-07', '2026-07-14', 3), '', 'planStart 未設定は空（従来どおり）');
eq(ctx.nextDueYm(null, 3, '2026-07', '2026-07-14', 3), '', 'null でも落ちない');
eq(ctx.nextDueYm('2026-07', 3, '', '2026-07-14', 3), '', '起点の月が無ければ空');
eq(ctx.nextDueYm('2026-09', 6, '2026-07', '', 3), '2026-08', '変則周期(6)は従来どおり開始前月だけが評価月');
eq(ctx.nextDueYm('2026-09', 6, '2026-07', '2026-08-01', 6), '2027-02',
  '変則周期(6)でも満たされていれば次の評価月（2027-03開始の前月＝2027-02）へ');
eq(ctx.nextDueYm('2020-01', 6, '2026-07', '2026-07-01', 6), '', '今後評価月が無ければ空（従来どおり）');

sec('9. 要支援（notKaigo）の挙動は変わらない');
eq(ctx.planGapCheck({ isKaigo: false, dueYm: '', lastYm: '2026-03', cycleMonths: 4, chosenYm: '2026-09' }).kind, 'notKaigo',
  '要支援は従来どおり警告の対象外');
eq(ctx.rowPlanGap({ care: '要支援2', dueYm: '', last: '2026-03-10', cycleMonths: 4 }, '2026-09').kind, 'notKaigo',
  '★要支援は dueYm を持たない（計画書が無い）＝この修正の影響を受けない');
eq(ctx.rowPlanGap({ care: '要支援1', dueYm: '', last: '', cycleMonths: 4 }, '2026-11').warn, false, '要支援に警告は出ない');

sec('10. 表示（planYm＝isPlanMonth）は変えない＝7/29の「判定と表示を分ける」を壊さない');
eq(ctx.nextPlanStartYm(PS8, 3, '2026-07'), '2026-08', '計画期間の開始月は 2026-08 のまま');
ok(ctx.nextPlanStartYm(PS8, 3, '2026-07') !== ctx.nextDueYm(PS8, 3, '2026-07', '2026-07-14', 3),
  '★期限（2026-10）と計画開始月（2026-08）は別物のまま');
eq(ctx.nextPlanStartYm('2026-05', 3, '2026-07'), '2026-08', '+2枝の人の表示も従来どおり');
// planYm が isPlanMonth 由来であること自体（実バイト）
ok(/function nextPlanStartYm[\s\S]{0,200}isPlanMonth/.test(script0), 'nextPlanStartYm は isPlanMonth を使っている');
ok(/function nextDueYm[\s\S]{0,400}isHyoukaMonth/.test(script0), 'nextDueYm は isHyoukaMonth を使っている（自作の月計算をしていない）');

sec('11. shared.js の isHyoukaMonth 自体には手を入れていない');
ok(/if \(diff === -1\) return true;/.test(shared), '★開始前月を評価月とする枝は残っている（個訓アプリと共用）');
eq(ctx.isHyoukaMonth(PS8, 3, 2026, 7), true, '2026-07 は planStart=2026-08 の評価月のまま');
eq(ctx.isHyoukaMonth(PS8, 3, 2026, 10), true, '2026-10 も評価月');
eq(ctx.isHyoukaMonth(PS8, 3, 2026, 9), false, '9月は評価月ではない');

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
