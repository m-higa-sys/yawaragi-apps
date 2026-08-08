// test-sns-consent-editing-guard.js
// sns-consent.html：編集中の自動更新で「条件メモ」の打ちかけが消えないことを、実HTMLを jsdom で
// 動かして検証する。
//
// なぜ実HTMLで回すか: 事故は「関数が間違っていた」のではなく「再描画が入力を巻き込む」という
//   配線の穴だった。純関数テストでは捕まらない。本物の <script> を読み込み、本物の
//   loadFromCloud() を叩いて DOM の value を見る。
//
// ★この不具合は条件つき。他端末が更新して mergeRemoteIntoLocal の結果が変わったときだけ
//   render() が走る（loadFromCloud 内 `if (JSON.stringify(state.records) !== before) render();`）。
//   単独利用では再現しない。ケース2はその「起きない側」を固定して、ガードが
//   通常の取得まで殺していないことを担保する。
//
// ★ガードは loadFromCloud() の先頭に当てること。render() に当てるのは誤り
//   （state と localStorage を先に書き換えるため、画面だけ古くなる）。詳細は docs/宿題.md。
//
// 実行: node scripts/test-sns-consent-editing-guard.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { JSDOM, VirtualConsole } = require(require.resolve('jsdom', { paths: [path.join(ROOT, 'node_modules')] }));
const CUR_VERSION = fs.readFileSync(path.join(ROOT, 'version.txt'), 'utf8').trim();

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.error('  NG  ' + msg); }
}
function eq(a, b, msg) {
  assert(a === b, msg + '  (実測=' + JSON.stringify(a) + ' 期待=' + JSON.stringify(b) + ')');
}

function rec(o) {
  return Object.assign({
    name: 'ダミーA', status: '未設定', note: '',
    statusChangedAt: '', updatedAt: '2026-08-01T00:00:00Z'
  }, o);
}

// cloudRef.records を後から差し替えると「他端末が更新した」状況を作れる。
async function boot(cloudRef) {
  const html = fs.readFileSync(path.join(ROOT, 'sns-consent.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://m-higa-sys.github.io/yawaragi-apps/sns-consent.html?v=' + encodeURIComponent(CUR_VERSION),
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.fetch = function (url) {
        const u = String(url);
        if (u.indexOf('version.txt') >= 0) {
          return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(CUR_VERSION); } });
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: function () { return Promise.resolve({ ok: true, records: cloudRef.records }); }
        });
      };
    }
  });
  const w = dom.window;
  await new Promise(function (r) { setTimeout(r, 60); });
  return {
    w: w, doc: w.document,
    settle: function () { return new Promise(function (r) { setTimeout(r, 40); }); },
    close: function () { w.close(); }
  };
}

// 編集モードに入り、条件メモに打ちかけの文字を入れる（★change を発火させない＝保存しない）
function typeWithoutBlur(app, typed) {
  const chk = app.doc.getElementById('chk-edit');
  chk.checked = true;
  chk.dispatchEvent(new app.w.Event('change'));
  const inp = app.doc.querySelector('.note-input');
  if (!inp) return null;
  inp.value = typed;
  inp.focus();
  return inp;
}

async function testEditingIsProtected() {
  console.log('[ケース1] 他端末が更新した状態で自動更新が走っても、打ちかけの入力が消えない');
  const cloud = { records: [rec({})] };
  const app = await boot(cloud);

  const inp = typeWithoutBlur(app, '入力途中のメモ');
  assert(!!inp, '編集モードで note-input が出る');
  eq(app.doc.querySelector('.note-input').value, '入力途中のメモ', '入力した値が入っている');
  assert(app.doc.activeElement === app.doc.querySelector('.note-input'), '入力欄にフォーカスがある');

  // 他端末が status を変えた（updatedAt を進める）＝マージ結果が変わる状況
  cloud.records = [rec({ status: 'OK', updatedAt: '2026-08-09T00:00:00Z' })];

  // ★30秒タイマー・visibilitychange・起動時のいずれもここを通る。同じ経路を直接叩く。
  await app.w.eval('loadFromCloud(true)');
  await app.settle();

  const after = app.doc.querySelector('.note-input');
  assert(!!after, '再描画されても入力欄自体は存在する');
  eq(after ? after.value : null, '入力途中のメモ', '★打ちかけの入力が残っている（ガードが効いている）');
  assert(app.doc.activeElement === after, '★フォーカスも残っている');
  app.close();
}

async function testNotEditingStillSyncs() {
  console.log('[ケース2] 編集していないときは、従来どおり取得・反映される（ガードが更新を殺していない）');
  const cloud = { records: [rec({})] };
  const app = await boot(cloud);
  await app.settle();

  // どこにもフォーカスが無い状態にする（編集モードにも入らない）
  app.doc.body.focus();
  eq(app.w.eval('state.records[0].status'), '未設定', '起動時は 未設定');

  cloud.records = [rec({ status: 'OK', updatedAt: '2026-08-09T00:00:00Z' })];
  await app.w.eval('loadFromCloud(true)');
  await app.settle();

  eq(app.w.eval('state.records[0].status'), 'OK', '★他端末の更新が取り込まれる（止まっていない）');
  app.close();
}

async function testSingleUserUnchanged() {
  console.log('[ケース3] 単独利用（クラウドの中身が変わらない）は従来どおり入力が残る');
  const cloud = { records: [rec({})] };
  const app = await boot(cloud);

  typeWithoutBlur(app, '入力途中のメモ2');
  await app.w.eval('loadFromCloud(true)');
  await app.settle();

  const after = app.doc.querySelector('.note-input');
  eq(after ? after.value : null, '入力途中のメモ2', '中身が変わらなければ入力は残る（元からの挙動）');
  app.close();
}

async function testGuardIsAtLoadFromCloud() {
  console.log('[ケース4] ガードの当て所が loadFromCloud の先頭であること（render だけ止めていない）');
  const src = fs.readFileSync(path.join(ROOT, 'sns-consent.html'), 'utf8');

  assert(/function\s+snsIsEditingNow\s*\(/.test(src), 'snsIsEditingNow が定義されている');

  // loadFromCloud の本体を切り出し、ガードが fetch より前にあることを見る
  const m = src.match(/function\s+loadFromCloud\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(!!m, 'loadFromCloud の本体を取り出せる');
  const body = m ? m[1] : '';
  const iGuard = body.indexOf('snsIsEditingNow()');
  const iFetch = body.indexOf('fetch(');
  const iMerge = body.indexOf('mergeRemoteIntoLocal');
  assert(iGuard >= 0, 'loadFromCloud の中にガードがある');
  assert(iGuard >= 0 && iFetch >= 0 && iGuard < iFetch, '★ガードは fetch より前（取得そのものを止めている）');
  assert(iGuard >= 0 && iMerge >= 0 && iGuard < iMerge, '★ガードは mergeRemoteIntoLocal より前（state を書き換える前に止めている）');

  // render() 側にガードを移していないこと（移すと state だけ新しくなる。docs/宿題.md 参照）
  const rm = src.match(/function\s+render\s*\(\s*\)\s*\{([\s\S]*?)\n\}/);
  assert(!!rm, 'render の本体を取り出せる');
  assert(rm && rm[1].indexOf('snsIsEditingNow') < 0,
    '★render() にはガードを当てていない（当てると state と画面がズレる）');
}

(async function main() {
  await testEditingIsProtected();
  await testNotEditingStillSyncs();
  await testSingleUserUnchanged();
  await testGuardIsAtLoadFromCloud();
  console.log('');
  console.log('PASS ' + pass + ' / FAIL ' + fail);
  // アプリの setInterval がイベントループを掴んだままなので明示終了する
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
