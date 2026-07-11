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

const oralSrc = fs.readFileSync(path.join(__dirname, '..', 'oral-plan.html'), 'utf8');
const oralCycleAt = new Function(extractFn(oralSrc, 'oralCycleAt') + '; return oralCycleAt;')();

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

// ===== F. abKoukuMoni_（口腔モニ＝oralCycleAt role!=none かつ 未実施・role仕分けなし） =====
// planStart=2026-07 → 7月は (T-P)%3=0 → role='moni1'。moni1未実施＝moni1_date空。
var oralUsers = [
  { userId: 'モニ太郎', name: 'モニ太郎', planStart: '2026-07', planEnd: '' },
  { userId: '対象外郎', name: '対象外郎', planStart: '2026-07', planEnd: '2026-06' } // planEnd超過→none
];
var oralRecByKey = { 'モニ太郎': { moni1_date: '', moni2_date: '', houkoku_date: '', plan_date: '' } };
var mRows = core.abKoukuMoni_(oralUsers, oralRecByKey, 2026, 7, oralCycleAt);
eq(mRows.length, 1, 'F1: 対象かつ未実施1名（対象外郎はplanEnd超過でnone）');
eq(mRows[0].key, 'モニ太郎', 'F2: モニ太郎が対象');
eq(mRows[0].role, 'moni1', 'F3: role=moni1');

// moni1実施済み（moni1_dateあり）は除外
var oralRecDone = { 'モニ太郎': { moni1_date: '2026-07-05', moni2_date: '', houkoku_date: '', plan_date: '' } };
eq(core.abKoukuMoni_(oralUsers, oralRecDone, 2026, 7, oralCycleAt).length, 0, 'F4: moni1実施済みは除外');

// 表記ゆれ耐性: oralRecByKey のキーが全角スペース付きでも正規化して突合（§3.4）
var oralRecDoneVar = { 'モニ　太郎': { moni1_date: '2026-07-05', moni2_date: '', houkoku_date: '', plan_date: '' } };
eq(core.abKoukuMoni_(oralUsers, oralRecDoneVar, 2026, 7, oralCycleAt).length, 0, 'F5: oralRecの表記ゆれでも正規化して実施済み除外');

// ===== G. abKoukuTaisou_（is_target 明示false以外はtrue） =====
var oralSettings = [
  { name: '体操太郎', is_target: true },
  { name: '既定子', is_target: undefined },   // 未設定→対象
  { name: '除外郎', is_target: false }         // 明示false→非対象
];
var gRows = core.abKoukuTaisou_(oralSettings);
eq(gRows.length, 2, 'G1: 明示false以外は対象（2名）');
ok(gRows.some(function(r){ return r.key === '体操太郎'; }) && gRows.some(function(r){ return r.key === '既定子'; }), 'G2: 太郎と既定子が対象');

// ===== H. abKotan_（介護度「要介護」前方一致） =====
var allUsers = [
  { name: '個訓太郎', category: '要介護3' },
  { name: '要支子', category: '要支援1' },
  { name: '中止郎', category: '要介護1', cancelled: true }
];
var hRows = core.abKotan_(allUsers);
eq(hRows.length, 1, 'H1: 要介護かつ非中止のみ（要支子除外・中止郎除外）');
eq(hRows[0].key, '個訓太郎', 'H2: 個訓太郎が対象');

eq(core.abKoukuTaisou_(null).length, 0, 'G3: null入力で空（落ちない）');
eq(core.abKotan_(null).length, 0, 'H3: null入力で空（落ちない）');
// is_target キー自体が無い（シート行なし＝既定true）も対象になる
eq(core.abKoukuTaisou_([{ name: '行なし子' }]).length, 1, 'G4: is_targetキー欠落は既定で対象');

// ===== I. abBirthday_（今月誕生月・撮影status未完・当日出席フィルタなし） =====
var bdUsers = [
  { name: '誕生太郎', birthday: '7/15' },
  { name: '来月子', birthday: '8/1' },
  { name: '済み郎', birthday: '7/20' }
];
// statusByKey: 正規化キー → { photo, print, give } すべて true なら完了＝除外
var bdStatus = { '済み郎': { photo: true, print: true, give: true } };
var iRows = core.abBirthday_(bdUsers, 7, bdStatus);
eq(iRows.length, 1, 'I1: 今月誕生月かつ未完のみ（来月子は月違い・済み郎は完了）');
eq(iRows[0].key, '誕生太郎', 'I2: 誕生太郎が対象');
eq(iRows[0].day, 15, 'I3: 日を数値で保持');
// status不明（未登録）は未完扱いで残る
eq(core.abBirthday_([{ name: '未登録美', birthday: '7/3' }], 7, {}).length, 1, 'I4: status未登録は未完で残す');
// 表記ゆれ耐性: statusByKey のキーが全角スペース付きでも正規化して完了判定（§3.4）
eq(core.abBirthday_([{ name: '済み郎', birthday: '7/20' }], 7, { '済み　郎': { photo: true, print: true, give: true } }).length, 0, 'I5: statusの表記ゆれでも正規化して完了除外');
eq(core.abBirthday_(null, 7, {}).length, 0, 'I6: null入力で空（落ちない）');

// ===== J. abIntersectPresent_（対象×当日出席の交差・出席順維持） =====
var present = [{ name: '山田太郎', key: '山田太郎' }, { name: '佐藤花子', key: '佐藤花子' }];
var targets = [{ name: '山田 太郎', key: '山田太郎', care: '要介護1' }, { name: '欠席男', key: '欠席男' }];
var inter = core.abIntersectPresent_(targets, present);
eq(inter.length, 1, 'J1: 出席かつ対象は1名（欠席男は出席にいない）');
eq(inter[0].key, '山田太郎', 'J2: 山田太郎が交差');
ok(inter[0].care === '要介護1', 'J3: 対象側の属性を保持');

// ===== K. abResidue_（出席者のうちどの対象キーにも当たらない＝名寄せ不能） =====
var allTargetKeys = { '山田太郎': true };
var residue = core.abResidue_(present, allTargetKeys);
eq(residue.length, 1, 'K1: 佐藤花子はどの対象にも当たらず名寄せ不能');
eq(residue[0].key, '佐藤花子', 'K2: 佐藤花子がresidue');

// ===== L. abBuildBoard_（全業務集約・当日出席交差・residue） =====
var input = {
  year: 2026, month: 7, today: '2026-07-20',
  attendance: { attendance: {
    am: [{ name: '評価月太郎', status: '出席', care: '要介護1' }, { name: 'モニ太郎', status: '出席', care: '要介護1' }],
    pm: [{ name: '佐藤花子', status: '出席', care: '要支援2' }, { name: '謎の人', status: '出席', care: '' }]
  }},
  kaigoUsers: [{ name: '評価月太郎', category: '要介護1', planStart: '2026-08', planMonths: 3 }],
  kaigoDoneByKey: {},
  shienUsers: [{ name: '佐藤花子', care: '要支援2' }],
  shienLastByName: { '佐藤花子': '2026-03-10' },
  oralUsers: [{ userId: 'モニ太郎', name: 'モニ太郎', planStart: '2026-07', planEnd: '' }],
  oralRecByKey: { 'モニ太郎': {} },
  oralSettings: [{ name: 'モニ太郎', is_target: true }],
  allUsers: [{ name: '評価月太郎', category: '要介護1' }],
  bdUsers: [{ name: '評価月太郎', birthday: '7/25' }, { name: '欠席誕生子', birthday: '7/10' }],
  bdStatusByKey: {}
};
var board = core.abBuildBoard_(input, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt });
ok(board.sokutei.length === 2 && board.sokutei[0].key === '評価月太郎' && board.sokutei[1].key === '佐藤花子', 'L1: 測定=要介護(評価月太郎)先頭+要支援(佐藤花子)の2系統統合・順序');
ok(board.koukuMoni.length === 1 && board.koukuMoni[0].key === 'モニ太郎', 'L2: 口腔モニ=モニ太郎');
ok(board.koukuTaisou.length === 1 && board.koukuTaisou[0].key === 'モニ太郎', 'L3: 口腔体操=出席かつis_target(モニ太郎)');
ok(board.kotan.length === 1 && board.kotan[0].key === '評価月太郎', 'L4: 個訓=出席かつ要介護');
ok(board.birthday.length === 2 && board.birthday.some(function(r){ return r.key === '欠席誕生子'; }), 'L5: 誕生日は当日出席フィルタなし=欠席の誕生月該当者も含む(交差されない証明)');
ok(board.residue.some(function(r){ return r.key === '謎の人'; }), 'L6: 謎の人はどの対象にも当たらず名寄せ不能residue');
ok(board.residue.every(function(r){ return r.key !== '欠席誕生子'; }), 'L7: 欠席誕生子は出席者でないのでresidueにも入らない(residueは出席者のみ)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
