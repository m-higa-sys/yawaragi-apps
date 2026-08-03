// attendance-ops.html 出勤時刻パース／退職フラグのテスト（jsdom）
// 実行: node scripts/test-attendance-ops-timeparse.js
//
// 2026-08-02 に旧アプリ（出勤＆送迎表.html）へ入った改修の移植分を固定する。
//  - 出勤時刻が "HH:MM"（単一）と "HH:MM-HH:MM"（範囲・送迎日誌/GAS由来）の2形式を取りうる
//  - 休憩時刻は「清掃後」等の業務語が入ることがあり、時刻として計算してはいけない
//  - 退社時刻が未入力でも、出勤が範囲形式なら終了側を実働計算に使う
//  - 退職者はシフト候補・送迎候補に出さない（データは消さない）
//
// ※ 実名・金額は使わない。ダミー氏名と構造だけで検証する。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'attendance-ops.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e));
vc.on('error', e => errors.push(e));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.github.io/yawaragi-apps/attendance-ops.html',
  virtualConsole: vc,
  beforeParse(w) {
    w.fetch = function () { return new Promise(function () { }); };
    w.BroadcastChannel = function () { this.onmessage = null; this.postMessage = function () { }; this.close = function () { }; };
    w.alert = function () { };
    w.confirm = function () { return false; };
    w.print = function () { };
  }
});
const w = dom.window;
const G = (expr) => w.eval(expr);

console.log('\n[1] isClockTime — 時刻とそれ以外を見分ける');
{
  ok(typeof w.isClockTime === 'function', 'isClockTime が定義されている');
  ok(w.isClockTime('7:45') === true, '"7:45" は時刻');
  ok(w.isClockTime('07:45') === true, '"07:45"（0埋め）も時刻');
  ok(w.isClockTime('17:00') === true, '"17:00" も時刻');
  ok(w.isClockTime('清掃後') === false, '業務語「清掃後」は時刻ではない');
  ok(w.isClockTime('送迎後') === false, '業務語「送迎後」は時刻ではない');
  ok(w.isClockTime('ラスト') === false, '業務語「ラスト」は時刻ではない');
  ok(w.isClockTime('') === false, '空文字は時刻ではない');
  ok(w.isClockTime(null) === false, 'null は時刻ではない');
  ok(w.isClockTime(undefined) === false, 'undefined は時刻ではない');
  ok(w.isClockTime('  8:00  ') === true, '前後の空白は無視して判定する');
  ok(w.isClockTime('7:45-16:45') === false, '範囲形式は「単一の時刻」ではない');
}

console.log('\n[2] parseAttendanceTime — 単一と範囲の2形式を扱う');
{
  ok(typeof w.parseAttendanceTime === 'function', 'parseAttendanceTime が定義されている');
  const single = w.parseAttendanceTime('8:45');
  ok(single.start === '8:45', '単一形式: start が取れる');
  ok(single.end === null, '単一形式: end は null（終了は別途 leave から取る）');

  const range = w.parseAttendanceTime('07:45-16:45');
  ok(range.start === '07:45', '範囲形式: start が取れる');
  ok(range.end === '16:45', '範囲形式: end が取れる');

  const bad = w.parseAttendanceTime('清掃後');
  ok(bad.start === null && bad.end === null, '業務語は start/end とも null（時刻として計算させない）');
  const empty = w.parseAttendanceTime('');
  ok(empty.start === null && empty.end === null, '空文字も null');
  const nul = w.parseAttendanceTime(null);
  ok(nul.start === null && nul.end === null, 'null も落ちずに null を返す');
  ok(w.parseAttendanceTime(' 9:00-17:30 ').start === '9:00', '前後の空白があっても範囲を解釈する');
}

console.log('\n[3] 実働時間の計算が壊れない（退社未入力でも範囲から拾う）');
{
  ok(typeof w.calcFloorHours === 'function', 'calcFloorHours が定義されている');
  const NAME = 'テスト太郎';
  // グローバル D には触らず、calcFloorHours(name, data) の data 引数で渡す
  const mk = (att, lv, brk) => ({ attendance: att || [], leave: lv || [], breaks: brk || [] });

  // ケースA: 出勤=単一 / 退社=あり → 従来どおり
  const hA = w.calcFloorHours(NAME, mk([{ name: NAME, time: '8:45' }], [{ name: NAME, time: '17:00' }]));
  ok(hA > 0, '出勤・退社が揃えば実働が出る（実測: ' + hA + 'h）');

  // ケースB: 出勤=範囲 / 退社=未入力 → 範囲の終了側を使う
  const hB = w.calcFloorHours(NAME, mk([{ name: NAME, time: '08:45-17:00' }], []));
  ok(hB > 0, '退社が未入力でも、範囲形式なら実働が出る（実測: ' + hB + 'h）');
  ok(Math.abs(hA - hB) < 0.01, 'ケースAとBで同じ実働になる');

  // ケースB2: 移植前は「退社が無ければ0h」だった。範囲形式で拾えるのが今回の改修点
  ok(hB !== 0, '範囲形式のとき 0h に落ちない（移植前はここが 0h だった）');

  // ケースC: 出勤=業務語 → 0h（NaN を作らない）
  const hC = w.calcFloorHours(NAME, mk([{ name: NAME, time: '清掃後' }], [{ name: NAME, time: '17:00' }]));
  ok(hC === 0, '出勤が業務語なら 0h（実測: ' + hC + '）');
  ok(!isNaN(hC), 'NaN にならない');

  // ケースD: 出勤なし → 0h
  const hD = w.calcFloorHours(NAME, mk([], [{ name: NAME, time: '17:00' }]));
  ok(hD === 0 && !isNaN(hD), '出勤が無ければ 0h・NaN でない');

  // ケースE: 休憩に業務語が入っていても実働計算が壊れない
  const hE = w.calcFloorHours(NAME, mk([{ name: NAME, time: '8:45' }], [{ name: NAME, time: '17:00' }], [{ name: NAME, time: '清掃後' }]));
  ok(!isNaN(hE) && hE > 0, '休憩が業務語でも実働が出る（実測: ' + hE + 'h）');
}

console.log('\n[4] 退職フラグ — 候補に出さないがデータは消さない');
{
  const meta = G('STAFF_META');
  const retired = meta.filter(m => m.retired === true);
  ok(retired.length >= 1, '退職フラグを持つスタッフが STAFF_META にいる（実測: ' + retired.length + '名）');
  ok(meta.every(m => typeof m.id === 'string' && m.id.length > 0), '全員に内部IDがある');
  ok(meta.every(m => m.name === undefined), 'STAFF_META は実名を持たない（移植でも持ち込んでいない）');

  // 退職者も STAFF には残る（過去データが引けるように）
  const map = {};
  meta.forEach((m, i) => { map['ダミー' + i] = m.id; });
  const built = w.buildStaffFromIdMap(meta, map);
  ok(built.staff.length === meta.length, '退職者も STAFF には残る（過去データを切らない）');
  const retiredInStaff = built.staff.filter(s => s.retired === true);
  ok(retiredInStaff.length === retired.length, 'retired フラグが STAFF まで引き継がれる');

  // 候補生成のフィルタに retired が効いている
  ok(html.indexOf('!s.retired') >= 0, '候補生成で retired を除外している');
  const filters = (html.match(/!s\.retired/g) || []).length;
  ok(filters >= 2, 'retired 除外が2箇所以上ある（実測: ' + filters + '）');
}

console.log('\n[5] 新スタッフの追加が実名なしで入っている');
{
  const meta = G('STAFF_META');
  const ids = meta.map(m => m.id);
  ok(ids.indexOf('izawa') >= 0, '新スタッフの内部IDが STAFF_META にある');
  ok(meta.length === 14, 'STAFF_META は14件（13件＋新規1件・実測: ' + meta.length + '）');
  const codes = G('SHIFT_DEFAULT_CODE');
  ok(codes['izawa'] !== undefined, '新スタッフの既定シフトコードがある');
  // 実名は持たない
  const izawa = meta.find(m => m.id === 'izawa');
  ok(izawa && izawa.name === undefined, '新スタッフも実名を持たない');
  ok(izawa && izawa.wageType === 'hourly', '賃金区分は引き継がれている');
}

console.log('\n[6] 時刻セレクトが任意値を失わない');
{
  ok(typeof w.attendanceTimeSelect === 'function', 'attendanceTimeSelect が定義されている');
  // 選択肢に無い値（範囲形式など）でも selected として残す
  const s = w.attendanceTimeSelect(0, '07:45-16:45');
  ok(s.indexOf('07:45-16:45') >= 0, '選択肢に無い値も option として残る');
  ok(s.indexOf('selected') >= 0, 'その値が selected になる');
  // 既存の選択肢は従来どおり
  const s2 = w.attendanceTimeSelect(0, '7:45');
  ok(s2.indexOf('7:45') >= 0, '既存の選択肢は従来どおり出る');
  const dup = (s2.match(/value="7:45"/g) || []).length;
  ok(dup === 1, '既存の値は重複して出ない（実測: ' + dup + '件）');
}

console.log('\n[7] 休憩セレクトに業務語の選択肢がある');
{
  ok(typeof w.breakTimeSelect === 'function', 'breakTimeSelect が定義されている');
  const s = w.breakTimeSelect(0, '');
  ok(s.indexOf('清掃後') >= 0, '「清掃後」が選択肢にある');
  const s2 = w.breakTimeSelect(0, '清掃後');
  ok(s2.indexOf('selected') >= 0, '選ばれていれば selected になる');
}

console.log('\n[8] 金額・実名を持ち込んでいない');
{
  ok(Object.keys(G('DEFAULT_WAGES')).length === 0, 'DEFAULT_WAGES は空のまま（時給改定値を持ち込んでいない）');
  const nameCompare = html.match(/(name|_n|staff\.name)\s*===\s*'[一-龥]{1,4}'/g) || [];
  ok(nameCompare.length === 0, '氏名リテラルとの等値比較が無い（実測: ' + nameCompare.length + '件）');
}

console.log('\n[9] jsdom 読み込みで JSエラー 0');
ok(errors.length === 0, 'jsdomError/error が0件（実測: ' + errors.length + '）');
if (errors.length > 0) errors.slice(0, 3).forEach(e => console.log('    ' + (e && (e.message || e))));

try { w.close(); } catch (e) { }

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
