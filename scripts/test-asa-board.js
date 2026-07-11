// 朝ボード判定 純関数テスト
// 実行: node scripts/test-asa-board.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'asa-board-core.js'));

// shared.js から isHyoukaMonth を抽出注入（正準を使う・drift防止。test-cycle-judge.js と同方式）
const fs = require('fs');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('shared.js に ' + name + ' が無い');
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { i++; break; } } }
  return src.slice(start, i);
}
const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
const isHyoukaMonth = new Function(extractFn(sharedSrc, 'isHyoukaMonth') + '; return isHyoukaMonth;')();

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }

// ===== A. abNormalizeName_（名寄せ正規化＝全突合キーの唯一の正） =====
eq(core.abNormalizeName_('山田 太郎'), '山田太郎', 'A1: 半角スペース除去');
eq(core.abNormalizeName_('山田　太郎'), '山田太郎', 'A2: 全角スペース除去');
eq(core.abNormalizeName_('山田太郎 様'), '山田太郎', 'A3: 末尾「様」除去');
eq(core.abNormalizeName_('ﾔﾏﾀﾞ'), 'ヤマダ', 'A4: NFKC半角カナ→全角');
eq(core.abNormalizeName_(null), '', 'A5: null→空文字(落ちない)');

// ===== B. abUniquePresent_（am/pm一意化・出席のみ・正規化キー付与） =====
var att1 = { attendance: {
  am: [{ name: '山田 太郎', status: '出席', care: '要介護1' }, { name: '欠席子', status: '欠席' }],
  pm: [{ name: '山田太郎', status: '出席', care: '要介護1' }, { name: '佐藤花子', status: '出席', care: '要支援2' }]
}};
var pres1 = core.abUniquePresent_(att1);
eq(pres1.length, 2, 'B1: 出席のみ2名（欠席子は除外・山田はam/pm重複排除）');
eq(pres1[0].key, '山田太郎', 'B2: 正規化キー付与（スペース吸収でam/pm同一視）');
ok(pres1.some(function(p){ return p.key === '佐藤花子' && p.care === '要支援2'; }), 'B3: careを保持');
eq(core.abUniquePresent_(null).length, 0, 'B4: null→空（落ちない）');
eq(core.abUniquePresent_({ attendance: { am: [{ name: 'A', status: '欠席' }] } }).length, 0, 'B5: 全欠席→空');
eq(core.abUniquePresent_({ attendance: {
  am: [{ name: '両単位子', status: '欠席', care: '' }],
  pm: [{ name: '両単位子', status: '出席', care: '要介護2' }]
}}).length, 1, 'B6: am欠席/pm出席は出席扱い（どちらかで出席）');
var pres2 = core.abUniquePresent_({ attendance: {
  am: [{ name: '後埋子', status: '出席', care: '' }],
  pm: [{ name: '後埋子', status: '出席', care: '要支援1' }]
}});
ok(pres2.length === 1 && pres2[0].care === '要支援1', 'B7: careは後続occurrenceからbackfillされる');

// ===== C. sokutei純関数（sokutei.html:99-121 の逐語転記・挙動同一） =====
eq(core.sokuteiCycleMonths_('要支援2'), 4, 'C1: 要支援→4ヶ月');
eq(core.sokuteiCycleMonths_('要介護1'), 3, 'C2: 要介護→3ヶ月');
eq(core.sokuteiDueDate_('2026-03-10', '要支援2'), '2026-07-10', 'C3: 実測定日+4ヶ月');
eq(core.sokuteiRemaining_('2026-07-10', '2026-07-01'), 9, 'C4: 残9日');

// ===== D. abMeasureShien_（要支援・事業対象＝前回実測定日+4ヶ月・残日数昇順・未測定最優先） =====
var shienLast = { '佐藤花子': '2026-03-10', '未測定男': '' };
var shienUsers = [
  { name: '佐藤花子', care: '要支援2' },
  { name: '未測定男', care: '事業対象者' }
];
var shienRows = core.abMeasureShien_(shienUsers, shienLast, '2026-07-01');
eq(shienRows[0].key, '未測定男', 'D1: 未測定(実測定日なし)が最優先で先頭');
ok(shienRows[0].unmeasured === true, 'D2: 未測定フラグ');
ok(shienRows[1].key === '佐藤花子' && shienRows[1].remaining === 9, 'D3: 佐藤は残9日');

// 表記ゆれ耐性: 測定日シート側が全角スペース付きでも正規化して突合（§3.4）
var shienRows2 = core.abMeasureShien_(
  [{ name: '山田太郎', care: '要支援2' }],
  { '山田　太郎': '2026-03-10' },  // 全角スペース付きキー
  '2026-07-01'
);
ok(shienRows2[0].unmeasured === false && shienRows2[0].remaining === 9, 'D4: 表記ゆれでも測定済み判定（誤って最優先化しない）');
ok(shienRows2[0].due === '2026-07-10', 'D5: dueも正しく算出');
eq(core.abMeasureShien_(null, null, '2026-07-01').length, 0, 'D6: null入力で空（落ちない）');

// ===== E. abMeasureKaigo_（要介護＝評価月isHyoukaMonth・未実施・月末残日数昇順） =====
// planStart=2026-08 → diff=-1 の 2026-07 が評価月（計画開始前月）
var kaigoUsers = [
  { name: '評価月太郎', category: '要介護1', planStart: '2026-08', planMonths: 3 }, // 7月=評価月
  { name: '対象外子', category: '要介護2', planStart: '2026-09', planMonths: 3 }    // 7月は評価月でない
];
var doneByKey = {}; // 当評価月に sokutei_date 済みの正規化キー集合
var kRows = core.abMeasureKaigo_(kaigoUsers, doneByKey, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows.length, 1, 'E1: 評価月かつ未実施は1名（対象外子は評価月でない）');
eq(kRows[0].key, '評価月太郎', 'E2: 評価月太郎が対象');
eq(kRows[0].remaining, 11, 'E3: 7/20→月末7/31まで残11日');

var kRows2 = core.abMeasureKaigo_(kaigoUsers, { '評価月太郎': true }, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows2.length, 0, 'E4: 当評価月に測定済みなら除外');

// 表記ゆれ耐性: doneByKey のキーが全角スペース付きでも正規化して除外（§3.4）
var kRows3 = core.abMeasureKaigo_(kaigoUsers, { '評価月　太郎': true }, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows3.length, 0, 'E5: doneByKeyの表記ゆれでも正規化して測定済み除外');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
