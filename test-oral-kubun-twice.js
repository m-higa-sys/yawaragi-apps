// 回帰テスト: 口腔実施記録の「月2回扱い」＋区変日ゲート（2026-07-06 更新）。
// ★再実装ではなく oral-record.html の実際の function 本体を抽出して実行する。
//
// 判定基準（社長確定 2026-07-06 更新版）:
//   月2回扱い(その月)＝
//     現care==kaigo … 全月2回
//     現care==shien かつ 区変中 … 「区変日(applyDate)の属する月」以降のみ2回・それ以前は1回
//     現care==shien かつ 予約介護度=要介護(適用月待ち) … 適用月以降のみ2回 [本番現状inert・forward-compat]
//     上記以外の shien … 全月1回
//   月比較は必ず年月(YYYY-MM)。会計年度4月始まりのため月番号だけの比較は禁止。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'oral-record.html'), 'utf8');

function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  if (!m) throw new Error('function not found: ' + name);
  return m[0];
}
function escapeAttr(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
const isOralTwiceMonthly = eval('(' + extractFn('isOralTwiceMonthly') + ')');
const buildKubunIndex = eval('(' + extractFn('buildKubunIndex') + ')');
const oralCellHtml = eval('(' + extractFn('oralCellHtml') + ')');
const monthLabelToYm = eval('(' + extractFn('monthLabelToYm') + ')');
const oralKubunBadge = eval('(' + extractFn('oralKubunBadge') + ')');

let pass = 0, fail = 0;
const assert = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

// ===== monthLabelToYm（会計年度4月始まりの年月変換） =====
assert('4月→年度と同年', monthLabelToYm(2026, '4月') === '2026-04');
assert('7月→年度と同年', monthLabelToYm(2026, '7月') === '2026-07');
assert('12月→年度と同年', monthLabelToYm(2026, '12月') === '2026-12');
assert('1月→年度+1', monthLabelToYm(2026, '1月') === '2027-01');
assert('3月→年度+1', monthLabelToYm(2026, '3月') === '2027-03');
assert('4月 < 7月（年月比較）', monthLabelToYm(2026, '4月') < monthLabelToYm(2026, '7月'));
assert('12月 < 1月（年度またぎ）', monthLabelToYm(2026, '12月') < monthLabelToYm(2026, '1月'));

// ===== isOralTwiceMonthly(care, monthYm, info) =====
const HI = { active: true, kubunHiYm: '2026-07', reservedCare: '', reservedApplyYm: '' };
assert('要介護は4月も2回', isOralTwiceMonthly('kaigo', '2026-04', {}) === true);
assert('要介護は1月も2回', isOralTwiceMonthly('kaigo', '2027-01', {}) === true);
assert('区変中: 2026-07(区変日月)は2回', isOralTwiceMonthly('shien', '2026-07', HI) === true);
assert('区変中: 2026-08は2回', isOralTwiceMonthly('shien', '2026-08', HI) === true);
assert('区変中: 2027-01(年度またぎ)も2回', isOralTwiceMonthly('shien', '2027-01', HI) === true);
assert('区変中: 2026-06は1回(区変日前)', isOralTwiceMonthly('shien', '2026-06', HI) === false);
assert('区変中: 2026-04は1回(区変日前)', isOralTwiceMonthly('shien', '2026-04', HI) === false);
const HI_NODATE = { active: true, kubunHiYm: '', reservedCare: '', reservedApplyYm: '' };
assert('区変中・区変日不明は全月1回(保守的)', isOralTwiceMonthly('shien', '2026-07', HI_NODATE) === false);
assert('通常要支援は7月も1回', isOralTwiceMonthly('shien', '2026-07', {}) === false);
assert('通常要支援は4月も1回', isOralTwiceMonthly('shien', '2026-04', {}) === false);
const RESV = { active: false, kubunHiYm: '', reservedCare: '要介護3', reservedApplyYm: '2026-09' };
assert('予約要介護: 2026-09(適用月)は2回', isOralTwiceMonthly('shien', '2026-09', RESV) === true);
assert('予約要介護: 2026-08は1回(適用前)', isOralTwiceMonthly('shien', '2026-08', RESV) === false);
const RESV_SHIEN = { active: false, kubunHiYm: '', reservedCare: '要支援2', reservedApplyYm: '2026-09' };
assert('予約が要支援は据置=全月1回', isOralTwiceMonthly('shien', '2026-09', RESV_SHIEN) === false);

// ===== buildKubunIndex（区変日 applyDate→YYYY-MM を索引化・本番drift耐性） =====
const realKubunList = { count: 1, active: [{ name: '水戸忠', applyDate: '2026-07-01', expectDate: '2026-08-15', prevCareLevel: '要支援２', daysOver: 0 }] };
const realScheduledGarbage = { success: true, date: '2026-07-06', dayOfWeek: '月' };
const idx1 = buildKubunIndex(realKubunList, realScheduledGarbage);
assert('区変中の氏名がactiveSetに入る', idx1.activeSet['水戸忠'] === true);
assert('区変日がkubunHiMapに YYYY-MM で入る', idx1.kubunHiMap['水戸忠'] === '2026-07');
assert('壊れた予約応答でもreservedMapは空', Object.keys(idx1.reservedMap).length === 0);

const goodScheduled = { count: 1, scheduled: [{ name: '予約太郎', currentCare: '要支援1', reservedCare: '要介護2', applyMonth: '2026-09' }] };
const idx2 = buildKubunIndex({ count: 0, active: [] }, goodScheduled);
assert('予約介護度がreservedMapに入る', idx2.reservedMap['予約太郎'] === '要介護2');
assert('予約適用月がreservedApplyMapに入る', idx2.reservedApplyMap['予約太郎'] === '2026-09');

const idx3 = buildKubunIndex(null, null);
assert('両方nullでも空索引', Object.keys(idx3.activeSet).length === 0 && Object.keys(idx3.kubunHiMap).length === 0);

const infoMito = { active: !!idx1.activeSet['水戸忠'], kubunHiYm: idx1.kubunHiMap['水戸忠'] || '', reservedCare: '', reservedApplyYm: '' };
assert('結合: 水戸忠 2026-07 は2回', isOralTwiceMonthly('shien', '2026-07', infoMito) === true);
assert('結合: 水戸忠 2026-06 は1回', isOralTwiceMonthly('shien', '2026-06', infoMito) === false);

// ===== oralKubunBadge（区変中バッジ・Phase3） =====
assert('要支援・区変中は区変中バッジを出す', oralKubunBadge('shien', true).indexOf('区変中') >= 0);
assert('通常要支援はバッジ空', oralKubunBadge('shien', false) === '');
assert('要介護はバッジ空', oralKubunBadge('kaigo', true) === '');

// ===== oralCellHtml（DOM出力・実測A/B/C） =====
const cellA7 = oralCellHtml({ userName: '水戸忠', key: '7月_2回目', si: 1, checked: '', twiceMonthly: true, isCurrentMonth: true });
assert('A: 水戸忠 7月2回目が開く', cellA7.indexOf("onclick=\"toggleCheck('水戸忠','7月_2回目')\"") >= 0 && cellA7.indexOf('>-<') < 0);
assert('A: 水戸忠 7月2回目・当月未実施は赤', cellA7.indexOf('highlight-undone') >= 0);
const cellA4 = oralCellHtml({ userName: '水戸忠', key: '4月_2回目', si: 1, checked: '', twiceMonthly: false, isCurrentMonth: false });
assert('A: 水戸忠 4月2回目は閉じる(disabled -)', cellA4.indexOf('disabled') >= 0 && cellA4.indexOf('>-<') >= 0);
const cellA5rec = oralCellHtml({ userName: '水戸忠', key: '5月_2回目', si: 1, checked: '2026-05-08', twiceMonthly: false, isCurrentMonth: false });
assert('A: 過去2回目に記録があっても閉月は - 表示(非破壊は表示のみ)', cellA5rec.indexOf('>-<') >= 0);
const cellB = oralCellHtml({ userName: '町田和子', key: '7月_2回目', si: 1, checked: '', twiceMonthly: false, isCurrentMonth: true });
assert('B: 通常要支援の2回目は閉(disabled)', cellB.indexOf('disabled') >= 0 && cellB.indexOf('onclick=') < 0);
const cellC = oralCellHtml({ userName: '介護者', key: '4月_2回目', si: 1, checked: '', twiceMonthly: true, isCurrentMonth: false });
assert('C: 要介護の2回目は開く', cellC.indexOf('onclick=') >= 0 && cellC.indexOf('>-<') < 0);
const cellClosedRed = oralCellHtml({ userName: 'x', key: '4月_2回目', si: 1, checked: '', twiceMonthly: false, isCurrentMonth: true });
assert('閉月の2回目は当月でも赤にしない', cellClosedRed.indexOf('highlight-undone') < 0);

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
