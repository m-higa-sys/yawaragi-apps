// 送迎条件 純コアテスト（段階0・2026-07-13）
// 対象: gas/yawaragi-board/sougei-conds-core.js
// 実行: node scripts/test-sougei-conds.js
const path = require('path');
const c = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'sougei-conds-core.js'));
let pass = 0, fail = 0;
function eq(a, e, m){ const A=JSON.stringify(a),E=JSON.stringify(e); if(A===E){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m+'\n    exp '+E+'\n    act '+A);} }
function ok(cnd, m){ if(cnd){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m); } }

console.log('[scNormTransport_] 送迎区分の正規化（walk/family/normal の3値）');
eq(c.scNormTransport_('walk'), 'walk', 'walk→walk');
eq(c.scNormTransport_('family'), 'family', 'family→family');
eq(c.scNormTransport_('shuttle'), 'normal', 'shuttle→normal(送迎)');
eq(c.scNormTransport_(''), 'normal', '空→normal(既定=送迎)');
eq(c.scNormTransport_('徒歩'), 'walk', '日本語 徒歩→walk');
eq(c.scNormTransport_('家族送迎'), 'family', '日本語 家族送迎→family');
eq(c.scNormTransport_('送迎'), 'normal', '日本語 送迎→normal');
eq(c.scNormTransport_(null), 'normal', 'null→normal(落ちない)');
eq(c.scNormTransport_('なんか変な値'), 'normal', '不明値→normal(安全側)');

console.log('\n[scTransportLabel_] 正規値→表示ラベル');
eq(c.scTransportLabel_('walk'), '徒歩', 'walk→徒歩');
eq(c.scTransportLabel_('family'), '家族送迎', 'family→家族送迎');
eq(c.scTransportLabel_('normal'), '送迎', 'normal→送迎');

console.log('\n[scNormCond_] 1人分条件の正規化（型を固定・欠けは既定）');
eq(c.scNormCond_({transport:'shuttle', no3:1, step:true, frontPref:'x', memo:' あ ', confirmed:1}),
   {transport:'normal', no3:true, step:true, frontPref:true, memo:'あ', confirmed:true}, 'フル指定→正規化(truthy→bool・memo trim)');
eq(c.scNormCond_({}),
   {transport:'normal', no3:false, step:false, frontPref:false, memo:'', confirmed:false}, '空→全既定(送迎/false/未確認)');
eq(c.scNormCond_(null),
   {transport:'normal', no3:false, step:false, frontPref:false, memo:'', confirmed:false}, 'null→全既定(落ちない)');
eq(c.scNormCond_({no3:false, step:0, memo:''}).confirmed, false, 'confirmed未指定→false');

console.log('\n[scBuildPrefill_] sakura transportマップ→プリフィル(条件は空・未確認)');
const pf = c.scBuildPrefill_({'山田 太郎':{transport:'walk'}, '鈴木 花子':{transport:'shuttle'}, '佐藤 次郎':{transport:'family'}});
eq(pf['山田 太郎'], {transport:'walk', no3:false, step:false, frontPref:false, memo:'', confirmed:false}, '徒歩者→transport=walk・条件空・未確認');
eq(pf['鈴木 花子'].transport, 'normal', 'shuttle→normal');
eq(pf['佐藤 次郎'].transport, 'family', 'family→family');
ok(Object.keys(pf).length===3, '3件生成');
ok(pf['山田 太郎'].confirmed===false, 'プリフィルは全て未確認(要確認)');

console.log('\n[scUpsert_] 1人分の非破壊upsert（既存を壊さず該当キーだけ差し替え）');
const store0 = {'山田 太郎':{transport:'walk', no3:false, step:false, frontPref:false, memo:'', confirmed:false}};
const store1 = c.scUpsert_(store0, '山田 太郎', {transport:'normal', no3:true, step:false, frontPref:false, memo:'左ドア希望', confirmed:true});
eq(store1['山田 太郎'], {transport:'normal', no3:true, step:false, frontPref:false, memo:'左ドア希望', confirmed:true}, '既存者を更新(confirmed=trueに)');
ok(store0['山田 太郎'].confirmed===false, '元storeは不変(非破壊)');
const store2 = c.scUpsert_(store1, '新井 三郎', {transport:'family'});
ok(store2['新井 三郎'] && store2['新井 三郎'].transport==='family', '新規者を追加');
ok(store2['山田 太郎'].no3===true, '既存者は保持');
ok(Object.keys(store2).length===2, '2件になる');

console.log('\n[scBuildRows_] 台帳在籍名 × store → 1人1行ビュー（未登録は空・未確認）');
const roster = ['山田 太郎', '田中 四郎'];
const store = {'山田 太郎':{transport:'walk', no3:true, step:false, frontPref:false, memo:'', confirmed:true}};
const rows = c.scBuildRows_(roster, store);
ok(rows.length===2, '在籍2名で2行');
eq(rows[0], {name:'山田 太郎', transport:'walk', no3:true, step:false, frontPref:false, memo:'', confirmed:true}, '登録済み→storeの値・確認済み');
eq(rows[1], {name:'田中 四郎', transport:'normal', no3:false, step:false, frontPref:false, memo:'', confirmed:false}, '未登録→既定・未確認(要確認)');

console.log('\n[scParseRouteRows_] 送迎時間JSON.routes[曜日]→定型ルート行(車ごと・利用者列)');
const sched = {routes:{'月':{
  am:{pick:[{driver:'小野', vehicle:'ス', stops:[{user:'山田', time:'8:30'},{user:'鈴木'}]}], drop:[]},
  pm:{pick:[], drop:[{driver:'林', vehicle:'シS', stops:[{user:'佐藤'}]}]}
}}};
const rr = c.scParseRouteRows_(sched, '月');
ok(rr.length===2, '月=迎え1便+送り1便で2行');
eq(rr[0], {ampm:'am', type:'pick', vehicle:'ス', driver:'小野', users:['山田','鈴木']}, 'AM迎え=ス/小野/山田鈴木');
eq(rr[1], {ampm:'pm', type:'drop', vehicle:'シS', driver:'林', users:['佐藤']}, 'PM送り=シS/林/佐藤');
eq(c.scParseRouteRows_({routes:{}}, '火'), [], 'その曜日にrouteなし→空配列');
eq(c.scParseRouteRows_(null, '月'), [], 'sched=null→空配列(落ちない)');
eq(c.scParseRouteRows_({routes:{'月':{am:{pick:[{driver:'', vehicle:'', stops:[]}],drop:[]},pm:{pick:[],drop:[]}}}}, '月'), [], 'stops空の便は行にしない');

console.log('\n[scCellBool_] シートセル値の真偽正規化（TRUE/FALSE文字列の罠対策）');
ok(c.scCellBool_(true)===true, 'bool true→true');
ok(c.scCellBool_(false)===false, 'bool false→false');
ok(c.scCellBool_('TRUE')===true, "文字列'TRUE'→true");
ok(c.scCellBool_('FALSE')===false, "文字列'FALSE'→false（truthy罠を回避）");
ok(c.scCellBool_('true')===true, "小文字'true'→true");
ok(c.scCellBool_('')===false, '空→false');
ok(c.scCellBool_(1)===true, '1→true');
ok(c.scCellBool_(0)===false, '0→false');
ok(c.scCellBool_('✓')===true, '任意の非空文字(FALSE以外)→true');

console.log('\n[scRowsToStore_] シート2次元配列(header+行)→store');
const values = [
  ['name','transport','no3','step','frontPref','memo','confirmed','updatedAt','updatedBy'],
  ['山田 太郎','walk','FALSE','FALSE','FALSE','','TRUE','2026-07-13T00:00:00Z','比嘉'],
  ['田中 四郎','normal','TRUE','FALSE','TRUE','前席固定','FALSE','','']
];
const st = c.scRowsToStore_(values);
ok(Object.keys(st).length===2, '2名分');
eq(st['山田 太郎'], {transport:'walk',no3:false,step:false,frontPref:false,memo:'',confirmed:true}, '山田=確認済み徒歩');
eq(st['田中 四郎'], {transport:'normal',no3:true,step:false,frontPref:true,memo:'前席固定',confirmed:false}, '田中=no3+前席・未確認');
eq(c.scRowsToStore_([]), {}, '空→{}');
eq(c.scRowsToStore_([['name','transport','no3','step','frontPref','memo','confirmed','updatedAt','updatedBy']]), {}, 'ヘッダのみ→{}');
eq(c.scRowsToStore_(null), {}, 'null→{}(落ちない)');
ok(c.scRowsToStore_([['name','transport','no3','step','frontPref','memo','confirmed','updatedAt','updatedBy'],['','walk','','','','','','','']])['']===undefined, '空name行はスキップ');

console.log('\n[scStoreToRows_] store→シート2次元配列(header+行・updatedAt/By付与)');
const srows = c.scStoreToRows_({'山田 太郎':{transport:'walk',no3:false,step:false,frontPref:false,memo:'',confirmed:true}}, '2026-07-13T00:00:00Z', '比嘉');
eq(srows[0], ['name','transport','no3','step','frontPref','memo','confirmed','updatedAt','updatedBy'], '1行目=ヘッダ');
eq(srows[1], ['山田 太郎','walk',false,false,false,'',true,'2026-07-13T00:00:00Z','比嘉'], 'データ行(boolはbool・updatedAt/By付与)');
ok(c.scStoreToRows_({}, 't', 'u').length===1, '空store→ヘッダ1行のみ');

console.log('\n[round-trip] store→rows→store で不変（confirmed/no3等が壊れない）');
const orig = {'A 太郎':{transport:'family',no3:true,step:true,frontPref:false,memo:'メモ',confirmed:true},
              'B 次郎':{transport:'normal',no3:false,step:false,frontPref:false,memo:'',confirmed:false}};
eq(c.scRowsToStore_(c.scStoreToRows_(orig,'t','u')), orig, 'round-trip一致');

console.log('\n' + (fail===0?'[OK] ':'[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail===0?0:1);
