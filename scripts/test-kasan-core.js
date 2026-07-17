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

console.log('\n===== ' + pass + ' passed / ' + fail + ' failed =====');
process.exit(fail ? 1 : 0);
