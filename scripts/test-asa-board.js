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
ok(shienRows[0].track === 'shien', 'D7: 要支援行にtrack=shien');

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
ok(kRows[0].track === 'kaigo', 'E6: 要介護行にtrack=kaigo');

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

// ===== G. abKoukuTaisou_（明示false以外はtrue・実源getOralTargetUsers_はisTargetを返す） =====
var oralSettings = [
  { name: '体操太郎', isTarget: true },
  { name: '既定子' },                        // フラグ未設定→対象（行なし新規＝既定true）
  { name: '除外郎', isTarget: false }          // 明示false→非対象
];
var gRows = core.abKoukuTaisou_(oralSettings);
eq(gRows.length, 2, 'G1: 明示false以外は対象（2名）');
ok(gRows.some(function(r){ return r.key === '体操太郎'; }) && gRows.some(function(r){ return r.key === '既定子'; }), 'G2: 太郎と既定子が対象');
ok(gRows.every(function(r){ return r.key !== '除外郎'; }), 'G2b: isTarget:false は除外（実データ契約）');

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
ok(board.sokutei[0].track === 'kaigo' && board.sokutei[board.sokutei.length-1].track === 'shien', 'L8: sokutei統合後もtrackで要介護/要支援を判別可能');

// ===== M. abCountWeeklyVisits_（利用曜日→週来所回数・日数ベース） =====
eq(core.abCountWeeklyVisits_('火木'), 2, 'M1: 火木→週2');
eq(core.abCountWeeklyVisits_('月水金'), 3, 'M2: 月水金→週3');
eq(core.abCountWeeklyVisits_('月火水木金'), 5, 'M3: 平日毎日→週5');
eq(core.abCountWeeklyVisits_(''), 0, 'M4: 空→0');
eq(core.abCountWeeklyVisits_(null), 0, 'M5: null→0（落ちない）');

// ===== N. abCountRemainingVisits_（明日〜月末の契約来所日数） =====
// 全曜日指定なら明日〜月末の日数そのもの（曜日非依存で決定的）
eq(core.abCountRemainingVisits_('月火水木金土日', '2026-07-30'), 1, 'N1: 7/30時点・全曜日→残1(7/31)');
eq(core.abCountRemainingVisits_('月火水木金土日', '2026-07-29'), 2, 'N2: 7/29時点・全曜日→残2(7/30,7/31)');
eq(core.abCountRemainingVisits_('月火水木金土日', '2026-07-31'), 0, 'N3: 月末当日→残0');
eq(core.abCountRemainingVisits_('月', '2026-07-31'), 0, 'N4: 月末当日→残0(曜日問わず)');
eq(core.abCountRemainingVisits_('', '2026-07-01'), 0, 'N5: 曜日不明→0');
eq(core.abCountRemainingVisits_(null, '2026-07-01'), 0, 'N6: null→0（落ちない）');
eq(core.abCountRemainingVisits_('火', '2026-07-01'), 4, 'N7: 単一曜日(火)で曜日マッピング検証');
eq(core.abCountRemainingVisits_('月', '2026-07-01'), 4, 'N8: 単一曜日(月)で曜日マッピング検証');

// ===== O. abMeasureUrgency_（加重加算スコア・高いほど先） =====
var W = { chance:1.0, freq:0.6, absence:0.6, unmeasuredBoost:2.0 };
// 週1(週回数1)は週2より頻度項が大きい（残来所日数・欠席を同一化）
var uWk1 = core.abMeasureUrgency_({ weeklyVisits:1, remainingVisits:2, absenceRate:0 }, W);
var uWk2 = core.abMeasureUrgency_({ weeklyVisits:2, remainingVisits:2, absenceRate:0 }, W);
ok(uWk1 > uWk2, 'O1: 週1は週2より高urgency（取り逃しリスク大）');
// 欠席率が高いほど高urgency
var uAbs = core.abMeasureUrgency_({ weeklyVisits:2, remainingVisits:2, absenceRate:0.5 }, W);
ok(uAbs > uWk2, 'O2: 欠席率が高いと加算される');
// 欠損ガード: weeklyVisits<=0 は chance/freq を0（欠席率のみ効く）
var uMiss = core.abMeasureUrgency_({ weeklyVisits:0, remainingVisits:0, absenceRate:0.3 }, W);
ok(Math.abs(uMiss - (0.6*0.3)) < 1e-9, 'O3: 曜日不明はchance/freq=0・欠席率のみ（誤上位化しない）');
// 未測定boostが層内先頭化に効く
var uUn = core.abMeasureUrgency_({ weeklyVisits:2, remainingVisits:2, absenceRate:0, unmeasured:true }, W);
ok(uUn > uWk1, 'O4: 未測定boostが乗る');
// 残来所日数0(今日が最後)はchance最大
var uLast = core.abMeasureUrgency_({ weeklyVisits:3, remainingVisits:0, absenceRate:0 }, W);
var uMany = core.abMeasureUrgency_({ weeklyVisits:3, remainingVisits:5, absenceRate:0 }, W);
ok(uLast > uMany, 'O5: 残来所0(今日が最後)はchance最大で先');

// ===== P. abSokuteiSort_（1プール階層ソート・careLayer→urgency→tiebreak） =====
var pool = [
  { name:'要支援A', key:'要支援A', careLayer:1, weeklyVisits:1, remainingVisits:1, absenceRate:0.4, unmeasured:false },
  { name:'要介護低', key:'要介護低', careLayer:0, weeklyVisits:5, remainingVisits:8, absenceRate:0 },
  { name:'要介護高', key:'要介護高', careLayer:0, weeklyVisits:1, remainingVisits:1, absenceRate:0.5 },
  { name:'要支援未測', key:'要支援未測', careLayer:1, weeklyVisits:2, remainingVisits:3, absenceRate:0, unmeasured:true }
];
var sorted = core.abSokuteiSort_(pool, W);
ok(sorted[0].careLayer === 0 && sorted[1].careLayer === 0, 'P1: 要介護(careLayer0)が全て先頭');
eq(sorted[0].key, '要介護高', 'P2: 要介護内は高リスク(週1・欠席)が先');
eq(sorted[1].key, '要介護低', 'P3: 要介護内は低リスクが後');
ok(sorted[2].careLayer === 1 && sorted[3].careLayer === 1, 'P4: 要支援(careLayer1)が後半');
eq(sorted[2].key, '要支援未測', 'P5: 要支援内は未測定boostで先頭（ただし要介護より下）');
// 非破壊
ok(pool[0].key === '要支援A', 'P6: 入力配列を破壊しない');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
