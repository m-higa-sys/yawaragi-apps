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

console.log('\n[avContractN_] 契約週N=曜日数（午前午後は足さない）');
ok(c.avContractN_('火木')===2, '火木→2');
ok(c.avContractN_('月水金')===3, '月水金→3');
ok(c.avContractN_('木')===1, '木→1');
ok(c.avContractN_('')===0, '空→0');

console.log('\n[avOccupancy_] 全在籍から占有[曜日]{am,pm}を集計');
const occ = c.avOccupancy_([
  { days:'火木', unit:'午前' },   // 火AM 木AM
  { days:'火', unit:'午前午後' }, // 火AM 火PM
  { days:'月木', unit:'月午前、木午後' } // 月AM 木PM
]);
ok(occ['火'].am===2, '火AM=2（1人目+2人目）');
ok(occ['火'].pm===1, '火PM=1（2人目のみ）');
ok(occ['木'].am===1 && occ['木'].pm===1, '木AM=1(1人目) 木PM=1(3人目)');
ok(occ['月'].am===1 && occ['月'].pm===0, '月AM=1(3人目) 月PM=0');

console.log('\n[avSlotsFree_] 空き=CAP-占有');
const free = c.avSlotsFree_({ '火':{am:16,pm:18}, '月':{am:0,pm:0} }, 18);
ok(free['火'].am===2, '火AM空き=18-16=2');
ok(free['火'].pm===0, '火PM空き=0');
ok(free['月'].am===18, '月AM空き=18');

console.log('\n[avLast3CompletedMonths_] 直近完了3ヶ月');
eq(c.avLast3CompletedMonths_('2026-07-12'), ['2026-04','2026-05','2026-06'], '7月→4/5/6');
eq(c.avLast3CompletedMonths_('2026-01-05'), ['2025-10','2025-11','2025-12'], '年跨ぎ');

console.log('\n[avDateMinusMonths_] 3ヶ月前（判定中の閾値用）');
eq(c.avDateMinusMonths_('2026-07-12', 3), '2026-04-12', '7/12-3ヶ月=4/12');
eq(c.avDateMinusMonths_('2026-01-31', 3), '2025-10-31', '年跨ぎ');

console.log('\n[avUserOpsRate_] 窓内出席率＋月別（—=null・推測で埋めない）');
const r = c.avUserOpsRate_(
  { '2026-05': {scheduled:5, attended:5}, '2026-06': {scheduled:8, attended:6} },
  ['2026-05','2026-06'],                 // window（率計算対象）
  ['2026-04','2026-05','2026-06']        // displayMonths（月別列）
);
ok(r.rate===84.6, '率=(5+6)/(5+8)=11/13=84.6%');
ok(r.windowAttended===11 && r.windowScheduled===13, '窓合計を保持（基準線用）');
ok(r.monthly['2026-04']===null, '4月=null（opsなし）');
ok(r.monthly['2026-05']===100, '5月=100%');
ok(r.monthly['2026-06']===75, '6月=6/8=75%');

const z = c.avUserOpsRate_({}, ['2026-05'], ['2026-05']);
ok(z.rate===null && z.windowScheduled===0, '窓に予定0→率null');

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
