// furikae Step2 取込ロジック（人ごと1枚＋月別内訳）純関数テスト
// 対象: fnkProcessImport（同月合算/自動消込/繰越/要確認/新規/冪等）＋ fnkIsUnpaid の繰越除外
// 実行: node scripts/test-furikae-import.js

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
let pass = 0, fail = 0;
function eq(a, e, m) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m + '\n    exp ' + E + '\n    act ' + A); } }
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

const sb = {};
new Function('sb',
  extractFn('fnkIsImportMarker') + '\n' +
  extractFn('fnkIsUnpaid') + '\n' +
  extractFn('fnkNormalizeRecord') + '\n' +
  extractFn('fnkProcessImport') + '\n' +
  'sb.fnkIsUnpaid=fnkIsUnpaid; sb.fnkProcessImport=fnkProcessImport;'
)(sb);
const { fnkIsUnpaid, fnkProcessImport } = sb;

const F = (cid, name, amount, code) => ({ customerId: cid, name: name, amount: amount, reason: code, resultCode: code });
const T = '2026-06-30';
const findCid = (recs, cid) => recs.filter(r => r.customerId === cid);
const active = (recs, cid) => recs.filter(r => r.customerId === cid && fnkIsUnpaid(r));

console.log('[fnkIsUnpaid 繰越除外]');
ok(fnkIsUnpaid({ status: '未対応' }) === true, '未対応→未回収');
ok(fnkIsUnpaid({ status: '連絡済み' }) === true, '連絡済み→未回収');
ok(fnkIsUnpaid({ status: '回収済' }) === false, '回収済→未回収でない');
ok(fnkIsUnpaid({ status: '繰越' }) === false, '繰越→未回収でない（アクティブから外す）');

console.log('\n[新規]');
let r = fnkProcessImport([], 1, [F('100', 'A', 1000, '2')], [], '2026-06', T);
eq(r.records.length, 1, '新規1枚');
eq(r.records[0].status, '未対応', 'status=未対応');
eq(r.records[0].breakdown, [{ month: '2026-06', amount: 1000 }], 'breakdown 1要素');
eq(r.records[0].occurrence, 1, 'occurrence=1');
eq(r.newCount, 1, 'newCount=1');

console.log('\n[同月複数行の合算]');
r = fnkProcessImport([], 1, [F('100', 'A', 600, '2'), F('100', 'A', 400, '2')], [], '2026-06', T);
eq(r.records.length, 1, '同月2行→1カード');
eq(r.records[0].amount, 1000, 'amount=月合計');
eq(r.records[0].breakdown, [{ month: '2026-06', amount: 1000 }], 'breakdown 1要素・合算額');

console.log('\n[自動消込：過去未回収×今月成功]');
let prev = [{ id: 1, customerId: '100', name: 'A', month: '2026-05', amount: 1000, status: '未対応', breakdown: [{ month: '2026-05', amount: 1000 }] }];
r = fnkProcessImport(prev, 2, [], ['100'], '2026-06', T);
const cleared = findCid(r.records, '100')[0];
eq(cleared.status, '回収済', '過去カード→回収済');
eq(cleared.resolvedMonth, '2026-06', 'resolvedMonth=当月');
eq(cleared.collectMethod, '翌月合算', 'collectMethod=翌月合算');
eq(r.autoCleared, [{ customerId: '100', name: 'A', amount: 1000 }], 'autoCleared に名前と額');
eq(active(r.records, '100').length, 0, 'アクティブから消える');

console.log('\n[繰越：過去未回収×今月も不能（逆算・内訳引継ぎ・連絡リセット）]');
prev = [{ id: 1, customerId: '162', name: 'ﾏﾁﾀﾞ', month: '2026-05', amount: 4753, status: '連絡済み', contactedBy: '下浦', contactedAt: '2026-06-01', contactMethod: '電話', breakdown: [{ month: '2026-05', amount: 4753 }] }];
r = fnkProcessImport(prev, 2, [F('162', 'ﾏﾁﾀﾞ', 9476, '4')], [], '2026-06', T);
const old = findCid(r.records, '162').find(x => x.month === '2026-05');
const now = findCid(r.records, '162').find(x => x.month === '2026-06');
eq(old.status, '繰越', '前月カード→繰越');
eq(old.contactedBy, '下浦', '前月の連絡記録は繰越カードに残る');
eq(now.breakdown, [{ month: '2026-05', amount: 4753 }, { month: '2026-06', amount: 4723 }], '当月分逆算=9476−4753=4723・内訳引継ぎ');
eq(now.amount, 9476, 'amount=電算累積額');
eq(now.occurrence, 2, 'occurrence=breakdown.length');
eq(now.prevAmount, 4753, 'prevAmount=前月未収合計');
eq(now.status, '未対応', '当月カードは未対応（連絡リセット）');
eq(now.contactedBy, null, 'contactedBy リセット');
eq(active(r.records, '162').length, 1, 'アクティブは当月1枚のみ（二重ゼロ）');
eq(r.carriedOver, [{ customerId: '162', name: 'ﾏﾁﾀﾞ' }], 'carriedOver 記録');

console.log('\n[要確認：今月ファイルに不在]');
prev = [{ id: 1, customerId: '100', name: 'A', month: '2026-05', amount: 1000, status: '未対応', breakdown: [{ month: '2026-05', amount: 1000 }] }];
r = fnkProcessImport(prev, 2, [F('200', 'B', 500, '2')], ['300'], '2026-06', T);
const absent = findCid(r.records, '100')[0];
eq(absent.nextMonthAbsent, true, '今月不在→nextMonthAbsent=true');
eq(absent.status, '未対応', '要確認は自動で消さない');
eq(r.flagged, [{ customerId: '100', name: 'A' }], 'flagged 記録');
eq(active(r.records, '100').length, 1, 'アクティブに残る');

console.log('\n[冪等：同月再取込で壊れない]');
prev = [{ id: 5, customerId: '162', name: 'ﾏﾁﾀﾞ', month: '2026-06', amount: 9476, status: '未対応', breakdown: [{ month: '2026-05', amount: 4753 }, { month: '2026-06', amount: 4723 }], occurrence: 2 }];
r = fnkProcessImport(prev, 6, [F('162', 'ﾏﾁﾀﾞ', 9476, '4')], [], '2026-06', T);
eq(r.records.length, 1, '再取込で新規増えない');
eq(r.skipCount, 1, 'skipCount=1');
eq(findCid(r.records, '162')[0].status, '未対応', '既存カード不変（繰越/消込を二重適用しない）');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
