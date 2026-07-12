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

console.log('\n[avActualPerWeek_] 実績週N.N=契約N×率, 乖離=契約N−実績');
const a = c.avActualPerWeek_(3, 84.6);
ok(a.actualPerWeek===2.54, '3×0.846=2.54');
ok(a.diverge===0.46, '3-2.54=0.46');
const nn = c.avActualPerWeek_(2, null);
ok(nn.actualPerWeek===null && nn.diverge===null, '率null→実績/乖離null');

console.log('\n[avDisplayState_] 優先: 長期休み>判定中(新規)>参考値(曜日変更)>normal');
eq(c.avDisplayState_({isLongLeave:true, isWeekdayChange:true, startDate:'2026-07-01', today:'2026-07-12'}),
   {state:'chouki', label:'算出不可'}, '長期休みが最優先');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:true, startDate:'2026-07-01', today:'2026-07-12'}),
   {state:'hanteichu', label:'判定中（データ蓄積中）'}, '新規(開始<3ヶ月)が曜日変更より優先');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:false, startDate:'2026-03-01', today:'2026-07-12'}),
   {state:'normal', label:''}, '開始>3ヶ月前→通常復帰');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:true, startDate:'2026-01-01', today:'2026-07-12'}),
   {state:'sanko', label:'参考値（率が不正確）'}, '曜日変更のみ→参考値');
eq(c.avDisplayState_({isLongLeave:false, isWeekdayChange:false, startDate:'', today:'2026-07-12'}),
   {state:'normal', label:''}, '開始日空→normal（判定中にしない）');

console.log('\n[avAddableSlots_] 同ampm保持・現曜日除外・空き>0の枠');
const sf = { '月':{am:1,pm:0}, '火':{am:1,pm:2}, '水':{am:0,pm:0}, '木':{am:0,pm:0}, '金':{am:1,pm:1} };
eq(c.avAddableSlots_('水','午前', sf), ['月AM','火AM','金AM'], '水AMのみ→月/火/金AM（水除外・空きある枠）');
eq(c.avAddableSlots_('火','午後', sf), ['金PM'], '火PMのみ→金PM（火除外・月木水はPM空きなし）');
eq(c.avAddableSlots_('月','午前午後', sf), ['火AM','金AM','火PM','金PM'], '午前午後→AM/PM両面の空き（月除外）');

console.log('\n[avIsUpsizeCandidate_] normal かつ 週1回');
ok(c.avIsUpsizeCandidate_('normal',1)===true, 'normal週1→候補');
ok(c.avIsUpsizeCandidate_('normal',2)===false, '週2→非候補');
ok(c.avIsUpsizeCandidate_('sanko',1)===false, 'sanko週1→非候補');

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
