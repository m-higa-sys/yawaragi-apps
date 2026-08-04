// attendance-ops.html 勤務コードの解釈テスト（jsdom）
// 実行: node scripts/test-attendance-ops-shiftcodes.js
//
// シフト作成(shift-create.html)の PATTERNS が出すコードを、出勤表が解釈できるかを固定する。
// 2026-08-04 の実測: 喜多さんの「C2」が未対応で、8月13日分が毎回手入力になっていた。
//
// 対応の線引き（今回）:
//  - C2      : shift-create の割り当てロジックが実際に書き込む（pattern: 指定が3件）
//  - 有給    : 勤務しない日なので「休」と同じく素通しする（警告を出さない）
//  - その他  : 割り当てロジックが使っていないため今回は対象外
//
// ※ 起動順そのままで検証する（applyStaffIdMap を先に呼ばない）。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'attendance-ops.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const shiftCreate = fs.readFileSync(path.join(__dirname, '..', 'shift-create.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// 検証に使うダミー氏名と、割り当てる内部ID
const P = [
  { n: 'ダミーA', id: 'kita', code: 'C2' },        // 今回の本題
  { n: 'ダミーB', id: 'katsumata', code: 'B2' },   // 既存（壊れていないこと）
  { n: 'ダミーC', id: 'shimoura', code: 'C' },     // 既存
  { n: 'ダミーD', id: 'takayama', code: 'E1' },    // 既存
  { n: 'ダミーE', id: 'haruyama', code: 'F' },     // 既存
  { n: 'ダミーF', id: 'kudou', code: 'H' },        // 既存
  { n: 'ダミーG', id: 'ono', code: '7②' },        // 送迎（既存）
  { n: 'ダミーH', id: 'ookubo', code: '有給' },    // 素通しになるべき
  { n: 'ダミーI', id: 'hoshino', code: '休' },     // 従来から素通し
];
const DATE = '2026-08-03';

(async () => {
  const MAP = {}, SD = {};
  P.forEach(p => { MAP[p.n] = p.id; SD[p.n] = {}; SD[p.n][DATE] = p.code; });

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e));
  vc.on('error', e => errors.push(e));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://example.github.io/yawaragi-apps/attendance-ops.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.fetch = function () { return new Promise(function () { }); };
      w.BroadcastChannel = function () { this.onmessage = null; this.postMessage = function () { }; this.close = function () { }; };
      w.alert = function () { }; w.confirm = function () { return false; }; w.print = function () { };
      w.localStorage.setItem('yawaragi_admin_key', 'dummy-not-a-real-key');
      w.localStorage.setItem('yawaragi_staff_id_map', JSON.stringify(MAP));
      w.localStorage.setItem('yawaragi_shift_2026-08', JSON.stringify({ data: SD, savedAt: 'x' }));
    }
  });
  const w = dom.window;
  [].slice.call(w.document.head.querySelectorAll('script[src*="script.google.com"]'))
    .forEach(s => { try { s.dispatchEvent(new w.Event('error')); } catch (e) { } });
  await new Promise(r => setTimeout(r, 50));

  console.log('\n[1] 対応表に C2 が入っている');
  {
    const st = w.eval('SHIFT_TIMES');
    ok(!!st['C2'], 'SHIFT_TIMES に C2 がある');
    ok(st['C2'] && st['C2'].start === '8:45', 'C2 の開始が 8:45（shift-create.html:413 の 08:45-17:15 が根拠）');
    ok(st['C2'] && st['C2'].end === '17:15', 'C2 の終了が 17:15（同上）');
    // 既存5件を変えていない
    ok(st['B2'].start === '7:45' && st['B2'].end === '16:45', 'B2 は不変');
    ok(st['C'].start === '8:45' && st['C'].end === '17:00', 'C は不変');
    ok(st['E1'].start === '8:45' && st['E1'].end === '15:00', 'E1 は不変');
    ok(st['F'].start === '8:45' && st['F'].end === '16:00', 'F は不変');
    ok(st['H'].start === '8:45' && st['H'].end === '16:30', 'H は不変');
    ok(Object.keys(st).length === 6, 'SHIFT_TIMES は6件（既存5＋C2・実測: ' + Object.keys(st).length + '）');
    // 送迎14件も不変
    ok(Object.keys(w.eval('SEND_CODES')).length === 14, 'SEND_CODES は14件のまま');
  }

  console.log('\n[2] 起動しただけで C2 の人が出勤欄に入る');
  {
    const d = w.loadFromShift(DATE);
    const att = (d.attendance || []).find(a => a.name === 'ダミーA');
    ok(!!att, 'C2 の人が出勤欄に入る');
    ok(!!att && att.time === '8:45', '出勤時刻が 8:45（実測: ' + (att ? att.time : 'なし') + '）');

    const lv = (d.leave || []).find(l => l.name === 'ダミーA');
    ok(!!lv, 'C2 の人が退社欄に入る');
    ok(!!lv && lv.time === '17:15', '退社時刻が 17:15（実測: ' + (lv ? lv.time : 'なし') + '）');
    ok(!!lv && lv.time !== '送迎後', '「送迎後」ではない（C2はフロア勤務で送迎に出ないため）');
  }

  console.log('\n[3] 未対応の警告が出ない');
  {
    const d = w.loadFromShift(DATE);
    const unknown = d._unknownShift || [];
    const c2 = unknown.filter(u => u.code === 'C2');
    ok(c2.length === 0, 'C2 が未対応として記録されない（実測: ' + c2.length + '件）');
    const yukyu = unknown.filter(u => u.code === '有給');
    ok(yukyu.length === 0, '有給が未対応として記録されない（実測: ' + yukyu.length + '件）');
    ok(unknown.length === 0, '未対応が1件も無い（実測: ' + unknown.length + '件）');
  }

  console.log('\n[4] 有給は「休」と同じく素通しする（勤務にしない）');
  {
    const d = w.loadFromShift(DATE);
    const att = (d.attendance || []).find(a => a.name === 'ダミーH');
    ok(!att, '有給の人は出勤欄に入らない');
    const lv = (d.leave || []).find(l => l.name === 'ダミーH');
    ok(!lv, '有給の人は退社欄にも入らない');
    const send = (d.sendStaff || []).find(s => s.name === 'ダミーH');
    ok(!send, '有給の人は送迎欄にも入らない');
    // 休は従来どおり
    ok(!(d.attendance || []).find(a => a.name === 'ダミーI'), '休の人も出勤欄に入らない（従来どおり）');
  }

  console.log('\n[5] 既存コードの挙動が変わっていない');
  {
    const d = w.loadFromShift(DATE);
    const at = n => (d.attendance || []).find(a => a.name === n);
    const lv = n => (d.leave || []).find(l => l.name === n);
    ok(at('ダミーB') && at('ダミーB').time === '7:45', 'B2 の出勤が 7:45');
    ok(lv('ダミーB') && lv('ダミーB').time === 'ラスト', 'B2(常勤) の退社が「ラスト」');
    ok(at('ダミーC') && at('ダミーC').time === '8:45', 'C の出勤が 8:45');
    ok(lv('ダミーC') && lv('ダミーC').time === '送迎後', 'C(17:00終わり) の退社は「送迎後」のまま');
    ok(lv('ダミーD') && lv('ダミーD').time === '15:00', 'E1 の退社が 15:00');
    ok(lv('ダミーE') && lv('ダミーE').time === '16:00', 'F の退社が 16:00');
    ok(lv('ダミーF') && lv('ダミーF').time === '16:30', 'H の退社が 16:30');
    const send = (d.sendStaff || []).find(s => s.name === 'ダミーG');
    ok(!!send, '送迎コード 7② の人が送迎欄に入る');
    ok(!!send && send.am === '7:45', '送迎の AM が 7:45');
  }

  console.log('\n[5.5] 時給者の実働換算に C2 がある（人件費が0円にならない）');
  {
    const sh = w.eval('SHIFT_HOURS');
    ok(sh['C2'] !== undefined, 'SHIFT_HOURS に C2 がある（無いと時給者の人件費が0円で計上される）');
    ok(sh['C2'] === 7.5, 'C2 は 7.5h（08:45-17:15 の8h30m − 休憩1h。shift-create.html:396-399 の控除ロジックが根拠・実測: ' + sh['C2'] + '）');
    // 既存の換算値を変えていない
    ok(sh['B2'] === 8.0, 'B2 は 8.0h のまま');
    ok(sh['C'] === 7.25, 'C は 7.25h のまま');
    ok(sh['E1'] === 5.25, 'E1 は 5.25h のまま');
    ok(sh['F'] === 6.25, 'F は 6.25h のまま');
    ok(sh['H'] === 6.75, 'H は 6.75h のまま');
    // C(17:00) より15分長いぶん、0.25h 多い
    ok(sh['C2'] - sh['C'] === 0.25, 'C より 0.25h 長い（終業が15分遅いぶん）');
  }

  console.log('\n[5.6] 月次人件費で有給を除外していない（常勤の日当は発生する）');
  {
    // calcFullMonthCost 側は有給を素通ししない。除外すると常勤の月次人件費が過小になる。
    const body = html.slice(html.indexOf('function calcFullMonthCost'), html.indexOf('function renderWagePanel'));
    ok(body.indexOf("code==='有給'") < 0, '月次人件費の集計は有給を除外していない（常勤は月給制のため日当が発生する）');
    ok(body.indexOf("code==='休'") >= 0, '休は従来どおり除外している');
  }

  console.log('\n[6] 休憩の割り当て方を変えていない');
  {
    ok(html.indexOf("const breakSlots=['10:50','10:50','12:00','12:00','12:20','13:00','13:30','13:45']") >= 0,
      '休憩スロットの定義が従来どおり');
  }

  console.log('\n[7] shift-create の定義と食い違っていない（根拠の突合）');
  {
    const m = shiftCreate.match(/"C2":\s*\{time:\s*"([^"]+)"/);
    ok(!!m, 'shift-create.html に C2 の定義がある');
    ok(!!m && m[1] === '08:45-17:15', 'shift-create の C2 は 08:45-17:15（実測: ' + (m ? m[1] : 'なし') + '）');
    const st = w.eval('SHIFT_TIMES');
    const norm = t => t.replace(/^0/, '');
    ok(!!m && norm(m[1].split('-')[0]) === st['C2'].start, '開始が shift-create と一致');
    ok(!!m && norm(m[1].split('-')[1]) === st['C2'].end, '終了が shift-create と一致');
  }

  console.log('\n[8] jsdom 読み込みで JSエラー 0');
  ok(errors.length === 0, 'jsdomError/error が0件（実測: ' + errors.length + '）');
  if (errors.length > 0) errors.slice(0, 3).forEach(e => console.log('    ' + (e && (e.message || e))));

  try { w.close(); } catch (e) { }
  console.log('\nPASS ' + pass + ' / FAIL ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
