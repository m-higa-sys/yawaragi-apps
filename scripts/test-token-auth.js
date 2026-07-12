// トークン認証 純関数 checkToken のテスト（セキュリティ強化 Phase 1・2026-07-12）
// 対象: gas/yawaragi-board/token-auth-core.js checkToken(provided, expected, enforce)
// 実行: node scripts/test-token-auth.js
//
// 仕様（指示書 1-2）:
//   checkToken(providedToken, expectedToken, enforce) → { ok:boolean, reason:string }
//   - reason は「トークン自体の真偽」= 'valid' | 'missing' | 'mismatch'（access_log の token_status 列と直結）
//   - enforce=false: reason が何であれ ok:true（ログのみ・通す）
//   - enforce=true : reason==='valid' のときだけ ok:true
//   ※ enforce(true/false) は access_log の別列で記録するため、reason には畳み込まない
//     （指示書の 'not_enforced' は「ok:true かつ reason∈{missing,mismatch}」= enforce列false で表現）

const path = require('path');
const { checkToken } = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'token-auth-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++; else { fail++; console.error('  [FAIL] ' + label + '  期待=' + e + ' 実際=' + a); }
}

const TOK = 'abc123DEADBEEF';

// ===== 6通り: 一致 / 欠落 / 不一致 × enforce OFF/ON =====
// enforce=false（初期値・ログのみ）: 常に ok:true、reason は正確に
eq(checkToken(TOK, TOK, false), { ok: true, reason: 'valid' },    'F1: OFF×一致 → ok:true/valid');
eq(checkToken('', TOK, false),  { ok: true, reason: 'missing' },  'F2: OFF×欠落 → ok:true/missing（通すが記録）');
eq(checkToken('WRONG', TOK, false), { ok: true, reason: 'mismatch' }, 'F3: OFF×不一致 → ok:true/mismatch（通すが記録）');

// enforce=true: 完全一致のみ通す
eq(checkToken(TOK, TOK, true),  { ok: true, reason: 'valid' },     'N1: ON×一致 → ok:true/valid');
eq(checkToken('', TOK, true),   { ok: false, reason: 'missing' },  'N2: ON×欠落 → ok:false/missing');
eq(checkToken('WRONG', TOK, true), { ok: false, reason: 'mismatch' }, 'N3: ON×不一致 → ok:false/mismatch');

// ===== 欠落の各種表現（null/undefined/空文字はすべて missing 扱い） =====
eq(checkToken(null, TOK, true),      { ok: false, reason: 'missing' }, 'E1: null → missing');
eq(checkToken(undefined, TOK, true), { ok: false, reason: 'missing' }, 'E2: undefined → missing');
eq(checkToken('', TOK, true),        { ok: false, reason: 'missing' }, 'E3: 空文字 → missing');

// ===== fail-closed: expected(サーバー保持キー) 未設定なら enforce=true では誰も通さない =====
// （API_TOKEN を設定する前に enforce を ON にしても素通りしない安全側）
eq(checkToken('anything', '', true),        { ok: false, reason: 'mismatch' }, 'C1: ON×expected空×provided有 → ok:false/mismatch');
eq(checkToken('', '', true),                { ok: false, reason: 'missing' },  'C2: ON×expected空×provided空 → ok:false/missing');
eq(checkToken(null, null, true),            { ok: false, reason: 'missing' },  'C3: ON×両方null → ok:false/missing');
// enforce=false のときは expected 未設定でも当然通す（ログのみ）
ok(checkToken('anything', '', false).ok === true, 'C4: OFF×expected空 → ok:true（ログのみ）');

// ===== fail-closed（社長指摘）: API_TOKEN が ScriptProperties から取得失敗（null/undefined） =====
// getProperty('API_TOKEN') が null/undefined を返す＝プロパティが消えた/未設定の状況。
// enforce=true なら provided が何であれ拒否＝全アプリ停止（意図通り）。
// TOKEN_ENFORCE=false に戻せば即復旧できるため、この全停止は許容（社長承認済み）。
eq(checkToken('looks-valid', null, true),      { ok: false, reason: 'mismatch' }, 'G1: ON×API_TOKEN=null(取得失敗)×provided有 → 拒否');
eq(checkToken('looks-valid', undefined, true), { ok: false, reason: 'mismatch' }, 'G2: ON×API_TOKEN=undefined×provided有 → 拒否');
eq(checkToken('', null, true),                 { ok: false, reason: 'missing' },  'G3: ON×API_TOKEN=null×provided空 → 拒否');
ok(checkToken('looks-valid', null, false).ok === true, 'G4: OFF×API_TOKEN=null → ok:true（enforce=falseで即復旧の実証）');

// ===== トリムしない（トークンに空白は無い前提・intakeAuthOk_ と同方針） =====
eq(checkToken(' ' + TOK, TOK, true), { ok: false, reason: 'mismatch' }, 'T1: 前後空白付き → mismatch（トリムしない）');

// ===== 型頑健性（数値等が来ても文字列比較で落ちない） =====
ok(checkToken(12345, 12345, true).ok === true, 'R1: 数値同値 → String比較で valid');

console.log('\ntest-token-auth: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
