// newmail.html フロントの純関数テスト（DOMスタブ不要・出荷HTMLから実コード抽出）。
// 実行: node scripts/test-newmail-html.js
// 検証: matchedBy→人が読めるラベル変換 / 経過日数 / 経過→強調クラス / script全体の構文。
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'newmail.html'), 'utf8');

// body内 script（2スペースインデント）から関数を実コード抽出。末尾は行頭2スペースの } まで。
function grab(name) {
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
  const m = html.match(re);
  if (!m) throw new Error(name + '() が newmail.html に無い');
  return m[0];
}
const mapMatch = html.match(/var NM_DOMAIN_LABEL = \{[\s\S]*?\};/);
if (!mapMatch) throw new Error('NM_DOMAIN_LABEL が無い');

const src = mapMatch[0] + '\n' +
  grab('nmLabel_') + '\n' + grab('nmDaysAgo_') + '\n' + grab('nmAgeClass_') + '\n' +
  'sandbox.nmLabel_ = nmLabel_; sandbox.nmDaysAgo_ = nmDaysAgo_; sandbox.nmAgeClass_ = nmAgeClass_;';
const sandbox = {};
(function () { eval(src); })();
const { nmLabel_: label, nmDaysAgo_: daysAgo, nmAgeClass_: ageClass } = sandbox;

let pass = 0, fail = 0;
function eq(a, b, label) { if (a === b) { pass++; console.log('  PASS ' + label); } else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(b) + ' actual=' + JSON.stringify(a)); } }
function eqJson(a, b, label) { eq(JSON.stringify(a), JSON.stringify(b), label); }

console.log('[nmLabel_ / matchedBy→ラベル]');
eqJson(label(['domain:.lg.jp']), ['行政'], '.lg.jp → 行政');
eqJson(label(['domain:.go.jp']), ['行政'], '.go.jp → 行政');
eqJson(label(['domain:.go.jp', 'domain:.lg.jp']), ['行政'], '行政の重複は1つに畳む');
eqJson(label(['domain:densan-s.co.jp']), ['電算'], 'densan → 電算');
eqJson(label(['domain:carezou.net']), ['けあ蔵'], 'carezou → けあ蔵');
eqJson(label(['domain:moneyforward.com']), ['マネフォ'], 'moneyforward → マネフォ');
eqJson(label(['domain:job-medley.com', 'subject:応募']), ['求人', '応募'], '求人＋件名キーワード（応募はそのまま）');
eqJson(label(['subject:請求書']), ['請求書'], '件名キーワードはそのまま');
eqJson(label(['domain:keepfitlife.com']), ['社内'], 'keepfitlife → 社内');
eqJson(label([]), [], '空 → 空');
eqJson(label(['domain:unknown.example.com']), ['unknown.example.com'], '未知ドメインはドメイン名にフォールバック（domain: は外す）');

console.log('[nmDaysAgo_ / 経過日数]');
const NOW = Date.parse('2026-07-14 12:00');
eq(daysAgo('2026-07-10 12:00', NOW), 4, '4日前 → 4');
eq(daysAgo('2026-07-14 12:00', NOW), 0, '当日 → 0');
eq(daysAgo('2026-07-13 18:00', NOW), 0, '18時間前 → 0（切り捨て）');
eq(daysAgo('パース不能', NOW), null, 'パース不能 → null');

console.log('[nmAgeClass_ / 経過→強調]');
eq(ageClass(0), 'calm', '0日 → calm');
eq(ageClass(1), 'calm', '1日 → calm');
eq(ageClass(2), 'warn', '2日 → warn');
eq(ageClass(3), 'warn', '3日 → warn');
eq(ageClass(4), 'crit', '4日 → crit');
eq(ageClass(10), 'crit', '10日 → crit');
eq(ageClass(null), 'calm', 'null → calm');

console.log('[script 全体の構文]');
const lastOpen = html.lastIndexOf('<script>');
const scriptText = html.slice(lastOpen + '<script>'.length, html.indexOf('</script>', lastOpen));
try { new Function(scriptText); eq(true, true, 'script 全体が構文エラーなし'); }
catch (e) { eq('構文エラー: ' + e.message, 'ok', 'script 全体が構文エラーなし'); }

console.log('[render / DOMスモーク（jsdom）]');
const { JSDOM } = require('jsdom');
const lastOpen2 = html.lastIndexOf('<script>');
let scriptBody = html.slice(lastOpen2 + '<script>'.length, html.indexOf('</script>', lastOpen2));
scriptBody = scriptBody.replace(/\n  \/\/ 本番: 起動時[\s\S]*$/, '\n'); // 末尾の自動 fetchBoard() を外す（実JSONPを叩かせない）
const htmlNoScript = html.slice(0, lastOpen2) + html.slice(html.indexOf('</script>', lastOpen2) + '</script>'.length);
const dom = new JSDOM(htmlNoScript, { runScripts: 'outside-only', url: 'https://example.com/' });
const win = dom.window;
win.eval(scriptBody);

win.render({ ok: true, items: [
  { id: 'm1', from: '松山市 <x@city.matsuyama.lg.jp>', subject: '行政のお知らせ', date: '2026-07-10 09:00', matchedBy: ['domain:.lg.jp'] },
  { id: 'm2', from: 'ジョブメドレー <system@job-medley.com>', subject: '応募がきました', date: '2026-07-13 15:00', matchedBy: ['domain:job-medley.com', 'subject:応募'] }
] });
let cards = win.document.querySelectorAll('#board .mailcard');
eq(cards.length, 2, 'カード2枚描画');
const boardHtml = win.document.querySelector('#board').innerHTML;
eq(boardHtml.indexOf('行政') >= 0, true, 'ラベル「行政」が描画される');
eq(boardHtml.indexOf('求人') >= 0, true, 'ラベル「求人」が描画される');
eq(boardHtml.indexOf('応募') >= 0, true, 'ラベル「応募」が描画される');
eq(win.document.querySelectorAll('#board .doneBtn').length, 2, '対応済みボタンが各カードに');
eq(win.document.querySelector('#board .agebadge') !== null, true, '経過バッジが描画される');
eq(cards[0].getAttribute('data-id'), 'm1', '古いメール(m1)が先頭に来る（古い順ソート）');
eq(win.document.querySelector('#cnt').textContent, '2件', '件数バッジ=2件');

// 取り消し挙動（誤タップ救済）: 対応済みタップ→pending+取り消しボタン、取り消しで復帰（APIは叩かれない）
cards[0].querySelector('.doneBtn').click();
eq(cards[0].classList.contains('pending'), true, '対応済みタップで pending 化');
eq(cards[0].querySelector('.undoBtn') !== null, true, '「取り消し」ボタンが出る');
cards[0].querySelector('.undoBtn').click();
eq(cards[0].classList.contains('pending'), false, '取り消しで pending 解除');
eq(cards[0].querySelector('.doneBtn') !== null, true, '取り消しで「対応済み」ボタンに復帰');
eq(cards[0].querySelector('.undoBtn'), null, '取り消し後は undo ボタンが消える');

// 0件 → 新着なし表示
win.render({ ok: true, items: [] });
eq(win.document.querySelector('.emptybox') !== null, true, '0件で「新着なし」ボックス');
eq(win.document.querySelectorAll('#board .mailcard').length, 0, '0件でカードなし');

console.log(`RESULT pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
