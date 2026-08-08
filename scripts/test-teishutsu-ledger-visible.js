// teishutsu.html — 台帳に在る行を画面から消さない（B案）＋「計画書」欄の言い方（D案）のテスト
// 2026-08-08
//
// ■ 何を塞ぐか（2026-08-08 実測）
//   2026-07 の提出送付台帳に在るのに、画面に1行も出ていない行が17件あった
//   （通所介護計画書9・通所評価8）。締め(monthly-close)は「7月が満了月」と判定して行を立てたが、
//   その後に満了日が翌年へ更新されたため、画面側の当月変換層は「もう満了月ではない」と計算し直し、
//   同じ人・同じ月に別の書類（通所モニ）を立てた。台帳の行はキーが一致せず、
//   さらに繰越の取り込みが「対象月 < 当月」しか見ていなかったため、エラーも出さずに消えていた。
//   送付漏れが起きても誰も気づけない状態so、台帳の行は必ず画面へ出す。
//   ★締め側(soufu-close-core.js)は触らない。台帳に在る行を正として拾うだけ。
//
// ■ 進め方
//   buildTasks を「本物のコードのまま」動かして見る（文字列検査ではない）。
//   通信はしない＝ state.data に手で組んだ材料を入れる。台帳へも一切書かない。
//
// 実行: node scripts/test-teishutsu-ledger-visible.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'teishutsu.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 画面本体を読み込む（init() は外す＝通信させない）----
const blocks = html.match(/<script>[\s\S]*?<\/script>/g);
let appSrc = blocks[blocks.length - 1].replace(/^<script>/, '').replace(/<\/script>$/, '');
appSrc = appSrc.replace(/\ninit\(\);\s*$/, '\n');
// const/let はコンテキストのプロパティにならないので、見たいものだけ外へ出す（値は変えない）
appSrc += '\nglobalThis.__app = { state: state, buildTasks: buildTasks, planLabel: planLabel, PLAN_DOCS: PLAN_DOCS, DOC: DOC };\n';

const el = () => ({
  classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
  style: {}, textContent: '', innerHTML: '', value: '', disabled: false,
  addEventListener: () => {}, getAttribute: () => '', querySelectorAll: () => []
});
const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: el, querySelectorAll: () => [], addEventListener: () => {},
              createElement: () => ({ style: {} }), head: { appendChild: () => {} } },
  setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {},
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  unescape, encodeURIComponent, decodeURIComponent
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas/yawaragi-board/session-board-core.js'), 'utf8'), sandbox);
vm.runInContext(appSrc, sandbox);
const app = sandbox.__app;

const YM = '2026-07';
// 要支援・満了月ではない人。変換層は tsusho_moni を1件だけ立てる。
const USER = { userId: '甲野花子', name: '甲野花子', category: '要支援2', cmOffice: 'テスト包括', furigana: 'コウノハナコ' };
const LROW = (docType, taishoTsuki, status, extra) => Object.assign({
  userId: '甲野花子', docType: docType, taishoTsuki: taishoTsuki, tekiyoTsuki: taishoTsuki,
  status: status, sorotta_by: '', sofu_at: '', kurikoshiRiyu: '', signKigen: '', updatedBy: 'monthly-close'
}, extra || {});

function build(ledgerRows, pdfFolders) {
  app.state.data = {
    pop: [USER], cancelledUsers: [], dueMap: {}, monMap: {}, keikMap: {}, contactMap: {},
    ledgerRows: ledgerRows,
    pdf: pdfFolders ? { ok: true, folders: pdfFolders } : null,
    aliases: {}, kunRecords: null, tsushoRecords: null, oralRecords: null
  };
  return app.buildTasks(YM);
}
const find = (ts, docType, ym) => ts.filter(t => t.docType === docType && t.taishoTsuki === (ym || YM))[0];

console.log('\n[A) 前提: 変換層は当月の通所モニだけを立てる]');
{
  const t = build([]);
  ok('A1 当月タスクは通所モニ1件', t.length === 1 && t[0].docType === 'tsusho_moni', '実測 ' + JSON.stringify(t.map(x => x.docType)));
}

console.log('\n[B) ★台帳に在る当月の行が画面へ出る（消えていた17行の再現）]');
{
  const t = build([LROW('tsusho_keikaku', YM, '保留'), LROW('tsusho_hyouka', YM, '保留')]);
  ok('B1 ★当月の通所介護計画書が出る', !!find(t, 'tsusho_keikaku'), '実測 ' + JSON.stringify(t.map(x => x.docType)));
  ok('B2 ★当月の通所評価が出る', !!find(t, 'tsusho_hyouka'));
  ok('B3 変換層の通所モニも残る（並記・誤要求はこの改修では解消しない）', !!find(t, 'tsusho_moni'));
  ok('B4 台帳の状態(保留)を引き継ぐ', find(t, 'tsusho_keikaku').status === '保留');
  ok('B5 ★繰越にはしない（当月の行so 繰越の数え方を動かさない）',
     find(t, 'tsusho_keikaku').isCarry === false, '実測 isCarry=' + find(t, 'tsusho_keikaku').isCarry);
  ok('B6 利用者の表示情報が入る', find(t, 'tsusho_keikaku').office === 'テスト包括' && find(t, 'tsusho_keikaku').furigana === 'コウノハナコ');
  ok('B7 合計3件（重複していない）', t.length === 3, '実測 ' + t.length + ' 件');
}

console.log('\n[C) 二重に出さない・出してはいけないものは出さない]');
{
  // 変換層が既に作る書類（通所モニ）が台帳にも在る場合＝二重にしない
  const t = build([LROW('tsusho_moni', YM, '保留')]);
  ok('C1 変換層と同じキーの行は二重にならない', t.filter(x => x.docType === 'tsusho_moni').length === 1, '実測 ' + t.length + ' 件');
  ok('C2 その場合も台帳の状態は反映される（従来どおり）', find(t, 'tsusho_moni').status === '保留');
}
{
  const t = build([LROW('jisseki', YM, '保留'), LROW('oral_moni', YM, '保留')]);
  ok('C3 実績・口腔モニは従来どおり出さない', t.length === 1 && t[0].docType === 'tsusho_moni', '実測 ' + JSON.stringify(t.map(x => x.docType)));
}
{
  const t = build([LROW('tsusho_keikaku', '2026-08', '保留')]);
  ok('C4 未来の月の行は出さない', !find(t, 'tsusho_keikaku', '2026-08'), '実測 ' + JSON.stringify(t.map(x => x.docType + '@' + x.taishoTsuki)));
}

console.log('\n[D) 繰越（対象月<当月）の扱いは今までどおり]');
{
  const t = build([LROW('tsusho_keikaku', '2026-06', '保留'), LROW('tsusho_hyouka', '2026-06', '送付済', { sofu_at: '2026-06-30' })]);
  const c = find(t, 'tsusho_keikaku', '2026-06');
  ok('D1 前月の未送付は出る', !!c);
  ok('D2 ★繰越として立つ（isCarry=true のまま）', c && c.isCarry === true);
  ok('D3 ★前月の送付済は出さない（従来どおり）', !find(t, 'tsusho_hyouka', '2026-06'));
}
{
  // 当月の送付済は、変換層が作る行と同じ扱い（＝出す）。「今月送付済」の数え方を月内で食い違わせない。
  const t = build([LROW('tsusho_keikaku', YM, '送付済', { sofu_at: '2026-07-31' })]);
  const s = find(t, 'tsusho_keikaku');
  ok('D4 当月の送付済も出す（押した直後にカードが消えない）', !!s, '実測 ' + JSON.stringify(t.map(x => x.docType)));
  ok('D5 送付日を持っている（今月送付済に数えられる）', s && s.sofu_at === '2026-07-31');
  ok('D6 動詞は done（集めるにも送るにも出ない）', s && s.verb === 'done');
}

console.log('\n[E) ★復活した行にも既存のPDF自動検出が効く（新規実装しない）]');
{
  // 通所介護計画書は実物と同じ名前で strong になる（語彙に「通所介護計画書」が在る）
  const folders = {
    tsusho_keikaku: { label: '通所計画書', files: ['7月通所介護計画書・甲野花子.pdf'] },
    tsusho_hyouka: { label: '通所・結果報告書', files: ['5月通所評価・別人太郎.pdf'] }
  };
  const t = build([LROW('tsusho_keikaku', YM, '保留'), LROW('tsusho_hyouka', YM, '保留')], folders);
  const k = find(t, 'tsusho_keikaku'), h = find(t, 'tsusho_hyouka');
  ok('E1 ★復活した行のPDFが検出される', k && k.pdfMatch === 'strong', '実測 pdfMatch=' + (k && k.pdfMatch));
  ok('E2 ★検出されたファイル名も入る', k && k.pdfFile === '7月通所介護計画書・甲野花子.pdf', '実測 ' + (k && k.pdfFile));
  ok('E3 ★「送る」段階になる（＝揃った相当）', k && k.verb === 'send', '実測 verb=' + (k && k.verb));
  ok('E4 別人・別月のPDFでは送るにならない', h && h.verb !== 'send' && !h.pdfMatch, '実測 verb=' + (h && h.verb));
}
{
  // 月で絞れていること（先月のPDFで当月を「送る」にしない）＝既存の絞りが復活行にも効く
  const t = build([LROW('tsusho_keikaku', YM, '保留')],
    { tsusho_keikaku: { label: '通所計画書', files: ['6月通所介護計画書・甲野花子.pdf'] } });
  ok('E5 先月のPDFでは当月を送るにしない', find(t, 'tsusho_keikaku').verb !== 'send',
     '実測 verb=' + find(t, 'tsusho_keikaku').verb);
}
{
  // ★既知の課題（この改修では直さない・報告のみ）:
  //   実物の通所評価は「7月通所介護評価・◯◯.pdf」だが、SB_PDF_DOC_WORDS の tsusho_hyouka は
  //   ['通所評価','結果報告書','評価表'] で「通所介護評価」を持たない。氏名は当たるが書類名が
  //   読めず weak 止まり＝「送る」へ上がらない。語彙はPDF検出の正本so、今回は触らない。
  const t = build([LROW('tsusho_hyouka', YM, '保留')],
    { tsusho_hyouka: { label: '通所・結果報告書', files: ['7月通所介護評価・甲野花子.pdf'] } });
  const h = find(t, 'tsusho_hyouka');
  ok('E6 ★実物の「通所介護評価」は weak 止まり（語彙の穴・別トラック）', h && h.pdfMatch === 'weak',
     '実測 pdfMatch=' + (h && h.pdfMatch));
  ok('E7 weak でもPDFの存在自体は画面に出る（黙って消さない）', h && !!h.pdfFile, '実測 ' + (h && h.pdfFile));
  ok('E8 語彙に「通所介護評価」が無いことを固定（足したらこのテストを更新する）',
     JSON.stringify(sandbox.SB_PDF_DOC_WORDS.tsusho_hyouka) === JSON.stringify(['通所評価', '結果報告書', '評価表']),
     '実測 ' + JSON.stringify(sandbox.SB_PDF_DOC_WORDS.tsusho_hyouka));
}

console.log('\n[F) D案: 「計画書」欄の言い方（分類は変えない）]');
{
  const L = app.planLabel;
  ok('F1 できている', L('kokun_set', true) === 'できている');
  ok('F2 まだ', L('kokun_set', false) === 'まだ');
  ok('F3 ★計画書の工程が無い書類は「ありません」と言う（通所モニ）',
     L('tsusho_moni', undefined) === 'この書類に計画書はありません', '実測 ' + L('tsusho_moni', undefined));
  ok('F4 ★同じく測定結果', L('sokutei', undefined) === 'この書類に計画書はありません', '実測 ' + L('sokutei', undefined));
  ok('F5 ★同じく通所評価', L('tsusho_hyouka', undefined) === 'この書類に計画書はありません', '実測 ' + L('tsusho_hyouka', undefined));
  ok('F6 ★材料が在るはずの書類が取れなかったときは「確認できませんでした」のまま',
     /確認できませんでした/.test(L('kokun_set', undefined)), '実測 ' + L('kokun_set', undefined));
  ok('F7 読み取り失敗と誤解される文言を、工程が無い書類には出さない',
     !/確認できませんでした/.test(L('tsusho_moni', undefined)));
  ok('F8 詳細パネルが planLabel を使っている', /planLabel\(t\.docType, t\.planCreated\)/.test(html));
}
{
  // ★単一の正: PLAN_DOCS と buildTasks が planCreated を作る書類は必ず一致すること。
  //   片方だけ増やすと「計画書はありません」と嘘をつく／逆に永久に不明のままになる。
  const inBuild = (html.match(/t\.docType === '(\w+)' && \w+Created/g) || [])
    .map(s => (s.match(/'(\w+)'/) || [])[1]).sort();
  const listed = Object.keys(app.PLAN_DOCS).sort();
  ok('F9 ★PLAN_DOCS と buildTasks の対象書類が一致する',
     JSON.stringify(inBuild) === JSON.stringify(listed),
     'buildTasks=' + JSON.stringify(inBuild) + ' PLAN_DOCS=' + JSON.stringify(listed));
}

console.log('\n[G) additive＝集計・PDF検出・台帳書き込みに触れていない]');
{
  ok('G1 台帳へ書く経路は3本のまま', (html.match(/action=upsertSoufuStatus/g) || []).length === 3);
  ok('G2 今月あと／繰越の数え方が不変', /else \{ cTodo\+\+; if \(t\.isCarry\) cCarry\+\+; \}/.test(html));
  ok('G3 揃った／今月送付済の数え方が不変',
     /if \(t\.status === '揃った'\) cSorotta\+\+;/.test(html) &&
     /if \(String\(t\.sofu_at\)\.slice\(0, 7\) === state\.ym\) cSent\+\+;/.test(html));
  ok('G4 PDF検出は既存の sbBuildPdfFoundMap_ のまま（新規実装していない）',
     /Object\.assign\(found, sbBuildPdfFoundMap_\(/.test(html) &&
     !/function\s+\w*[Pp]df[A-Za-z]*Match/.test(html));
  ok('G5 unknown の分類ロジック（core）を変えていない',
     /else verb = 'unknown';/.test(fs.readFileSync(path.join(ROOT, 'gas/yawaragi-board/session-board-core.js'), 'utf8')));
  ok('G6 締め側(soufu-close-core.js)の書類ルールが不変',
     /if \(care === 'shien' && !isManryou\) out\.push\(\{ docType: 'tsusho_moni'/
       .test(fs.readFileSync(path.join(ROOT, 'gas/yawaragi-board/soufu-close-core.js'), 'utf8')));
}

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
