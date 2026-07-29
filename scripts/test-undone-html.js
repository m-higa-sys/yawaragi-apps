// 送迎日誌「今日できませんでした」ボタンの画面側の検証（2026-07-30）
// 対象: sougei_nisshi.html の未実施報告ブロック
//   段3-1 storage拒否で「完全無反応」にならない
//   段3-2 sending の文言に所要時間を出す
//   段3-3 pending（押したが未送信）を残し、次回ロードで再送信案内を出す
//   段3-4 ボタンが .controls（sticky/z-index:100）より上に来る
//   段3-5 .toast の当たり判定を殺す
// 実行: node scripts/test-undone-html.js
//
// 実測の限界（隠さず明記）: jsdom はレイアウトを持たないため elementFromPoint による
//   実機ヒットテストはできない。3-4/3-5 は「CSSの不変条件」として検証する。

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'sougei_nisshi.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, e, label) {
  if (JSON.stringify(a) === JSON.stringify(e)) pass++;
  else { fail++; console.error('  [FAIL] ' + label + '  期待=' + JSON.stringify(e) + ' 実際=' + JSON.stringify(a)); }
}

// ===== 段3-4 / 3-5: CSSの不変条件 =====
function decl(selector) {
  // 「selector{...}」の中身を素で取り出す（このファイルは1行1ルールの素のCSS）。
  // /* コメント */ は必ず落とす（コメント内の "z-index:100" を宣言と誤読しないため）。
  const i = html.indexOf(selector);
  if (i < 0) return '';
  const s = html.indexOf('{', i), e = html.indexOf('}', s);
  return html.slice(s + 1, e).replace(/\/\*[\s\S]*?\*\//g, '');
}
const btnCss = decl('#undone-report-btn {');
const controlsCss = decl('.controls{');
const toastCss = decl('.toast{');

ok(/position:\s*relative/.test(btnCss), '3-4a: ボタンが positioned（z-indexを効かせる前提）');
const btnZ = Number((btnCss.match(/z-index:\s*(\d+)/) || [])[1]);
const ctrlZ = Number((controlsCss.match(/z-index:\s*(\d+)/) || [])[1]);
ok(/position:\s*sticky/.test(controlsCss), '3-4b: .controls は sticky（前提の確認）');
eq(ctrlZ, 100, '3-4c: .controls の z-index は 100（前提の確認）');
ok(btnZ > ctrlZ, '3-4d: ボタンの z-index(' + btnZ + ') > .controls(' + ctrlZ + ') ＝ 青バーに奪われない');
ok(/pointer-events:\s*none/.test(toastCss), '3-5: .toast に pointer-events:none（opacity:0でも当たり判定が残るため）');
ok(/top:\s*60px/.test(toastCss), '3-5b: .toast は top:60px（ボタン直下に重なる位置。前提の確認）');

// ===== ボタン本体のマークアップ（DOM上の前提）=====
const dom0 = new JSDOM(html, { runScripts: 'outside-only' });
const btn0 = dom0.window.document.getElementById('undone-report-btn');
ok(!!btn0, 'M1: #undone-report-btn が存在する');
eq(btn0.getAttribute('data-state'), 'idle', 'M2: 初期 data-state=idle');
eq(btn0.getAttribute('onclick'), 'onUndoneClick()', 'M3: onclick=onUndoneClick()');
// body 直下で、描画される（script以外の）最初の要素であること＝画面最上部
const firstVisible = Array.from(dom0.window.document.body.children)
  .find(el => el.tagName !== 'SCRIPT');
ok(btn0.parentElement.tagName === 'BODY' && btn0 === firstVisible,
  'M4: body 直下・描画される最初の要素（画面最上部）');

// ===== 関数を取り出して単体で動かす =====
function extractFn(src, name) {
  const kw = src.indexOf('function ' + name + '(') >= 0 ? 'function ' : 'async function ';
  const s = src.indexOf(kw + name + '(');
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}

// ボタンだけを持つ最小DOM＋差し替え可能な localStorage を用意して、対象関数を評価する
function makeEnv(storageImpl) {
  const dom = new JSDOM('<button id="undone-report-btn" data-state="idle" type="button">'
    + '<span class="main-text"></span><span class="sub"></span></button>');
  const ctx = {
    document: dom.window.document,
    localStorage: storageImpl,
    UNDONE_APP_KEY: 'sougei_nisshi',
    JSON: JSON, Date: Date, String: String, Number: Number, isNaN: isNaN
  };
  const names = ['_undoneTodayDateStr', '_undoneStorageKey', '_undoneFormatHHMM', '_undoneFormatMDHM',
    '_undoneReadStore', '_undoneWriteStore', '_undoneClearStore', '_undoneSetState', '_undoneRestoreState'];
  const src = names.map(n => extractFn(html, n)).join('\n');
  const vm = require('vm');
  vm.createContext(ctx);
  vm.runInContext(src + '\n', ctx);
  const btn = dom.window.document.getElementById('undone-report-btn');
  return {
    ctx, btn,
    state: () => btn.getAttribute('data-state'),
    main: () => btn.querySelector('.main-text').textContent,
    sub: () => btn.querySelector('.sub').textContent
  };
}
function memStorage(seed) {
  const m = Object.assign({}, seed || {});
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    _dump: () => m
  };
}
// iOS Safari で Cookie/ストレージをブロックした端末の再現（getItem が投げる）
function blockedStorage() {
  return {
    getItem: () => { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; },
    setItem: () => { throw new Error('The operation is insecure.'); },
    removeItem: () => { throw new Error('The operation is insecure.'); }
  };
}

// ===== 段3-1: storage拒否端末でも「表示変化ゼロ」にならない =====
{
  const env = makeEnv(blockedStorage());
  env.ctx._undoneRestoreState();
  eq(env.state(), 'error', '3-1a: storage拒否 → data-state が idle から error へ変わる（完全無反応でない）');
  eq(env.sub(), 'この端末の設定で保存できません', '3-1b: 拒否理由を画面に出す');
  ok(env.main().indexOf('⚠️') === 0, '3-1c: 主文言が警告表示');
}
// 参考: 修正前の実装（try外の素の getItem）だと例外が漏れて表示が変わらないことを確認
{
  const blocked = blockedStorage();
  let threw = false;
  try { blocked.getItem('k'); } catch (e) { threw = true; }
  ok(threw, '3-1d: 再現の妥当性（拒否storageの getItem は実際に例外を投げる）');
}

// ===== 段3-2: sending の文言 =====
{
  const env = makeEnv(memStorage());
  env.ctx._undoneSetState('sending');
  eq(env.state(), 'sending', '3-2a: data-state=sending');
  ok(env.main().indexOf('最大30秒') >= 0, '3-2b: 所要時間を出す（実測 3.9〜21.8秒のため）');
  ok(env.sub().length > 0, '3-2c: サブ文言も出る（無言のグレーにしない）');
}

// ===== 段3-3: pending が残っていれば再送信案内 =====
{
  const key = 'yawaragi_undone_sougei_nisshi_' + (() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  })();
  // pending（押されたが送信できていない）
  const envP = makeEnv(memStorage({ [key]: JSON.stringify({ id: '', reportedAt: '2026-07-30T09:12:00+09:00', state: 'pending' }) }));
  envP.ctx._undoneRestoreState();
  eq(envP.state(), 'pending', '3-3a: pending が残っていれば data-state=pending');
  ok(envP.main().indexOf('押されましたが送信できていません') >= 0, '3-3b: 送信できていない旨を出す');
  ok(/7\/30 09:12/.test(envP.main()), '3-3c: 押下時刻を M/D HH:MM で出す（実測=' + envP.main() + '）');
  eq(envP.sub(), 'タップで再送信', '3-3d: 再送信を促す');

  // confirmed（送信成功済み）は従来どおり reported
  const envC = makeEnv(memStorage({ [key]: JSON.stringify({ id: 'un_1', reportedAt: '2026-07-30T09:12:00+09:00', state: 'confirmed' }) }));
  envC.ctx._undoneRestoreState();
  eq(envC.state(), 'reported', '3-3e: confirmed → reported');
  ok(envC.main().indexOf('未実施報告済') >= 0, '3-3f: 報告済み表示');

  // state 未設定の旧フォーマット（2026-04〜）は confirmed 扱い＝後方互換
  const envO = makeEnv(memStorage({ [key]: JSON.stringify({ id: 'un_1', reportedAt: '2026-07-30T09:12:00+09:00' }) }));
  envO.ctx._undoneRestoreState();
  eq(envO.state(), 'reported', '3-3g: state無しの旧データは reported（後方互換）');

  // 何も無ければ idle
  const envI = makeEnv(memStorage());
  envI.ctx._undoneRestoreState();
  eq(envI.state(), 'idle', '3-3h: 記録なし → idle');
}

// ===== 送信フローの契約（GAS返り値の読み方を固定する）=====
ok(/action:\s*'report_undone'/.test(html), 'P1: action は report_undone');
ok(/json\.success/.test(html), 'P2: 成否は json.success で判定する');
ok(/state:\s*'pending'/.test(html), 'P3: 送信前に pending を書く');
ok(/state:\s*'confirmed'/.test(html), 'P4: 成功で confirmed に昇格する');
// 失敗時に pending を消していないこと（_undoneClearStore は cancel 成功時のみ）
const clickSrc = extractFn(html, 'onUndoneClick');
eq((clickSrc.match(/_undoneClearStore\(\)/g) || []).length, 1,
  'P5: _undoneClearStore は1箇所（cancel成功時のみ）＝失敗でpendingを消さない');
ok(/mode:\s*'no-cors'/.test(clickSrc) === false, 'P6: 未実施パスに no-cors を使わない（応答検証を殺さない）');
ok(/sendBeacon/.test(clickSrc) === false, 'P7: 未実施パスに sendBeacon を使わない');

console.log('\ntest-undone-html: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
