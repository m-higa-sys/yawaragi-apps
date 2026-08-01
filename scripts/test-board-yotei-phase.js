// 段階5: 月次ボード・セッションボードの対象月を「予定月(domain='kobetsu')」ベースへ
// 実行: node scripts/test-board-yotei-phase.js
//
// 仕様（社長決定 2026-08-01）:
//   要介護の測定の督促は【計画書の予定】に合わせる。測定アプリ側の予定(domain='sokutei')は使わない。
//   測定・評価・計画書は1つの節目なので、ボードの同じ月に3つとも立つのが正しい。
//   → ボード月 M に対する要介護の判定は3つとも同じ拠り所:
//        計画書 / 評価 / 測定 … いずれも「M+1 == その人の kobetsu予定月」
//   要支援・事業対象者の測定は従来どおり（前回測定日+4ヶ月・測定アプリ側の予定）。変更しない。
//
//   ★済判定は今回変えない（対象月だけ）:
//     kunPlan = _mbFieldDoneWorkMonth_（当月 or 前月）／kunEval = 当月／
//     sokuteiKaigo = 個訓シート ∪ 測定記録シート の和（@360）
//   ★予定月が取れない人・供給されていない場合は従来の planStart ベースへフォールバックし、
//     warnings に kunYoteiFallback を立てる（黙って旧挙動に戻らない＝@355 と同じ方式）。
//
// 利用者の実名は使わない（記号のみ）。
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');
const core = require(path.join(REPO, 'gas', 'yawaragi-board', 'month-board-core.js'));
const sb = require(path.join(REPO, 'gas', 'yawaragi-board', 'session-board-core.js'));
const judges = require(path.join(REPO, 'gas', 'yawaragi-board', 'session-board-judges.js'));
const gasSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const buildMonthBoard = core.buildMonthBoard;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  [FAIL] ' + m); } }
function sec(t) { console.log('\n[' + t + ']'); }

const deps = {
  isPlanMonth: judges.isPlanMonth,
  isHyoukaMonth: judges.isHyoukaMonth,
  sokuteiDueDate_: sb.sokuteiDueDate_,
  sbNormalizeName_: sb.sbNormalizeName_
};
// planStart=2026-01 / 3ヶ月 → planStart ベースの計画月は 1,4,7,10月・評価月はその前月
const KAIGO = (id, name) => ({ userId: id, name: name, category: '要介護1', planStart: '2026-01', planMonths: 3 });
const SHIEN = (id, name) => ({ userId: id, name: name, category: '要支援1', planStart: '', planMonths: null });

function build(ym, users, opt) {
  opt = opt || {};
  const input = {
    targetMonth: ym, users: users,
    kunRecords: opt.kunRecords || [], kunRecordsNext: opt.kunRecordsNext || [],
    oralRecords: [], sokuteiRecords: opt.sokuteiRecords || [],
    tsushoSendRecords: [], tsushoDueMap: {}
  };
  if (opt.kobetsuYotei !== undefined) input.kobetsuYotei = opt.kobetsuYotei;
  return buildMonthBoard(input, deps);
}
const sect = (b, k) => b.sections.find(s => s.key === k) || { targets: [], countTarget: 0 };
const has = (b, k, uid) => sect(b, k).targets.some(t => t.userId === uid);
const got = (b, k, uid) => sect(b, k).targets.find(t => t.userId === uid) || { done: '(対象に居ない)' };
const warnTypes = b => (b.warnings || []).map(w => w.type);

// =====================================================================
sec('A) _mbYoteiIsWorkMonth_（純関数）');
{
  const f = core._mbYoteiIsWorkMonth_;
  ok(typeof f === 'function', 'A0: _mbYoteiIsWorkMonth_ が公開されている');
  if (typeof f === 'function') {
    ok(f({ U1: '2026-09' }, 'U1', '2026-09') === true, 'A1: 翌月が予定月なら true（＝このボード月が作業月）');
    ok(f({ U1: '2026-09' }, 'U1', '2026-08') === false, 'A2: 翌月が予定月でなければ false');
    ok(f({ U1: '2026-09' }, 'U2', '2026-09') === null, 'A3: その人の行が無ければ null（＝フォールバックの合図）');
    ok(f(null, 'U1', '2026-09') === null, 'A4: マップ自体が無ければ null');
    ok(f({ U1: '2026-9' }, 'U1', '2026-09') === null, 'A5: 形式違いは null（黙って対象外にしない）');
    ok(f({ U1: '' }, 'U1', '2026-09') === null, 'A6: 空文字も null');
  }
}

sec('B) 月次ボード: 翌月が予定月なら 計画書・評価・測定 の3つとも同じ月に立つ');
{
  // ボード月2026-08／予定月2026-09 → 8月が作業月。planStart ベースだと 8月は対象外（計画月は 1,4,7,10）。
  const u = [KAIGO('U1', 'ダミーA')];
  const b = build('2026-08', u, { kobetsuYotei: { U1: '2026-09' }, kunRecordsNext: [] });
  ok(has(b, 'kunPlan', 'U1'), 'B1: 計画書が対象になる');
  ok(has(b, 'kunEval', 'U1'), 'B2: 評価が対象になる');
  ok(has(b, 'sokuteiKaigo', 'U1'), 'B3: 測定(要介護)が対象になる');
  ok(warnTypes(b).indexOf('kunYoteiFallback') < 0, 'B4: 予定月が取れているのでフォールバック warning は立たない');
  // 対象外の月では3つとも立たない
  const b2 = build('2026-07', u, { kobetsuYotei: { U1: '2026-09' }, kunRecordsNext: [] });
  ok(!has(b2, 'kunPlan', 'U1') && !has(b2, 'kunEval', 'U1') && !has(b2, 'sokuteiKaigo', 'U1'),
    'B5: 作業月でない月には3つとも立たない（planStart ベースの 7月＝旧計画月でも立たない）');
}

sec('C) 予定月を1ヶ月動かすと3つとも同じだけ移動する');
{
  const u = [KAIGO('U1', 'ダミーB')];
  const at = (ym, yotei) => {
    const b = build(ym, u, { kobetsuYotei: { U1: yotei }, kunRecordsNext: [] });
    return [has(b, 'kunPlan', 'U1'), has(b, 'kunEval', 'U1'), has(b, 'sokuteiKaigo', 'U1')].join(',');
  };
  ok(at('2026-08', '2026-09') === 'true,true,true', 'C1: 予定月=9月 → 8月に3つとも立つ');
  ok(at('2026-09', '2026-09') === 'false,false,false', 'C2: 予定月=9月 → 9月には立たない');
  ok(at('2026-09', '2026-10') === 'true,true,true', 'C3: 予定月を10月へ動かすと 9月へ3つとも移動');
  ok(at('2026-08', '2026-10') === 'false,false,false', 'C4: 移動後、元の8月には立たない');
}

sec('D) 予定月の行が無い人はフォールバックし warning が立つ');
{
  const u = [KAIGO('U1', 'ダミーC')];
  // 予定月マップはあるが、この人の行が無い → planStart ベース（計画月 1,4,7,10 / 作業月はその前月）
  const b = build('2026-06', u, { kobetsuYotei: { OTHER: '2026-09' }, kunRecordsNext: [] });
  ok(has(b, 'kunPlan', 'U1'), 'D1: フォールバックで 6月が作業月（翌7月が planStart ベースの計画月）');
  ok(warnTypes(b).indexOf('kunYoteiFallback') >= 0, 'D2: kunYoteiFallback の warning が立つ');
  const w = (b.warnings || []).find(x => x.type === 'kunYoteiFallback');
  ok(w && w.userId === 'U1', 'D3: warning に userId が入る');
  ok(w && w.month === '2026-06', 'D4: warning に対象月が入る');
  // 評価はフォールバックで isHyoukaMonth(planStart) ＝ 12,3,6,9月
  const b2 = build('2026-06', u, { kobetsuYotei: {}, kunRecordsNext: [] });
  ok(has(b2, 'kunEval', 'U1') && has(b2, 'sokuteiKaigo', 'U1'),
    'D5: 評価・測定もフォールバックで従来どおり立つ（6月＝planStart ベースの評価月）');
}

sec('E) 予定月の供給自体が無い場合もフォールバックする（旧GAS・読み取り失敗）');
{
  const u = [KAIGO('U1', 'ダミーD')];
  const b = build('2026-06', u, { kunRecordsNext: [] });   // kobetsuYotei を渡さない
  ok(has(b, 'kunPlan', 'U1'), 'E1: 供給が無くても従来どおり判定される（黙って全員対象外にしない）');
  ok(warnTypes(b).indexOf('kunYoteiFallback') >= 0, 'E2: kunYoteiFallback が立つ');
}

sec('F) 要支援・事業対象者の測定判定は不変');
{
  const s = [SHIEN('S1', 'ダミーE')];
  const recs = [{ name: 'ダミーE', sokutei_date: '2026-03-10' }];
  const b = build('2026-07', s, { sokuteiRecords: recs, kobetsuYotei: { S1: '2026-09' }, kunRecordsNext: [] });
  ok(has(b, 'sokuteiShien', 'S1'), 'F1: 前回測定+4ヶ月で対象（予定月マップに行があっても影響しない）');
  ok(!has(b, 'sokuteiKaigo', 'S1'), 'F2: 要支援は要介護の測定セクションに出ない');
  const b2 = build('2026-08', s, { sokuteiRecords: recs, kobetsuYotei: { S1: '2026-09' }, kunRecordsNext: [] });
  ok(!has(b2, 'sokuteiShien', 'S1'), 'F3: 8月は対象外（+4ヶ月＝7月）＝判定が動いていない');
  ok(warnTypes(b).indexOf('kunYoteiFallback') < 0, 'F4: 要支援だけの月に要介護のフォールバック warning を立てない');
}

sec('G) 保留（blocked_reason）の除外が従来どおり効く');
{
  const u = [KAIGO('U1', 'ダミーF')];
  const yo = { U1: '2026-09' };
  const next = [{ userId: 'U1', name: 'ダミーF', keikaku_date: '', blocked_reason: '長期休み' }];
  const cur = [{ userId: 'U1', name: 'ダミーF', tasseido_date: '', blocked_reason: '長期休み' }];
  const b = build('2026-08', u, { kobetsuYotei: yo, kunRecordsNext: next, kunRecords: cur });
  ok(!has(b, 'kunPlan', 'U1'), 'G1: 保留なら計画書は対象外（翌月の行の blocked_reason を見る）');
  ok(!has(b, 'kunEval', 'U1'), 'G2: 保留なら評価も対象外（当月の行の blocked_reason を見る）');
  ok(has(b, 'sokuteiKaigo', 'U1'), 'G3: 測定は保留の除外対象外（従来どおり立つ）');
}

sec('H) 年跨ぎ（予定月が翌年1月）');
{
  const u = [KAIGO('U1', 'ダミーG')];
  const b = build('2026-12', u, { kobetsuYotei: { U1: '2027-01' }, kunRecordsNext: [] });
  ok(has(b, 'kunPlan', 'U1') && has(b, 'kunEval', 'U1') && has(b, 'sokuteiKaigo', 'U1'),
    'H1: 12月に3つとも立つ（翌1月が予定月）');
  const b2 = build('2027-01', u, { kobetsuYotei: { U1: '2027-01' }, kunRecordsNext: [] });
  ok(!has(b2, 'kunPlan', 'U1'), 'H2: 1月には立たない');
}

sec('I) 済判定は変えていない');
{
  const u = [KAIGO('U1', 'ダミーH')];
  const yo = { U1: '2026-09' };
  // kunPlan: _mbFieldDoneWorkMonth_（翌月ym＝2026-09 の当月 or 前月＝2026-08）
  const b1 = build('2026-08', u, { kobetsuYotei: yo, kunRecordsNext: [{ userId: 'U1', name: 'ダミーH', keikaku_date: '2026-08-20' }] });
  ok(got(b1, 'kunPlan', 'U1').done === true, 'I1: 計画書は前月付け(8/20)でも済（_mbFieldDoneWorkMonth_ のまま）');
  const b2 = build('2026-08', u, { kobetsuYotei: yo, kunRecordsNext: [{ userId: 'U1', name: 'ダミーH', keikaku_date: '2026-07-20' }] });
  ok(got(b2, 'kunPlan', 'U1').done === false, 'I2: 前々月付けは未（窓の広さを変えていない）');
  // kunEval: 当月のみ
  const b3 = build('2026-08', u, { kobetsuYotei: yo, kunRecords: [{ userId: 'U1', name: 'ダミーH', tasseido_date: '2026-08-05' }], kunRecordsNext: [] });
  ok(got(b3, 'kunEval', 'U1').done === true, 'I3: 評価は当月付けで済');
  // sokuteiKaigo: 個訓シート ∪ 測定記録シート（@360の和）
  const b4 = build('2026-08', u, { kobetsuYotei: yo, kunRecordsNext: [], sokuteiRecords: [{ name: 'ダミーH', sokutei_date: '2026-08-06' }] });
  ok(got(b4, 'sokuteiKaigo', 'U1').done === true, 'I4: 測定記録シート由来でも済（@360の和が生きている）');
  const b5 = build('2026-08', u, { kobetsuYotei: yo, kunRecordsNext: [], sokuteiRecords: [{ userId: 'U1', sokutei_date: '2026-08-02' }] });
  ok(got(b5, 'sokuteiKaigo', 'U1').done === true, 'I5: 個訓シート13列目由来でも済');
}

sec('J) セッションボード: sbMeasureKaigo_ も予定月ベース');
{
  const users = [{ name: 'ダミーI', category: '要介護1', planStart: '2026-01', planMonths: 3, days: '月' }];
  const run = (y, m, yoteiMap) => sb.sbMeasureKaigo_(users, {}, y, m, y + '-' + String(m).padStart(2, '0') + '-01',
    judges.isHyoukaMonth, {}, yoteiMap);
  ok(run(2026, 8, { 'ダミーI': '2026-09' }).length === 1, 'J1: 予定月=9月 → 8月が対象');
  ok(run(2026, 9, { 'ダミーI': '2026-09' }).length === 0, 'J2: 9月は対象外');
  ok(run(2026, 9, { 'ダミーI': '2026-10' }).length === 1, 'J3: 予定月を動かすと対象月も動く');
  ok(run(2026, 6, {}).length === 1, 'J4: 予定月が無ければ planStart ベースへフォールバック（6月＝評価月）');
  ok(run(2026, 8, {}).length === 0, 'J5: フォールバック時は従来どおり 8月は対象外');
  ok(run(2026, 6, null).length === 1, 'J6: マップ自体が無くても落ちない');
  // 済判定は不変（doneByKey で除外される）
  const done = {}; done[sb.sbNormalizeName_('ダミーI')] = true;
  ok(sb.sbMeasureKaigo_(users, done, 2026, 8, '2026-08-01', judges.isHyoukaMonth, {}, { 'ダミーI': '2026-09' }).length === 0,
    'J7: 済の人は従来どおり除外される');
}

sec('K) 配線（コード.js が予定月を供給している）');
{
  ok(/kobetsuYotei/.test(gasSrc), 'K1: コード.js が kobetsuYotei を組み立てている');
  ok(/readYotei_\(\s*['"]kobetsu['"]\s*\)/.test(gasSrc), 'K2: 予定月シートの domain=kobetsu を読んでいる');
  ok((gasSrc.match(/kobetsuYotei:/g) || []).length >= 2,
    'K3: 月次ボードとセッションボードの両方の入力に渡している 実際=' + (gasSrc.match(/kobetsuYotei:/g) || []).length);
  ok(/sbBuildKaigoDone_\(/.test(gasSrc), 'K4: @360 の測定の済判定はそのまま残っている');
}

sec('L) 要支援の判定コードに変更が無い');
{
  const mbSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'month-board-core.js'), 'utf8');
  ok(mbSrc.indexOf('var due = mbShienMeasureDue_(dates, ym, cat, d.sokuteiDueDate_);') >= 0,
    'L1: 要支援の対象判定（mbShienMeasureDue_）が従来どおり');
  ok(mbSrc.indexOf('var ss = _mbListDone_(dates, ym);') >= 0, 'L2: 要支援の済判定が従来どおり');
  const sbSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'session-board-core.js'), 'utf8');
  ok(sbSrc.indexOf('function sbMeasureShien_(shienUsers, lastByName, todayStr, usageByKey) {') >= 0,
    'L3: セッションボードの要支援関数のシグネチャが不変');
}

console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
process.exit(fail ? 1 : 0);
