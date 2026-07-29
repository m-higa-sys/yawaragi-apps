// test-sokutei-due-month.js
// 測定の期限（＝個訓の評価月）の判定を、shared.js の isHyoukaMonth に寄せたことの検証。
//
// 【なぜ直したか】2026-07-29 社長が本番で発見。
//   アプリは「計画月(=計画期間の開始月)までに測る」と考えていたが、実態は
//   「計画期間が始まる前の月までに測定・評価・計画書作成を済ませる」。
//   実例: 計画期間 2026-07-01〜09-30 ／ 身体機能評価 6/10 ／ 計画書 6/24 ／ 次期間 10/1〜
//        → 次の測定は 9月 が正しいのに、アプリは「9月にすると計画書の月に測定結果が無い」と誤報した。
//   実測(2026-07-29・個訓シート153行): keikaku_date 70件中59件・sokutei_date 20件中18件・
//        tasseido_date 34件中33件が「計画期間の開始月＋2ヶ月（＝次期間の前月）」に集中。
//
// 【直し方】shared.js は変更しない。isHyoukaMonth が既に正しい定義を持っているため、
//   sokutei.html が掴む関数を isPlanMonth → isHyoukaMonth に差し替えるだけにする。
//   個訓アプリ（個別機能訓練計画書チェック.html）は元から isHyoukaMonth を使っている＝2つのアプリが揃う。
//
// 実行: node scripts/test-sokutei-due-month.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');
const open = html.indexOf('<script>');
const script0 = html.slice(open + '<script>'.length, html.indexOf('</script>', open));
const shared = fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8');
const kunHtml = fs.readFileSync(path.join(ROOT, '個別機能訓練計画書チェック.html'), 'utf8');
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

// ---- sokutei.html の実バイトから、期限まわりの純関数だけを取り出す ----
const ctx = { console };
vm.createContext(ctx);
vm.runInContext([
  extractFn(shared, 'isPlanMonth'),
  extractFn(shared, 'isHyoukaMonth'),
  extractFn(yoteiSrc, '_yoteiParseYm_'),
  extractFn(yoteiSrc, '_yoteiFmtYm_'),
  extractFn(yoteiSrc, 'ymAdd'),
  extractFn(script0, 'nextPlanYm'),
  extractFn(script0, 'nextDueYm'),
  extractFn(script0, 'nextPlanStartYm'),
  extractFn(script0, 'ymMonthsBetween'),
  extractFn(script0, 'planGapCheck'),
  extractFn(script0, 'rowPlanGap'),
  extractFn(script0, 'isKaigoCare')
].join('\n\n'), ctx);

// =====================================================================
sec('★境界値: 測定の期限は「計画期間が始まる前の月」（planStart+2）');
// planStart=2026-07 / 3ヶ月周期 → 計画期間は 7-9月、次は 10-12月。
// 評価・測定は各期間の最終月（=次期間の前月）に行う → 期限は 6月・9月・12月…
eq(ctx.nextDueYm('2026-07', 3, '2026-07'), '2026-09',
  '★planStart と同月から見た期限は 9月（同月は期限ではない・これが社長が踏んだ誤報の正体）');
eq(ctx.nextDueYm('2026-07', 3, '2026-08'), '2026-09', '期間の2ヶ月目から見ても期限は 9月');
eq(ctx.nextDueYm('2026-07', 3, '2026-09'), '2026-09', '★planStart+2（期限の月）に居るならその月自身が期限');
eq(ctx.nextDueYm('2026-07', 3, '2026-10'), '2026-12', '★planStart+3（次期間の開始月）から見た期限は 12月');
eq(ctx.nextDueYm('2026-07', 3, '2026-06'), '2026-06', '★planStart−1（開始前月）も評価月＝その月が期限');
eq(ctx.nextDueYm('2026-07', 3, '2026-11'), '2026-12', '期間の2ヶ月目に居れば翌月が期限');

sec('★境界値: 年をまたぐ');
eq(ctx.nextDueYm('2026-11', 3, '2026-12'), '2027-01', '★2026-12 から見た期限は 2027-01（年またぎ）');
eq(ctx.nextDueYm('2027-01', 3, '2026-12'), '2026-12', '★開始前月が年またぎでも拾える（2027-01期間の期限は2026-12）');
eq(ctx.nextDueYm('2026-10', 3, '2026-12'), '2026-12', '10月開始の期間の最終月は12月');
eq(ctx.nextDueYm('2026-10', 3, '2027-01'), '2027-03', '★年をまたいでも次の期限を正しく返す');
eq(ctx.nextDueYm('2025-11', 3, '2026-12'), '2027-01', '前年開始でも位相を保って年をまたぐ');

sec('境界値: 算出できないもの');
eq(ctx.nextDueYm('', 3, '2026-07'), '', 'planStart 未設定は空');
eq(ctx.nextDueYm(null, 3, '2026-07'), '', 'null でも落ちない');
eq(ctx.nextDueYm('2026-07', 3, ''), '', '起点の月が無ければ空');
eq(ctx.nextDueYm('2026-09', 6, '2026-07'), '2026-08', '変則周期(6)は開始前月だけが評価月');
eq(ctx.nextDueYm('2020-01', 6, '2026-07'), '', '変則周期で今後評価月が無ければ空');

sec('計画期間の開始月（表示用）は従来どおり isPlanMonth で取れる');
eq(ctx.nextPlanStartYm('2026-07', 3, '2026-07'), '2026-07', '当月が開始月ならその月');
eq(ctx.nextPlanStartYm('2026-07', 3, '2026-08'), '2026-10', '期間の途中なら次の開始月');
eq(ctx.nextPlanStartYm('2026-02', 3, '2026-07'), '2026-08', '2月開始→当月7月の次の開始月は8月');
eq(ctx.nextPlanStartYm('2025-11', 3, '2026-12'), '2027-02', '年またぎでも従来どおり');
ok(ctx.nextPlanStartYm('2026-07', 3, '2026-07') !== ctx.nextDueYm('2026-07', 3, '2026-07'),
  '★開始月と期限は別物（同じ値を返してはいけない）');

sec('期限は必ず「開始月の1ヶ月前」になる（2つの関数の関係）');
['2026-01', '2026-02', '2026-03', '2026-05', '2026-08', '2026-11'].forEach(ps => {
  ['2026-07', '2026-08', '2026-12', '2027-01'].forEach(from => {
    const due = ctx.nextDueYm(ps, 3, from);
    if (!due) return;
    const nextStart = ctx.nextPlanStartYm(ps, 3, ctx.ymAdd(due, 1));
    eq(ctx.ymMonthsBetween(nextStart, due), 1,
      'planStart=' + ps + ' / ' + from + ' 起点: 期限(' + due + ')の翌月が計画期間の開始月(' + nextStart + ')');
  });
});

// =====================================================================
sec('★A-2: 個訓アプリと同じ関数・同じ引数・同じ月を返す');
ok(/function isHyoukaMonth\(planStart, planMonths, year, month\)/.test(shared),
  'shared.js が isHyoukaMonth(planStart, planMonths, year, month) を定義している');
ok(kunHtml.indexOf('isHyoukaMonth(u.planStart, u.planMonths,') >= 0,
  '個訓アプリは isHyoukaMonth(u.planStart, u.planMonths, 年, 月) で呼んでいる');
ok(/const f = isHyoukaMonthFn \|\| \(typeof isHyoukaMonth === 'function' \? isHyoukaMonth : null\)/.test(script0)
  || script0.indexOf('typeof isHyoukaMonth === \'function\' ? isHyoukaMonth : null') >= 0,
  '★測定管理も既定で shared.js の isHyoukaMonth を掴んでいる（判定を複製していない）');
eq((script0.match(/function isHyoukaMonth\s*\(/g) || []).length, 0,
  '★測定管理側に isHyoukaMonth の写しを作っていない');

// 同一の利用者データで、2つのアプリが同じ月を「評価月」と答えるか
// （個訓アプリの呼び方 = isHyoukaMonth を月ごとに直接呼ぶ／測定管理 = nextDueYm で先頭から走査）
const PLAN_STARTS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2025-11', '2027-01'];
let agree = 0, disagree = 0;
PLAN_STARTS.forEach(ps => {
  // 個訓アプリの見方: 各月について isHyoukaMonth を直接呼ぶ
  const kunMonths = [];
  for (let i = 0; i < 24; i++) {
    const ym = ctx.ymAdd('2026-06', i);
    if (ctx.isHyoukaMonth(ps, 3, +ym.slice(0, 4), +ym.slice(5, 7))) kunMonths.push(ym);
  }
  // 測定管理の見方: nextDueYm を次々に手繰る
  const sokuteiMonths = [];
  let cur = '2026-06';
  for (let i = 0; i < 24 && cur; i++) {
    const d = ctx.nextDueYm(ps, 3, cur);
    if (!d || ctx.ymMonthsBetween(d, '2026-06') >= 24) break;
    sokuteiMonths.push(d);
    cur = ctx.ymAdd(d, 1);
  }
  if (JSON.stringify(kunMonths) === JSON.stringify(sokuteiMonths)) agree++;
  else { disagree++; console.log('    不一致 planStart=' + ps + '\n      個訓  =' + JSON.stringify(kunMonths) + '\n      測定管理=' + JSON.stringify(sokuteiMonths)); }
});
eq(disagree, 0, '★14通りの planStart すべてで、個訓アプリと測定管理が同じ評価月を返す');
eq(agree, PLAN_STARTS.length, '（一致した planStart の数）');

// =====================================================================
sec('★社長が本番で踏んだ誤報が消える');
// 計画期間 2026-07-01〜09-30 / 評価6/10 / 計画書6/24 / 次期間10/1〜 → 次の測定は9月が正しい
const r = { care: '要介護1', last: '2026-06-10', cycleMonths: 3 };
r.planYm = ctx.nextPlanStartYm('2026-07', 3, '2026-07');   // 表示用＝計画期間の開始月
r.dueYm = ctx.nextDueYm('2026-07', 3, '2026-07');          // 判定用＝測定の期限
eq(r.planYm, '2026-07', '画面に出す「計画書 ◯月」は計画期間の開始月のまま（表示は嘘にしない）');
eq(r.dueYm, '2026-09', '判定に使う期限は9月');
eq(ctx.rowPlanGap(r, '2026-09').warn, false, '★予定月を9月にしても警告しない（社長の判断が正しい）');
eq(ctx.rowPlanGap(r, '2026-09').kind, 'inTime', '9月は期限内');
// 10月は本当に遅い。6/10の測定は9月時点で3ヶ月前＝周期3を越えており、10-12月の計画書には使えない
eq(ctx.rowPlanGap(r, '2026-10').kind, 'gap', '★10月は期限(9月)を越えて6月の測定も古い＝ここは正しく警告する');

// ★社長が実際に見た画面の再現。
//   この方の 6/10 の測定はリハブにはあるが、個訓シート（アプリの読み先）には入っていない。
//   つまりアプリから見ると「前回測定なし」。旧定義だとその状態で9月を選ぶと警告が出ていた。
const rNoRec = { care: '要介護1', last: '', cycleMonths: 3, planYm: '2026-07', dueYm: '2026-09' };
eq(ctx.planGapCheck({ isKaigo: true, planYm: '2026-07', lastYm: '', cycleMonths: 3, chosenYm: '2026-09' }).kind,
  'gap', '（参考）旧定義＝期限を計画月(7月)としていたので9月は警告だった＝これが誤報');
eq(ctx.rowPlanGap(rNoRec, '2026-09').kind, 'inTime',
  '★新定義なら、測定記録が無くても9月は期限内＝警告しない');
// 記録がアプリに入っていれば旧定義でも救われていた（誤報は「定義のズレ」と「記録の欠落」の合わせ技）
eq(ctx.planGapCheck({ isKaigo: true, planYm: '2026-07', lastYm: '2026-06', cycleMonths: 3, chosenYm: '2026-09' }).kind,
  'covered', '（参考）6月の測定がアプリに入っていれば旧定義でも警告は出なかった');

sec('rowPlanGap は期限(dueYm)を見ている（計画期間の開始月ではない）');
const r2 = { care: '要介護1', last: '', cycleMonths: 3, planYm: '2026-07', dueYm: '2026-09' };
eq(ctx.rowPlanGap(r2, '2026-08').kind, 'inTime', '★開始月(7月)を越えても期限(9月)までなら警告しない');
eq(ctx.rowPlanGap(r2, '2026-10').kind, 'gap', '期限(9月)を越えて前回測定も無ければ警告');
const r3 = { care: '要支援2', last: '', cycleMonths: 4, planYm: '', dueYm: '' };
eq(ctx.rowPlanGap(r3, '2027-12').kind, 'notKaigo', '要支援・事業対象者は従来どおり無制限');
const r4 = { care: '要介護1', last: '', cycleMonths: 3, planYm: '', dueYm: '' };
eq(ctx.rowPlanGap(r4, '2027-12').kind, 'unknownPlan', '期限が算出できない要介護は警告しない');

// =====================================================================
sec('★C-1: 初期生成も同じ期限で置く（新しい利用者で同じズレを再発させない）');
const gasCode = fs.readFileSync(path.join(ROOT, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
ok(gasCode.indexOf('function sokuteiNextDueYm_(') >= 0, 'GAS 側に期限を返す関数がある');
ok(gasCode.indexOf('isHyoukaMonth(planStart, planMonths,') >= 0, '★GAS も isHyoukaMonth を使っている');
eq((gasCode.match(/function isHyoukaMonth\s*\(/g) || []).length, 0,
  '★コード.js に isHyoukaMonth の写しを作っていない（正本は session-board-judges.js / shared.js）');
ok(gasCode.indexOf('dueYmOf: function (u, ym) { return sokuteiNextDueYm_(u.planStart, u.planMonths, ym); }') >= 0,
  '★setupYoteiInitial_ が dueYmOf を渡している');
ok(yoteiSrc.indexOf('if (d.dueYmOf)') >= 0, 'buildInitialYotei が dueYmOf を使う');
ok(/if \(have\[uid\]\) \{ stats\.skippedExisting\+\+; return; \}/.test(yoteiSrc),
  '★既に予定月の行がある人は初期生成が触らない（既存値を書き換えない）');

// buildInitialYotei を実バイトで動かし、測定記録の無い人が「期限」に置かれることを見る
vm.runInContext([extractFn(yoteiSrc, 'nextYmAfterDone'), extractFn(yoteiSrc, 'buildInitialYotei')].join('\n\n'), ctx);
ctx.dueYmOf = (u, ym) => ctx.nextDueYm(u.planStart, u.planMonths, ym);
const built = ctx.buildInitialYotei(
  {
    domain: 'sokutei', thisYm: '2026-07', lastDoneByKey: {}, existing: [],
    users: [
      { userId: 'U1', name: 'ダミー甲', care: '要介護1', planStart: '2026-07', planMonths: 3 },
      { userId: 'U2', name: 'ダミー乙', care: '要介護1', planStart: '2026-05', planMonths: 3 },
      { userId: 'U3', name: 'ダミー丙', care: '要支援2', planStart: '', planMonths: null }
    ]
  },
  { cycleMonths: (care) => (String(care).indexOf('要介護') === 0 ? 3 : 4), normalizeName: (s) => String(s || ''), dueYmOf: ctx.dueYmOf }
);
const byId = {}; built.rows.forEach(r => byId[r.userId] = r);
eq(byId.U1.nextYm, '2026-09', '★7月開始の人は期限9月に置く（旧: 計画月10月に置いていた）');
eq(byId.U2.nextYm, '2026-07', '★5月開始の人は期限7月（当月）に置く（旧: 8月に置いていた）');
eq(byId.U3.nextYm, '2026-07', '計画書が無い人は従来どおり当月（起点なし）');
eq(byId.U3.note, '起点なし', '起点なしの印も従来どおり');
eq(byId.U1.cycleMonths, 3, '周期は介護度から引く（従来どおり）');
// dueYmOf を渡さなければ従来の挙動に落ちる（既存の呼び出しを壊さない）
const legacy = ctx.buildInitialYotei(
  { domain: 'sokutei', thisYm: '2026-07', lastDoneByKey: {}, existing: [], users: [{ userId: 'U1', name: 'ダミー甲', care: '要介護1', planStart: '2026-07', planMonths: 3 }] },
  { cycleMonths: () => 3, normalizeName: (s) => String(s || '') }
);
eq(legacy.rows[0].nextYm, '2026-10', 'dueYmOf 未指定なら従来どおり planStart+周期（既存の呼び出しを壊さない）');


// =====================================================================
console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
