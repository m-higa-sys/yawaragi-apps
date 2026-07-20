// stamp-dest-core.js 純関数テスト（切手管理アプリ 宛先=ケアマネ事業所 抽出ロジック）
// 実行: node scripts/test-stamp-dest-core.js
// 背景: stamp.html の宛先セレクトが空になる事故。原因は旧 fetchDestinations が
//   ボードGAS応答の存在しない json.users を見て無言 return していたこと。
//   実測でボード応答の json.patterns（氏名キー・各cmOffice）に全111名22事業所が入ると確定so、
//   そこから distinct cmOffice を抽出するのが本純関数の責務。
// フィクスチャ: scripts/fixtures/stamp-board-response.json（本番ボード応答の実キャプチャ）。
const fs = require('fs');
const path = require('path');
const M = require('../stamp-dest-core.js');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'stamp-board-response.json'), 'utf8'));

let pass = 0, fail = 0;
function eq(a, e, m) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m + '\n    exp ' + E + '\n    act ' + A); } }
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

// 1) 本番実応答 → 22事業所（実測母数）を網羅
const real = M.stampExtractOffices(FX);
ok(Array.isArray(real), '配列を返す');
eq(real.length, 22, '実応答から distinct 事業所 = 22');
ok(real.includes('事業所06'), '既知の事業所を含む（匿名化fixture）');
ok(real.includes('事業所09'), '別の既知事業所を含む（匿名化fixture）');

// 2) 電算システム/その他は抽出物に混ぜない（それらは renderDestSelect が付与する固定枠）
ok(!real.includes('電算システム'), '電算システムは抽出しない（固定枠の責務）');
ok(!real.includes('__other__'), 'その他は抽出しない（固定枠の責務）');

// 3) ja ロケールでソート済み（安定・重複なし）
const sorted = [...real].sort((a, b) => a.localeCompare(b, 'ja'));
eq(real, sorted, 'ja ロケールで昇順ソート済み');
eq(real.length, new Set(real).size, '重複なし');

// 4) フォールバック: 応答が {users:[...]} 形（将来 台帳API に差し替えた場合）でも cmOffice を拾う
const usersShape = { users: [{ cmOffice: 'B事業所' }, { cmOffice: 'A事業所' }, { cmOffice: 'A事業所' }, { cmOffice: '' }, { name: '氏名のみ' }] };
eq(M.stampExtractOffices(usersShape), ['A事業所', 'B事業所'], 'users配列形からも distinct 抽出（空除外・ソート）');

// 5) 前後空白のトリム
const trimShape = { patterns: { 甲: { cmOffice: '  X事業所 ' }, 乙: { cmOffice: 'X事業所' } } };
eq(M.stampExtractOffices(trimShape), ['X事業所'], '空白トリムで同一視・重複排除');

// 6) 異常系: 何を渡しても throw せず [] を返す（無言 return 全廃の土台）
eq(M.stampExtractOffices(null), [], 'null → []');
eq(M.stampExtractOffices(undefined), [], 'undefined → []');
eq(M.stampExtractOffices({}), [], '空オブジェクト → []');
eq(M.stampExtractOffices({ patterns: null }), [], 'patterns=null → []');
eq(M.stampExtractOffices({ patterns: 'ゴミ' }), [], 'patterns=文字列 → []');
eq(M.stampExtractOffices('壊れた文字列'), [], '文字列 → []');
eq(M.stampExtractOffices(123), [], '数値 → []');

// 7) patterns と users 併存時は両方をマージ（漏れを作らない）
const bothShape = { patterns: { 甲: { cmOffice: 'P事業所' } }, users: [{ cmOffice: 'U事業所' }] };
eq(M.stampExtractOffices(bothShape), ['P事業所', 'U事業所'], 'patterns+users をマージ');

console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAIL') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
