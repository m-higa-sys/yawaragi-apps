// intake 新規作成の必須判定 GAS純コアテスト
// 対象: gas/yawaragi-board/intake-required-core.js（intakeRequiredCheck_）
// 実行: node scripts/test-intake-required-core.js
//
// 背景（2026-07-29 「中断して保存」で消える事故）:
//   旧 createIntake は `if (!data.氏名 || !data.TEL)` で弾いていた。
//   一方 intake.html の中断保存は「氏名 / ふりがな / TEL のどれか1つ」で送る。
//   → 「ふりがなだけ」「電話だけ」「氏名だけ（TELなし）」は全部サーバーが捨てていた。
//   さらに shared.js gasPost が no-cors のため画面は {success:false} を読めず
//   「✅保存しました」と嘘をついて閉じ、入力が消えていた。
//   本テストは「サーバー判定を画面判定に一致させる」ことを固定する。
//
// 確定仕様（社長確認済 2026-07-29）:
//   中断保存（全記入済 !== true）: 氏名 / ふりがな / TEL のうち1つでも非空ならOK
//   本保存  （全記入済 === true）: (氏名 or ふりがな) が非空 かつ TEL が非空

const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'intake-required-core.js'));

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n    expected ' + e + '\n    actual   ' + a); }
}
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const OK = { ok: true };
const E_SUSPEND = 'お名前か電話番号のどちらか1つは入れてください';
const E_NAME    = 'お名前（漢字またはふりがな）を入れてください';
const E_TEL     = '本保存には電話番号が必要です';

// ===== 完了条件① 中断保存：氏名だけ → 保存される =====
console.log('[完了条件①] 中断保存：氏名だけ');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', 全記入済: false }), OK, '氏名だけ（全記入済:false）→ OK');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎' }), OK, '氏名だけ（全記入済 未指定）→ OK');

// ===== 完了条件② 中断保存：ふりがなだけ → 保存される =====
console.log('\n[完了条件②] 中断保存：ふりがなだけ');
eq(core.intakeRequiredCheck_({ ふりがな: 'ひがたろう', 全記入済: false }), OK, 'ふりがなだけ → OK');

// ===== 完了条件③ 中断保存：TELだけ → 保存される =====
console.log('\n[完了条件③] 中断保存：TELだけ');
eq(core.intakeRequiredCheck_({ TEL: '0493-00-0000', 全記入済: false }), OK, 'TELだけ → OK');

// ===== 完了条件④ 中断保存：3つとも空 → NG =====
console.log('\n[完了条件④] 中断保存：3つとも空 → NG');
eq(core.intakeRequiredCheck_({ 全記入済: false }),
   { ok: false, error: E_SUSPEND }, '3つとも未指定 → NG（中断用の文言）');
eq(core.intakeRequiredCheck_({ 氏名: '', ふりがな: '', TEL: '', 全記入済: false }),
   { ok: false, error: E_SUSPEND }, '3つとも空文字 → NG');
eq(core.intakeRequiredCheck_({ 氏名: '  ', ふりがな: '\t', TEL: ' ', 全記入済: false }),
   { ok: false, error: E_SUSPEND }, '3つとも空白のみ → NG（trim して空扱い）');

// ===== 完了条件⑤ 本保存：ふりがな＋TEL（氏名なし）→ 保存される ★旧コードが落としていた本命 =====
console.log('\n[完了条件⑤] 本保存：ふりがな＋TEL（氏名なし）★本命');
eq(core.intakeRequiredCheck_({ ふりがな: 'ひがたろう', TEL: '0493-00-0000', 全記入済: true }),
   OK, 'ふりがな＋TEL・氏名なし → OK（旧 !data.氏名 では NG だった）');

// ===== 完了条件⑥ 本保存：氏名あり・TEL空 → NG「本保存には電話番号が必要です」 =====
console.log('\n[完了条件⑥] 本保存：氏名あり・TEL空 → NG');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', 全記入済: true }),
   { ok: false, error: E_TEL }, '氏名あり・TELなし → NG（TELの文言）');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', TEL: '   ', 全記入済: true }),
   { ok: false, error: E_TEL }, '氏名あり・TELが空白のみ → NG');

// ===== 本保存：氏名系が両方空 → 名前の文言（TELの有無に関わらず名前を先に言う） =====
console.log('\n[本保存] 氏名・ふりがな両方空 → 名前エラー');
eq(core.intakeRequiredCheck_({ TEL: '0493-00-0000', 全記入済: true }),
   { ok: false, error: E_NAME }, 'TELだけ・名前系なし → NG（名前の文言）');
eq(core.intakeRequiredCheck_({ 全記入済: true }),
   { ok: false, error: E_NAME }, '全部空の本保存 → 名前エラーを先に出す');

// ===== 本保存：正常系 =====
console.log('\n[本保存] 正常系');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', TEL: '0493-00-0000', 全記入済: true }),
   OK, '氏名＋TEL → OK');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', ふりがな: 'ひがたろう', TEL: '0493-00-0000', 全記入済: true }),
   OK, '氏名＋ふりがな＋TEL → OK');

// ===== 全記入済 の真偽判定は「=== true」だけを本保存とみなす =====
console.log('\n[全記入済フラグ] === true のときだけ本保存扱い');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', 全記入済: 'true' }),
   OK, "文字列 'true' は本保存扱いにしない（中断＝氏名だけでOK）");
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', 全記入済: 1 }),
   OK, '数値 1 は本保存扱いにしない');
eq(core.intakeRequiredCheck_({ 氏名: '比嘉太郎', 全記入済: null }),
   OK, 'null は本保存扱いにしない');

// ===== 入力を壊さない・落ちない =====
console.log('\n[頑健性]');
eq(core.intakeRequiredCheck_(null), { ok: false, error: E_SUSPEND }, 'null 入力でも落ちずに NG');
eq(core.intakeRequiredCheck_(undefined), { ok: false, error: E_SUSPEND }, 'undefined 入力でも落ちずに NG');
const src = { 氏名: '比嘉太郎', 全記入済: false };
const before = JSON.stringify(src);
core.intakeRequiredCheck_(src);
ok(JSON.stringify(src) === before, '引数オブジェクトを書き換えない（純関数）');

// ===== 数値TEL（シート/入力由来で number になり得る）=====
console.log('\n[型ゆれ]');
eq(core.intakeRequiredCheck_({ TEL: 493000000, 全記入済: false }), OK, '数値のTELも非空とみなす');
ok(core.intakeValueFilled_(0) === true, '数値0は String 化して非空扱い（画面は text input 由来で常に文字列）');
ok(core.intakeValueFilled_(null) === false && core.intakeValueFilled_(undefined) === false,
   'null / undefined は空');

// ===== 旧実装との差分を明示（回帰の証拠）=====
console.log('\n[旧実装 !data.氏名 || !data.TEL との差分]');
function legacyCheck(d) { return !(!d.氏名 || !d.TEL); }
ok(legacyCheck({ ふりがな: 'ひがたろう', TEL: '0493-00-0000', 全記入済: true }) === false &&
   core.intakeRequiredCheck_({ ふりがな: 'ひがたろう', TEL: '0493-00-0000', 全記入済: true }).ok === true,
   '旧=NG / 新=OK :「ふりがな＋TEL」本保存（事故の本体）');
ok(legacyCheck({ 氏名: '比嘉太郎', 全記入済: false }) === false &&
   core.intakeRequiredCheck_({ 氏名: '比嘉太郎', 全記入済: false }).ok === true,
   '旧=NG / 新=OK :「氏名だけ」中断保存');
ok(legacyCheck({ TEL: '0493-00-0000', 全記入済: false }) === false &&
   core.intakeRequiredCheck_({ TEL: '0493-00-0000', 全記入済: false }).ok === true,
   '旧=NG / 新=OK :「電話だけ」中断保存');

// ===== 配線: コード.js の createIntake が純関数を使っている（ドリフト検知）=====
console.log('\n[配線] createIntake が intakeRequiredCheck_ を使う');
const fs = require('fs');
const GAS = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const ci = GAS.slice(GAS.indexOf('function createIntake('), GAS.indexOf('function getTrialsForDate('));
ok(ci.length > 0, 'createIntake を抽出できる');
ok(/intakeRequiredCheck_\(data\)/.test(ci), 'createIntake が intakeRequiredCheck_(data) を呼ぶ');
// 「実コードに残っていない」を見たいので、経緯を書いた // コメント行は除いて判定する
const ciCode = ci.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
ok(!/!data\.氏名\s*\|\|\s*!data\.TEL/.test(ciCode), '旧判定 `!data.氏名 || !data.TEL` が実コードに残っていない');
ok(!/氏名・TELは必須/.test(ciCode), '旧エラー文言「氏名・TELは必須」が残っていない');
// 触らない約束の妥当性チェックは据え置き
ok(/種別はinquiry\/visit\/trialのいずれか/.test(ci), '種別チェックは従来どおり残っている');
ok(/ペースメーカーは有\/無\/不明/.test(ci), 'ペースメーカーチェックは従来どおり残っている');
ok(/連絡元区分が不正/.test(ci), '連絡元区分チェックは従来どおり残っている');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
