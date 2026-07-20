// 体重チェック表 改修（2026-07-13）純ロジックの回帰テスト。
// ★再実装せず weight.html の実 function 本体を抽出して実行する（インラインとの二重管理を排除）。
//
// 対象:
//   改修1 名前検索  … wtNormalizeText / wtMatchesSearch
//   改修2 中止者=台帳status単一ソース … wtIsEndedStatus
//   改修3 中止者セクション年度スコープ+台帳外分離 … wtHasRecordInYear / wtLatestInYear / wtClassifyTerminated
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'weight.html'), 'utf8');

function extractFn(name) {
  const re = new RegExp('\\nfunction\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  if (!m) throw new Error('function not found: ' + name);
  return m[0];
}
// 依存関数をまとめて eval できるよう、必要な純関数を1つのスコープに読み込む
const bundle = [
  'wtNormalizeText', 'wtMatchesSearch', 'wtIsEndedStatus',
  'wtHasRecordInYear', 'wtLatestInYear', 'wtClassifyTerminated',
  'wtLedgerNameSet', 'wtFilterCloudWeights'
].map(extractFn).join('\n');
eval(bundle);

const MONTHS = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];

let pass = 0, fail = 0;
const assert = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

// ===== 改修1: wtNormalizeText（正規化） =====
console.log('--- wtNormalizeText ---');
assert('前後空白除去', wtNormalizeText('  たなか  ') === 'タナカ');
assert('全角スペース除去', wtNormalizeText('田中　太郎') === '田中太郎');
assert('半角スペース(内部)除去', wtNormalizeText('田中 太郎') === '田中太郎');
assert('ひらがな→カタカナ', wtNormalizeText('やなぎうら') === 'ヤナギウラ');
assert('英字は小文字化', wtNormalizeText('ABC') === 'abc');
assert('null安全', wtNormalizeText(null) === '' && wtNormalizeText(undefined) === '');

// ===== 改修1: wtMatchesSearch（氏名＋ふりがな部分一致・AND前提の1段） =====
console.log('--- wtMatchesSearch ---');
assert('空クエリは全通過', wtMatchesSearch('田中太郎', 'タナカタロウ', '') === true);
assert('空白のみクエリも全通過', wtMatchesSearch('田中太郎', 'タナカタロウ', '　 ') === true);
assert('漢字部分一致', wtMatchesSearch('田中太郎', 'タナカタロウ', '田中') === true);
assert('ふりがな(ひらがな)で漢字名にヒット', wtMatchesSearch('利用者110', 'リヨウシャ110', 'りよう') === true);
assert('ふりがな途中一致', wtMatchesSearch('利用者110', 'リヨウシャ110', 'しゃ') === true);
assert('非該当はfalse', wtMatchesSearch('田中太郎', 'タナカタロウ', 'すずき') === false);
assert('氏名とふりがなを跨いだ誤ヒットを起こさない', wtMatchesSearch('田中', 'スズキ', '中スズ') === false);

// ===== 改修2: wtIsEndedStatus（台帳status＝中止/終了/卒業 のみ） =====
console.log('--- wtIsEndedStatus ---');
assert('空は現役', wtIsEndedStatus('') === false);
assert('現役表記は現役', wtIsEndedStatus('利用中') === false);
assert('中止は中止', wtIsEndedStatus('中止') === true);
assert('終了は中止扱い', wtIsEndedStatus('利用終了') === true);
assert('卒業は中止扱い', wtIsEndedStatus('卒業') === true);
assert('null安全', wtIsEndedStatus(null) === false);

// ===== 改修3: wtHasRecordInYear =====
console.log('--- wtHasRecordInYear ---');
const W = {
  2025: { '古田': { '7月': 60 } },
  2026: { '利用者110': { '7月': 83.8 }, '空井戸': { '4月': '' }, '法浦武治': { '7月': 70 } }
};
assert('該当年度に値あり', wtHasRecordInYear(W, 2026, '利用者110') === true);
assert('該当年度に行なし', wtHasRecordInYear(W, 2026, '不在') === false);
assert('別年度のみの人は当年度false', wtHasRecordInYear(W, 2026, '古田') === false);
assert('空文字だけはfalse', wtHasRecordInYear(W, 2026, '空井戸') === false);

// ===== 改修3: wtLatestInYear =====
console.log('--- wtLatestInYear ---');
const W2 = { 2026: { 'A': { '4月': 50, '7月': 52, '1月': 55 } } };
const lat = wtLatestInYear(W2, 2026, 'A', MONTHS);
assert('年度内最新は1月(翌暦年)', lat && lat.monthNum === 1 && lat.calYear === 2027);
const lat2 = wtLatestInYear({ 2026: { 'A': { '4月': 50, '7月': 52 } } }, 2026, 'A', MONTHS);
assert('7月最新はcalYear=fy', lat2 && lat2.monthNum === 7 && lat2.calYear === 2026);
assert('記録なしはnull', wtLatestInYear(W2, 2026, 'X', MONTHS) === null);

// ===== 改修3: wtClassifyTerminated（年度スコープ＋台帳外分離） =====
console.log('--- wtClassifyTerminated ---');
// シナリオ: 現役=利用者110(記録あり) / 台帳中止=古田(当年度記録なし)・辞田(当年度記録あり) / 台帳外=法浦武治(記録あり)
const weights = {
  2025: { '古田': { '3月': 60 } },
  2026: { '利用者110': { '7月': 83.8 }, '辞田': { '5月': 48 }, '法浦武治': { '7月': 70 } }
};
const res = wtClassifyTerminated({
  activeNames: ['利用者110'],
  terminated: [
    { name: '古田', kana: 'フルタ', lastUseDate: '2026-03-31' },
    { name: '辞田', kana: 'ジタ', lastUseDate: '2026-05-20' }
  ],
  weights: weights, fy: 2026, months: MONTHS
});
assert('台帳中止で当年度記録ありのみledger入り(辞田)', res.ledger.length === 1 && res.ledger[0].name === '辞田');
assert('当年度に記録なしの台帳中止(古田)は年度スコープで除外', res.ledger.every(x => x.name !== '古田'));
assert('現役(利用者110)はledgerにもorphanにも出ない',
  res.ledger.every(x => x.name !== '利用者110') && res.orphans.every(x => x.name !== '利用者110'));
assert('台帳外の孤立記録(法浦武治)はorphansへ', res.orphans.length === 1 && res.orphans[0].name === '法浦武治');
assert('orphanのbadgeは最終測定月', res.orphans[0].badge === '2026/7月');
assert('ledgerのbadgeも最終測定月', res.ledger[0].badge === '2026/5月');
// 翌年度(2027)表示に切替えると、当年度に記録がある者が居ない→両方空（肥大化しない）
const resNext = wtClassifyTerminated({
  activeNames: ['利用者110'], terminated: [{ name: '辞田', kana: '', lastUseDate: '' }],
  weights: weights, fy: 2027, months: MONTHS
});
assert('翌年度に切替えると当年度記録のない中止者は自動的に消える', resNext.ledger.length === 0 && resNext.orphans.length === 0);

// ===== 再汚染対策: wtLedgerNameSet / wtFilterCloudWeights =====
console.log('--- wtLedgerNameSet ---');
const lset = wtLedgerNameSet(
  [{ name: '利用者110' }, { name: '田中太郎' }],
  [{ name: '古田花子' }]
);
assert('現役＋中止者を氏名Setに', lset.has('利用者110') && lset.has('田中太郎') && lset.has('古田花子'));
assert('台帳外は含まない', !lset.has('法浦武治'));

console.log('--- wtFilterCloudWeights ---');
const cloudTree = {
  2026: {
    '利用者110': { '7月': 83.8 },   // 現役 → 送る
    '古田花子': { '5月': 48 },      // 台帳中止者 → 送る（記録保持）
    '法浦武治': { '7月': 70 },      // 台帳外・値あり → スキップ（警告対象）
    '空殻': {}                       // 台帳外・空 → スキップ（警告非対象）
  }
};
// enabled=false（台帳未取得）＝一切除外しない（データ消失事故防止）
const off = wtFilterCloudWeights(cloudTree, lset, false);
assert('未取得端末は素通し(法浦も残る)', !!off.tree[2026]['法浦武治'] && off.skipped.length === 0);
// enabled=true（台帳取得済み）＝台帳外だけ落とす
const on = wtFilterCloudWeights(cloudTree, lset, true);
assert('現役(柳浦)は送信対象に残る', !!on.tree[2026]['利用者110']);
assert('台帳中止者(古田)も送信対象に残る＝記録保持', !!on.tree[2026]['古田花子']);
assert('台帳外(法浦)は送信から除外', !on.tree[2026]['法浦武治']);
assert('台帳外(空殻)も除外', !on.tree[2026]['空殻']);
assert('skippedに台帳外2件', on.skipped.length === 2 && on.skipped.indexOf('法浦武治') >= 0 && on.skipped.indexOf('空殻') >= 0);
assert('警告(値あり)は法浦のみ', on.skippedWithData.length === 1 && on.skippedWithData[0] === '法浦武治');
// 元データを破壊しない（新オブジェクトを返す）
assert('入力treeを破壊しない', !!cloudTree[2026]['法浦武治']);

console.log('\n==== weight-core: ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail === 0 ? 0 : 1);
