// 出席率・利用頻度ビュー 純関数テスト
// 実行: node scripts/test-attendance-view-core.js
const path = require('path');
const c = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'attendance-view-core.js'));
let pass = 0, fail = 0;
function eq(a, e, m){ const A=JSON.stringify(a),E=JSON.stringify(e); if(A===E){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m+'\n    exp '+E+'\n    act '+A);} }
function ok(cnd, m){ if(cnd){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m);} }

console.log('[定数]');
ok(c.AV_CAP === 18, 'AV_CAP=18');

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
