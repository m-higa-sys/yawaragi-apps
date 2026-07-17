// mailcheck 純コアテスト
// 対象: gas/yawaragi-board/mailcheck-core.js
//   （最終メール報告日時の解決/保存値算出・ISO検証・プロパティ名/既定時間）
// 実行: node scripts/test-mailcheck-core.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'mailcheck-core.js'));
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// 基準時刻: 2026-07-16T00:00:00Z
const NOW = Date.parse('2026-07-16T00:00:00.000Z');
const DAY_MS = 24 * 3600 * 1000;

console.log('[定数]');
ok(core.MAILCHECK_PROP === 'LAST_MAILCHECK_AT', 'プロパティ名=LAST_MAILCHECK_AT');
ok(core.MAILCHECK_DEFAULT_HOURS === 24, '既定=24時間');

console.log('\n[mcIsValidIso_] ISO文字列の検証');
ok(core.mcIsValidIso_('2026-07-15T12:00:00.000Z') === true, '正常なISO(UTC Z)→true');
ok(core.mcIsValidIso_('2026-07-15T21:00:00+09:00') === true, 'オフセット付きISO→true');
ok(core.mcIsValidIso_('') === false, '空文字→false');
ok(core.mcIsValidIso_('   ') === false, '空白のみ→false');
ok(core.mcIsValidIso_(null) === false, 'null→false');
ok(core.mcIsValidIso_(undefined) === false, 'undefined→false');
ok(core.mcIsValidIso_('not-a-date') === false, '非日付文字列→false');
ok(core.mcIsValidIso_(12345) === false, '数値→false（文字列のみ受理）');

console.log('\n[mcResolveLastCheck_] 保存値の解決');
ok(core.mcResolveLastCheck_('2026-07-15T12:00:00.000Z', NOW, 24) === '2026-07-15T12:00:00.000Z',
   '有効な保存値→そのまま正規化して返す');
ok(core.mcResolveLastCheck_('', NOW, 24) === '2026-07-15T00:00:00.000Z',
   '未設定(空)→既定24h前を返す');
ok(core.mcResolveLastCheck_(null, NOW, 24) === '2026-07-15T00:00:00.000Z',
   '未設定(null)→既定24h前を返す');
ok(core.mcResolveLastCheck_('garbage', NOW, 24) === '2026-07-15T00:00:00.000Z',
   '壊れた保存値→既定24h前にフォールバック（取りこぼし防止）');
ok(core.mcResolveLastCheck_(null, NOW, 48) === new Date(NOW - 48 * 3600 * 1000).toISOString(),
   'defaultHours=48指定→48h前');
ok(core.mcResolveLastCheck_(null, NOW) === '2026-07-15T00:00:00.000Z',
   'defaultHours省略→24h前（既定）');
// オフセット付き保存値はUTC正規化されて同一instant
ok(core.mcResolveLastCheck_('2026-07-15T21:00:00+09:00', NOW, 24) === '2026-07-15T12:00:00.000Z',
   'オフセット付き保存値→UTC ISOへ正規化（同一時刻）');

console.log('\n[mcComputeSetValue_] set時の保存値算出');
ok(core.mcComputeSetValue_(null, NOW) === '2026-07-16T00:00:00.000Z',
   'at指定なし→「今」を保存');
ok(core.mcComputeSetValue_('', NOW) === '2026-07-16T00:00:00.000Z',
   'at空→「今」を保存');
ok(core.mcComputeSetValue_('2026-07-10T03:00:00.000Z', NOW) === '2026-07-10T03:00:00.000Z',
   'at有効ISO指定→その時刻を保存（明示指定を許可）');
ok(core.mcComputeSetValue_('garbage', NOW) === '2026-07-16T00:00:00.000Z',
   'at壊れ→「今」にフォールバック（不正値で過去に飛ばさない）');

console.log('\n[往復] set→resolve が一致する');
const setVal = core.mcComputeSetValue_(null, NOW);
ok(core.mcResolveLastCheck_(setVal, NOW + 1000, 24) === setVal,
   'setした値をresolveでそのまま取得できる');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
