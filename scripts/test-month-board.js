// 月次ボード判定 純関数テスト（TDD）
// 実行: node scripts/test-month-board.js
// 対象: month-board-core.js（buildMonthBoard）。判定は既存純関数を再利用（二重実装しない）。
const path = require('path');
const fs = require('fs');

const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));
const judges = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-judges.js'));

// shared.js §I の isPlanMonth を抽出注入（正準を使う・test-session-board.js と同方式・drift防止）
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('shared.js に ' + name + ' が無い');
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { i++; break; } } }
  return src.slice(start, i);
}
const sharedSrc = fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8');
const isPlanMonth = new Function(extractFn(sharedSrc, 'isPlanMonth') + '; return isPlanMonth;')();

const mb = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'month-board-core.js'));

// 既存の正本関数を注入（ロジックの二重実装をしない）
const deps = {
  oralCycleAt: judges.oralCycleAt,
  isPlanMonth: isPlanMonth,
  isHyoukaMonth: judges.isHyoukaMonth,
  sokuteiDueDate_: core.sokuteiDueDate_,
  sbNormalizeName_: core.sbNormalizeName_
};

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }

function sec(board, key) {
  var s = board.sections.filter(function (x) { return x.key === key; })[0];
  if (!s) throw new Error('section not found: ' + key);
  return s;
}
function tgt(section, name) {
  return section.targets.filter(function (t) { return t.name === name; })[0];
}
function hasTgt(section, name) { return !!tgt(section, name); }

// ============================================================
// 入力データ（targetMonth = 2026-07 基準）
// ============================================================
const users = [
  // --- 口腔（setsume=口腔評価/計画書 対象。oralPlanStart 2026-05 → 2026-07 は (T-P)%3===2 = setsume） ---
  { userId: 'u-o1', name: 'オ評済', category: '要介護1', oralPlanStart: '2026-05' }, // setsume・済
  { userId: 'u-o2', name: 'オ評未', category: '要介護1', oralPlanStart: '2026-05' }, // setsume・未
  { userId: 'u-o3', name: 'オ非対', category: '要介護1', oralPlanStart: '2026-07' }, // moni1（非対象）

  // --- 個訓（要介護のみ） ---
  { userId: 'u-k1', name: '訓計済', category: '要介護1', planStart: '2026-07', planMonths: 3 }, // isPlanMonth diff0=計画月・済
  { userId: 'u-k2', name: '訓計未', category: '要介護1', planStart: '2026-04', planMonths: 3 }, // isPlanMonth diff3=計画月・未
  { userId: 'u-k3', name: '訓評済', category: '要介護1', planStart: '2026-05', planMonths: 3 }, // isHyoukaMonth diff2=評価月・済（→測定も対象）
  { userId: 'u-k4', name: '訓評未', category: '要介護2', planStart: '2026-08', planMonths: 3 }, // isHyoukaMonth diff-1=評価月・未
  { userId: 'u-k5', name: '訓評短2', category: '要介護1', planStart: '2026-06', planMonths: 2 }, // 短縮pm2: diff1=評価月
  { userId: 'u-k6', name: '訓計短1', category: '要介護1', planStart: '2026-07', planMonths: 1 }, // 短縮pm1: diff0=計画月かつ評価月

  // --- 測定（要支援・事業対象）＝前回測定日+4ヶ月がtargetMonth。名前キーで照合 ---
  { userId: 'u-s1', name: '測支援未', category: '要支援2' }, // prev 2026-03 → due 2026-07 = 対象・未
  { userId: 'u-s2', name: '測支援済', category: '要支援1' }, // prev 2026-03 → due 2026-07 = 対象・当月測定済
  { userId: 'u-s3', name: '測支援非', category: '事業対象' }, // prev 2026-04 → due 2026-08 ≠ 対象外
  { userId: 'u-s4', name: '測支援無', category: '要支援2' }, // 測定履歴なし → 対象外（初回・別扱い）

  // --- 通所（isTsusho=true） ---
  { userId: 'u-t1', name: '通計介護', category: '要介護1', isTsusho: true }, // due 2026-07 → 計画書のみ・済
  { userId: 'u-t2', name: '通評支援', category: '要支援2', isTsusho: true }, // due 2026-07 → 計画書+評価・済
  { userId: 'u-t3', name: '通モニ事', category: '事業対象', isTsusho: true }, // due 2026-10 → モニ・未
  { userId: 'u-t4', name: '通モニ済', category: '要支援1', isTsusho: true }, // due 2026-12 → モニ・済
  { userId: 'u-t5', name: '通満了無', category: '要支援2', isTsusho: true }, // due未設定 → warning
  { userId: 'u-x1', name: '通対象外', category: '要支援2', isTsusho: false } // 通所非対象 → 何もなし・warningも無し
];

const oralRecords = [
  { userId: 'u-o1', name: 'オ評済', houkoku_date: '2026-07-10', plan_date: '2026-07-11' }
];
const kunRecords = [
  { userId: 'u-k1', name: '訓計済', keikaku_date: '2026-07-05' },
  { userId: 'u-k6', name: '訓計短1', keikaku_date: '2026-07-02' },
  { userId: 'u-k3', name: '訓評済', tasseido_date: '2026-07-08' }
];
const sokuteiRecords = [
  { userId: 'u-k3', name: '訓評済', sokutei_date: '2026-07-09' }, // 要介護・当月測定済（userIdキー）
  { userId: 'u-s1', name: '測支援未', sokutei_date: '2026-03-10' }, // 支援・前回のみ
  { userId: 'u-s2', name: '測支援済', sokutei_date: '2026-03-15' }, // 支援・前回
  { userId: 'u-s2', name: '測支援済', sokutei_date: '2026-07-15' }, // 支援・当月測定済（nameキー）
  { userId: 'u-s3', name: '測支援非', sokutei_date: '2026-04-10' }, // 支援・due 2026-08
  // 通所テスト用の要支援/事業対象は「過去測定あり（+4=2026-09で7月非該当）」＝測定は非対象・neverMeasuredにもしない
  { userId: 'u-t2', name: '通評支援', sokutei_date: '2026-05-10' },
  { userId: 'u-t3', name: '通モニ事', sokutei_date: '2026-05-10' },
  { userId: 'u-t4', name: '通モニ済', sokutei_date: '2026-05-10' },
  { userId: 'u-t5', name: '通満了無', sokutei_date: '2026-05-10' },
  { userId: 'u-x1', name: '通対象外', sokutei_date: '2026-05-10' }
];
const tsushoDueMap = {
  'u-t1': '2026-07-31',
  'u-t2': '2026-07-15',
  'u-t3': '2026-10-31',
  'u-t4': '2026-12-31'
  // u-t5 は意図的に欠落 → noDueDate warning
};
const tsushoSendRecords = [
  { userId: 'u-t1', name: '通計介護', plan_date: '2026-07-20' }, // 計画書作成日（済）
  { userId: 'u-t2', name: '通評支援', plan_date: '2026-07-05', pdfSendDate: '2026-07-18' }, // 計画書+評価済
  { userId: 'u-t4', name: '通モニ済', printSendDate: '2026-07-22' } // モニ送付済
];

const input = {
  targetMonth: '2026-07',
  users: users,
  oralRecords: oralRecords,
  kunRecords: kunRecords,
  sokuteiRecords: sokuteiRecords,
  tsushoDueMap: tsushoDueMap,
  tsushoSendRecords: tsushoSendRecords
};

const board = mb.buildMonthBoard(input, deps);

// ===== 0. 外形 =====
eq(board.month, '2026-07', '0-1: month エコー');
eq(board.sections.length, 9, '0-2: 9セクション');
eq(board.sections.map(function (s) { return s.key; }).join(','),
  'oralEval,oralPlan,kunPlan,kunEval,sokuteiKaigo,sokuteiShien,tsushoPlan,tsushoEval,tsushoMoni',
  '0-3: セクション順序');

// ===== 1. 口腔評価（setsume × houkoku_date） =====
var s = sec(board, 'oralEval');
eq(s.label, '口腔評価', '1-0: label');
eq(s.countTarget, 2, '1-1: 対象2（setsumeのみ・moni1除外）');
eq(s.countDone, 1, '1-2: 済1');
eq(s.countUndone, 1, '1-3: 未1');
ok(tgt(s, 'オ評済').done === true && tgt(s, 'オ評済').doneDate === '2026-07-10', '1-4: 済のdoneDate=houkoku_date');
ok(tgt(s, 'オ評未').done === false, '1-5: 未は done=false');
ok(!hasTgt(s, 'オ非対'), '1-6: moni1は非対象');

// ===== 2. 口腔計画書（setsume × plan_date） =====
s = sec(board, 'oralPlan');
eq(s.label, '口腔計画書', '2-0: label');
eq(s.countTarget, 2, '2-1: 対象2');
eq(s.countDone, 1, '2-2: 済1');
ok(tgt(s, 'オ評済').done === true && tgt(s, 'オ評済').doneDate === '2026-07-11', '2-3: 済=plan_date');
ok(tgt(s, 'オ評未').done === false, '2-4: 未');

// ===== 3. 個訓計画書（isPlanMonth × keikaku_date） =====
s = sec(board, 'kunPlan');
eq(s.label, '個訓計画書', '3-0: label');
eq(s.countTarget, 3, '3-1: 対象3（k1 diff0・k2 diff3・k6短縮pm1 diff0）');
eq(s.countDone, 2, '3-2: 済2（k1,k6）');
eq(s.countUndone, 1, '3-3: 未1（k2）');
ok(hasTgt(s, '訓計済') && hasTgt(s, '訓計未') && hasTgt(s, '訓計短1'), '3-4: 対象メンバ');
ok(!hasTgt(s, '訓評済'), '3-5: 評価月のみ(diff2)は計画書非対象');
ok(tgt(s, '訓計済').done === true && tgt(s, '訓計済').doneDate === '2026-07-05', '3-6: doneDate=keikaku_date');

// ===== 4. 個訓評価（isHyoukaMonth × tasseido_date）＋短縮 =====
s = sec(board, 'kunEval');
eq(s.label, '個訓評価', '4-0: label');
eq(s.countTarget, 4, '4-1: 対象4（k3 diff2・k4 diff-1・k5短縮pm2・k6短縮pm1）');
eq(s.countDone, 1, '4-2: 済1（k3）');
ok(hasTgt(s, '訓評短2'), '4-3: 短縮pm2が評価月対象（diff1）');
ok(hasTgt(s, '訓計短1'), '4-4: 短縮pm1が評価月対象（diff0）');
ok(tgt(s, '訓評済').done === true && tgt(s, '訓評済').doneDate === '2026-07-08', '4-5: doneDate=tasseido_date');
ok(tgt(s, '訓評短2').done === false, '4-6: 短縮pm2は未');

// ===== 5. 測定(要介護)（isHyoukaMonth × sokutei_date・短縮反映・userIdキー） =====
s = sec(board, 'sokuteiKaigo');
eq(s.label, '測定(要介護)', '5-0: label');
eq(s.countTarget, 4, '5-1: 対象4（個訓評価月と同一・k3,k4,k5,k6）');
eq(s.countDone, 1, '5-2: 済1（k3 sokutei 2026-07-09）');
ok(hasTgt(s, '訓評短2') && hasTgt(s, '訓計短1'), '5-3: 短縮pm2/pm1が測定対象（短縮反映）');
ok(tgt(s, '訓評済').done === true && tgt(s, '訓評済').doneDate === '2026-07-09', '5-4: doneDate=sokutei_date(userId照合)');
ok(tgt(s, '訓評未').done === false, '5-5: k4未');

// ===== 6. 測定(要支援等)（前回+4ヶ月=targetMonth・nameキー） =====
s = sec(board, 'sokuteiShien');
eq(s.label, '測定(要支援等)', '6-0: label');
eq(s.countTarget, 3, '6-1: 対象3（s1,s2＝前回03月+4=07月・s4＝測定履歴なしも漏れ検知で対象）');
eq(s.countDone, 1, '6-2: 済1（s2は当月測定済）');
ok(hasTgt(s, '測支援未') && tgt(s, '測支援未').done === false, '6-3: s1対象・未');
ok(tgt(s, '測支援済').done === true && tgt(s, '測支援済').doneDate === '2026-07-15', '6-4: s2は当月測定済でも対象に残る（前回=07月前の最大で判定）');
ok(!hasTgt(s, '測支援非'), '6-5: due=08月は非対象');
ok(hasTgt(s, '測支援無') && tgt(s, '測支援無').done === false, '6-6: 測定履歴なしは対象・未実施で必ず出す（A-1・漏れ検知）');

// ===== 7. 通所介護計画書（満了月=targetMonth・全員・plan_date） =====
s = sec(board, 'tsushoPlan');
eq(s.label, '通所介護計画書', '7-0: label');
eq(s.countTarget, 2, '7-1: 対象2（t1,t2＝満了07月）');
eq(s.countDone, 2, '7-2: 済2（plan_date在月）');
ok(hasTgt(s, '通計介護') && hasTgt(s, '通評支援'), '7-3: 介護・支援とも満了月なら対象');
ok(tgt(s, '通計介護').done === true && tgt(s, '通計介護').doneDate === '2026-07-20', '7-4: doneDate=plan_date');
ok(!hasTgt(s, '通満了無'), '7-5: due未設定は対象に入らない（warningへ）');

// ===== 8. 通所評価（満了月 かつ 要支援・事業対象・送付日） =====
s = sec(board, 'tsushoEval');
eq(s.label, '通所評価', '8-0: label');
eq(s.countTarget, 1, '8-1: 対象1（t2＝支援×満了月）');
eq(s.countDone, 1, '8-2: 済1（pdfSendDate在月）');
ok(!hasTgt(s, '通計介護'), '8-3: 要介護は評価非対象');
ok(tgt(s, '通評支援').done === true && tgt(s, '通評支援').doneDate === '2026-07-18', '8-4: doneDate=pdfSendDate');

// ===== 9. 通所モニタリング（非満了月 かつ 要支援・事業対象・送付日） =====
s = sec(board, 'tsushoMoni');
eq(s.label, '通所モニタリング', '9-0: label');
eq(s.countTarget, 2, '9-1: 対象2（t3事業・t4支援＝非満了月）');
eq(s.countDone, 1, '9-2: 済1（t4 printSendDate在月）');
ok(tgt(s, '通モニ済').done === true && tgt(s, '通モニ済').doneDate === '2026-07-22', '9-3: doneDate=printSendDate');
ok(tgt(s, '通モニ事').done === false, '9-4: t3未');
ok(!hasTgt(s, '通評支援'), '9-5: 満了月の支援はモニ非対象（評価へ）');

// ===== 10. warnings（満了日未設定・測定履歴なしは黙って落とさない） =====
eq(board.warnings.length, 2, '10-1: warning2件（noDueDate + neverMeasured）');
ok(board.warnings.some(function (w) { return w.type === 'noDueDate' && w.userId === 'u-t5' && w.name === '通満了無'; }), '10-2: noDueDate(u-t5)');
ok(board.warnings.some(function (w) { return w.type === 'neverMeasured' && w.userId === 'u-s4' && w.name === '測支援無'; }), '10-4: neverMeasured(u-s4・測定履歴なし)');
ok(!board.warnings.some(function (w) { return w.userId === 'u-x1'; }), '10-3: 通所非対象(isTsusho=false)はwarning対象外');

// ===== 12. A-2: 通所モニ/評価の母集団に事業対象を含む =====
var a2 = mb.buildMonthBoard({
  targetMonth: '2026-07',
  users: [
    { userId: 'j1', name: '事業満了', category: '事業対象', isTsusho: true },
    { userId: 'j2', name: '事業非満', category: '事業対象', isTsusho: true }
  ],
  tsushoDueMap: { 'j1': '2026-07-20', 'j2': '2026-09-20' },
  tsushoSendRecords: []
}, deps);
eq(sec(a2, 'tsushoEval').countTarget, 1, '12-1: 事業対象×満了月→通所評価対象');
ok(hasTgt(sec(a2, 'tsushoEval'), '事業満了'), '12-2: 事業対象が評価母集団に含まれる');
eq(sec(a2, 'tsushoMoni').countTarget, 1, '12-3: 事業対象×非満了月→通所モニ対象');
ok(hasTgt(sec(a2, 'tsushoMoni'), '事業非満'), '12-4: 事業対象がモニ母集団に含まれる');

// ===== 11. targetMonth は引数（当月固定にしない） =====
var boardAug = mb.buildMonthBoard(Object.assign({}, input, { targetMonth: '2026-08' }), deps);
eq(boardAug.month, '2026-08', '11-1: 8月指定でmonth=2026-08');
eq(sec(boardAug, 'oralEval').countTarget, 0, '11-2: 8月は口腔setsume対象0（月で結果が変わる＝当月固定でない）');
ok(sec(board, 'oralEval').countTarget !== sec(boardAug, 'oralEval').countTarget, '11-3: 7月と8月で対象数が異なる');

// ============================================================
console.log('');
console.log('month-board-core テスト: ' + pass + ' pass / ' + fail + ' fail  (計 ' + (pass + fail) + ')');
if (fail > 0) process.exit(1);
