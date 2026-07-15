// セッションボード判定 純関数テスト
// 実行: node scripts/test-session-board.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

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

// ===== A. sbNormalizeName_（名寄せ正規化＝全突合キーの唯一の正） =====
eq(core.sbNormalizeName_('山田 太郎'), '山田太郎', 'A1: 半角スペース除去');
eq(core.sbNormalizeName_('山田　太郎'), '山田太郎', 'A2: 全角スペース除去');
eq(core.sbNormalizeName_('山田太郎 様'), '山田太郎', 'A3: 末尾「様」除去');
eq(core.sbNormalizeName_('ﾔﾏﾀﾞ'), 'ヤマダ', 'A4: NFKC半角カナ→全角');
eq(core.sbNormalizeName_(null), '', 'A5: null→空文字(落ちない)');

// ===== B. sbUniquePresent_（am/pm一意化・出席のみ・正規化キー付与） =====
var att1 = { attendance: {
  am: [{ name: '山田 太郎', status: '出席', care: '要介護1' }, { name: '欠席子', status: '欠席' }],
  pm: [{ name: '山田太郎', status: '出席', care: '要介護1' }, { name: '佐藤花子', status: '出席', care: '要支援2' }]
}};
var pres1 = core.sbUniquePresent_(att1);
eq(pres1.length, 2, 'B1: 出席のみ2名（欠席子は除外・山田はam/pm重複排除）');
eq(pres1[0].key, '山田太郎', 'B2: 正規化キー付与（スペース吸収でam/pm同一視）');
ok(pres1.some(function(p){ return p.key === '佐藤花子' && p.care === '要支援2'; }), 'B3: careを保持');
eq(core.sbUniquePresent_(null).length, 0, 'B4: null→空（落ちない）');
eq(core.sbUniquePresent_({ attendance: { am: [{ name: 'A', status: '欠席' }] } }).length, 0, 'B5: 全欠席→空');
eq(core.sbUniquePresent_({ attendance: {
  am: [{ name: '両単位子', status: '欠席', care: '' }],
  pm: [{ name: '両単位子', status: '出席', care: '要介護2' }]
}}).length, 1, 'B6: am欠席/pm出席は出席扱い（どちらかで出席）');
var pres2 = core.sbUniquePresent_({ attendance: {
  am: [{ name: '後埋子', status: '出席', care: '' }],
  pm: [{ name: '後埋子', status: '出席', care: '要支援1' }]
}});
ok(pres2.length === 1 && pres2[0].care === '要支援1', 'B7: careは後続occurrenceからbackfillされる');

// ===== C. sokutei純関数（sokutei.html:99-121 の逐語転記・挙動同一） =====
eq(core.sokuteiCycleMonths_('要支援2'), 4, 'C1: 要支援→4ヶ月');
eq(core.sokuteiCycleMonths_('要介護1'), 3, 'C2: 要介護→3ヶ月');
eq(core.sokuteiDueDate_('2026-03-10', '要支援2'), '2026-07-10', 'C3: 実測定日+4ヶ月');
eq(core.sokuteiRemaining_('2026-07-10', '2026-07-01'), 9, 'C4: 残9日');

// ===== D. sbMeasureShien_（要支援・事業対象＝前回実測定日+4ヶ月・残日数昇順・未測定最優先） =====
var shienLast = { '佐藤花子': '2026-03-10', '未測定男': '' };
var shienUsers = [
  { name: '佐藤花子', care: '要支援2' },
  { name: '未測定男', care: '事業対象者' }
];
var shienRows = core.sbMeasureShien_(shienUsers, shienLast, '2026-07-01');
var dUn = shienRows.filter(function(r){ return r.key === '未測定男'; })[0];
var dSa = shienRows.filter(function(r){ return r.key === '佐藤花子'; })[0];
ok(dUn && dUn.unmeasured === true, 'D1: 未測定男は未測定フラグ（並替はsbSokuteiSort_）');
ok(dSa && dSa.remaining === 9, 'D2: 佐藤は残9日');
ok(dUn && dUn.careLayer === 1 && dSa && dSa.careLayer === 1, 'D3: 要支援はcareLayer=1');

// 表記ゆれ耐性: 測定日シート側が全角スペース付きでも正規化して突合（§3.4）
var shienRows2 = core.sbMeasureShien_(
  [{ name: '山田太郎', care: '要支援2' }],
  { '山田　太郎': '2026-03-10' },  // 全角スペース付きキー
  '2026-07-01'
);
ok(shienRows2[0].unmeasured === false && shienRows2[0].remaining === 9, 'D4: 表記ゆれでも測定済み判定（誤って最優先化しない）');
ok(shienRows2[0].due === '2026-07-10', 'D5: dueも正しく算出');
eq(core.sbMeasureShien_(null, null, '2026-07-01').length, 0, 'D6: null入力で空（落ちない）');
ok(shienRows.every(function(r){ return r.track === 'shien'; }), 'D7: 全行track=shien');

// ===== E. sbMeasureKaigo_（要介護＝評価月isHyoukaMonth・未実施・月末残日数昇順） =====
// planStart=2026-08 → diff=-1 の 2026-07 が評価月（計画開始前月）
var kaigoUsers = [
  { name: '評価月太郎', category: '要介護1', planStart: '2026-08', planMonths: 3 }, // 7月=評価月
  { name: '対象外子', category: '要介護2', planStart: '2026-09', planMonths: 3 }    // 7月は評価月でない
];
var doneByKey = {}; // 当評価月に sokutei_date 済みの正規化キー集合
var kRows = core.sbMeasureKaigo_(kaigoUsers, doneByKey, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows.length, 1, 'E1: 評価月かつ未実施は1名（対象外子は評価月でない）');
eq(kRows[0].key, '評価月太郎', 'E2: 評価月太郎が対象');
eq(kRows[0].remaining, 11, 'E3: 7/20→月末7/31まで残11日');

var kRows2 = core.sbMeasureKaigo_(kaigoUsers, { '評価月太郎': true }, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows2.length, 1, 'E4: 当評価月に測定済みでも消さず残す（done方式）');
eq(kRows2[0].done, true, 'E4b: 測定済みは done:true');

// 表記ゆれ耐性: doneByKey のキーが全角スペース付きでも正規化して突合（§3.4）
var kRows3 = core.sbMeasureKaigo_(kaigoUsers, { '評価月　太郎': true }, 2026, 7, '2026-07-20', isHyoukaMonth);
eq(kRows3.length, 1, 'E5: doneByKey表記ゆれでも正規化して残す（done方式）');
eq(kRows3[0].done, true, 'E5b: 正規化照合で done:true');
ok(kRows[0].track === 'kaigo', 'E6: 要介護行にtrack=kaigo');
ok(kRows[0].careLayer === 0, 'E7: 要介護行にcareLayer=0');

// ===== F. sbKoukuMoni_（口腔モニ＝oralCycleAt role!=none かつ 未実施・role仕分けなし） =====
// planStart=2026-07 → 7月は (T-P)%3=0 → role='moni1'。moni1未実施＝moni1_date空。
var oralUsers = [
  { userId: 'モニ太郎', name: 'モニ太郎', planStart: '2026-07', planEnd: '' },
  { userId: '対象外郎', name: '対象外郎', planStart: '2026-07', planEnd: '2026-06' } // planEnd超過→none
];
var oralRecByKey = { 'モニ太郎': { moni1_date: '', moni2_date: '', houkoku_date: '', plan_date: '' } };
var mRows = core.sbKoukuMoni_(oralUsers, oralRecByKey, 2026, 7, oralCycleAt);
eq(mRows.length, 1, 'F1: 対象かつ未実施1名（対象外郎はplanEnd超過でnone）');
eq(mRows[0].key, 'モニ太郎', 'F2: モニ太郎が対象');
eq(mRows[0].role, 'moni1', 'F3: role=moni1');

// moni1実施済み（moni1_dateあり）は消さず done:true で残す（done方式）
var oralRecDone = { 'モニ太郎': { moni1_date: '2026-07-05', moni2_date: '', houkoku_date: '', plan_date: '' } };
var f4 = core.sbKoukuMoni_(oralUsers, oralRecDone, 2026, 7, oralCycleAt);
eq(f4.length, 1, 'F4: moni1実施済みでも消さず残す（done方式）');
eq(f4[0].done, true, 'F4b: moni1実施済みは done:true');

// 表記ゆれ耐性: oralRecByKey のキーが全角スペース付きでも正規化して突合（§3.4）
var oralRecDoneVar = { 'モニ　太郎': { moni1_date: '2026-07-05', moni2_date: '', houkoku_date: '', plan_date: '' } };
var f5 = core.sbKoukuMoni_(oralUsers, oralRecDoneVar, 2026, 7, oralCycleAt);
eq(f5.length, 1, 'F5: oralRec表記ゆれでも正規化して done:true（残す）');
eq(f5[0].done, true, 'F5b: 正規化照合で done:true');

// ===== G. sbKoukuTaisou_（明示false以外はtrue・実源getOralTargetUsers_はisTargetを返す） =====
var oralSettings = [
  { name: '体操太郎', isTarget: true },
  { name: '既定子' },                        // フラグ未設定→対象（行なし新規＝既定true）
  { name: '除外郎', isTarget: false }          // 明示false→非対象
];
var gRows = core.sbKoukuTaisou_(oralSettings);
eq(gRows.length, 2, 'G1: 明示false以外は対象（2名）');
ok(gRows.some(function(r){ return r.key === '体操太郎'; }) && gRows.some(function(r){ return r.key === '既定子'; }), 'G2: 太郎と既定子が対象');
ok(gRows.every(function(r){ return r.key !== '除外郎'; }), 'G2b: isTarget:false は除外（実データ契約）');

// ===== H. sbKotan_（介護度「要介護」前方一致） =====
var allUsers = [
  { name: '個訓太郎', category: '要介護3' },
  { name: '要支子', category: '要支援1' },
  { name: '中止郎', category: '要介護1', cancelled: true }
];
var hRows = core.sbKotan_(allUsers);
eq(hRows.length, 1, 'H1: 要介護かつ非中止のみ（要支子除外・中止郎除外）');
eq(hRows[0].key, '個訓太郎', 'H2: 個訓太郎が対象');

eq(core.sbKoukuTaisou_(null).length, 0, 'G3: null入力で空（落ちない）');
eq(core.sbKotan_(null).length, 0, 'H3: null入力で空（落ちない）');
// is_target キー自体が無い（シート行なし＝既定true）も対象になる
eq(core.sbKoukuTaisou_([{ name: '行なし子' }]).length, 1, 'G4: is_targetキー欠落は既定で対象');

// ===== I. sbBirthday_（今月誕生月・撮影status未完・当日出席フィルタなし） =====
var bdUsers = [
  { name: '誕生太郎', birthday: '7/15' },
  { name: '来月子', birthday: '8/1' },
  { name: '済み郎', birthday: '7/20' }
];
// statusByKey: 正規化キー → { photo, print, give } すべて true なら完了＝除外
var bdStatus = { '済み郎': { photo: true, print: true, give: true } };
var iRows = core.sbBirthday_(bdUsers, 7, bdStatus);
eq(iRows.length, 1, 'I1: 今月誕生月かつ未完のみ（来月子は月違い・済み郎は完了）');
eq(iRows[0].key, '誕生太郎', 'I2: 誕生太郎が対象');
eq(iRows[0].day, 15, 'I3: 日を数値で保持');
// status不明（未登録）は未完扱いで残る
eq(core.sbBirthday_([{ name: '未登録美', birthday: '7/3' }], 7, {}).length, 1, 'I4: status未登録は未完で残す');
// 表記ゆれ耐性: statusByKey のキーが全角スペース付きでも正規化して完了判定（§3.4）
eq(core.sbBirthday_([{ name: '済み郎', birthday: '7/20' }], 7, { '済み　郎': { photo: true, print: true, give: true } }).length, 0, 'I5: statusの表記ゆれでも正規化して完了除外');
eq(core.sbBirthday_(null, 7, {}).length, 0, 'I6: null入力で空（落ちない）');

// ===== J. sbIntersectPresent_（対象×当日出席の交差・出席順維持） =====
var present = [{ name: '山田太郎', key: '山田太郎' }, { name: '佐藤花子', key: '佐藤花子' }];
var targets = [{ name: '山田 太郎', key: '山田太郎', care: '要介護1' }, { name: '欠席男', key: '欠席男' }];
var inter = core.sbIntersectPresent_(targets, present);
eq(inter.length, 1, 'J1: 出席かつ対象は1名（欠席男は出席にいない）');
eq(inter[0].key, '山田太郎', 'J2: 山田太郎が交差');
ok(inter[0].care === '要介護1', 'J3: 対象側の属性を保持');

// ===== K. sbResidue_（出席者のうちどの対象キーにも当たらない＝名寄せ不能） =====
var allTargetKeys = { '山田太郎': true };
var residue = core.sbResidue_(present, allTargetKeys);
eq(residue.length, 1, 'K1: 佐藤花子はどの対象にも当たらず名寄せ不能');
eq(residue[0].key, '佐藤花子', 'K2: 佐藤花子がresidue');

// ===== L. sbBuildBoard_（全業務集約・当日出席交差・residue） =====
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
var board = core.sbBuildBoard_(input, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt });
ok(board.sokutei.length === 2 && board.sokutei[0].key === '評価月太郎' && board.sokutei[1].key === '佐藤花子', 'L1: 測定=要介護(評価月太郎)先頭+要支援(佐藤花子)の2系統統合・順序');
ok(board.koukuMoni.length === 1 && board.koukuMoni[0].key === 'モニ太郎', 'L2: 口腔モニ=モニ太郎');
ok(board.koukuTaisou.length === 1 && board.koukuTaisou[0].key === 'モニ太郎', 'L3: 口腔体操=出席かつis_target(モニ太郎)');
ok(board.kotan.length === 1 && board.kotan[0].key === '評価月太郎', 'L4: 個訓=出席かつ要介護');
ok(board.birthday.length === 2 && board.birthday.some(function(r){ return r.key === '欠席誕生子'; }), 'L5: 誕生日は当日出席フィルタなし=欠席の誕生月該当者も含む(交差されない証明)');
ok(board.residue.some(function(r){ return r.key === '謎の人'; }), 'L6: 謎の人はどの対象にも当たらず名寄せ不能residue');
ok(board.residue.every(function(r){ return r.key !== '欠席誕生子'; }), 'L7: 欠席誕生子は出席者でないのでresidueにも入らない(residueは出席者のみ)');
ok(board.sokutei[0].track === 'kaigo' && board.sokutei[board.sokutei.length-1].track === 'shien', 'L8: sokutei統合後もtrackで要介護/要支援を判別可能');

// ===== M. sbCountWeeklyVisits_（利用曜日→週来所回数・日数ベース） =====
eq(core.sbCountWeeklyVisits_('火木'), 2, 'M1: 火木→週2');
eq(core.sbCountWeeklyVisits_('月水金'), 3, 'M2: 月水金→週3');
eq(core.sbCountWeeklyVisits_('月火水木金'), 5, 'M3: 平日毎日→週5');
eq(core.sbCountWeeklyVisits_(''), 0, 'M4: 空→0');
eq(core.sbCountWeeklyVisits_(null), 0, 'M5: null→0（落ちない）');

// ===== N. sbCountRemainingVisits_（明日〜月末の契約来所日数） =====
// 全曜日指定なら明日〜月末の日数そのもの（曜日非依存で決定的）
eq(core.sbCountRemainingVisits_('月火水木金土日', '2026-07-30'), 1, 'N1: 7/30時点・全曜日→残1(7/31)');
eq(core.sbCountRemainingVisits_('月火水木金土日', '2026-07-29'), 2, 'N2: 7/29時点・全曜日→残2(7/30,7/31)');
eq(core.sbCountRemainingVisits_('月火水木金土日', '2026-07-31'), 0, 'N3: 月末当日→残0');
eq(core.sbCountRemainingVisits_('月', '2026-07-31'), 0, 'N4: 月末当日→残0(曜日問わず)');
eq(core.sbCountRemainingVisits_('', '2026-07-01'), 0, 'N5: 曜日不明→0');
eq(core.sbCountRemainingVisits_(null, '2026-07-01'), 0, 'N6: null→0（落ちない）');
eq(core.sbCountRemainingVisits_('火', '2026-07-01'), 4, 'N7: 単一曜日(火)で曜日マッピング検証');
eq(core.sbCountRemainingVisits_('月', '2026-07-01'), 4, 'N8: 単一曜日(月)で曜日マッピング検証');

// ===== O. sbMeasureUrgency_（加重加算スコア・高いほど先） =====
var W = { chance:1.0, freq:0.6, absence:0.6, unmeasuredBoost:2.0 };
// 週1(週回数1)は週2より頻度項が大きい（残来所日数・欠席を同一化）
var uWk1 = core.sbMeasureUrgency_({ weeklyVisits:1, remainingVisits:2, absenceRate:0 }, W);
var uWk2 = core.sbMeasureUrgency_({ weeklyVisits:2, remainingVisits:2, absenceRate:0 }, W);
ok(uWk1 > uWk2, 'O1: 週1は週2より高urgency（取り逃しリスク大）');
// 欠席率が高いほど高urgency
var uAbs = core.sbMeasureUrgency_({ weeklyVisits:2, remainingVisits:2, absenceRate:0.5 }, W);
ok(uAbs > uWk2, 'O2: 欠席率が高いと加算される');
// 欠損ガード: weeklyVisits<=0 は chance/freq を0（欠席率のみ効く）
var uMiss = core.sbMeasureUrgency_({ weeklyVisits:0, remainingVisits:0, absenceRate:0.3 }, W);
ok(Math.abs(uMiss - (0.6*0.3)) < 1e-9, 'O3: 曜日不明はchance/freq=0・欠席率のみ（誤上位化しない）');
// 未測定boostが層内先頭化に効く
var uUn = core.sbMeasureUrgency_({ weeklyVisits:2, remainingVisits:2, absenceRate:0, unmeasured:true }, W);
ok(uUn > uWk1, 'O4: 未測定boostが乗る');
// 残来所日数0(今日が最後)はchance最大
var uLast = core.sbMeasureUrgency_({ weeklyVisits:3, remainingVisits:0, absenceRate:0 }, W);
var uMany = core.sbMeasureUrgency_({ weeklyVisits:3, remainingVisits:5, absenceRate:0 }, W);
ok(uLast > uMany, 'O5: 残来所0(今日が最後)はchance最大で先');

// ===== P. sbSokuteiSort_（1プール階層ソート・careLayer→urgency→tiebreak） =====
var pool = [
  { name:'要支援A', key:'要支援A', careLayer:1, weeklyVisits:1, remainingVisits:1, absenceRate:0.4, unmeasured:false },
  { name:'要介護低', key:'要介護低', careLayer:0, weeklyVisits:5, remainingVisits:8, absenceRate:0 },
  { name:'要介護高', key:'要介護高', careLayer:0, weeklyVisits:1, remainingVisits:1, absenceRate:0.5 },
  { name:'要支援未測', key:'要支援未測', careLayer:1, weeklyVisits:2, remainingVisits:3, absenceRate:0, unmeasured:true }
];
var sorted = core.sbSokuteiSort_(pool, W);
ok(sorted[0].careLayer === 0 && sorted[1].careLayer === 0, 'P1: 要介護(careLayer0)が全て先頭');
eq(sorted[0].key, '要介護高', 'P2: 要介護内は高リスク(週1・欠席)が先');
eq(sorted[1].key, '要介護低', 'P3: 要介護内は低リスクが後');
ok(sorted[2].careLayer === 1 && sorted[3].careLayer === 1, 'P4: 要支援(careLayer1)が後半');
eq(sorted[2].key, '要支援未測', 'P5: 要支援内は未測定boostで先頭（ただし要介護より下）');
// 非破壊
ok(pool[0].key === '要支援A', 'P6: 入力配列を破壊しない');

// ===== Q. sbBuildBoard_ 測定プール優先順位（1プール・careLayer→urgency・要介護>要支援） =====
var qInput = {
  year:2026, month:7, today:'2026-07-06',
  attendance:{ attendance:{ am:[
    {name:'介護低リスク', status:'出席', care:'要介護1'},
    {name:'介護高リスク', status:'出席', care:'要介護1'},
    {name:'支援未測',   status:'出席', care:'要支援2'}
  ], pm:[] }},
  kaigoUsers:[
    {name:'介護低リスク', category:'要介護1', planStart:'2026-08', planMonths:3, days:'月火水木金'},
    {name:'介護高リスク', category:'要介護1', planStart:'2026-08', planMonths:3, days:'月'}
  ],
  kaigoDoneByKey:{},
  shienUsers:[{name:'支援未測', care:'要支援2', days:'火木'}],
  shienLastByName:{},
  usageByKey:{ '介護高リスク':0.5 },
  oralUsers:[], oralRecByKey:{}, oralSettings:[], allUsers:[], bdUsers:[], bdStatusByKey:{}
};
var qb = core.sbBuildBoard_(qInput, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt });
eq(qb.sokutei.length, 3, 'Q1: 測定プール3名（要介護2＋要支援1）');
eq(qb.sokutei[0].key, '介護高リスク', 'Q2: 要介護の高リスク(週1・欠席0.5)が先頭');
eq(qb.sokutei[1].key, '介護低リスク', 'Q3: 要介護の低リスク(週5)が次');
eq(qb.sokutei[2].key, '支援未測', 'Q4: 要支援は最後尾（careLayerで要介護より下）');
ok(qb.sokutei[0].careLayer === 0 && qb.sokutei[2].careLayer === 1, 'Q5: careLayerで層分離');

// ===== R. session帰属（AM/PM二分・衝突検出・§2.5）1日2単位制so'both'不在 =====
// R1-R2: sbUniquePresent_ が各出席者に session:'am'|'pm' を付与
var attR = { attendance: {
  am: [{ name: '午前男', status: '出席', care: '要介護1' }, { name: '午前欠席子', status: '欠席' }],
  pm: [{ name: '午後子', status: '出席', care: '要支援2' }]
}};
var presR = core.sbUniquePresent_(attR);
var rZen = presR.filter(function(p){ return p.key==='午前男'; })[0];
var rGo  = presR.filter(function(p){ return p.key==='午後子'; })[0];
ok(rZen && rZen.session==='am', 'R1: 午前のみ出席→session=am');
ok(rGo && rGo.session==='pm', 'R2: 午後のみ出席→session=pm');
// R3-R4: am欠席/pm出席は出席側(pm)に帰属・衝突でない
var presR2 = core.sbUniquePresent_({ attendance: {
  am: [{ name: '両単位子', status: '欠席', care: '' }],
  pm: [{ name: '両単位子', status: '出席', care: '要介護2' }]
}});
ok(presR2.length===1 && presR2[0].session==='pm', 'R3: am欠席/pm出席→session=pm');
ok(!presR2[0].conflict, 'R4: 片枠のみ出席は衝突でない（conflict無し）');
// R5-R7: 同一正規化キーがam/pm両方「出席」＝1日2単位制ではあり得ない異常
var presR3 = core.sbUniquePresent_({ attendance: {
  am: [{ name: '衝突 太郎', status: '出席', care: '要介護1' }],
  pm: [{ name: '衝突太郎', status: '出席', care: '要支援2' }]  // 正規化後同一キー
}});
ok(presR3.length===1, 'R5: 衝突キーは1行に畳む（増殖させず二重カウント防止）');
ok(presR3[0].session==='am', 'R6: 衝突は決定的にamへ割当（業務から落とさない）');
ok(presR3[0].conflict===true, 'R7: 衝突はconflict:trueで異常フラグ');
// R8-R10: sbIntersectPresent_ が出席者のsessionを業務hit行へ載せる（順序保持・非破壊）
var tgtR = [{ name:'午前男', key:'午前男', care:'要介護1' }, { name:'午後子', key:'午後子', care:'要支援2' }];
var interR = core.sbIntersectPresent_(tgtR, presR);
ok(interR.length===2 && interR[0].session==='am' && interR[1].session==='pm', 'R8: hit行にsessionが載る');
ok(interR[0].care==='要介護1', 'R9: 交差でtarget属性も保持');
ok(tgtR[0].session===undefined, 'R10: 元target行を破壊しない');
// R11-R18: sbBuildBoard_ の presentAm/presentPm・恒等・行session・residue session・ampmConflict
var inR = {
  year:2026, month:7, today:'2026-07-20',
  attendance:{ attendance:{
    am:[{name:'評価月太郎', status:'出席', care:'要介護1'}],
    pm:[{name:'佐藤花子', status:'出席', care:'要支援2'}, {name:'謎の人', status:'出席', care:''}]
  }},
  kaigoUsers:[{name:'評価月太郎', category:'要介護1', planStart:'2026-08', planMonths:3, days:'月'}],
  kaigoDoneByKey:{}, shienUsers:[{name:'佐藤花子', care:'要支援2', days:'火木'}],
  shienLastByName:{'佐藤花子':'2026-03-10'}, usageByKey:{},
  oralUsers:[], oralRecByKey:{}, oralSettings:[], allUsers:[{name:'評価月太郎', category:'要介護1'}],
  bdUsers:[], bdStatusByKey:{}
};
var bR = core.sbBuildBoard_(inR, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt });
eq(bR.presentAm, 1, 'R11: presentAm=1（評価月太郎）');
eq(bR.presentPm, 2, 'R12: presentPm=2（佐藤花子・謎の人）');
eq(bR.presentAm + bR.presentPm, bR.presentCount, 'R13: presentAm+presentPm=presentCount 恒等');
ok(bR.sokutei.length>0 && bR.sokutei.every(function(r){ return r.session==='am'||r.session==='pm'; }), 'R14: 測定行は全てsessionを持つ');
var rKaigo = bR.sokutei.filter(function(r){ return r.key==='評価月太郎'; })[0];
var rShien = bR.sokutei.filter(function(r){ return r.key==='佐藤花子'; })[0];
ok(rKaigo && rKaigo.session==='am', 'R15: 評価月太郎(am出席)→session=am');
ok(rShien && rShien.session==='pm', 'R16: 佐藤花子(pm出席)→session=pm');
ok(Array.isArray(bR.ampmConflict) && bR.ampmConflict.length===0, 'R17: 衝突なしならampmConflict空配列');
ok(bR.residue.some(function(r){ return r.key==='謎の人' && r.session==='pm'; }), 'R18: residue行にもsession');
// R19-R20: 衝突ありのsbBuildBoard_は1名カウント＋ampmConflictに名指し可視化
var bRc = core.sbBuildBoard_({
  year:2026, month:7, today:'2026-07-20',
  attendance:{ attendance:{
    am:[{name:'衝突太郎', status:'出席', care:'要介護1'}],
    pm:[{name:'衝突　太郎', status:'出席', care:'要介護1'}]
  }},
  kaigoUsers:[], kaigoDoneByKey:{}, shienUsers:[], shienLastByName:{}, usageByKey:{},
  oralUsers:[], oralRecByKey:{}, oralSettings:[], allUsers:[], bdUsers:[], bdStatusByKey:{}
}, { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt });
eq(bRc.presentCount, 1, 'R19: 衝突キーは1名としてカウント（二重にしない）');
ok(bRc.ampmConflict.length===1 && bRc.ampmConflict[0].key==='衝突太郎', 'R20: 衝突はampmConflictに名指し可視化');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
