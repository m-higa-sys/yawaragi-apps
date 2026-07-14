// 管理者セッション認可 純関数テスト
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'shift-kibou', 'admin-session-core.js'));
const { adminSessionReason_, checkAdminAuth, adminTokenLooksValid_, ADMIN_SESSION_TTL_SEC } = core;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
function eq(a, e, msg) { ok(JSON.stringify(a) === JSON.stringify(e), msg + ` (got ${JSON.stringify(a)})`); }

console.log('=== adminSessionReason_ ===');
eq(adminSessionReason_('', '1'), 'missing', 'provided空→missing');
eq(adminSessionReason_(null, '1'), 'missing', 'provided null→missing');
eq(adminSessionReason_('tok', ''), 'expired', 'cached空(期限切れ)→expired');
eq(adminSessionReason_('tok', null), 'expired', 'cached null→expired');
eq(adminSessionReason_('tok', '1'), 'valid', '両方あり→valid');

console.log('=== checkAdminAuth: enforce=OFF は常に素通り（段階導入・既存UI維持） ===');
eq(checkAdminAuth('', '', false), { ok: true, reason: 'missing' }, 'OFF+missing→ok:true(ログのみ)');
eq(checkAdminAuth('tok', null, false), { ok: true, reason: 'expired' }, 'OFF+expired→ok:true');
eq(checkAdminAuth('tok', '1', false), { ok: true, reason: 'valid' }, 'OFF+valid→ok:true');

console.log('=== checkAdminAuth: enforce=ON は valid のみ通す（漏洩クローズ） ===');
eq(checkAdminAuth('tok', '1', true), { ok: true, reason: 'valid' }, 'ON+valid→ok:true');
eq(checkAdminAuth('', '1', true), { ok: false, reason: 'missing' }, 'ON+トークン無し→ok:false(★スタッフ直叩き拒否)');
eq(checkAdminAuth('tok', '', true), { ok: false, reason: 'expired' }, 'ON+期限切れ→ok:false');

console.log('=== fail-closed: cachedが無ければ ON で必ず拒否（発行系が壊れても漏れない） ===');
eq(checkAdminAuth('anytoken', null, true), { ok: false, reason: 'expired' }, 'ON+サーバ側キー無し→拒否');

console.log('=== adminTokenLooksValid_ ===');
ok(adminTokenLooksValid_('123e4567-e89b-12d3-a456-426614174000'), 'UUID形式→true');
ok(!adminTokenLooksValid_(''), '空→false');
ok(!adminTokenLooksValid_('short'), '短すぎ→false');

console.log('=== 定数 ===');
ok(ADMIN_SESSION_TTL_SEC === 14400, 'TTL=4時間(14400s)');

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
