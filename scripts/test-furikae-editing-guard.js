// furikae 編集中の自動更新抑止＋繰越の郵送日引継ぎ（2026-08-02）
//
// 対象1: 編集中（フォーム要素にフォーカスがある間）は自動更新を走らせない。
//   30秒interval と visibilitychange の2つは cloudLoad 経由、
//   もう1つ fetchFurikaeFubi → renderMonth という別経路がある（★見落とすと直らない）。
//   全フィールドが onchange のため、再描画でDOMごと消えると change が発火せず入力が失われる。
// 対象2: 繰越の当月カードへ formSentDate / expectedStartDate / expectedStartMonth を引き継ぐ。
//   落とすと code4 の人は毎月入れ直しになり、その間は「予告」表示に戻って実際より遅い日付が出る。
//
// 実行: node scripts/test-furikae-editing-guard.js

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'furikae.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('furikae.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start), d = 0;
  for (let j = i; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (d === 0) return html.slice(start, j + 1); } }
  throw new Error(name + ' 閉じ括弧なし');
}
function tryExtract(name) { try { return extractFn(name); } catch (e) { return null; } }

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
function eq(a, e, m) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m + '\n    exp ' + E + '\n    act ' + A); } }

// ===== (1) 編集中判定の純関数 =====
console.log('[fnkIsEditingTag 純関数]');
const srcTag = tryExtract('fnkIsEditingTag');
if (!srcTag) {
  fail++; console.log('  FAIL fnkIsEditingTag が未実装（RED）');
} else {
  const sb = {};
  new Function('sb', srcTag + '\nsb.f=fnkIsEditingTag;')(sb);
  const f = sb.f;
  ok(f('INPUT') === true, 'INPUT → 編集中');
  ok(f('TEXTAREA') === true, 'TEXTAREA → 編集中');
  ok(f('SELECT') === true, 'SELECT → 編集中');
  ok(f('input') === true, '小文字でも判定できる（tagNameの表記ゆれ耐性）');
  ok(f('BODY') === false, 'BODY → 編集中でない（自動更新は走ってよい）');
  ok(f('DIV') === false, 'DIV → 編集中でない');
  ok(f('BUTTON') === false, 'BUTTON → 編集中でない（ピッカーは対象外）');
  ok(f(null) === false, 'null → 編集中でない（安全側ではなく更新側。判定不能で更新が死なない）');
  ok(f(undefined) === false, 'undefined → 編集中でない');
}

// ===== (2) 3経路すべてにガードが入っていること（構造の証明）=====
// 経路1(30秒interval)・経路2(visibilitychange) は cloudLoad に集約されるので cloudLoad 1箇所でよい。
// 経路3 は fetchFurikaeFubi → renderMonth。ここを塞がないと開いていたフォームは消えたまま。
console.log('\n[3経路のガード]');
const GUARD = 'fnkIsEditingNow';
const srcNow = tryExtract('fnkIsEditingNow');
ok(!!srcNow, 'fnkIsEditingNow が存在する（activeElement を見る側）');
if (srcNow) ok(srcNow.indexOf('activeElement') >= 0, 'fnkIsEditingNow は document.activeElement を見る');

const srcLoad = tryExtract('cloudLoad');
ok(!!srcLoad && srcLoad.indexOf(GUARD) >= 0, '経路1･2: cloudLoad が ' + GUARD + ' で早期returnする');

const srcFubi = tryExtract('fetchFurikaeFubi');
ok(!!srcFubi && srcFubi.indexOf(GUARD) >= 0, '★経路3: fetchFurikaeFubi の再描画も ' + GUARD + ' で抑止する');

// cloudLoad は records を丸ごと差し替えるので、ガードは差し替えより前になければ意味がない
if (srcLoad) {
  const gi = srcLoad.indexOf(GUARD);
  const ai = srcLoad.indexOf('data.records = cloud.records');
  ok(gi >= 0 && ai >= 0 && gi < ai, 'ガードは data.records 差し替えより前にある（順序）');
}

// ===== (3) 繰越の当月カードへ郵送日・引落開始予定を引き継ぐ =====
console.log('\n[繰越カードの引継ぎ]');
const sb2 = {};
new Function('sb',
  extractFn('fnkIsImportMarker') + '\n' + extractFn('fnkIsUnpaid') + '\n' +
  extractFn('fnkNormalizeRecord') + '\n' + extractFn('fnkProcessImport') + '\n' +
  'sb.fnkProcessImport=fnkProcessImport; sb.fnkIsUnpaid=fnkIsUnpaid;')(sb2);
const { fnkProcessImport, fnkIsUnpaid } = sb2;

// 顧客番号166の実データ形（氏名・口座は伏せる）。6月カードが郵送日と引落開始予定を持つ。
const prev = [{
  id: 17, month: '2026-06', customerId: '166', name: 'X', amount: 2920,
  reason: '預金口座振替依頼書なし', resultCode: '4', status: '手続中',
  breakdown: [{ month: '2026-06', amount: 2920 }],
  formSentDate: '2026-07-13', expectedStartDate: '2026-08-27', expectedStartMonth: '2026-08'
}];
const funou = [{ customerId: '166', name: 'X', amount: 5305, reason: '預金口座振替依頼書なし', resultCode: '4' }];
const r3 = fnkProcessImport(prev, 18, funou, [], '2026-07', '2026-08-02');
const now = r3.records.filter(x => x.month === '2026-07' && x.customerId === '166')[0];

eq(now.formSentDate, '2026-07-13', '★formSentDate が当月カードへ引き継がれる');
eq(now.expectedStartDate, '2026-08-27', '★expectedStartDate が引き継がれる');
eq(now.expectedStartMonth, '2026-08', '★expectedStartMonth が引き継がれる');
eq(now.status, '未対応', 'status は引き継がない（今月まだ誰も見ていない契機を残す）');
eq(now.amount, 5305, 'amount は電算の累積額のまま（金額に影響しない）');
eq(now.breakdown, [{ month: '2026-06', amount: 2920 }, { month: '2026-07', amount: 2385 }], 'breakdown は従来どおり');
eq(now.occurrence, 2, 'occurrence は従来どおり');
eq(r3.records.filter(x => x.id === 17)[0].status, '繰越', '前月カードは繰越で閉じる（従来どおり）');

// 郵送日を持たない人は null のまま（余計な値を作らない）
const prevNo = [{
  id: 30, month: '2026-06', customerId: '200', name: 'Y', amount: 1000,
  reason: '資金不足', resultCode: '1', status: '未対応',
  breakdown: [{ month: '2026-06', amount: 1000 }]
}];
const r4 = fnkProcessImport(prevNo, 31, [{ customerId: '200', name: 'Y', amount: 1800, reason: '資金不足', resultCode: '1' }], [], '2026-07', '2026-08-02');
const now4 = r4.records.filter(x => x.month === '2026-07' && x.customerId === '200')[0];
ok(!now4.formSentDate, '元が郵送日なしなら当月カードも空のまま');

// 新規（繰越でない）は従来どおり郵送日なし
const r5 = fnkProcessImport([], 1, [{ customerId: '999', name: 'Z', amount: 500, reason: '資金不足', resultCode: '1' }], [], '2026-07', '2026-08-02');
ok(!r5.records[0].formSentDate, '新規カードは郵送日なし（従来どおり）');
eq(r5.newCount, 1, '新規カウントは従来どおり');

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
