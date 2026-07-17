// wb.html GAS_URL直書き化＋版ゲート追加のjsdom統合テスト
// 実行: node scripts/test-wb-gas-url-dom.js
//
// 安全策（memory: 本番HTMLを実ブラウザで開いて検証してはいけない / verify-against-mock-environments）:
//   - jsdom の外部リソース読み込みは既定のまま無効 → <script src=GAS_URL> は絶対にロードされない
//   - window.fetch はスタブ。実ネットワークへは1バイトも出さない
//   - ダミー利用者は実在しない名前のみ（実在名を使うと本番取り違えの温床になる）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: ['C:/tmp/node_modules', 'C:/tmp'] }));

const WB_PATH = path.join(__dirname, '..', 'wb.html');
const html = fs.readFileSync(WB_PATH, 'utf8');

const EXPECTED_GAS_URL = 'https://script.google.com/macros/s/AKfycbzybYfuBLM14V9YrSqJvwvPVEGh9ixEuh-S8W7nnfoFbJf0dCMLmSgJq_DJsL2rwwq6/exec';
const TEST_VER = '2026-07-04-TESTVER';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

async function build() {
  const fetchCalls = [];
  const dom = new JSDOM(html, {
    url: 'https://m-higa-sys.github.io/yawaragi-apps/wb.html?v=' + TEST_VER,
    runScripts: 'dangerously',
    // resources は既定（外部リソースを一切ロードしない）のまま。usable にしてはならない。
    beforeParse(window) {
      // 版ゲートの fetch をスタブ。現URLの ?v= と同値を返して location.replace を発火させない
      window.fetch = function (url, opts) {
        fetchCalls.push({ url: String(url), opts: opts });
        return Promise.resolve({ text: function () { return Promise.resolve(TEST_VER + '\n'); } });
      };
      // 実ネットワークを使う経路が万一あれば即座に落とす
      window.XMLHttpRequest = function () { throw new Error('XHR は禁止（実ネットワーク遮断）'); };
      window.location.replace = function (u) { window.__replacedTo = u; };
    }
  });
  await new Promise(function (r) { setTimeout(r, 60); });
  return { dom, window: dom.window, fetchCalls };
}

(async function main() {
  console.log('=== wb.html GAS_URL直書き＋版ゲート jsdomテスト ===\n');

  // ---------- 1. 版ゲート ----------
  console.log('[1] 版ゲート（version.txt ポーリング＋cache-busting redirect）');
  {
    const { window, fetchCalls } = await build();
    const verFetch = fetchCalls.filter(function (c) { return c.url.indexOf('version.txt') >= 0; });
    ok(verFetch.length === 1, 'version.txt を1回だけ取得する');
    ok(verFetch.length > 0 && /version\.txt\?_=\d+/.test(verFetch[0].url), 'version.txt にキャッシュ回避クエリが付く');
    ok(verFetch.length > 0 && verFetch[0].opts && verFetch[0].opts.cache === 'no-store', "fetch は cache:'no-store'");
    ok(window.__replacedTo === undefined, '版が一致していれば location.replace しない（無限リロード防止）');

    // 純関数
    ok(window.gateShouldReload('2026-07-04-71', '2026-07-04-72') === true, 'gateShouldReload: 版が違えばリロード');
    ok(window.gateShouldReload('2026-07-04-72', '2026-07-04-72') === false, 'gateShouldReload: 同版ならリロードしない');
    ok(window.gateShouldReload(null, '') === false, 'gateShouldReload: version.txt が空なら何もしない（オフライン安全）');
    ok(window.gateShouldReload(null, '2026-07-04-72') === true, 'gateShouldReload: ?v= 無しの初回はリロード');
    const built = window.buildVersionedUrl('https://x.test/wb.html', '2026-07-04-72');
    ok(built === 'https://x.test/wb.html?v=2026-07-04-72', 'buildVersionedUrl: ?v= を付与する');
    window.close();
  }

  // ---------- 2. 開いた瞬間に GAS_URL で同期 ----------
  console.log('\n[2] 開いた瞬間に GAS_URL で同期が走る');
  const { window, fetchCalls } = await build();
  {
    ok(window.eval('GAS_URL') === EXPECTED_GAS_URL, 'GAS_URL が指定のexec URLで直書きされている');
    ok(window.eval('AUTO_SYNC_SEC') === 60, '自動同期は60秒ハードコード');

    const script = window.document.getElementById('jsonpScript');
    ok(!!script, 'DOMContentLoaded 時点でJSONPスクリプトが生成されている＝同期が走った');
    ok(!!script && script.src.indexOf(EXPECTED_GAS_URL + '?callback=wbCallback_') === 0, 'JSONPの向き先が GAS_URL である');
    ok(fetchCalls.every(function (c) { return c.url.indexOf('script.google.com') < 0; }), '本番GASへ fetch は飛ばない（JSONPのみ・jsdomはsrcをロードしない）');

    const bodyText = window.document.body.textContent;
    ok(bodyText.indexOf('未設定です') < 0, '「GAS URLが未設定です」が出ない');
    ok(bodyText.indexOf('右上の「設定」から') < 0, '設定誘導の文言が出ない');
  }

  // ---------- 3. 設定UIの撤去／非表示モーダルの温存 ----------
  console.log('\n[3] 設定UI撤去・非表示管理モーダル温存');
  {
    const d = window.document;
    ok(d.getElementById('settingsModal') === null, '設定モーダルが消えている');
    ok(d.getElementById('gasUrlInput') === null, 'GAS URL入力欄が消えている');
    ok(d.getElementById('autoSyncSelect') === null, '自動同期間隔セレクトが消えている');
    ok(d.querySelector('.btn-settings') === null, '右上「設定」ボタンが消えている');
    ok(typeof window.openSettings === 'undefined', 'openSettings が存在しない');
    ok(typeof window.saveSettings === 'undefined', 'saveSettings が存在しない');
    ok(d.getElementById('hiddenModal') !== null, '非表示管理モーダルは残っている');
    ok(typeof window.showHiddenModal === 'function', 'showHiddenModal は残っている');
    ok(d.querySelectorAll('.modal-overlay').length === 1, 'modal CSS/構造は非表示モーダル用に温存されている');
  }

  // ---------- 4. JSONPコールバック＝利用者同期の本体 ----------
  console.log('\n[4] 利用者同期（JSONPコールバック）が従来通り動く');
  {
    const script = window.document.getElementById('jsonpScript');
    const cbName = script.src.split('callback=')[1];
    ok(typeof window[cbName] === 'function', 'コールバックが登録されている');

    window[cbName]({
      hasWBCols: true,
      users: [
        { name: 'テスト太郎', kana: 'テストタロウ', wbHeight: '160', wbStrength: '3', wbOther: '緑枕', days: '月,水', ampm: '午前' },
        { name: 'ダミー花子', kana: 'ダミーハナコ', wbHeight: '150', wbStrength: 'BT', wbOther: '', days: '火', ampm: '午後' }
      ]
    });

    ok(window.document.getElementById('userCount').textContent === '2', '登録者数が表示される（2人）');
    ok(window.document.querySelectorAll('.user-card').length === 2, '利用者カードが描画される');
    ok(window.document.body.textContent.indexOf('テスト太郎') >= 0, '利用者名が描画される');

    // 残すキー: wb_settings_data / wb_settings_last_sync
    const cached = JSON.parse(window.localStorage.getItem('wb_settings_data') || '{}');
    ok(cached['テスト太郎'] && cached['テスト太郎'].height === '160', 'wb_settings_data にローカルキャッシュされる（温存キー）');
    ok(!!window.localStorage.getItem('wb_settings_last_sync'), 'wb_settings_last_sync が記録される（温存キー）');
    ok(window.document.getElementById('lastSync').textContent.indexOf('最終同期') >= 0, '最終同期表示が出る');
    ok(window.document.getElementById('lastSync').textContent.indexOf('（1分ごと自動同期）') >= 0, '「1分ごと自動同期」と表示される');

    // 廃止キーは書かれない
    ok(window.localStorage.getItem('wb_settings_gas_url') === null, 'wb_settings_gas_url は一切書かれない（廃止キー）');
    ok(window.localStorage.getItem('wb_settings_auto_sync') === null, 'wb_settings_auto_sync は一切書かれない（廃止キー）');
  }

  // ---------- 5. 保存（saveToGAS）の向き先 ----------
  console.log('\n[5] スプレッドシート保存の向き先が GAS_URL');
  {
    const before = window.document.head.querySelectorAll('script').length;
    window.updateSetting('テスト太郎', 'height', '170');
    ok(window.document.getElementById('saveStatus').textContent === '変更あり...', '変更検知が出る');
    // 1.5秒デバウンス後にJSONP保存
    await new Promise(function (r) { setTimeout(r, 1700); });
    const scripts = Array.from(window.document.head.querySelectorAll('script'));
    const saveScript = scripts.filter(function (s) { return s.src && s.src.indexOf('action=save') >= 0; })[0];
    ok(!!saveScript, '保存JSONPが発行される');
    ok(!!saveScript && saveScript.src.indexOf(EXPECTED_GAS_URL + '?action=save') === 0, '保存の向き先が GAS_URL である');
    ok(!!saveScript && saveScript.src.indexOf('wbHeight=170') >= 0, '保存パラメータ wbHeight が載る');
    ok(!!saveScript && saveScript.src.indexOf(encodeURIComponent('テスト太郎')) >= 0, '保存パラメータ name が載る');
  }

  // ---------- 6. 空白行±ボタン（温存キー） ----------
  console.log('\n[6] 印刷の空白行±ボタン（wb_settings_blank_rows 温存）');
  {
    window.changeBlankRows(1);
    ok(window.document.getElementById('blankCount').textContent === '4', '＋で空白行が増える');
    ok(window.localStorage.getItem('wb_settings_blank_rows') === '4', 'wb_settings_blank_rows に保存される（温存キー）');
    window.changeBlankRows(-1);
    ok(window.localStorage.getItem('wb_settings_blank_rows') === '3', '−で戻り保存される');
  }

  // ---------- 7. 非表示利用者（温存キー） ----------
  console.log('\n[7] 非表示利用者（wb_hidden_users 温存）');
  {
    window.hideUser('ダミー花子');
    ok(JSON.parse(window.localStorage.getItem('wb_hidden_users') || '[]').indexOf('ダミー花子') >= 0, 'wb_hidden_users に保存される（温存キー）');
    ok(window.document.getElementById('userCount').textContent === '1', '非表示にすると登録者数が減る');
    window.showHiddenModal();
    ok(window.document.getElementById('hiddenModal').classList.contains('active'), '非表示管理モーダルが開く');
    window.unhideUser('ダミー花子');
    ok(window.document.getElementById('userCount').textContent === '2', '表示に戻せる');
    window.closeHiddenModal();
  }
  window.close();

  // ---------- 8. GASエラー時の renderFromLocal フォールバック ----------
  // 注: エラー文言を出した直後に renderFromLocal() が userList を上書きするため、
  //     ローカルキャッシュがある時はエラー文言が残らない。これは master と同一の既存挙動
  //     （本改修では error 分岐に一切手を入れていない）。フォールバック描画側を正とする。
  console.log('\n[8] GASエラー時の renderFromLocal フォールバック（wb_settings_data 温存）');
  {
    const { window: w2 } = await build();
    w2.localStorage.setItem('wb_settings_data', JSON.stringify({ 'キャッシュ次郎': { height: '155', strength: '2', other: '' } }));
    w2.eval('loadLocalData()');
    const script = w2.document.getElementById('jsonpScript');
    const cb = script.src.split('callback=')[1];
    w2[cb]({ error: 'テスト用エラー' });
    ok(w2.document.body.textContent.indexOf('キャッシュ次郎') >= 0, 'キャッシュ有: ローカルキャッシュからフォールバック描画される');
    ok(w2.document.getElementById('userCount').textContent === '1', 'キャッシュ有: フォールバック分の人数が出る');
    w2.close();
  }
  {
    // キャッシュ無しなら renderFromLocal が早期returnするのでエラー文言が残る
    const { window: w3 } = await build();
    const script = w3.document.getElementById('jsonpScript');
    const cb = script.src.split('callback=')[1];
    w3[cb]({ error: 'テスト用エラー' });
    ok(w3.document.body.textContent.indexOf('エラー: テスト用エラー') >= 0, 'キャッシュ無: GASエラーが表示される');
    w3.close();
  }
  {
    // 通信断（JSONP onerror）: 接続失敗表示 → キャッシュ描画
    const { window: w4 } = await build();
    w4.localStorage.setItem('wb_settings_data', JSON.stringify({ 'キャッシュ次郎': { height: '155', strength: '2', other: '' } }));
    w4.eval('loadLocalData()');
    const script = w4.document.getElementById('jsonpScript');
    script.onerror();
    ok(w4.document.body.textContent.indexOf('キャッシュ次郎') >= 0, '通信断: ローカルキャッシュから描画される');
    w4.close();
  }

  console.log('\n================================');
  console.log('PASS: ' + pass + ' / FAIL: ' + fail);
  console.log('================================');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('テスト実行エラー:', e);
  process.exit(1);
});
