// 加算・事業所情報アプリ kasan.html 純関数テスト
// 実行: node scripts/test-kasan-core.js
const path = require('path');
const c = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'kasan-core.js'));
let pass = 0, fail = 0;
function eq(a, e, m){ const A=JSON.stringify(a),E=JSON.stringify(e); if(A===E){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m+'\n    exp '+E+'\n    act '+A);} }
function ok(cnd, m){ if(cnd){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m);} }

console.log('[定数]');
eq(c.KASAN_HEADER, ['section','表示順','系統','コード','項目','値','最終確認日','備考'], 'ヘッダ8列');
eq(c.KASAN_SECTIONS, ['基本情報','運営体制','地域区分','加算'], 'section4種');
eq(c.KASAN_KEITOU, ['介護給付','総合事業'], '系統2種');

console.log('\n[kasanNormalizeCode] ★Sheetsが781241を数値化する罠');
ok(c.kasanNormalizeCode(781241) === '781241', '数値781241→文字列(指数・小数を作らない)');
ok(c.kasanNormalizeCode(781241.0) === '781241', '小数表現でも781241');
ok(c.kasanNormalizeCode('A61111') === 'A61111', '英字混在は素通し');
ok(c.kasanNormalizeCode('  786108  ') === '786108', '前後空白をtrim');
ok(c.kasanNormalizeCode(null) === '', 'null→空');
ok(c.kasanNormalizeCode(undefined) === '', 'undefined→空');
ok(c.kasanNormalizeCode('') === '', '空→空');

console.log('\n[kasanSeedKey_] section|コード|項目 で冪等');
ok(c.kasanSeedKey_(['加算',10,'介護給付','781241','本体（地域通所介護11）','','2026-07-17','']) === '加算|781241|本体（地域通所介護11）', '加算行のキー');
ok(c.kasanSeedKey_(['基本情報',10,'','','法人名','株式会社キープフィットライフ','2026-07-17','']) === '基本情報||法人名', '基本情報は項目で効く');
ok(c.kasanSeedKey_(['加算',10,'介護給付',781241,'本体','','','']) === c.kasanSeedKey_(['加算',10,'介護給付','781241','本体','','','']), '★数値/文字列のコードで同一キー＝再実行で重複しない');
ok(c.kasanSeedKey_(null) === '', 'null→空');

console.log('\n[kasanParseRows] ヘッダ「名」で列解決＝列順の入替に強い');
const H = ['section','表示順','系統','コード','項目','値','最終確認日','備考'];
eq(c.kasanParseRows([H, ['加算', 10, '介護給付', 781241, '本体（地域通所介護11）', '', '2026-07-17', '']]),
   [{section:'加算', order:10, keitou:'介護給付', code:'781241', item:'本体（地域通所介護11）', value:'', checkedAt:'2026-07-17', note:''}],
   '基本の1行（コードは数値でも文字列化）');

// 列順を入れ替えても同じ結果になること＝位置決め打ちでない証明
const H2 = ['備考','項目','section','コード','系統','値','最終確認日','表示順'];
eq(c.kasanParseRows([H2, ['', '本体（地域通所介護11）', '加算', 781241, '介護給付', '', '2026-07-17', 10]]),
   [{section:'加算', order:10, keitou:'介護給付', code:'781241', item:'本体（地域通所介護11）', value:'', checkedAt:'2026-07-17', note:''}],
   '★列順を入れ替えても同一結果');

eq(c.kasanParseRows([]), [], '空→[]');
eq(c.kasanParseRows([H]), [], 'ヘッダのみ→[]');
eq(c.kasanParseRows(null), [], 'null→[]');
eq(c.kasanParseRows([H, ['', '', '', '', '', '', '', '']]), [], 'section空の行はスキップ');
eq(c.kasanParseRows([H, ['基本情報', '', '', '', '法人名', '株式会社キープフィットライフ', '', '']])[0].order, 9999,
   '表示順が空→9999（末尾へ）');
eq(c.kasanParseRows([H, ['基本情報', 'あ', '', '', '法人名', 'X', '', '']])[0].order, 9999,
   '表示順が非数値→9999（末尾へ）');
// ヘッダに存在しない列を要求しても落ちない
eq(c.kasanParseRows([['section','項目'], ['基本情報', '法人名']]),
   [{section:'基本情報', order:9999, keitou:'', code:'', item:'法人名', value:'', checkedAt:'', note:''}],
   '★列が欠けていても落ちず空で埋まる');
// 行が短くても落ちない
eq(c.kasanParseRows([H, ['基本情報']])[0].item, '', '行が短くても落ちない');

console.log('\n[kasanParseRows] ★最終確認日のTZずれ防止（Date化されても+16hずらさない）');
eq(c.kasanParseRows([H, ['加算', 10, '介護給付', '781241', '本体', '', new Date(2026, 6, 17), '']])[0].checkedAt,
   '2026-07-17', 'Dateはローカル年月日で yyyy-MM-dd 化（UTC変換しない＝日付がずれない）');

console.log('\n[kasanSortRows] 表示順→コード の安定ソート・非破壊');
const rs = [
  {section:'加算', order:20, code:'785053', item:'個訓Ⅰ2'},
  {section:'加算', order:10, code:'781241', item:'本体'},
  {section:'加算', order:9999, code:'999999', item:'表示順なし'},
  {section:'加算', order:10, code:'A61111', item:'総合本体'}
];
// ★スナップショットは kasanSortRows を1度も呼ぶ前に撮る。
//   呼び出し後に撮ると、破壊的な実装でも「ソート済み同士の比較」になって通ってしまう（偽陰性）。
const before = rs.map(function(x){return x.code;});
eq(c.kasanSortRows(rs).map(function(x){return x.code;}), ['781241','A61111','785053','999999'],
   '表示順昇順／同値はコード順（781241 < A61111）／9999は末尾');
eq(rs.map(function(x){return x.code;}), before, '★非破壊（引数の配列を並べ替えない）');
eq(c.kasanSortRows([]), [], '空→[]');
eq(c.kasanSortRows(null), [], 'null→[]');

console.log('\n[kasanGroupBySection] 未知sectionを黙って捨てない');
const g = c.kasanGroupBySection([
  {section:'基本情報', code:'', item:'法人名'},
  {section:'加算', code:'781241', item:'本体'},
  {section:'謎', code:'', item:'知らないsection'}
]);
eq(g['基本情報'].map(function(x){return x.item;}), ['法人名'], '基本情報に振る');
eq(g['加算'].map(function(x){return x.code;}), ['781241'], '加算に振る');
eq(g['不明'].map(function(x){return x.item;}), ['知らないsection'], '★未知sectionは「不明」へ＝消えない');
eq(g['運営体制'], [], '該当なしは空配列');
eq(c.kasanGroupBySection([]), {'基本情報':[],'運営体制':[],'地域区分':[],'加算':[],'不明':[]}, '空→全カテゴリ空');
eq(c.kasanGroupBySection(null), {'基本情報':[],'運営体制':[],'地域区分':[],'加算':[],'不明':[]}, 'null→全カテゴリ空');
// ★プロトタイプ汚染耐性: section が 'constructor' でも落ちない
ok((function(){ try { c.kasanGroupBySection([{section:'constructor', code:'', item:'x'}]); return true; } catch(e){ return false; } })(),
   "★section='constructor' でも例外にならない");
eq(c.kasanGroupBySection([{section:'constructor', code:'', item:'x'}])['不明'].length, 1,
   "★section='constructor' は「不明」へ");

console.log('\n[kasanSplitKeitou] 系統が空の加算行も落とさない');
const sp = c.kasanSplitKeitou([
  {keitou:'介護給付', code:'781241'},
  {keitou:'総合事業', code:'A61111'},
  {keitou:'', code:'999999'}
]);
eq(sp['介護給付'].map(function(x){return x.code;}), ['781241'], '介護給付');
eq(sp['総合事業'].map(function(x){return x.code;}), ['A61111'], '総合事業');
eq(sp['系統不明'].map(function(x){return x.code;}), ['999999'], '★系統が空→「系統不明」へ＝沈黙させない');
eq(c.kasanSplitKeitou([]), {'介護給付':[],'総合事業':[],'系統不明':[]}, '空→全系統空');
eq(c.kasanSplitKeitou(null), {'介護給付':[],'総合事業':[],'系統不明':[]}, 'null→全系統空');

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
