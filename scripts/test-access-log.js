// access_log 純関数（行組立・日次トリム計画）のテスト（セキュリティ強化 Phase 1・2026-07-12）
// 対象: gas/yawaragi-board/access-log-core.js
//   - buildAccessLogRow_(ctx) → 7列の配列（PII・トークン値は絶対に含めない）
//   - computeAccessLogTrim_(lastRow, opts) → null | { deleteStartRow, deleteCount }
// 実行: node scripts/test-access-log.js
//
// 設計方針（社長指示）:
//   トリムは appendRow のたびに走らせない。日次トリガ dailyTrimAccessLog_ から
//   computeAccessLogTrim_ を1回呼ぶだけ。判定は純関数なのでTDDで固める。

const path = require('path');
const {
  buildAccessLogRow_,
  computeAccessLogTrim_,
  ACCESS_LOG_HEADER
} = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'access-log-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++; else { fail++; console.error('  [FAIL] ' + label + '  期待=' + e + ' 実際=' + a); }
}

// ===== ヘッダは指示書1-4の7列 ＋ origin（社長指示・穴②）= 8列 =====
eq(ACCESS_LOG_HEADER,
  ['timestamp', 'method', 'action', 'origin', 'token_status', 'enforce', 'result', 'note'],
  'H1: ヘッダ8列（origin をaction直後に追加）');

// ===== 行組立: 8列・順序固定・型正規化 =====
const ts = new Date('2026-07-12T08:30:00+09:00');
eq(buildAccessLogRow_({ timestamp: ts, method: 'GET', action: 'morningDigest', origin: 'https://m-higa-sys.github.io', tokenStatus: 'valid', enforce: false, result: 'ok', note: '' }),
  [ts, 'GET', 'morningDigest', 'https://m-higa-sys.github.io', 'valid', false, 'ok', ''],
  'B1: 通常行（GET/valid/ok/origin付き）');
eq(buildAccessLogRow_({ timestamp: ts, method: 'POST', action: 'absence', origin: 'https://m-higa-sys.github.io', tokenStatus: 'missing', enforce: true, result: 'unauthorized', note: '' }),
  [ts, 'POST', 'absence', 'https://m-higa-sys.github.io', 'missing', true, 'unauthorized', ''],
  'B2: 拒否行（POST/missing/unauthorized/enforce=true）');

// ===== PII・トークン値の混入防止: note/origin はサニタイズ、action は文字列化 =====
// token= を含む文字列が note に来ても、値は落とす（キーだけ残す/伏せる）
ok(!/abc123SECRET/.test(JSON.stringify(buildAccessLogRow_({
  timestamp: ts, method: 'GET', action: 'x', origin: 'https://x', tokenStatus: 'valid', enforce: false, result: 'ok',
  note: 'token=abc123SECRET&foo=1'
}))), 'B3: note に生トークン値が残らない');
// origin に万一 token 値が紛れても落とす
ok(!/SECRETORIGIN/.test(JSON.stringify(buildAccessLogRow_({
  timestamp: ts, method: 'GET', action: 'x', origin: 'https://x?token=SECRETORIGIN', tokenStatus: 'valid', enforce: false, result: 'ok', note: ''
}))), 'B3b: origin に生トークン値が残らない');
eq(buildAccessLogRow_({ timestamp: ts, method: 'GET', action: null, origin: null, tokenStatus: 'valid', enforce: false, result: 'ok', note: null })[2],
  '', 'B4: action=null → 空文字（列ズレ防止）');
// origin 未送信は空文字ではなく '(none)'（社長指示・穴③: 記録漏れと未送信を区別）
eq(buildAccessLogRow_({ timestamp: ts, method: 'GET', action: 'x', origin: null, tokenStatus: 'valid', enforce: false, result: 'ok', note: null })[3],
  '(none)', 'B4b: origin=null → (none)（未送信の明示）');
eq(buildAccessLogRow_({ timestamp: ts, method: 'GET', action: 'x', origin: '', tokenStatus: 'valid', enforce: false, result: 'ok', note: null })[3],
  '(none)', 'B4c: origin=空文字 → (none)');
eq(buildAccessLogRow_({ timestamp: ts, method: 'GET', action: 'x', origin: '   ', tokenStatus: 'valid', enforce: false, result: 'ok', note: null })[3],
  '(none)', 'B4d: origin=空白のみ → (none)');
eq(buildAccessLogRow_({ timestamp: ts, method: 'GET', action: 'x', origin: '', tokenStatus: 'valid', enforce: false, result: 'ok', note: null })[7],
  '', 'B5: note=null → 空文字（8列目）');

// note の長さ上限（暴走防止・巨大本文をそのまま書かない）
ok(buildAccessLogRow_({ timestamp: ts, method: 'POST', action: 'x', origin: '', tokenStatus: 'valid', enforce: false, result: 'error',
  note: 'E'.repeat(1000) })[7].length <= 200, 'B6: note は200字で切り詰め（8列目）');
// origin の長さ上限
ok(buildAccessLogRow_({ timestamp: ts, method: 'GET', action: 'x', origin: 'H'.repeat(1000), tokenStatus: 'valid', enforce: false, result: 'ok', note: '' })[3].length <= 300,
  'B7: origin は300字で切り詰め');

// ===== origin＝location.origin+location.pathname 方式（社長 追加要件1〜4）=====
function orig(v) {
  return buildAccessLogRow_({ timestamp: ts, method: 'GET', action: 'x', origin: v, tokenStatus: 'valid', enforce: false, result: 'ok', note: '' })[3];
}
// 要件2: クエリ文字列は必ず除去（PII: 利用者名・日付が乗りうる）
eq(orig('https://m-higa-sys.github.io/genba.html?name=山田太郎&date=2026-07-12'),
  'https://m-higa-sys.github.io/genba.html', 'O1: クエリ(PII)は除去し pathname まで残す');
// 通常のページURL（クエリ無し）はそのまま＝どのアプリか識別できる
eq(orig('https://m-higa-sys.github.io/genba.html'),
  'https://m-higa-sys.github.io/genba.html', 'O2: 正常ページURLはそのまま（アプリ識別）');
// 要件3: file:// 直開き（Chrome: origin='null'）→ '(none)'に丸めず値を残す（環境分裂の炙り出し）
eq(orig('null/C:/Users/mh/出勤＆送迎表.html'),
  'null/C:/Users/mh/出勤＆送迎表.html', 'O3: file://(origin=null)+pathname を保持（環境分裂検出）');
eq(orig('null'), 'null', 'O3b: originが文字列"null"のみでも (none)に丸めない');
// 要件3: 想定外オリジン（github.io 以外）も識別できるよう保持
eq(orig('http://localhost:5500/genba.html'),
  'http://localhost:5500/genba.html', 'O4: 想定外オリジン(localhost)も保持し識別可能');
// 要件4: パラメータ自体が未送信のときだけ '(none)'（shared.js未経由＝Phase2残作業のシグナル）
eq(orig(undefined), '(none)', 'O5: origin未送信 → (none)（shared.js未経由の炙り出し）');
// クエリだけ（pathname無し）の異常入力は除去後空→(none)
eq(orig('?name=山田'), '(none)', 'O6: クエリのみ → 除去後空 → (none)');

// ===== トリム計画: header=1行 / max=10000（既定） =====
// データ行数 = lastRow - 1
eq(computeAccessLogTrim_(1, { maxRows: 10000, headerRows: 1 }), null, 'T1: ヘッダのみ → トリム不要');
eq(computeAccessLogTrim_(5001, { maxRows: 10000, headerRows: 1 }), null, 'T2: 5000行 → 不要');
eq(computeAccessLogTrim_(10001, { maxRows: 10000, headerRows: 1 }), null, 'T3: ちょうど10000行 → 不要（超えたら削る）');
eq(computeAccessLogTrim_(10002, { maxRows: 10000, headerRows: 1 }),
  { deleteStartRow: 2, deleteCount: 1 }, 'T4: 10001行 → 最古1行を削除（row2から）');
eq(computeAccessLogTrim_(12001, { maxRows: 10000, headerRows: 1 }),
  { deleteStartRow: 2, deleteCount: 2000 }, 'T5: 12000行 → 2000行削除（最古から）');
// 既定値（opts省略）でも 10000/header1 で動く
eq(computeAccessLogTrim_(1), null, 'T6: 既定opts・ヘッダのみ → 不要');
// 異常系: lastRow < headerRows など
eq(computeAccessLogTrim_(0, { maxRows: 10000, headerRows: 1 }), null, 'T7: 空シート → 不要（安全）');

console.log('\ntest-access-log: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
