// teishutsu.html — 中止者の繰越行に表示情報を載せる（2026-08-07）
//
// 背景: 締め(soufu-close-core)は「中止者でも対象月に利用実績1日以上」なら母集団に含めるので、
//       台帳には中止者の行が立つ。画面の繰越行は台帳から直接作られるため★行自体は出ていた。
//       しかし表示情報は pop（= users から cancelled を除いた配列）からしか引いておらず、
//       中止者は毎回 `|| {}` に落ちて事業所名・フリガナ・介護度が失われていた。
//       実測(2026-08-07): 該当1件が「(事業所未登録)」枠に入り、ひらがな検索でも引けない状態。
//
// 何を守るか:
//   ①中止者でも事業所・フリガナ・介護度が正しく引けること（正しい事業所に届く・検索で引ける）
//   ②★要支援の中止者が careOf('') で要介護に倒れないこと（書類フィルタの分類がずれる）
//   ③中止者と分かること（現場が「この人もう来ていないのに？」と迷わない）
//   ④★どちらにも居ない人でも落ちないこと（業務を止めない）
//
// ★このテストは teishutsu.html から実際の純関数を抽出して動かす（文字列検査ではない）。
// 実行: node scripts/test-teishutsu-cancelled-info.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'teishutsu.html'), 'utf8');

function grab(name) {
  const m = html.match(new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm'));
  if (!m) { console.error('[FAIL] 関数を抽出できません: ' + name); process.exit(1); }
  return m[0];
}
// careOf はアロー関数の const 定義so別に拾う
const careOfSrc = (html.match(/const\s+careOf\s*=[^\n]+/) || [''])[0];
const src = grab('carryUserInfo') + '\n' + careOfSrc;
const api = new Function(src + '\nreturn { carryUserInfo, careOf };')();
const { carryUserInfo, careOf } = api;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}

const POP = [
  { userId: '利用者A', furigana: 'リヨウシャエー', cmOffice: 'あおぞら居宅', category: '要介護２' }
];
const CANCELLED = [
  { userId: '中止者X', furigana: 'チュウシシャエックス', cmOffice: 'きらめき居宅', category: '要介護１', cancelDate: '2026-06-12' },
  { userId: '中止者Y', furigana: 'チュウシシャワイ', cmOffice: 'みどり居宅', category: '要支援２', cancelDate: '2026-05-01' }
];

console.log('\n[A) 非中止者は今までどおり引ける（既存の挙動を変えない）]');
{
  const r = carryUserInfo(POP, CANCELLED, '利用者A');
  ok('A1 pop から引ける', r && r.u && r.u.cmOffice === 'あおぞら居宅', JSON.stringify(r));
  ok('A2 中止フラグは立たない', r.cancelled === false, JSON.stringify(r.cancelled));
  ok('A3 フリガナが取れる（ひらがな検索の材料）', r.u.furigana === 'リヨウシャエー');
}

console.log('\n[B) ★中止者も引ける（今回の本題）]');
{
  const r = carryUserInfo(POP, CANCELLED, '中止者X');
  ok('B1 事業所名が「(事業所未登録)」に落ちない', r.u.cmOffice === 'きらめき居宅', JSON.stringify(r.u.cmOffice));
  ok('B2 フリガナが取れる（検索で引ける）', r.u.furigana === 'チュウシシャエックス');
  ok('B3 ★中止者だと分かる', r.cancelled === true);
  ok('B4 介護度が取れる', r.u.category === '要介護１');
  ok('B5 中止日も持っている（表示に使える）', r.u.cancelDate === '2026-06-12');
}

console.log('\n[C) ★要支援の中止者が要介護に倒れない]');
{
  const r = carryUserInfo(POP, CANCELLED, '中止者Y');
  ok('C1 category が取れる', r.u.category === '要支援２', JSON.stringify(r.u.category));
  ok('C2 ★careOf が shien を返す（従来は空文字→kaigo に倒れていた）',
     careOf(r.u.category || '') === 'shien', careOf(r.u.category || ''));
  // 旧挙動の再現: pop にしか無いと空オブジェクト → careOf('') = 'kaigo'
  ok('C3 旧挙動なら kaigo に倒れていたことを確認（回帰の目印）', careOf('') === 'kaigo');
}

console.log('\n[D) どちらにも居ない人でも落ちない（業務を止めない）]');
{
  const r = carryUserInfo(POP, CANCELLED, '存在しない人');
  ok('D1 例外を投げない', !!r);
  ok('D2 空の情報を返す', r.u && r.u.cmOffice === undefined, JSON.stringify(r.u));
  ok('D3 中止扱いにしない（不明を中止に化かさない）', r.cancelled === false);
  ok('D4 引数が空でも落ちない', (() => {
    try { const x = carryUserInfo(null, null, '誰か'); return !!x && x.cancelled === false; }
    catch (e) { return false; }
  })());
}

console.log('\n[E) 呼び出し側の結線（teishutsu.html の静的検査）]');
{
  ok('E1 state.data に中止者の配列を持っている',
     /cancelledUsers:\s*\(oral\.cancelledUsers\s*\|\|\s*\[\]\)/.test(html));
  ok('E2 ★繰越の生成が carryUserInfo を使っている（pop 直引きに戻っていない）',
     /carryUserInfo\(d\.pop,\s*d\.cancelledUsers,\s*r\.userId\)/.test(html));
  ok('E3 繰越行に isCancelled を載せている', /isCancelled:/.test(html));
  ok('E4 ★中止バッジを出している', /b-chushi/.test(html));
  ok('E5 中止バッジのCSSがある', /\.b-chushi\s*\{/.test(html));
  ok('E6 当月変換層は pop のまま（母集団ルールを変えていない）',
     /pop:\s*\(oral\.users\s*\|\|\s*\[\]\)\.filter\(u\s*=>\s*!u\.cancelled\)/.test(html));

  // 集めるタブは1行が小さく、バッジ欄を持たない。中止だと分からないまま「作れ」と出るのは危ない。
  const collectRow = (html.match(/function\s+collectRow\s*\([\s\S]*?\n\}/m) || [''])[0];
  ok('E7 ★集めるタブの行にも中止が出る（ここだけ抜けると「作れ」とだけ見える）',
     /isCancelled/.test(collectRow), collectRow.slice(0, 0));
  const collectDetail = (html.match(/function\s+collectDetail\s*\([\s\S]*?\n\}/m) || [''])[0];
  ok('E8 詳細パネルに中止の情報が出る', /中止/.test(collectDetail));
}

console.log('\n===== PASS ' + pass + ' / FAIL ' + fail + ' =====');
process.exit(fail ? 1 : 0);
