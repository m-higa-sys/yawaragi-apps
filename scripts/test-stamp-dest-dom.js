// stamp.html の宛先セレクトを jsdom で実ファイル丸ごとロードして実測する統合テスト。
// 実行: node scripts/test-stamp-dest-dom.js
// 目的: 「自己判定で直った」ではなく、実際に <select id="useDest"> の option が
//   ①成功時=22事業所＋電算システム＋その他 が出る ②失敗時でも電算/その他は必ず出る＋トースト
//   ことを、本番と同じ stamp.html のコードで測る。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'stamp.html'), 'utf8');
const coreJs = fs.readFileSync(path.join(ROOT, 'stamp-dest-core.js'), 'utf8');
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'stamp-board-response.json'), 'utf8'));

// 外部 <script src> は jsdom がローカル解決しないので、実ファイル内容をインライン化して等価に。
html = html.replace('<script src="stamp-dest-core.js"></script>', '<script>' + coreJs + '</script>');
html = html.replace('<script src="auto-refresh-patch.js"></script>', '<script>/* auto-refresh stub */</script>');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

async function run(label, fetchImpl) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://higa-manabu.github.io/yawaragi-apps/stamp.html',
    beforeParse(window) {
      window.fetch = fetchImpl;
      // JSONP(fetchFromCloud) は script 追加だけで実ネットは飛ばない。alert/confirm は無害化。
      window.alert = function () {}; window.confirm = function () { return false; };
    },
  });
  // initAll() 内の async fetchDestinations が解決するのを待つ
  await new Promise(r => setTimeout(r, 100));
  const doc = dom.window.document;
  const sel = doc.getElementById('useDest');
  const opts = Array.from(sel.options).map(o => o.value);
  const toast = doc.getElementById('toast');
  dom.window.close();
  return { opts, toastText: toast.textContent, toastShown: toast.className.indexOf('show') >= 0 };
}

(async () => {
  // ① 成功: 本番応答フィクスチャを返す
  const okFetch = async () => ({ ok: true, json: async () => FX });
  const r1 = await run('成功', okFetch);
  const offices = r1.opts.filter(v => v && v !== '__other__' && v !== '電算システム');
  console.log('[成功] option数=' + r1.opts.length + ' 事業所数=' + offices.length);
  ok(offices.length === 22, '成功時: 事業所22件が宛先に出る（実測母数一致）');
  ok(r1.opts.includes('電算システム'), '成功時: 電算システムが出る');
  ok(r1.opts.includes('__other__'), '成功時: その他（手入力）が出る');
  ok(r1.opts.includes('事業所06'), '成功時: 実事業所（事業所06）が出る');
  ok(r1.opts[0] === '', '先頭は -- 選択してください -- のプレースホルダ');

  // ② 失敗: fetch が reject（サーバ落ち/オフライン）でも固定枠は必ず出す＋トースト
  const failFetch = async () => { throw new Error('network down'); };
  const r2 = await run('失敗', failFetch);
  const offices2 = r2.opts.filter(v => v && v !== '__other__' && v !== '電算システム');
  console.log('[失敗] option数=' + r2.opts.length + ' 事業所数=' + offices2.length + ' toast="' + r2.toastText + '"');
  ok(r2.opts.includes('電算システム'), '失敗時でも: 電算システムが必ず出る（業務が止まらない）');
  ok(r2.opts.includes('__other__'), '失敗時でも: その他（手入力）が必ず出る');
  ok(offices2.length === 0, '失敗時: 事業所は空（キャッシュ無し前提）だが固定枠は生存');
  ok(r2.toastText.indexOf('宛先の取得に失敗') >= 0, '失敗時: showToast で通知（無言にしない）');

  // ③ 200だが中身が users も patterns も無い（旧事故の応答形）→ 失敗扱いで固定枠＋トースト
  const emptyFetch = async () => ({ ok: true, json: async () => ({ success: true, attendance: { am: [], pm: [] }, cmContacts: [] }) });
  const r3 = await run('空応答', emptyFetch);
  const offices3 = r3.opts.filter(v => v && v !== '__other__' && v !== '電算システム');
  console.log('[空応答] option数=' + r3.opts.length + ' 事業所数=' + offices3.length + ' toast="' + r3.toastText + '"');
  ok(r3.opts.includes('電算システム') && r3.opts.includes('__other__'), '空応答でも: 固定枠が出る');
  ok(r3.toastText.indexOf('宛先の取得に失敗') >= 0, '空応答: 0件は取得不全としてトースト');

  console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAIL') + '  pass=' + pass + ' fail=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
