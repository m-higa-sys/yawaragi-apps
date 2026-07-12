// 出席率・利用頻度ビュー 純関数テスト
// 実行: node scripts/test-attendance-view-core.js
const path = require('path');
const c = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'attendance-view-core.js'));
let pass = 0, fail = 0;
function eq(a, e, m){ const A=JSON.stringify(a),E=JSON.stringify(e); if(A===E){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m+'\n    exp '+E+'\n    act '+A);} }
function ok(cnd, m){ if(cnd){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m);} }

console.log('[定数]');
ok(c.AV_CAP === 18, 'AV_CAP=18');

console.log('\n[avSlotSet_] 曜日別ampmパース（複合ampm幽霊なし）');
eq(c.avSlotSet_('火木', '午前'), {'火|午前':true,'木|午前':true}, '単純 午前→両日AM');
eq(c.avSlotSet_('火', '午前午後'), {'火|午前':true,'火|午後':true}, '午前午後→AM+PM両方');
eq(c.avSlotSet_('月木', '月午前、木午後'), {'月|午前':true,'木|午後':true}, '★複合→曜日ごとに正しく振る（幽霊なし）');
eq(c.avSlotSet_('', ''), {}, '空→空');

console.log('\n[avAttendsCell_] セル判定');
ok(c.avAttendsCell_('火木','午前','火','am')===true, '火AM在籍→true');
ok(c.avAttendsCell_('火木','午前','火','pm')===false, '火PMは不在→false');
ok(c.avAttendsCell_('月木','月午前、木午後','木','pm')===true, '複合 木PM→true');

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
