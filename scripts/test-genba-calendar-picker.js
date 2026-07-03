// genba.html カレンダー式ピッカーの純関数を「実コード抽出」してテスト
// 対象: gnbYmAdd / gnbMonthCalendarDays / gnbDowScheduledDates / gnbDaySlots / gnbToggleDaySlots / gnbToggleDowSlots
// 実行: node scripts/test-genba-calendar-picker.js
// （test-genba-absence-slots.js と同じTDD流儀。出荷コードそのものを検証する）

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

const NAMES = ['gnbNormalizeSlots', 'gnbYmAdd', 'gnbMonthCalendarDays',
  'gnbDowScheduledDates', 'gnbDaySlots', 'gnbToggleDaySlots', 'gnbToggleDowSlots'];
const sandbox = {};
new Function('sb', NAMES.map(extractFn).join('\n') + '\n' +
  NAMES.map(function (n) { return 'sb.' + n + ' = ' + n + ';'; }).join(''))(sandbox);
const { gnbYmAdd, gnbMonthCalendarDays, gnbDowScheduledDates,
        gnbDaySlots, gnbToggleDaySlots, gnbToggleDowSlots } = sandbox;

let pass = 0, fail = 0;
function eqJson(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; }
  else { fail++; console.error('  [FAIL] ' + label + '\n    expected: ' + E + '\n    actual:   ' + A); }
}

// ===== 基準: 2026-07-03(金)。7月: 水=1,8,15,22,29 / 金=3,10,17,24,31 =====
// 利用者パターン: 水(am+pm)・金(pm)
const pat = [{ day: 3, unit: 'am' }, { day: 3, unit: 'pm' }, { day: 5, unit: 'pm' }];
const TODAY = '2026-07-03';

// --- gnbYmAdd ---
eqJson(gnbYmAdd('2026-07', 1), '2026-08', 'ymAdd: +1');
eqJson(gnbYmAdd('2026-12', 1), '2027-01', 'ymAdd: 年跨ぎ');
eqJson(gnbYmAdd('2026-08', -1), '2026-07', 'ymAdd: -1');
eqJson(gnbYmAdd('2026-01', -1), '2025-12', 'ymAdd: 負の年跨ぎ');

// --- gnbMonthCalendarDays ---
const july = gnbMonthCalendarDays(pat, TODAY, '2026-07');
eqJson(july.length, 31, 'month: 7月は31日');
eqJson(gnbMonthCalendarDays([], TODAY, '2026-02').length, 28, 'month: 2026-02は28日');
eqJson(gnbMonthCalendarDays([], TODAY, '2028-02').length, 29, 'month: 2028-02は閏年で29日');
eqJson(gnbMonthCalendarDays([], TODAY, '2026-04').length, 30, 'month: 2026-04は30日');
eqJson(july[0], { date: '2026-07-01', dow: 3, scheduled: true, past: true },
  'month: 7/1(水)=通所日・過去');
eqJson(july[2], { date: '2026-07-03', dow: 5, scheduled: true, past: false },
  'month: 7/3(金)=当日は past ではない');
eqJson(july[3], { date: '2026-07-04', dow: 6, scheduled: false, past: false },
  'month: 7/4(土)=非通所日');
eqJson(gnbMonthCalendarDays([], TODAY, '2026-07')[0].scheduled, false,
  'month: パターン空なら全日 scheduled=false');

// --- gnbDowScheduledDates（曜日一括の対象。今日以降のみ・過去日は巻き込まない） ---
eqJson(gnbDowScheduledDates(pat, TODAY, '2026-07', 3),
  ['2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29'],
  'dow一括: 水曜は過去の7/1を除いた4日');
eqJson(gnbDowScheduledDates(pat, TODAY, '2026-07', 5),
  ['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31'],
  'dow一括: 金曜は当日7/3を含む5日');
eqJson(gnbDowScheduledDates(pat, TODAY, '2026-07', 1), [],
  'dow一括: 非利用曜日(月)は空＝ヘッダ非活性の根拠');
eqJson(gnbDowScheduledDates(pat, TODAY, '2026-08', 3),
  ['2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26'],
  'dow一括: 翌月の水曜4日');

// --- gnbDaySlots（unitは既存推定ロジックと同一） ---
eqJson(gnbDaySlots(pat, '2026-07-08'),
  [{ date: '2026-07-08', unit: '午前' }, { date: '2026-07-08', unit: '午後' }],
  'daySlots: 水(am+pm)の日は2コマ');
eqJson(gnbDaySlots(pat, '2026-07-10'),
  [{ date: '2026-07-10', unit: '午後' }], 'daySlots: 金(pm)の日は午後のみ');
eqJson(gnbDaySlots(pat, '2026-07-06'),
  [{ date: '2026-07-06', unit: '午前' }, { date: '2026-07-06', unit: '午後' }],
  'daySlots: 非通所日(月)は am+pm持ち利用者なら両コマ推定');
eqJson(gnbDaySlots([{ day: 5, unit: 'pm' }], '2026-07-06'),
  [{ date: '2026-07-06', unit: '午後' }], 'daySlots: pmのみ利用者の非通所日は午後推定');
eqJson(gnbDaySlots([], '2026-07-06'),
  [{ date: '2026-07-06', unit: '午前' }], 'daySlots: パターン未設定は午前既定');

// --- gnbToggleDaySlots ---
let s = gnbToggleDaySlots([], '2026-07-08', pat);
eqJson(s, [{ date: '2026-07-08', unit: '午前' }, { date: '2026-07-08', unit: '午後' }],
  'toggleDay: 未選択→選択（2コマ追加）');
s = gnbToggleDaySlots(s, '2026-07-10', pat);
eqJson(s.length, 3, 'toggleDay: 別日追加で3スロット');
s = gnbToggleDaySlots(s, '2026-07-08', pat);
eqJson(s, [{ date: '2026-07-10', unit: '午後' }], 'toggleDay: 再タップでその日の全コマ解除');

// --- gnbToggleDowSlots ---
const wedDates = ['2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29'];
let w = gnbToggleDowSlots([], wedDates, pat);
eqJson(w.length, 8, 'toggleDow: 水曜4日×2コマ=8スロット一括選択');
w = gnbToggleDowSlots(w, wedDates, pat);
eqJson(w, [], 'toggleDow: 全選択済→全解除');
w = gnbToggleDowSlots([{ date: '2026-07-08', unit: '午前' }, { date: '2026-07-08', unit: '午後' }], wedDates, pat);
eqJson(w.length, 8, 'toggleDow: 一部選択済→残りを埋めて全選択');
eqJson(gnbToggleDowSlots([{ date: '2026-07-10', unit: '午後' }], wedDates, pat).length, 9,
  'toggleDow: 他曜日の既存選択は保持');
eqJson(gnbToggleDowSlots([], [], pat), [], 'toggleDow: 対象日空なら何もしない');

// --- 受け入れ条件の再現: 7月の水曜5日ぶん（今日=7/1として一括+当日個別） ---
const wedAll = gnbDowScheduledDates(pat, '2026-07-01', '2026-07', 3);
eqJson(wedAll, ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29'],
  '受け入れ: 7/1時点の水曜一括対象は5日');
const wedSlots = gnbToggleDowSlots([], wedAll, pat);
const uniqDates = wedSlots.map(function (x) { return x.date; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
eqJson(uniqDates.length, 5, '受け入れ: ユニーク日付5日が1回の操作で選択される');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
