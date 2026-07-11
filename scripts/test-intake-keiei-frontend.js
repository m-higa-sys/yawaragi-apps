// intake.html「経営」タブの純粋ロジックを実コード抽出して検証（TDD流儀・出荷コードそのものをテスト）
// 対象: KD_slotSet_ / KD_attendsCell_ / kdComputeVacant / kdRate / kdEsc / kdRenderDashboard
// 実行: node scripts/test-intake-keiei-frontend.js
//
// 空き枠は 週間予定表.html の曜日対応ampmパーサを流用（naive indexOf 禁止）である事を担保する。

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'intake.html'), 'utf8');

// function NAME(...){...} を波括弧バランスで抽出
function extractFn(name) {
  const sig = 'function ' + name + '(';
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('intake.html に ' + sig + ' が無い（未実装＝RED）');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

// 依存の var 宣言（週間予定表由来の定数）を再現し、関数群を1つのスコープに束ねる
const preamble =
  "var KD_WEEKDAY_CHARS = ['月','火','水','木','金','土','日'];\n" +
  "var KD_SLOT_OF = { am:'午前', pm:'午後' };\n" +
  "var kdDaicho = [];\n";

const preamble2 = "var kdDaichoLoaded = false;\n";

const fns = [
  'KD_slotSet_', 'KD_attendsCell_', 'kdComputeVacant', 'kdVacantLabel',
  'kdEsc', 'kdRate', 'kdRenderDashboard'
].map(extractFn).join('\n');

const wire =
  '\nsb.KD_slotSet_=KD_slotSet_; sb.KD_attendsCell_=KD_attendsCell_;' +
  ' sb.kdComputeVacant=kdComputeVacant; sb.kdEsc=kdEsc; sb.kdRate=kdRate;' +
  ' sb.kdRenderDashboard=kdRenderDashboard;' +
  ' sb.setDaicho=function(d){ kdDaicho = d; };';

const wire2 = ' sb.kdVacantLabel=kdVacantLabel; sb.setDaichoLoaded=function(b){ kdDaichoLoaded = b; };';

const sb = {};
// document は kdRenderDashboard が innerHTML を書き込む先。captured に文字列を退避する。
const captured = { html: '' };
const fakeDoc = { getElementById: function(){ return { set innerHTML(v){ captured.html = v; } }; } };
new Function('sb', 'document', preamble + preamble2 + fns + wire + wire2)(sb, fakeDoc);

let pass = 0, fail = 0;
function ok(label, cond) { if (cond) { pass++; console.log('  PASS', label); } else { fail++; console.error('  FAIL', label); } }
function eq(label, got, exp) { ok(label + ' (got ' + JSON.stringify(got) + ')', JSON.stringify(got) === JSON.stringify(exp)); }

console.log('[kdComputeVacant 空き枠]');
sb.setDaicho([]);
eq('空台帳 → 10セル×18 = 180', sb.kdComputeVacant(), 180);

sb.setDaicho([{ days:'月火', ampm:'午前' }]);
eq('月火の午前で 月AM/火AM 各-1 → 178', sb.kdComputeVacant(), 178);

// 複合ampm: 「月午前、木午後」は 月AM と 木PM のみ。naive indexOf なら 月PM/木AM も誤ヒットし176になる。
sb.setDaicho([{ days:'月木', ampm:'月午前、木午後' }]);
eq('複合ampm 月午前/木午後のみ-2 → 178（曜日対応パース証明）', sb.kdComputeVacant(), 178);

console.log('[kdVacantLabel 名簿未取得ガード]');
sb.setDaicho([]);
sb.setDaichoLoaded(false);
eq('名簿未取得 → —（名簿未取得）', sb.kdVacantLabel(), '—（名簿未取得）');
ok('名簿未取得時に数値180を出さない', String(sb.kdVacantLabel()).indexOf('180') < 0);
sb.setDaichoLoaded(true);
eq('名簿取得済＆空daicho → 180（回帰）', sb.kdVacantLabel(), 180);

console.log('[KD_attendsCell_ 曜日対応]');
ok('月午前=true', sb.KD_attendsCell_('月木', '月午前、木午後', '月', 'am') === true);
ok('月午後=false（naiveなら誤true）', sb.KD_attendsCell_('月木', '月午前、木午後', '月', 'pm') === false);
ok('木午後=true', sb.KD_attendsCell_('月木', '月午前、木午後', '木', 'pm') === true);
ok('木午前=false（naiveなら誤true）', sb.KD_attendsCell_('月木', '月午前、木午後', '木', 'am') === false);

console.log('[kdRate]');
eq('null → —', sb.kdRate(null), '—');
eq('0.5 → 50%', sb.kdRate(0.5), '50%');
eq('0.333 → 33.3%', sb.kdRate(0.333), '33.3%');

console.log('[kdEsc]');
eq('HTMLエスケープ', sb.kdEsc('<a>&"\''), '&lt;a&gt;&amp;&quot;&#39;');

console.log('[kdRenderDashboard その他表示/非表示]');
const sample = {
  需給: { 受付:3, 進行中:{見学予定:1,見学済:2,体験予定:1,体験済:0,契約準備:1}, 進行中合計:5, 開始待ち:2, その他:4 },
  所要日数: { 中央値:20, 件数:2, cases:[{氏名:'山田<太>',days:20,source:'history'},{氏名:'鈴木',days:30,source:'approx'}] },
  問合せ元: { 区分別:{ 'ケアマネ紹介':{件数:5,利用開始数:2} }, 月次:{ '2026-06':3, '2026-05':1 } },
  転換率: { 見学到達_体験到達:{分母:4,分子:2,率:0.5,進行中N:1}, 体験到達_契約到達:{分母:0,分子:0,率:null,進行中N:0} },
  失注: { 理由別:{ '他事業所へ':2 }, 一覧:[{氏名:'佐藤',到達段階:'見学',到達段階approx:true,理由:'他事業所へ',日付:'2026-06-10'}] }
};
sb.setDaicho([]); sb.setDaichoLoaded(true); // 空き枠180
let out;
try { out = sb.kdRenderDashboard(sample); } catch (e) { out = null; console.error('  render threw:', e && e.message); }
ok('例外を投げない', !!out);
ok("'需給対比' を含む", out.indexOf('需給対比') >= 0);
ok("'所要日数' を含む", out.indexOf('所要日数') >= 0);
ok("'転換率' を含む", out.indexOf('転換率') >= 0);
ok("'失注' を含む", out.indexOf('失注') >= 0);
ok('空き枠180を含む', out.indexOf('>180<') >= 0);
ok('その他>0 で「その他」表示', out.indexOf('その他') >= 0);
ok('概算ケースに ※日付列からの概算', out.indexOf('※日付列からの概算') >= 0);
ok('率null は — 表示', out.indexOf('—') >= 0);
ok('50% 表示', out.indexOf('50%') >= 0);
ok('氏名がHTMLエスケープされる', out.indexOf('山田&lt;太&gt;') >= 0);
ok('到達段階approx で ※推定', out.indexOf('※推定') >= 0);
ok('document 経由の書き込みが一致', captured.html === out);

// その他=0 の時は「その他」KPIを出さない
const sample0 = JSON.parse(JSON.stringify(sample));
sample0.需給.その他 = 0;
const out0 = sb.kdRenderDashboard(sample0);
ok('その他=0 で「その他(未分類)」を隠す', out0.indexOf('その他(未分類)') < 0);

// 名簿未取得のまま描画したら空き枠に —（名簿未取得）を出し、誤180を出さない
sb.setDaichoLoaded(false);
const outNL = sb.kdRenderDashboard(sample);
ok('名簿未取得の描画で「—（名簿未取得）」を含む', outNL.indexOf('—（名簿未取得）') >= 0);
ok('名簿未取得の描画で空き枠に180を出さない', outNL.indexOf('>180<') < 0);

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAIL') + ' : ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
