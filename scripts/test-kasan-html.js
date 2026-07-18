// test-kasan-html.js
// kasan.html（加算・事業所情報アプリ）の実コード抽出テスト（design.md 2026-07-17 §4.0.1 準拠）
//
// 方式：jsdom を使わず、出荷コードから正規表現で該当ブロック/純関数を抽出して検証する
//   （出荷コードとテストのドリフト防止）。設計書の指示「実コード抽出・jsdom なし」に従う。
//
// 観点：
//   1. 版ゲート  … genba.html のゲート <script> ブロックと byte 単位で同一（verbatim 移植）
//   2. ゲート挙動 … 抽出した gateShouldReload / buildVersionedUrl が genba と同一挙動
//   3. esc       … 全出力エスケープ（<>&" と null 安全）
//   4. JSONP結線  … callback 付き URL・script 注入・window[cbName]・タイムアウト
//   5. 行整形     … 加算行を「コード␣名称」でコード併記し、値は esc 経由
//
// 実行: node scripts/test-kasan-html.js

const fs = require('fs');
const path = require('path');

const GENBA = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');
const KASAN_PATH = path.join(__dirname, '..', 'kasan.html');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// kasan.html が無ければ readFileSync が throw → 未実装＝RED
const KASAN = fs.readFileSync(KASAN_PATH, 'utf8');

// <head> 直後のゲート <script> 要素（gateShouldReload を含む）を抽出
const GATE_RE = /<script>\s*function gateShouldReload[\s\S]*?<\/script>/;
function extractGate(html, label) {
  const m = html.match(GATE_RE);
  if (!m) throw new Error(label + ' にゲート <script> ブロックが見つからない（未移植＝RED）');
  return m[0];
}

// ===== 1+2. 版ゲート byte 一致 & 挙動 =====
console.log('[版ゲート genba同一性]');
const genbaGate = extractGate(GENBA, 'genba.html');
let kasanGate = null;
try {
  kasanGate = extractGate(KASAN, 'kasan.html');
  pass++; console.log('  PASS kasan.html にゲート <script> ブロックが存在する');
} catch (e) {
  fail++; console.log('  FAIL ' + e.message);
}
eq(kasanGate, genbaGate, 'kasan.html のゲートブロックが genba と byte 単位で同一');

// 抽出した純関数の挙動（genba と同一であること）
function loadGateFns(gateSrc) {
  const reShould = /function\s+gateShouldReload\s*\([^)]*\)\s*\{[^}]*\}/;
  const reBuild = /function\s+buildVersionedUrl\s*\([^)]*\)\s*\{[^}]*\}/;
  const sandbox = {};
  const src = gateSrc.match(reShould)[0] + '\n' + gateSrc.match(reBuild)[0] +
    '\nsandbox.gateShouldReload = gateShouldReload; sandbox.buildVersionedUrl = buildVersionedUrl;';
  (function () { eval(src); })();
  return sandbox;
}
if (kasanGate) {
  const fns = loadGateFns(kasanGate);
  console.log('[ゲート挙動]');
  eq(fns.gateShouldReload('a', 'b'), true, 'cur≠latest → reload');
  eq(fns.gateShouldReload('a', 'a'), false, 'cur=latest → no reload');
  eq(fns.gateShouldReload('a', ''), false, 'latest空 → no reload（固まらせない）');
  eq(fns.gateShouldReload(null, 'b'), true, 'cur=null（?v=無し）→ reload');
  eq(fns.buildVersionedUrl('https://x.io/kasan.html', '2026-07-04-71'),
     'https://x.io/kasan.html?v=2026-07-04-71', 'v= を付与');
  eq(fns.buildVersionedUrl('https://x.io/kasan.html?v=old', '2026-07-04-71'),
     'https://x.io/kasan.html?v=2026-07-04-71', '既存 v= を置換');
}

// ===== 3. esc（全出力エスケープ） =====
// kasan.html 内の function esc(...) を実コード抽出して挙動を評価する。
function loadEsc(html) {
  // esc は1行関数。行内の最後の } まで貪欲に取る（. は改行に非マッチ＝1行内で閉じる）。
  const m = html.match(/function\s+esc\s*\([^)]*\)\s*\{.*\}/);
  if (!m) throw new Error('kasan.html に function esc が見つからない（未実装＝RED）');
  const sandbox = {};
  (function () { eval(m[0] + '\nsandbox.esc = esc;'); })();
  return sandbox.esc;
}
console.log('[esc エスケープ]');
try {
  const esc = loadEsc(KASAN);
  eq(esc('<script>'), '&lt;script&gt;', '< > をエスケープ');
  eq(esc('a & b'), 'a &amp; b', '& をエスケープ');
  eq(esc('"x"'), '&quot;x&quot;', '" をエスケープ');
  eq(esc(null), '', 'null → 空文字（落ちない）');
  eq(esc(undefined), '', 'undefined → 空文字');
  eq(esc(781241), '781241', '数値 → 文字列化');
  eq(esc('普通の文字'), '普通の文字', '通常文字は素通し');
} catch (e) {
  fail++; console.log('  FAIL ' + e.message);
}

// ===== 4. JSONP結線 =====
// board GAS は GET=JSONP（fetch不可・script注入＋callback= 必須。設計書§4.0）。
// URL構築は純関数 kasanApiUrl に切り出してあること＝挙動を直接検証できる。
console.log('[JSONP結線]');
function loadApiUrl(html) {
  // 1行関数。行内の最後の } まで（. は改行に非マッチ）。
  const m = html.match(/function\s+kasanApiUrl\s*\([^)]*\)\s*\{.*\}/);
  if (!m) throw new Error('kasan.html に function kasanApiUrl が見つからない（未実装＝RED）');
  const sandbox = {};
  (function () { eval(m[0] + '\nsandbox.kasanApiUrl = kasanApiUrl;'); })();
  return sandbox.kasanApiUrl;
}
try {
  const apiUrl = loadApiUrl(KASAN);
  eq(apiUrl('https://x/exec', 'cb1', 123),
     'https://x/exec?action=kasan&callback=cb1&t=123',
     'action=kasan・callback・キャッシュバスターt を組む');
  ok(/action=kasan/.test(apiUrl('https://x/exec', 'cb', 1)), 'action=kasan を必ず含む');
} catch (e) {
  fail++; console.log('  FAIL ' + e.message);
}
// 結線コードの静的存在（DOM実行は jsdom 無しで検証不可＝コード存在で担保）
ok(/createElement\(\s*['"]script['"]\s*\)/.test(KASAN), 'script要素を注入している');
ok(/window\[[^\]]+\]\s*=/.test(KASAN), 'window[cbName] にコールバックを登録している');
ok(/setTimeout/.test(KASAN), 'タイムアウトを設定している（応答なしで固まらせない）');
ok(/delete\s+window\[[^\]]+\]|window\[[^\]]+\]\s*=\s*undefined/.test(KASAN), 'cleanup でコールバックを破棄している');

// ===== 5. 加算行フォーマット純関数（コード併記・esc経由） =====
// 加算行 {code,item,note} を「コード␣名称」の HTML に。全出力 esc 経由（XSS防止）。
console.log('[加算行フォーマット]');
function loadAddonLine(html) {
  const escM = html.match(/function\s+esc\s*\([^)]*\)\s*\{.*\}/);
  const m = html.match(/function\s+kasanAddonLine\s*\([^)]*\)\s*\{.*\}/);
  if (!m) throw new Error('kasan.html に function kasanAddonLine が見つからない（未実装＝RED）');
  const sandbox = {};
  (function () { eval(escM[0] + '\n' + m[0] + '\nsandbox.f = kasanAddonLine;'); })();
  return sandbox.f;
}
try {
  const line = loadAddonLine(KASAN);
  const h = line({ code: '781241', item: '本体（地域通所介護11）', note: '' });
  ok(h.indexOf('781241') >= 0, 'コードを併記する');
  ok(h.indexOf('本体（地域通所介護11）') >= 0, '名称を表示する');
  // XSS: item にタグ → esc される（生タグが残らない）
  const x = line({ code: 'A61111', item: '<img src=x onerror=alert(1)>', note: '' });
  ok(x.indexOf('<img') < 0, 'item の生タグを埋め込まない（esc経由）');
  ok(x.indexOf('&lt;img') >= 0, 'item のタグは &lt; へエスケープ');
  // code も esc
  const c = line({ code: '<b>', item: 'x', note: '' });
  ok(c.indexOf('<b>') < 0 && c.indexOf('&lt;b&gt;') >= 0, 'code も esc される');
  // note の有無
  const wn = line({ code: '786108', item: '処遇改善加算Ⅰ', note: '令和8年6月〜Ⅰロ 12.7%' });
  ok(wn.indexOf('令和8年6月〜Ⅰロ 12.7%') >= 0, 'note があれば表示する');
  const nn = line({ code: '786361', item: '科学的介護推進体制加算', note: '' });
  ok(nn.indexOf('科学的介護推進体制加算') >= 0, 'note が空でも名称は出る');
} catch (e) {
  fail++; console.log('  FAIL ' + e.message);
}

// ===== 6. 基本情報行フォーマット純関数（項目：値・esc） =====
console.log('[基本情報行フォーマット]');
function loadInfoLine(html) {
  const escM = html.match(/function\s+esc\s*\([^)]*\)\s*\{.*\}/);
  const m = html.match(/function\s+kasanInfoLine\s*\([^)]*\)\s*\{.*\}/);
  if (!m) throw new Error('kasan.html に function kasanInfoLine が見つからない（未実装＝RED）');
  const sandbox = {};
  (function () { eval(escM[0] + '\n' + m[0] + '\nsandbox.f = kasanInfoLine;'); })();
  return sandbox.f;
}
try {
  const info = loadInfoLine(KASAN);
  const h = info({ item: '事業所番号', value: '1173300995' });
  ok(h.indexOf('事業所番号') >= 0, '項目名を表示');
  ok(h.indexOf('1173300995') >= 0, '値を表示');
  const x = info({ item: '法人名', value: '<b>x</b>' });
  ok(x.indexOf('<b>') < 0 && x.indexOf('&lt;b&gt;') >= 0, '値を esc する');
} catch (e) {
  fail++; console.log('  FAIL ' + e.message);
}

// ===== 7. 描画の骨子（静的存在） =====
console.log('[描画の骨子]');
ok(/function\s+render\s*\(/.test(KASAN), 'render 関数がある');
ok(/function\s+showError\s*\(/.test(KASAN), 'showError 関数がある');
ok(KASAN.indexOf('基本情報') >= 0, 'カード見出し: 基本情報');
ok(KASAN.indexOf('運営体制') >= 0, 'カード見出し: 運営体制');
ok(KASAN.indexOf('地域区分') >= 0, 'カード見出し: 地域区分');
ok(KASAN.indexOf('加算') >= 0, 'カード見出し: 加算');
ok(KASAN.indexOf('介護給付') >= 0, '加算の系統ラベル: 介護給付');
ok(KASAN.indexOf('総合事業') >= 0, '加算の系統ラベル: 総合事業');
ok(KASAN.indexOf('未取得') >= 0, '総合事業の単価を「未取得」と明示（設計書§7-3）');
ok((KASAN.match(/kasanAddonLine/g) || []).length >= 2, 'kasanAddonLine を定義かつ呼び出している（描画で使う）');
ok((KASAN.match(/kasanInfoLine/g) || []).length >= 2, 'kasanInfoLine を定義かつ呼び出している（描画で使う）');
ok((KASAN.match(/fetchKasan\s*\(/g) || []).length >= 2, '起動時に fetchKasan を呼ぶ（定義＋呼び出し）');

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
