// フェーズ1b: done方式（実施済みを消さず残しグレー化）・並べ替え・残数カウントの純関数テスト。
// 実行: node scripts/test-session-done-1b.js
// 対象: session-board-core.js の sbMeasureKaigo_/sbMeasureShien_/sbKoukuMoni_/sbKoukuTaisou_/
//       sbSokuteiSort_（done最下位）/新helper sbDoneLast_/sbUndoneCount_/sbTopUndone_
const assert = require('assert');
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

let pass = 0, fail = 0, cases = [];
function t(name, fn) {
  try { fn(); pass++; cases.push('  ok ' + name); }
  catch (e) { fail++; cases.push('  NG ' + name + '\n      ' + (e && e.message || e)); }
}
function eq(a, b, m) { assert.strictEqual(a, b, m); }

var isHyk = function () { return true; };
var kUsers = [{ name: '介太郎', category: '要介護1', planStart: '2026-01', planMonths: 3, days: '月火' }];

// ---- 測定 要介護: 実施済みを done で残す ----
  t('kaigo 未実施は done:false で残る', function () {
    var r = core.sbMeasureKaigo_(kUsers, {}, 2026, 7, '2026-07-15', isHyk, {});
    eq(r.length, 1); eq(r[0].done, false);
  });
  t('kaigo 実施済みは消さず done:true で残す', function () {
    var r = core.sbMeasureKaigo_(kUsers, { '介太郎': true }, 2026, 7, '2026-07-15', isHyk, {});
    eq(r.length, 1); eq(r[0].done, true);
  });

// ---- 測定 要支援: last月==当月なら done ----
var sUsers = [{ name: '支花子', care: '要支援2', days: '月' }];
  t('shien 当月測定済み → done:true', function () {
    var r = core.sbMeasureShien_(sUsers, { '支花子': '2026-07-03' }, '2026-07-15', {});
    eq(r[0].done, true);
  });
  t('shien 先月以前 → done:false', function () {
    var r = core.sbMeasureShien_(sUsers, { '支花子': '2026-06-30' }, '2026-07-15', {});
    eq(r[0].done, false);
  });
  t('shien 未測定 → done:false・unmeasured:true', function () {
    var r = core.sbMeasureShien_(sUsers, {}, '2026-07-15', {});
    eq(r[0].done, false); eq(r[0].unmeasured, true);
  });

// ---- 口腔モニ: 実施済みを done で残す ----
var oUsers = [{ name: 'モニ子', planStart: '2026-07', planEnd: '' }];
var cyc = function () { return { role: 'moni1' }; };
  t('moni 未実施 → done:false で残る', function () {
    var r = core.sbKoukuMoni_(oUsers, {}, 2026, 7, cyc);
    eq(r.length, 1); eq(r[0].done, false);
  });
  t('moni 当月実施済み → done:true で残す', function () {
    var r = core.sbKoukuMoni_(oUsers, { 'モニ子': { moni1_date: '2026-07-05' } }, 2026, 7, cyc);
    eq(r.length, 1); eq(r[0].done, true);
  });

// ---- 口腔体操: 1aの required/remaining を組込み done付与 ----
var checks = { '2026': { '介太郎': { '7月_1回目': '7/2', '7月_2回目': '7/20' }, '支花子': { '7月_1回目': '7/5' } } };
var tSettings = [
  { name: '介太郎', isTarget: true, care: '要介護1' },   // 2/2 → 済
  { name: '支花子', isTarget: true, care: '要支援2' },   // 1/1 → 済
  { name: '未実子', isTarget: true, care: '要介護2' },   // 0/2 → 未実施 残2
  { name: '除外郎', isTarget: false, care: '要介護1' }    // 非対象
];
  t('taisou required/remaining/done を付与（残>0のみ未実施）', function () {
    var r = core.sbKoukuTaisou_(tSettings, checks, 2026, 7);
    var by = {}; r.forEach(function (x) { by[x.name] = x; });
    eq(r.length, 3);
    eq(by['介太郎'].done, true); eq(by['介太郎'].remaining, 0); eq(by['介太郎'].required, 2);
    eq(by['支花子'].done, true); eq(by['支花子'].remaining, 0); eq(by['支花子'].required, 1);
    eq(by['未実子'].done, false); eq(by['未実子'].remaining, 2); eq(by['未実子'].doneCount, 0);
  });
  t('taisou oralChecks省略時は全員未実施（done:false）', function () {
    var r = core.sbKoukuTaisou_([{ name: '介太郎', isTarget: true, care: '要介護1' }]);
    eq(r[0].done, false); eq(r[0].remaining, 2);
  });

// ---- sbDoneLast_: 未実施を上・済みを下（安定ソート） ----
  t('sbDoneLast_ 未実施が上・済みが下・順序安定', function () {
    var arr = [{ key: 'a', done: false }, { key: 'b', done: true }, { key: 'c', done: false }, { key: 'd', done: true }];
    var r = core.sbDoneLast_(arr);
    eq(r.map(function (x) { return x.key; }).join(''), 'acbd');
  });
  t('sbDoneLast_ null入力で空', function () { eq(core.sbDoneLast_(null).length, 0); });

// ---- sbUndoneCount_ / sbTopUndone_: カード数=残数・上位N=未実施のみ ----
  t('sbUndoneCount_ 未実施のみ数える', function () {
    eq(core.sbUndoneCount_([{ done: false }, { done: true }, { done: false }]), 2);
  });
  t('sbUndoneCount_ 全員済 → 0（境界）', function () {
    eq(core.sbUndoneCount_([{ done: true }, { done: true }]), 0);
  });
  t('sbTopUndone_ 未実施のみから上位N', function () {
    var arr = [{ key: 'a', done: true }, { key: 'b', done: false }, { key: 'c', done: false }, { key: 'd', done: false }];
    var r = core.sbTopUndone_(arr, 2);
    eq(r.length, 2); eq(r.map(function (x) { return x.key; }).join(''), 'bc');
  });

// ---- sbSokuteiSort_: done を最下位（未実施が上・careLayerより優先） ----
  t('sbSokuteiSort_ done は最下位（未実施を上に）', function () {
    var pool = [
      { key: 'done1', careLayer: 0, done: true, weeklyVisits: 2, remainingVisits: 1 },
      { key: 'undone1', careLayer: 1, done: false, weeklyVisits: 2, remainingVisits: 1 }
    ];
    var r = core.sbSokuteiSort_(pool, {});
    eq(r[0].done, false); eq(r[1].done, true);
  });

// ---- 境界: 全員済 → カード残数0 ----
  t('境界: 要介護全員済 → 残数0', function () {
    var allDone = core.sbMeasureKaigo_(kUsers, { '介太郎': true }, 2026, 7, '2026-07-15', isHyk, {});
    eq(core.sbUndoneCount_(allDone), 0);
  });

console.log(cases.join('\n'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
