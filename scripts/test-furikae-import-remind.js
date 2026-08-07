// test-furikae-import-remind.js
// morningDigest「電算 結果Excel 取込リマインド」の純関数テスト（実コード抽出方式）。
// 対象: _digestPrevYm_ / furikaeImportReminder_（gas/yawaragi-board/コード.js）
// 実行: node scripts/test-furikae-import-remind.js
//
// 正本: docs/superpowers/specs/2026-07-06-furikae-kekka-import-remind-design.md §6
//
// 背景: 振替不能の入口（結果Excelの取込）が人力依存で、取り込み忘れると
// 「不能そのものが検知されない」。終わるまで方式で毎朝催促し、取り込んだら自動で消える。
// 受け皿（センチネル＝取込済マーカー）は furikae.html 側に実装済み・テスト緑。
// 本ファイルは発火側の判定だけを固定する。
//
// ★二重持ちにせず GAS の実コードを抽出して評価する（test-furikae-tracker.js と同方式）。
//   コピーを置くと GAS 側を直したときに黙って乖離するため。未実装なら extractFn が throw = RED。

const fs = require('fs');
const path = require('path');
const gas = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = gas.indexOf(sig);
  if (start < 0) throw new Error('コード.js に ' + sig + ' が無い（未実装＝RED）');
  let i = gas.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < gas.length; j++) {
    const c = gas[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return gas.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

const sb = {};
new Function('sb',
  extractFn('_digestPrevYm_') + '\n' +
  extractFn('furikaeImportReminder_') + '\n' +
  'sb._digestPrevYm_ = _digestPrevYm_;' +
  'sb.furikaeImportReminder_ = furikaeImportReminder_;'
)(sb);

const { _digestPrevYm_, furikaeImportReminder_ } = sb;

// ===== テストハーネス =====
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    expected: ' + e + '\n    actual  : ' + a); }
}
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

// ============================================================
console.log('_digestPrevYm_（_digestNextYm_ の鏡写し・年またぎ）');
// ============================================================

eq(_digestPrevYm_('2026-06-15'), '2026-05', '通常月: 2026-06 → 2026-05');
eq(_digestPrevYm_('2026-08-08'), '2026-07', '通常月: 2026-08 → 2026-07（本日基準）');
eq(_digestPrevYm_('2026-01-05'), '2025-12', '★年またぎ: 2026-01 → 2025-12');
eq(_digestPrevYm_('2026-12-31'), '2026-11', '12月: 2026-12 → 2026-11');
eq(_digestPrevYm_('2026-11-01'), '2026-10', '2桁月の維持: 2026-11 → 2026-10');
eq(_digestPrevYm_('2026-10-01'), '2026-09', '★1桁月のゼロ埋め: 2026-10 → 2026-09');
eq(_digestPrevYm_('2026-02-01'), '2026-01', '★1桁月のゼロ埋め: 2026-02 → 2026-01');

// ============================================================
console.log('\nfurikaeImportReminder_（終わるまで方式・null=催促なし）');
// ============================================================

const START = 3;

// --- 1) startDay 前は静観 -------------------------------------------------
eq(furikaeImportReminder_([], '2026-08-01', START), null,
  '発火日前(1日): records空でも催促しない');
eq(furikaeImportReminder_([], '2026-08-02', START), null,
  '発火日前(2日): records空でも催促しない');

// --- 2) 発火日以降・前月データありで沈黙 ----------------------------------
eq(furikaeImportReminder_([{ month: '2026-07', status: '未対応' }], '2026-08-03', START), null,
  '前月の不能レコードあり → 取込済とみなし沈黙');
eq(furikaeImportReminder_(
  [{ month: '2026-07', status: '未対応' }, { month: '2026-07', status: '手続中' }],
  '2026-08-31', START), null,
  '月末でも前月データがあれば沈黙（居座らない）');

// --- 3) 発火日以降・前月データなしで催促 ----------------------------------
const r1 = furikaeImportReminder_([], '2026-08-03', START);
ok(r1 && r1.month === '2026-07', '発火日当日・records空 → 催促（対象月=前月2026-07）');
ok(r1 && typeof r1.message === 'string' && r1.message.indexOf('2026-07') >= 0,
  '催促メッセージに対象月が含まれる');
ok(r1 && r1.message.indexOf('kekka.xls') >= 0,
  '催促メッセージに何をDLするか(kekka.xls)が含まれる');

// 前月以外しか無い場合も催促（探索は常に直前1ヶ月）
const r2 = furikaeImportReminder_(
  [{ month: '2026-06', status: '未対応' }, { month: '2026-05', status: '繰越' }],
  '2026-08-05', START);
ok(r2 && r2.month === '2026-07', '前々月までしか無い → 前月分を催促');

// --- 4) ★マーカーのみでも沈黙（不能0件の月の取込済判定）-------------------
eq(furikaeImportReminder_(
  [{ id: 9, month: '2026-07', isImportMarker: true, status: '回収済',
     name: '(取込済マーカー)', amount: 0, customerId: '' }],
  '2026-08-03', START), null,
  '★センチネル(取込済マーカー)1件だけでも取込済 → 沈黙');

// 回収済ステータスでも月が一致すれば取込済扱い（判定は month のみ・status に依存しない）
eq(furikaeImportReminder_([{ month: '2026-07', status: '回収済' }], '2026-08-03', START), null,
  '前月が全件回収済でも沈黙（判定は月の有無のみ・statusを見ない）');

// --- 5) ★年またぎ（1月発火 → 前年12月を対象）------------------------------
const r3 = furikaeImportReminder_([], '2026-01-05', START);
ok(r3 && r3.month === '2025-12', '★年またぎ: 2026-01-05 → 対象は2025-12を催促');
eq(furikaeImportReminder_([{ month: '2025-12', status: '未対応' }], '2026-01-05', START), null,
  '★年またぎ: 2025-12 のデータがあれば沈黙');
const r3b = furikaeImportReminder_([{ month: '2026-01', status: '未対応' }], '2026-01-05', START);
ok(r3b && r3b.month === '2025-12',
  '★年またぎ: 当月(2026-01)のデータがあっても対象は前年12月 → 催促する');

// --- 6) ★取得失敗で沈黙（社長判断: 誤って黙る方が誤って騒ぐより害が小さい）--
eq(furikaeImportReminder_(null, '2026-08-03', START), null,
  '★records=null（取得失敗） → 催促しない');
eq(furikaeImportReminder_(undefined, '2026-08-03', START), null,
  '★records=undefined（取得失敗） → 催促しない');

// --- 7) 境界・堅牢性 --------------------------------------------------------
eq(furikaeImportReminder_([{ month: '2026-07' }], '2026-08-03', START), null,
  'status を持たない行でも月が一致すれば取込済');
eq(furikaeImportReminder_([{ status: '未対応' }], '2026-08-03', START) === null, false,
  'month を持たない行は取込済の証拠にならない → 催促する');
eq(furikaeImportReminder_([], '2026-08-03', 10), null,
  'startDay=10 なら3日は静観（設定値で調整できる）');
const r4 = furikaeImportReminder_([], '2026-08-10', 10);
ok(r4 && r4.month === '2026-07', 'startDay=10 なら10日から催促');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
