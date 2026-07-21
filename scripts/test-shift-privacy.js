// シフト希望 スタッフ画面プライバシー（案A：人数のみ表示・実名を隠す）の検証
// 実行: node scripts/test-shift-privacy.js
//
// 2系統を1ファイルで検証する:
//   [A] サーバ側 getAllData / getAllDataAdmin … コード.js を vm で実物ロードし
//       SpreadsheetApp をモック。応答本文に他スタッフ氏名が出ないことを実測。
//   [B] 画面側 renderMySummary / concedeDay … shift.html・画面.html を jsdom で
//       ロードし apiCall を差し替え。被り人数表示・ゆずる導線・氏名非表示を実測。
//
// 本番シート/本番APIには一切アクセスしない（全てモック・インメモリ）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require(require.resolve('jsdom', {
  paths: ['/tmp/node_modules', '/tmp', 'C:/tmp/node_modules', 'C:/tmp']
}));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}
const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };

// ================================================================
// [A] サーバ側 getAllData（実物ロード）
// ================================================================
const GAS_SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'shift-kibou', 'コード.js'), 'utf8');

// 全スタッフの氏名（応答本文に出てはいけない他人名を判定するため）
const STAFF = ['春山', '髙山', '石井', '勝又', '星野', '下浦', '工藤', '大久保'];

// テスト用シート群。春山の希望日9/10は勝又・星野も希望（＝被り2人）
function serverSheets() {
  return {
    'スタッフ': [['名前','カナ','雇用形態'], ['春山','ハルヤマ','パート'], ['髙山','タカヤマ','パート'],
                 ['勝又','カツマタ','社員'], ['星野','ホシノ','社員'], ['下浦','シモウラ','パート']],
    'シフト希望': [['対象月','スタッフ','日','登録日'],
      ['2026-09','春山',10,new Date('2026-08-01T00:00:00Z')],
      ['2026-09','勝又',10,new Date('2026-08-01T00:00:00Z')],
      ['2026-09','星野',10,new Date('2026-08-01T00:00:00Z')],
      ['2026-09','春山',15,new Date('2026-08-01T00:00:00Z')],   // 春山だけの日（被りなし）
      ['2026-09','下浦',20,new Date('2026-08-01T00:00:00Z')]],  // 春山が出していない日
    '設定': [['キー','値'],['deadline','20'],['maxPerDay','3']],
    '確定状況': [['スタッフ','対象月','確定日時','種別'],
      ['春山','2026-09','2026-08-01','確定'],
      ['勝又','2026-09','2026-08-01','確定']],
    '外せない予定': [['スタッフ名','開始日','終了日','理由','登録日'],
      ['髙山', new Date('2026-09-05'), new Date('2026-09-05'), '通院', new Date()]],
    '通知': [['対象スタッフ','メッセージ','対象月','対象日','作成日','既読'],
      ['春山','あなた宛の通知です','2026-09',10,new Date(),''],
      ['勝又','勝又宛の通知です','2026-09',10,new Date(),'']],
    '譲歩カウント': [['スタッフ','回数']],
    '社長休み': [['日付']]
  };
}

function makeServerSandbox(sheets) {
  const store = {};
  Object.keys(sheets).forEach(n => store[n] = sheets[n].map(r => r.slice()));
  function sheetObj(name) {
    return {
      getName: () => name,
      getLastRow: () => (store[name] || []).length,
      getLastColumn: () => ((store[name] || [])[0] || []).length,
      getDataRange: () => ({ getValues: () => (store[name] || []).map(r => r.slice()) }),
      getRange: () => ({ getValues: () => [[]], setValues: () => {}, setValue: () => {},
                         setFontWeight: () => {}, setBackground: () => {} }),
      appendRow: (r) => { (store[name] = store[name] || []).push(r.slice()); },
      insertSheet: () => {}
    };
  }
  const ss = {
    getSheetByName: (n) => store[n] ? sheetObj(n) : null,
    insertSheet: (n) => { store[n] = store[n] || [[]]; return sheetObj(n); }
  };
  const sandbox = {
    Date, JSON, Math, String, Number, Boolean, Object, Array, Error, isNaN, parseInt, parseFloat, console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const dt = new Date(d.getTime() + 9 * 3600 * 1000);
        const p = (n, w) => String(n).padStart(w || 2, '0');
        return fmt.replace('yyyy', dt.getUTCFullYear()).replace('MM', p(dt.getUTCMonth() + 1))
          .replace('dd', p(dt.getUTCDate())).replace('HH', p(dt.getUTCHours()))
          .replace('mm', p(dt.getUTCMinutes())).replace('ss', p(dt.getUTCSeconds()));
      }
    },
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(GAS_SRC, sandbox);
  return sandbox;
}

// 応答本文から本人以外の氏名の出現を検出。
// ただし staff（スタッフ名簿）は除外する：ログインの名前選択に必須で、
// かつ無認証の getStaff action で元から公開されている「同僚の名簿」。
// 秘匿対象は「誰がいつ休むか」（wishes/confirmations/absence理由名）であり、
// 名簿そのものではない。名簿を隠すとログイン画面が作れない。
function foreignNames(objJson, me) {
  const scoped = Object.assign({}, objJson);
  delete scoped.staff; // 名簿は意図的に対象外（本文の他フィールドを走査）
  const s = JSON.stringify(scoped);
  return STAFF.filter(n => n !== me).filter(n => s.indexOf(n) >= 0);
}

console.log('=== [A] サーバ側 getAllData プライバシー ===\n');
{
  const sb = makeServerSandbox(serverSheets());

  // スタッフ用（春山）
  const staffRes = sb.getAllData('2026-09', '春山');
  console.log('  [1] スタッフ用 getAllData(春山)');
  ok(Array.isArray(staffRes.wishes) && staffRes.wishes.every(w => w.staff === '春山'),
     'wishes は本人(春山)分のみ');
  ok(staffRes.wishes.length === 2, '春山の希望は2件（9/10・9/15）');
  ok(staffRes.confirmations.every(c => c.staff === '春山'), 'confirmations は本人分のみ');
  ok(staffRes.wishCounts && staffRes.wishCounts[10] === 3, 'wishCounts[10]=3（春山+勝又+星野）');
  ok(staffRes.wishCounts[15] === 1, 'wishCounts[15]=1（春山のみ）');
  ok(staffRes.wishCounts[20] === 1, 'wishCounts[20]=1（下浦。本人未申請日も集計は返る）');
  // wishCounts の値は数値のみ・氏名やタイムスタンプを含まない
  const wcStr = JSON.stringify(staffRes.wishCounts);
  ok(STAFF.every(n => wcStr.indexOf(n) < 0), 'wishCounts に氏名が一切含まれない');
  ok(staffRes.notifications && staffRes.notifications.length === 1, '通知は本人宛の1件のみ');

  const leaks = foreignNames(staffRes, '春山');
  console.log('  [2] 応答本文の他人名スキャン（名簿 staff を除く全フィールド）');
  ok(leaks.length === 0, '希望休/確定/集計のどこにも他スタッフ氏名が無い（実測: ' +
     (leaks.length ? leaks.join(',') : 'なし') + '）');
  // 名簿は意図的に残す（ログインの名前選択に必須・元から getStaff で公開）
  ok(Array.isArray(staffRes.staff) && staffRes.staff.length >= 3,
     'スタッフ名簿(staff)は従来どおり返る（ログイン用・秘匿対象外）');

  // 管理者用は従来どおり全員分
  console.log('  [3] 管理者用 getAllDataAdmin（変更なし）');
  const adminRes = sb.getAllDataAdmin('2026-09');
  ok(adminRes.wishes.length === 5, '管理者は全員分の希望(5件)を受け取る');
  const staffSet = new Set(adminRes.wishes.map(w => w.staff));
  ok(staffSet.has('勝又') && staffSet.has('星野') && staffSet.has('下浦'),
     '管理者応答には全スタッフの氏名が含まれる（従来どおり）');
  ok(adminRes.isAdmin === true, 'isAdmin:true');
}

// ================================================================
// [B] 画面側（jsdom）
// ================================================================
async function bootHtml(file, apiImpl) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/' + file });
  const w = dom.window;
  await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
  const calls = [], toasts = [], confirms = [];
  w.apiCall = (params) => { calls.push(JSON.parse(JSON.stringify(params))); return apiImpl(params); };
  w.showToast = (m) => toasts.push(String(m));
  w.alert = (m) => toasts.push(String(m));
  w.confirm = (m) => { confirms.push(String(m)); return true; };
  w.eval("currentUser='春山'; isAdmin=false; currentMonth='2026-09';");
  return { w, calls, toasts, confirms };
}

// getAllData 応答（案A形）を返す。被り人数は wishCounts で伝える。
function respFor(myDays, counts) {
  return {
    staff: STAFF.slice(),
    wishes: myDays.map(d => ({ staff: '春山', day: d, timestamp: '' })),
    wishCounts: counts,
    month: '2026-09',
    settings: { deadline: '20', maxPerDay: 3 },
    absences: [],
    confirmations: []
  };
}

(async () => {
for (const file of ['shift.html', 'gas/shift-kibou/画面.html']) {
  console.log('\n=== [B] 画面側 ' + file + ' ===');

  // ---- 被り 0人 / 1人 / 複数人 ----
  {
    const { w } = await bootHtml(file, () => Promise.resolve(respFor([15], { 15: 1 })));
    // 手動で状態を注入して renderMySummary を呼ぶ
    w.eval("myWishes=[{staff:'春山',day:15}]; allWishes=myWishes.slice(); wishCounts={15:1};");
    w.renderMySummary();
    const daysHtml = w.document.getElementById('myDays').innerHTML;
    const titles = Array.from(w.document.querySelectorAll('#myDays [title]')).map(e => e.getAttribute('title'));
    ok(!/ゆずる/.test(daysHtml), '0人被り（自分だけの日）: ゆずるボタンが出ない');
    ok(titles.every(t => STAFF.every(n => t.indexOf(n) < 0)), '0人被り: title に氏名なし');
  }
  {
    const { w } = await bootHtml(file, () => Promise.resolve(respFor([10], { 10: 2 })));
    w.eval("myWishes=[{staff:'春山',day:10}]; allWishes=myWishes.slice(); wishCounts={10:2};");
    w.renderMySummary();
    const titles = Array.from(w.document.querySelectorAll('#myDays [title]')).map(e => e.getAttribute('title'));
    const chipTitle = titles.find(t => /希望/.test(t)) || '';
    ok(/他に1人/.test(chipTitle), '1人被り: 「他に1人が希望しています」と人数で表示（実測: ' + chipTitle + '）');
    ok(/ゆずる/.test(w.document.getElementById('myDays').innerHTML), '1人被り: ゆずるボタンが出る');
    ok(titles.every(t => STAFF.every(n => t.indexOf(n) < 0)), '1人被り: どの title にも氏名なし');
  }
  {
    const { w } = await bootHtml(file, () => Promise.resolve(respFor([10], { 10: 3 })));
    w.eval("myWishes=[{staff:'春山',day:10}]; allWishes=myWishes.slice(); wishCounts={10:3};");
    w.renderMySummary();
    const titles = Array.from(w.document.querySelectorAll('#myDays [title]')).map(e => e.getAttribute('title'));
    const chipTitle = titles.find(t => /希望/.test(t)) || '';
    ok(/他に2人/.test(chipTitle), '複数人被り: 「他に2人が希望しています」（実測: ' + chipTitle + '）');
    ok(titles.every(t => STAFF.every(n => t.indexOf(n) < 0)), '複数人被り: 氏名なし');
  }

  // ---- ゆずる導線（人数のみで動く） ----
  {
    const { w, calls, confirms } = await bootHtml(file, () => Promise.resolve({ success: true }));
    w.eval("myWishes=[{staff:'春山',day:10}]; allWishes=myWishes.slice(); wishCounts={10:3}; isProcessing=false; renderAll=function(){};");
    await w.concedeDay(10, 2);
    ok(confirms.some(c => /他の2人/.test(c)), 'ゆずる確認ダイアログが人数表示（実測: ' +
       (confirms.find(c => /ゆず/.test(c)) || '') + '）');
    ok(confirms.every(c => STAFF.every(n => c.indexOf(n) < 0)), 'ゆずるダイアログに氏名なし');
    const cd = calls.find(c => c.action === 'concedeDay');
    ok(cd && cd.day === 10 && cd.staff === '春山', 'concedeDay は day/staff のみ送信（他人名を送らない）');
    ok(cd && !('otherStaff' in cd), 'リクエストに otherStaff を含めない');
  }

  // ---- 旧サーバ互換（wishCounts 無し・旧応答は全員分）----
  {
    const { w } = await bootHtml(file, () => Promise.resolve({}));
    // 旧サーバ想定: allWishes に全員入るが wishCounts は空 → 人数フォールバック
    w.eval("myWishes=[{staff:'春山',day:10}]; allWishes=[{staff:'春山',day:10},{staff:'勝又',day:10},{staff:'星野',day:10}]; wishCounts={};");
    w.renderMySummary();
    const titles = Array.from(w.document.querySelectorAll('#myDays [title]')).map(e => e.getAttribute('title'));
    const chipTitle = titles.find(t => /希望/.test(t)) || '';
    ok(/他に2人/.test(chipTitle), '旧サーバ互換: allWishes から人数を算出して表示（実測: ' + chipTitle + '）');
    ok(titles.every(t => STAFF.every(n => t.indexOf(n) < 0)), '旧サーバ互換でも title に氏名を出さない');
  }
}

console.log('\n----------------------------------------');
console.log('PASS ' + pass + ' / FAIL ' + fail);
console.log('本番シート/本番APIアクセス: 0（全モック・インメモリ）');
process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('テスト異常終了: ' + e.stack); process.exit(1); });
