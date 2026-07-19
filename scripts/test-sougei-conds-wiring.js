// 送迎条件 board GAS配線 抽出検証（段階0・2026-07-13）
// 対象: gas/yawaragi-board/コード.js に sougei_conds の doGet/doPost 配線とハンドラが
//       additive で入っており、既存 weekly/schedTime を壊さないこと。
// 実行: node scripts/test-sougei-conds-wiring.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m){ if(c){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m);} }

console.log('[doGet配線] sougeiCondsGet（鍵なし・callback対応）');
ok(/action === 'sougeiCondsGet'/.test(src), "doGet に sougeiCondsGet 分岐");
ok(/respond\(sougeiCondsGet_\(ss\), ?callback\)/.test(src), "respond(sougeiCondsGet_(ss), callback) で返す");

console.log('\n[doPost配線] sougeiCondsUpsert / sougeiCondsSeed');
ok(/case 'sougeiCondsUpsert'/.test(src), "doPost に sougeiCondsUpsert case");
ok(/case 'sougeiCondsSeed'/.test(src), "doPost に sougeiCondsSeed case");
ok(/sougeiCondsUpsert_\(ss, ?data\)/.test(src), "sougeiCondsUpsert_(ss, data) 呼び出し");
ok(/sougeiCondsSeed_\(ss, ?data\)/.test(src), "sougeiCondsSeed_(ss, data) 呼び出し");

console.log('\n[doGet(JSONP)保存] 応答を読むため Upsert/Seed も GET で叩ける');
ok(/action === 'sougeiCondsUpsert'/.test(src), "doGet に sougeiCondsUpsert 分岐(JSONP保存)");
ok(/action === 'sougeiCondsSeed'/.test(src), "doGet に sougeiCondsSeed 分岐(JSONP保存)");
ok(/respond\(sougeiCondsUpsert_\(ss, ?[a-zA-Z_]+\), ?callback\)/.test(src), "Upsert を respond(...,callback) で返す");
ok(/respond\(sougeiCondsSeed_\(ss, ?[a-zA-Z_]+\), ?callback\)/.test(src), "Seed を respond(...,callback) で返す");
ok(/JSON\.parse\(e\.parameter\.p/.test(src), "GET時は e.parameter.p(JSON文字列)からデータ復元");

console.log('\n[ハンドラ定義] 5関数がある');
['sougeiCondsGet_','sougeiCondsUpsert_','sougeiCondsSeed_','scEnsureCondsSheet_','scReadStore_','scWriteStore_'].forEach(function(fn){
  ok(new RegExp('function\\s+'+fn+'\\s*\\(').test(src), '定義: '+fn);
});

console.log('\n[core依存] 純関数 sougei-conds-core を経由（行↔store変換）');
ok(/scReadStore_[\s\S]*scRowsToStore_/.test(src), 'scReadStore_ が scRowsToStore_ を使う');
ok(/scWriteStore_[\s\S]*scStoreToRows_/.test(src), 'scWriteStore_ が scStoreToRows_ を使う');
ok(/scBuildPrefill_/.test(src), 'Seed が scBuildPrefill_ を使う');

console.log('\n[非破壊] sougei_conds シートのみを対象（既存シート名を新ハンドラで触らない）');
// 新ハンドラ区間を抽出して、その中で既存の要シート名を getSheetByName していないことを確認
var seg = (src.split('===== 送迎条件（')[1] || '').split('===== 送迎条件セクション ここまで')[0];
ok(seg.length > 0 && /sougeiCondsSeed_/.test(seg), '送迎条件セクションが開始〜終端マーカーで抽出できる');
ok(!/getSheetByName\('(送迎時間|weekly_overlay|見学体験新規|利用者台帳|出席予定)/.test(seg), '新ハンドラは既存シートを掴まない(条件シート限定)');
ok(/SC_CONDS_SHEET/.test(seg), 'sougei_conds シートは SC_CONDS_SHEET 定数経由');

console.log('\n' + (fail===0?'[OK] ':'[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail===0?0:1);
