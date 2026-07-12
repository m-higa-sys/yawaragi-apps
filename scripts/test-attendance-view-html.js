// 出席率.html 描画スモークテスト（jsdom）
// 実行: node scripts/test-attendance-view-html.js
// attendance_view レスポンスのモックを onData() に流し込み、状態4分離・4月「—」・増回バッジ・
// 基準線・ソート・success:false エラー表示を検証する（描画が「静かに間違わない」ことのガード）。
const fs = require('path') && require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', '出席率.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const mock = {
  success: true, generatedAt: '2026-07-12 10:00', today: '2026-07-12',
  window: { months: ['2026-05', '2026-06'], note: '2026-04 はdailyOps未保持のため率は「—」' },
  displayMonths: ['2026-04', '2026-05', '2026-06'], kaigoAvgRate: 87.7, capacity: 18,
  slotsFree: { '月': { am: 1, pm: 1 }, '火': { am: 1, pm: 2 }, '水': { am: 0, pm: 0 }, '木': { am: 0, pm: 0 }, '金': { am: 1, pm: 1 } },
  users: [
    { name: '井草進英', care: '要介護１', days: '木', unit: '午前', contractN: 1, displayState: 'normal', stateLabel: '', rate: 100, actualPerWeek: 1, diverge: 0, monthly: { '2026-04': null, '2026-05': 100, '2026-06': 100 }, isUpsizeCandidate: true, addableSlots: ['月AM', '火AM', '金AM'] },
    { name: '太田賢', care: '要介護1', days: '木', unit: '午前', contractN: 1, displayState: 'chouki', stateLabel: '算出不可', rate: null, actualPerWeek: null, diverge: null, monthly: { '2026-04': null, '2026-05': null, '2026-06': null }, isUpsizeCandidate: false, addableSlots: [] },
    { name: '菅井一浩', care: '要介護２', days: '月木', unit: '午前', contractN: 2, displayState: 'sanko', stateLabel: '参考値（率が不正確）', rate: 52.9, actualPerWeek: 1.06, diverge: 0.94, monthly: { '2026-04': null, '2026-05': 50, '2026-06': 55 }, isUpsizeCandidate: false, addableSlots: [] },
    { name: '有野久美', care: '要介護1', days: '金', unit: '午前', contractN: 1, displayState: 'hanteichu', stateLabel: '判定中（データ蓄積中）', rate: null, actualPerWeek: null, diverge: null, monthly: { '2026-04': null, '2026-05': null, '2026-06': null }, isUpsizeCandidate: false, addableSlots: [] }
  ],
  diag: { opsFetched: true, opDaysCount: 43, kaigoCount: 4 }, warnings: []
};

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.github.io/a?v=x' });
const w = dom.window;
setTimeout(function () {
  w.onData(mock);
  const doc = w.document;
  const rows = doc.querySelectorAll('#tbody tr');
  ok(rows.length === 4, '4行描画');
  ok(doc.getElementById('avg').textContent === '87.7%', '基準線=要介護平均87.7%');
  const ths = [].slice.call(doc.querySelectorAll('#thead th'));
  ok(ths.some(t => t.textContent === '4月') && ths.some(t => t.textContent === '6月'), '月別ヘッダに4月/6月');
  const r0 = rows[0];
  ok(r0.className.indexOf('cand') >= 0, 'upsize既定: 先頭=増回候補行(cand)');
  ok(r0.innerHTML.indexOf('＋月AM') >= 0 && r0.innerHTML.indexOf('＋金AM') >= 0, '増回候補に空き枠バッジ＋月AM/金AM');
  ok(r0.innerHTML.indexOf('100%') >= 0, '井草 出席率100%表示');
  let aprDash = 0;
  rows.forEach(function (r) { const tds = r.querySelectorAll('td'); if (tds[7].textContent.trim() === '—') aprDash++; });
  ok(aprDash === 4, '全4行の4月セルが「—」(' + aprDash + '/4・推測で埋めない)');
  const body = doc.getElementById('tbody').innerHTML;
  ok(body.indexOf('算出不可') >= 0, 'chouki(太田)→算出不可ピル');
  ok(body.indexOf('判定中（データ蓄積中）') >= 0, 'hanteichu(有野)→判定中ピル(no-data)');
  ok(body.indexOf('参考値（率が不正確）') >= 0, 'sanko(菅井)→参考値ピル(approx)');
  ok(body.indexOf('52.9%') >= 0, 'sanko(菅井)は率も表示52.9%＝approxは数字を出す');
  // hanteichu/chouki は率セルが「—」（並び順に依存しないよう氏名で行を特定）
  function rowByName(nm) { return [].slice.call(doc.querySelectorAll('#tbody tr')).find(function (r) { return r.querySelector('td').textContent === nm; }); }
  ok(rowByName('太田賢').querySelectorAll('td')[6].textContent.trim() === '—', 'chouki(太田) 出席率セル=—（数字出さない）');
  ok(rowByName('有野久美').querySelectorAll('td')[6].textContent.trim() === '—', 'hanteichu(有野) 出席率セル=—（数字出さない）');
  ok(doc.getElementById('slots').textContent.indexOf('火 AM1/PM2') >= 0, '空き枠サマリ 火AM1/PM2（台帳ベース）');
  const btns = [].slice.call(doc.querySelectorAll('#controls button'));
  btns.find(b => b.getAttribute('data-mode') === 'lowrate').click();
  const lr = doc.querySelectorAll('#tbody tr');
  const lastName = lr[lr.length - 1].querySelector('td').textContent;
  ok(lastName === '太田賢' || lastName === '有野久美', 'lowrate:率null行が末尾(' + lastName + ')');

  // XSS・rate:0 の描画安全性（別インスタンス）
  const dom3 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://y.github.io/a?v=x' });
  setTimeout(function () {
    dom3.window.onData({
      success: true, generatedAt: '2026-07-12 10:00', today: '2026-07-12',
      window: { months: ['2026-05', '2026-06'], note: '' }, displayMonths: ['2026-05', '2026-06'],
      kaigoAvgRate: 70, capacity: 18, slotsFree: { '月': { am: 0, pm: 0 }, '火': { am: 0, pm: 0 }, '水': { am: 0, pm: 0 }, '木': { am: 0, pm: 0 }, '金': { am: 0, pm: 0 } },
      users: [
        { name: '<img src=x onerror=alert(1)>太郎', care: '要介護1', days: '月', unit: '午前', contractN: 1, displayState: 'normal', stateLabel: '', rate: 0, actualPerWeek: 0, diverge: 1, monthly: { '2026-05': 0, '2026-06': 0 }, isUpsizeCandidate: true, addableSlots: [] }
      ], diag: { opsFetched: true, opDaysCount: 40, kaigoCount: 1 }, warnings: []
    });
    const b3 = dom3.window.document.getElementById('tbody').innerHTML;
    ok(b3.indexOf('<img src=x') < 0, 'XSS: 氏名のHTMLタグが生挿入されない(esc済)');
    ok(b3.indexOf('&lt;img') >= 0, 'XSS: 氏名がエスケープ表示される');
    ok(dom3.window.document.querySelector('#tbody tr').querySelectorAll('td')[6].textContent.trim() === '0%', 'rate:0→「0%」表示（—と取り違えない）');
    ok(dom3.window.document.querySelector('#tbody tr').querySelectorAll('td')[7].textContent.trim() === '0%', '月別0→「0%」表示（—と取り違えない）');

    // success:false → エラー表示（沈黙不全ガードの画面側・二重エスケープしない）
    const dom2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/a?v=x' });
    setTimeout(function () {
      dom2.window.onData({ success: false, error: '介護度列<>が見つかりません' });
      const e = dom2.window.document.getElementById('error');
      ok(e.style.display === 'block', 'success:false→エラー表示');
      ok(e.textContent.indexOf('介護度列<>が') >= 0, 'エラー本文にサーバmsg反映（二重エスケープなし）');
      console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
      process.exit(fail ? 1 : 0);
    }, 60);
  }, 60);
}, 60);
