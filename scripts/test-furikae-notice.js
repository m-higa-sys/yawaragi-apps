// 振替不能トラッカー 伝達ボード通知 upsert判定の純関数テスト
// 対象: gas/yawaragi-board/furikae-notice-core.js の furikaeNoticeDecide_/furikaeNoticeValidKey_
// 実行: node scripts/test-furikae-notice.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'furikae-notice-core.js'));

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }

const K = 'furikae-funou-2026-05';
const HEADER = ['id', 'from', 'to', 'body', 'deadline', 'createdAt', 'done', 'doneAt', 'doneBy'];

// ===== A. キー厳格化（他メッセージに触れない）=====
ok(core.furikaeNoticeValidKey_(K) === true, 'A1: furikae-funou-接頭辞 → 有効');
ok(core.furikaeNoticeValidKey_('furikae-funou-') === false, 'A2: 接頭辞のみ → 無効');
ok(core.furikaeNoticeValidKey_('db_123') === false, 'A3: 他メッセージid → 無効');
ok(core.furikaeNoticeValidKey_('') === false, 'A4: 空 → 無効');
ok(core.furikaeNoticeValidKey_(null) === false, 'A5: null → 無効');

// ===== B. upsert 判定 =====
const empty = [HEADER];
ok(core.furikaeNoticeDecide_(empty, K, '振替不能・要対応あり（3件）').op === 'add', 'B1: 未存在＋本文 → add');

const withKey = [HEADER, ['furikae-funou-2026-05', '振替不能', '全員', '振替不能・要対応あり（3件）', '', '2026-07-06 10:00:00', false, '', '']];
ok(core.furikaeNoticeDecide_(withKey, K, '振替不能・要対応あり（2件）').op === 'update', 'B2: 既存＋本文 → update');
ok(core.furikaeNoticeDecide_(withKey, K, '').op === 'delete', 'B3: 既存＋空本文 → delete（締め）');
ok(core.furikaeNoticeDecide_(empty, K, '').op === 'noop', 'B4: 未存在＋空本文 → noop');

// ===== C. 他メッセージを絶対に巻き込まない =====
const withOthers = [HEADER,
  ['db_111', '社長', '社長', '既存の大事な伝言', '', '2026-07-01', false, '', ''],
  ['nyukin-dashboard', '社長', '社長', '入金管理…', '', '2026-06-14', false, '', '']];
const d = core.furikaeNoticeDecide_(withOthers, K, '振替不能・要対応あり（1件）');
ok(d.op === 'add' && d.rowIndex === -1, 'C1: 他メッセージだけの盤面 → addのみ（既存行を指さない）');
ok(core.furikaeNoticeDecide_(withOthers, 'db_111', '乗っ取り').op === 'reject', 'C2: 他メッセージidをキーにしたら reject（更新拒否）');

// ===== D. rowIndex は正しい行を指す =====
const mixed = [HEADER,
  ['db_111', '社長', '社長', 'x', '', '', false, '', ''],
  ['furikae-funou-2026-05', '振替不能', '全員', '振替不能・要対応あり（3件）', '', '', false, '', '']];
ok(core.furikaeNoticeDecide_(mixed, K, '振替不能・要対応あり（2件）').rowIndex === 2, 'D1: 既存キー行のindex=2を指す');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
