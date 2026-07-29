// test-sokutei-long-leave.js
// 長期休み中の人を「⏰ 予定月を過ぎています」から「💤 来所がなく測れていません」へ分けるための純関数。
//
// 背景（2026-07-29 社長決定）:
//   長期休みの人は予定月をスライドせず放置する運用にする。急に来たとき一覧に出ていて
//   その場で測れるようにするため。ただしそのままだと ⏰ に
//     「来ているのに測れていない人」と「来ないから測れない人」が混ざる。ここを分ける。
//   📋「計画に間に合いません」は枠を分けない。休んでいても計画書の期限は動かないため、
//   むしろ休み中こそケアマネへ相談が要る。枠から消すと相談の機会が消える（社長判断）。
//
// データ源は既存の board GAS。出欠変更シートの type='長期休み' 行が
// action=absences&month=YYYY-MM の absences.longTerm[] として公開済み（GAS改修不要）。
// getLongLeaveList は復帰日(endDate)が入った人を除外するため、返るのは進行中の休みだけ。
// それでも当月重なりはフロント側で判定する（APIの仕様変更に巻き込まれないための防御）。
//
// 判定式（planGapCheck / planGapLevel / covered）は一切触らない。
//
// 実行: node scripts/test-sokutei-long-leave.js

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
['normKey', 'longLeaveCoversMonth', 'buildLongLeaveMap'].forEach(n => {
  vm.runInContext(extractFn(html, n), sandbox);
});
const { normKey, longLeaveCoversMonth, buildLongLeaveMap } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A === E) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    actual  =' + A + '\n    expected=' + E); }
}
function sec(t) { console.log('\n[' + t + ']'); }

const YM = '2026-07';

sec('1. 長期休みの期間が当月に重なる／重ならない');
eq(longLeaveCoversMonth('2026-06-02', '', YM), true, '6月に始まり復帰未定 → 7月に重なる');
eq(longLeaveCoversMonth('2026-05-01', '2026-09-30', YM), true, '5月開始・9月復帰予定 → 7月に重なる');
eq(longLeaveCoversMonth('2026-08-01', '', YM), false, '8月開始 → 7月には重ならない（未来の休み）');
eq(longLeaveCoversMonth('2026-03-01', '2026-06-30', YM), false, '6月に復帰済 → 7月には重ならない');
eq(longLeaveCoversMonth('2026-03-01', '2026-07-15', YM), true, '7月中に復帰予定 → 7月には重なる');

sec('2. 終了日が未設定（無期限）');
eq(longLeaveCoversMonth('2026-06-02', '', YM), true, '復帰日が空＝まだ戻っていない');
eq(longLeaveCoversMonth('2026-06-02', null, YM), true, 'null でも無期限として扱う');
eq(longLeaveCoversMonth('2026-06-02', undefined, YM), true, 'undefined でも無期限として扱う');

sec('3. 開始日が当月の途中');
eq(longLeaveCoversMonth('2026-07-06', '', YM), true, '7/6 開始＝当月途中でも当月に重なる');
eq(longLeaveCoversMonth('2026-07-31', '', YM), true, '月末開始でも当月に重なる');

sec('4. 壊れた入力で落ちない');
eq(longLeaveCoversMonth('', '', YM), false, '開始日が空 → 対象外');
eq(longLeaveCoversMonth('2026-06-02', '', ''), false, '対象月が空 → 対象外');
eq(longLeaveCoversMonth(null, null, YM), false, 'null 尽くしでも例外にしない');

// =====================================================================
// buildLongLeaveMap: longTerm[] → { 正規化名: { startDate, elapsedDays } }
// =====================================================================
sec('5. 氏名の表記ゆれ（normKey で一致／不一致）');
{
  const list = [{ name: 'ダミー甲', date: '2026-06-02', resumeDate: '', elapsedDays: 57 }];
  const m = buildLongLeaveMap(list, YM);
  eq(!!m[normKey('ダミー甲')], true, '素の名前で引ける');
  eq(!!m[normKey('ダミー　甲')], true, '全角スペース入りでも正規化して一致');
  eq(!!m[normKey('ダミー甲 様')], true, '「様」付きでも正規化して一致');
  eq(!!m[normKey('ダミー乙')], false, '別人では一致しない');
  eq(m[normKey('ダミー甲')].elapsedDays, 57, '経過日数を持ち回れる（📋 の印に使う）');
  eq(m[normKey('ダミー甲')].startDate, '2026-06-02', '休み開始日を持ち回れる');
}

sec('6. longTerm が空配列／欠損でも壊れない');
eq(buildLongLeaveMap([], YM), {}, '空配列 → 空のマップ');
eq(buildLongLeaveMap(null, YM), {}, 'null → 空のマップ（API失敗時の想定）');
eq(buildLongLeaveMap(undefined, YM), {}, 'undefined → 空のマップ');
eq(buildLongLeaveMap([{}, { name: '' }, { date: '2026-06-01' }], YM), {}, '氏名が無い行は捨てる');

sec('7. 当月に重ならない人はマップに入らない');
{
  const list = [
    { name: 'ダミー甲', date: '2026-06-02', resumeDate: '', elapsedDays: 57 },   // 重なる
    { name: 'ダミー乙', date: '2026-08-01', resumeDate: '', elapsedDays: 0 },    // 未来
    { name: 'ダミー丙', date: '2026-03-01', resumeDate: '2026-06-30', elapsedDays: 0 } // 復帰済
  ];
  const m = buildLongLeaveMap(list, YM);
  eq(Object.keys(m).length, 1, '重なる1名だけが残る');
  eq(!!m[normKey('ダミー甲')], true, '残るのは甲');
}

sec('8. 同じ人に複数行があれば新しい休みを採る');
{
  const list = [
    { name: 'ダミー甲', date: '2026-05-01', resumeDate: '', elapsedDays: 89 },
    { name: 'ダミー甲', date: '2026-07-06', resumeDate: '', elapsedDays: 23 }
  ];
  const m = buildLongLeaveMap(list, YM);
  eq(m[normKey('ダミー甲')].startDate, '2026-07-06', '開始日が新しい方を採る');
  eq(m[normKey('ダミー甲')].elapsedDays, 23, '経過日数も新しい方に揃う');
}

console.log('\n==== ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + ' / ' + (pass + fail) + ' ====');
process.exit(fail ? 1 : 0);
