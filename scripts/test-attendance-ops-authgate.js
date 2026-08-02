// attendance-ops.html 編集可否ゲート（鍵方式）のテスト（jsdom）
// 実行: node scripts/test-attendance-ops-authgate.js
//
// 旧: location.hostname.includes('github.io') で公開先なら一律で閲覧専用にしていた。
//     Pages へ移すと社長も編集できなくなるため、admin.html と同じ鍵(adminKey)方式に置換した。
//
// ここで固定するのは「どのルートを通っても編集可に落ちてこない」こと:
//   鍵なし / localStorage が読めない / 形式が不正 / 例外発生 → すべて閲覧専用
//   鍵あり → 編集可
// あわせて、閲覧専用時に画面に明示が出ること・保存が黙って落ちないことを固定する。
//
// ※ 実際の鍵の値はこのファイルにも書かない。検証用のダミー文字列だけを使う。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'attendance-ops.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const DUMMY_KEY = 'dummy-value-not-a-real-key';

// 鍵の状態を指定して window を作る。
//   mode: 'none' | 'set' | 'throws' | 'blank' | 'nonstring'
function makeWindow(mode) {
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
      if (mode === 'set') w.localStorage.setItem('yawaragi_admin_key', DUMMY_KEY);
      if (mode === 'blank') w.localStorage.setItem('yawaragi_admin_key', '   ');
      if (mode === 'throws') {
        // localStorage が読めない環境（プライベートモード等）を模す
        Object.defineProperty(w, 'localStorage', {
          configurable: true,
          get() { throw new Error('localStorage is not available'); }
        });
      }
      if (mode === 'nonstring') {
        const real = w.localStorage;
        Object.defineProperty(w, 'localStorage', {
          configurable: true,
          get() {
            return {
              getItem(k) { return k === 'yawaragi_admin_key' ? 12345 : real.getItem(k); },
              setItem() { }, removeItem() { }, key() { return null; }, get length() { return 0; }, clear() { }
            };
          }
        });
      }
    }
  });
  return { w: dom.window, errors, dom };
}

console.log('\n[1] admin.html と同じ鍵・同じ保存先を使っている');
{
  const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  const adminKeyName = (adminHtml.match(/KEY_STORE\s*=\s*'([^']+)'/) || [])[1];
  const opsKeyName = (html.match(/ADMIN_KEY_STORE\s*=\s*'([^']+)'/) || [])[1];
  ok(!!adminKeyName, 'admin.html から鍵のキー名を読み取れた');
  ok(adminKeyName === opsKeyName, 'キー名が admin.html と一致（新しいキー名を作っていない）');
  ok(html.indexOf('localStorage.getItem(ADMIN_KEY_STORE)') >= 0, '保存先が localStorage（admin.html と同じ）');
  // 旧判定が残っていないこと（コメント内の説明は除く）
  const liveHostname = html.split('\n').filter(l => l.indexOf('hostname') >= 0 && l.trim().indexOf('//') !== 0);
  ok(liveHostname.length === 0, 'hostname による判定がコードから消えている（説明コメントのみ）');
}

console.log('\n[2] フェイルセーフ：4パターンすべて閲覧専用');
{
  const cases = [
    ['none', '鍵なし'],
    ['throws', 'localStorage が読めない（例外）'],
    ['blank', '鍵はあるが空白のみ（形式が不正）'],
    ['nonstring', '鍵が文字列でない（形式が不正）']
  ];
  cases.forEach(([mode, label]) => {
    const { w, errors } = makeWindow(mode);
    ok(w.eval('IS_READONLY') === true, label + ' → 閲覧専用（IS_READONLY=true）');
    ok(w.document.documentElement.classList.contains('readonly'), label + ' → readonly クラスが付く');
    ok(errors.length === 0, label + ' → JSエラー0（実測: ' + errors.length + '）');
    try { w.close(); } catch (e) { }
  });
}

console.log('\n[3] 鍵があるときだけ編集可');
{
  const { w, errors } = makeWindow('set');
  ok(w.eval('IS_READONLY') === false, '鍵あり → 編集可（IS_READONLY=false）');
  ok(!w.document.documentElement.classList.contains('readonly'), '鍵あり → readonly クラスが付かない');
  ok(errors.length === 0, '鍵あり → JSエラー0（実測: ' + errors.length + '）');

  // 判定関数そのものを直接叩く（同一 window 内で鍵を切り替える）
  w.localStorage.removeItem('yawaragi_admin_key');
  ok(w.computeReadonly() === true, '鍵を消すと computeReadonly() が true に戻る');
  w.localStorage.setItem('yawaragi_admin_key', DUMMY_KEY);
  ok(w.computeReadonly() === false, '鍵を戻すと false');
  w.localStorage.setItem('yawaragi_admin_key', '');
  ok(w.computeReadonly() === true, '空文字は閲覧専用');
  w.localStorage.setItem('yawaragi_admin_key', '　 \t');
  ok(w.computeReadonly() === true, '全角スペース・タブだけでも閲覧専用');
  w.localStorage.removeItem('yawaragi_admin_key');
  ok(w.readAdminKey() === '', '鍵が無いとき readAdminKey() は空文字（undefined を返さない）');
  try { w.close(); } catch (e) { }
}

console.log('\n[4] 閲覧専用のとき画面に明示が出る');
{
  const { w } = makeWindow('none');
  const doc = w.document;
  const bar = doc.querySelector('.readonly-bar');
  ok(!!bar, '閲覧専用バーが存在する');
  const title = doc.getElementById('ro-title');
  ok(!!title && title.textContent.indexOf('閲覧専用') >= 0, 'バーに「閲覧専用」と出る');
  ok(!!title && title.textContent.indexOf('編集・保存できません') >= 0, 'バーに「編集・保存できません」と出る');
  const link = doc.getElementById('ro-keylink');
  ok(!!link, '鍵の投入導線（リンク）がある');
  ok(!!link && link.getAttribute('href') === 'admin.html', '導線は admin.html（既存の鍵入力経路を流用）');
  // CSS: .readonly が付いているときだけ表示される作り
  ok(html.indexOf('.readonly-bar{display:none') >= 0, '既定では非表示');
  ok(html.indexOf('.readonly .readonly-bar{display:flex!important;}') >= 0, 'readonly のときだけ表示');
  try { w.close(); } catch (e) { }
}

console.log('\n[5] 編集可能なときはその表示を出さない');
{
  const { w } = makeWindow('set');
  ok(!w.document.documentElement.classList.contains('readonly'), 'readonly クラスが無い＝バーは非表示（CSSで制御）');
  try { w.close(); } catch (e) { }
}

console.log('\n[6] 閲覧専用のとき保存が黙って落ちない');
{
  const { w } = makeWindow('none');
  let toasted = null;
  w.showToast = function (msg, color) { toasted = { msg: msg, color: color }; };
  w.autoSave();
  ok(toasted !== null, '保存操作で反応が返る（黙って何も起きない状態ではない）');
  ok(toasted && toasted.msg.indexOf('保存されませんでした') >= 0, '「保存されませんでした」と分かる文言');
  ok(toasted && toasted.msg.indexOf('鍵') >= 0, 'どうすれば編集できるかが分かる');
  try { w.close(); } catch (e) { }
}

console.log('\n[7] 編集可能なときは余計な通知を出さない');
{
  const { w } = makeWindow('set');
  let toasted = null;
  w.showToast = function (msg) { toasted = msg; };
  w.eval('D = D || {}; D.date = "";');   // 日付未選択で早期returnさせ、保存副作用を起こさない
  w.autoSave();
  ok(toasted === null, '編集可のときは閲覧専用トーストが出ない');
  try { w.close(); } catch (e) { }
}

console.log('\n[8] IS_READONLY の分岐を消していない');
{
  const refs = (html.match(/IS_READONLY/g) || []).length;
  ok(refs >= 28, 'IS_READONLY の参照が28箇所以上ある（実測: ' + refs + '）');
  // 代入は1箇所だけ
  const assigns = (html.match(/const IS_READONLY\s*=/g) || []).length;
  ok(assigns === 1, 'IS_READONLY の代入は1箇所だけ（実測: ' + assigns + '）');
  ok(html.indexOf('const IS_READONLY = computeReadonly();') >= 0, '代入式が鍵判定に差し替わっている');
}

console.log('\n[9] 鍵の値がコードに埋まっていない');
{
  // 鍵は localStorage から読むだけで、リテラルとして持たない
  const suspicious = html.match(/ADMIN_KEY_STORE\s*,\s*'[^']+'/g) || [];
  ok(suspicious.length === 0, '鍵の値を setItem でコードから書き込んでいない');
  ok(html.indexOf('adminKey =') < 0, '鍵の値を変数に直書きしていない');
  // 限界の明記
  ok(html.indexOf('ANYONE_ANONYMOUS') >= 0, 'サーバ側認証が別課題であることがコメントに書いてある');
  ok(html.indexOf('直接POSTは防げない') >= 0, 'クライアント側ゲートの限界が明記されている');
}

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
