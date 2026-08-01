// 月次ボード／セッションボード: 要介護の測定を「測定記録シート」からも読む
// 実行: node scripts/test-board-sokutei-source.js
//
// 背景（2026-08-01 のクロコ調査・実測）:
//   2026-08-01 の片寄せ（版 -03）で、個訓アプリからの測定入力を撤去し、新規の測定は
//   すべて「測定記録シート」へ書かれるようになった。ところが
//     ・月次ボード   … 済判定 = sokById（個訓シート13列目）のみ（month-board-core.js:235）
//     ・セッションB … 済判定 = kaigoDoneByKey（個訓13列目 かつ「行の年月が当月」の行のみ）
//   のままで、測定記録シートを1件も見ていない。このままだと測定しても永久に「未」で督促が続く。
//   実害（2026-07 実測）: 誤督促が 月次ボード4名／セッションボード21名（対象全員）。
//
// 仕様（クロ確定 2026-08-01）:
//   ・要介護の済判定を「個訓シート13列目 ∪ 測定記録シート」の【和】にする。既存参照は外さない。
//   ・セッションボードは「行の年月」ではなく【実施日の月】で判定する（行の月と実施月は一致しない）。
//   ・要支援側（sokByName のみ）の判定は変えない。
//   ・★対象月の決め方（isHyoukaMonth / planStart 起点）は変更しない。それは段階5の範囲。
//
// 利用者の実名は使わない（記号のみ）。
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..');
const core = require(path.join(REPO, 'gas', 'yawaragi-board', 'month-board-core.js'));
const sb = require(path.join(REPO, 'gas', 'yawaragi-board', 'session-board-core.js'));
const gasSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const buildMonthBoard = core.buildMonthBoard;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  [FAIL] ' + m); } }
function sec(t) { console.log('\n[' + t + ']'); }

const norm = s => String(s == null ? '' : s).replace(/[\s　]+/g, '');
// 対象月の判定は「planStart があれば当月が評価月」で固定（今回は位相を触らないので単純化）
const deps = {
  isPlanMonth: () => false,
  isHyoukaMonth: (planStart) => !!planStart,
  sokuteiDueDate_: sb.sokuteiDueDate_,
  sbNormalizeName_: sb.sbNormalizeName_
};
const KAIGO = (id, name) => ({ userId: id, name: name, category: '要介護1', planStart: '2026-01', planMonths: 3 });
const SHIEN = (id, name) => ({ userId: id, name: name, category: '要支援1', planStart: '', planMonths: null });
function build(ym, users, sokuteiRecords) {
  return buildMonthBoard({
    targetMonth: ym, users: users, kunRecords: [], kunRecordsNext: [],
    oralRecords: [], sokuteiRecords: sokuteiRecords || [], tsushoSendRecords: [], tsushoDueMap: {}
  }, deps);
}
const sect = (b, key) => b.sections.find(s => s.key === key) || { targets: [] };
const findT = (b, key, uid) => sect(b, key).targets.filter(t => t.userId === uid);

// =====================================================================
sec('A) 月次ボード: 測定記録シートにだけ測定がある人が「済」になる');
{
  // 個訓シート由来は { userId, sokutei_date }（name を持たない）＝ sokById へ入る
  // 測定記録シート由来は { name, sokutei_date }（userId を持たない）＝ sokByName へ入る
  const b = build('2026-07', [KAIGO('U1', 'ダミーA')], [{ name: 'ダミーA', sokutei_date: '2026-07-06' }]);
  const t = findT(b, 'sokuteiKaigo', 'U1');
  ok(t.length === 1, 'A0: 対象に1件だけ出る 実際=' + t.length);
  ok(t[0] && t[0].done === true, 'A1: 測定記録シートだけでも「済」になる 実際=' + (t[0] && t[0].done));
  ok(t[0] && t[0].doneDate === '2026-07-06', 'A2: 実施日も返る 実際=' + (t[0] && t[0].doneDate));
}
{
  // 表記ゆれ（全角スペース）でも正規化して突き合わせる
  const b = build('2026-07', [KAIGO('U1', 'ダミー　A')], [{ name: 'ダミーA', sokutei_date: '2026-07-06' }]);
  const t = findT(b, 'sokuteiKaigo', 'U1');
  ok(t[0] && t[0].done === true, 'A3: 名前の表記ゆれを正規化して拾う');
}

sec('B) 月次ボード: 個訓シートにだけ測定がある人は引き続き「済」（既存参照を外していない）');
{
  const b = build('2026-07', [KAIGO('U1', 'ダミーB')], [{ userId: 'U1', sokutei_date: '2026-07-02' }]);
  const t = findT(b, 'sokuteiKaigo', 'U1');
  ok(t[0] && t[0].done === true, 'B1: 個訓シート13列目だけでも「済」のまま 実際=' + (t[0] && t[0].done));
  ok(t[0] && t[0].doneDate === '2026-07-02', 'B2: 実施日も従来どおり 実際=' + (t[0] && t[0].doneDate));
}
{
  // 当月に無ければ従来どおり「未」
  const b = build('2026-08', [KAIGO('U1', 'ダミーB')], [{ userId: 'U1', sokutei_date: '2026-07-02' }]);
  const t = findT(b, 'sokuteiKaigo', 'U1');
  ok(t[0] && t[0].done === false, 'B3: 当月に測定が無ければ「未」（判定の意味は変えていない）');
}

sec('C) 月次ボード: 両方にあっても二重にならない');
{
  const b = build('2026-07', [KAIGO('U1', 'ダミーC')], [
    { userId: 'U1', sokutei_date: '2026-07-02' },
    { name: 'ダミーC', sokutei_date: '2026-07-06' }
  ]);
  const t = findT(b, 'sokuteiKaigo', 'U1');
  ok(t.length === 1, 'C1: 対象は1人1件のまま（二重カウントしない） 実際=' + t.length);
  ok(t[0] && t[0].done === true, 'C2: 済');
  ok(t[0] && t[0].doneDate === '2026-07-02', 'C3: 個訓シート側を先に採る（既存の見え方を変えない） 実際=' + (t[0] && t[0].doneDate));
  const s = sect(b, 'sokuteiKaigo');
  ok(s.countTarget === 1 && s.countDone === 1, 'C4: 集計も1件（countTarget=' + s.countTarget + ' countDone=' + s.countDone + '）');
}

sec('D) 月次ボード: 要支援側の判定は変えていない');
{
  // 要支援は前回測定日+4ヶ月が対象月（nameキー）。個訓シート由来(userIdのみ)は影響しない。
  const b = build('2026-07', [SHIEN('S1', 'ダミーD')], [{ name: 'ダミーD', sokutei_date: '2026-03-10' }]);
  const t = findT(b, 'sokuteiShien', 'S1');
  ok(t.length === 1, 'D1: 前回測定+4ヶ月で対象になる（従来どおり） 実際=' + t.length);
  ok(t[0] && t[0].done === false, 'D2: 当月未実施なら「未」');
  const b2 = build('2026-07', [SHIEN('S1', 'ダミーD')], [
    { name: 'ダミーD', sokutei_date: '2026-03-10' }, { name: 'ダミーD', sokutei_date: '2026-07-05' }]);
  ok(findT(b2, 'sokuteiShien', 'S1')[0].done === true, 'D3: 当月実施なら「済」（従来どおり）');
  // 要支援に userId キーの行を足しても判定が動かないこと（要介護側の変更が漏れていない）
  const b3 = build('2026-07', [SHIEN('S1', 'ダミーD')], [
    { name: 'ダミーD', sokutei_date: '2026-03-10' }, { userId: 'S1', sokutei_date: '2026-07-05' }]);
  ok(findT(b3, 'sokuteiShien', 'S1')[0].done === false,
    'D4: 要支援は name キーのみで判定する（userId 由来を混ぜていない）');
}

sec('E) 月次ボード: 年跨ぎで壊れない');
{
  const b = build('2026-01', [KAIGO('U1', 'ダミーE')], [{ name: 'ダミーE', sokutei_date: '2026-01-15' }]);
  ok(findT(b, 'sokuteiKaigo', 'U1')[0].done === true, 'E1: 1月の測定記録シート由来を拾う');
  const b2 = build('2026-01', [KAIGO('U1', 'ダミーE')], [{ name: 'ダミーE', sokutei_date: '2025-12-20' }]);
  ok(findT(b2, 'sokuteiKaigo', 'U1')[0].done === false, 'E2: 前年12月は当月ではないので「未」');
}

sec('F) セッションボード: sbBuildKaigoDone_（純関数）');
{
  const f = sb.sbBuildKaigoDone_;
  ok(typeof f === 'function', 'F0: sbBuildKaigoDone_ が公開されている');
  if (typeof f === 'function') {
    // ★実データの主パターン: 行=2026-05（計画期間の開始月）／実施日=2026-07
    //   従来は「行の年月が当月」で絞っていたため取りこぼしていた（実測21件中20件）。
    const kun = [{ name: 'ダミーF', year: 2026, month: 5, sokutei_date: '2026-07-02' }];
    const d1 = f(kun, [], '2026-07', norm);
    ok(!!d1[norm('ダミーF')], 'F1: 行の年月と実施月が違っても、実施日の月で拾う');
    const d2 = f(kun, [], '2026-05', norm);
    ok(!d2[norm('ダミーF')], 'F2: 行の年月では済にしない（実施日の月が正）');
    // 測定記録シート由来
    const d3 = f([], [{ name: 'ダミーF', sokutei_date: '2026-07-06' }], '2026-07', norm);
    ok(!!d3[norm('ダミーF')], 'F3: 測定記録シートの測定も拾う');
    // 両方あっても1つ
    const d4 = f(kun, [{ name: 'ダミーF', sokutei_date: '2026-07-06' }], '2026-07', norm);
    ok(Object.keys(d4).length === 1 && !!d4[norm('ダミーF')], 'F4: 両方にあってもキーは1つ（二重にならない）');
    // 当月以外は入らない
    ok(!f(kun, [], '2026-08', norm)[norm('ダミーF')], 'F5: 当月以外の測定は済にしない');
    // 年跨ぎ
    ok(!!f([{ name: 'ダミーG', year: 2025, month: 11, sokutei_date: '2025-12-20' }], [], '2025-12', norm)[norm('ダミーG')],
      'F6: 年跨ぎ（行=2025-11 実施=2025-12）でも拾う');
    // 表記ゆれ・空・壊れた値
    ok(!!f([{ name: 'ダミー　F', year: 2026, month: 5, sokutei_date: '2026-07-02' }], [], '2026-07', norm)[norm('ダミーF')],
      'F7: 名前の表記ゆれを正規化する');
    ok(Object.keys(f(null, null, '2026-07', norm)).length === 0, 'F8: 入力が無くても落ちない');
    ok(Object.keys(f([{ name: 'x', year: 2026, month: 5, sokutei_date: '' }], [], '2026-07', norm)).length === 0,
      'F9: 測定日が空の行は済にしない');
    ok(Object.keys(f([], [], '', norm)).length === 0, 'F10: ym が空なら誰も済にしない');
  }
}

sec('G) セッションボードの配線（コード.js）');
{
  ok(gasSrc.indexOf('sbBuildKaigoDone_(') >= 0, 'G1: コード.js が sbBuildKaigoDone_ を呼んでいる');
  // 旧実装（行の年月で絞る2行）が残っていないこと
  ok(!/if \(\(parseInt\(kr\[2\], 10\) \|\| 0\) !== year\) continue;/.test(gasSrc),
    'G2: 「行の year が当月でなければ continue」の絞り込みが残っていない');
  ok(gasSrc.indexOf('ensureShienSokuteiSheet_') >= 0, 'G3: 測定記録シートの読み取りは残っている');
}

sec('H) 対象月の判定（位相）は変更していない＝段階5の範囲');
{
  const mbSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'month-board-core.js'), 'utf8');
  ok(mbSrc.indexOf('d.isHyoukaMonth(u.planStart, u.planMonths, y, m)') >= 0,
    'H1: 月次ボードの対象月は isHyoukaMonth(planStart) のまま');
  const sbSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'session-board-core.js'), 'utf8');
  ok(sbSrc.indexOf('if (!isHyoukaMonthFn(u.planStart, u.planMonths, year, month)) return;') >= 0,
    'H2: セッションボードの対象月は isHyoukaMonth(planStart) のまま');
  ok(mbSrc.indexOf('mbShienMeasureDue_') >= 0, 'H3: 要支援の対象月判定も従来どおり');
}

console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
process.exit(fail ? 1 : 0);
