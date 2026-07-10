// 利用頻度v1.1 純関数層のテスト（Task1: classifyReason + THRESHOLDS + REASON_TABLE）
// 対象: gas/yawaragi-board/usage-frequency.js
// 実行: node scripts/test-usage-frequency.js
// 契約: scratchpad/usage-frequency-contract.md §1 / 設計書 2026-07-09-riyou-hindo-keisan-v1.1-design.md
const path = require('path');
const uf = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'usage-frequency.js'));

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }

const { classifyReason, THRESHOLDS, REASON_TABLE } = uf;

// ===== 定数（設計書リテラル準拠・ドリフト禁止）=====
ok(THRESHOLDS && THRESHOLDS['減らし'] === 70, 'C1: THRESHOLDS.減らし === 70');
ok(THRESHOLDS && THRESHOLDS['増やし'] === 110, 'C2: THRESHOLDS.増やし === 110');
ok(THRESHOLDS && THRESHOLDS['曜日差'] === 20, 'C3: THRESHOLDS.曜日差 === 20');
ok(THRESHOLDS && THRESHOLDS['n下限'] === 6, 'C4: THRESHOLDS.n下限 === 6');
ok(THRESHOLDS && THRESHOLDS['期間'] === 3, 'C5: THRESHOLDS.期間 === 3');

ok(REASON_TABLE && REASON_TABLE['除外'].indexOf('入院') !== -1, 'C6: REASON_TABLE.除外 に 入院');
ok(REASON_TABLE && REASON_TABLE['除外'].indexOf('施設側中止') !== -1, 'C7: REASON_TABLE.除外 に 施設側中止');
ok(REASON_TABLE && REASON_TABLE['除外'].indexOf('長期不在') !== -1, 'C8: REASON_TABLE.除外 に 長期不在');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('体調不良') !== -1, 'C9: REASON_TABLE.カウント に 体調不良');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('本人都合') !== -1, 'C10: REASON_TABLE.カウント に 本人都合');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('家族都合') !== -1, 'C11: REASON_TABLE.カウント に 家族都合');
ok(REASON_TABLE && REASON_TABLE['カウント'].indexOf('通院') !== -1, 'C12: REASON_TABLE.カウント に 通院');

// ===== T7: 分岐（率が下がる側を除外しない）=====
ok(classifyReason('欠席', '体調不良', REASON_TABLE) === 'カウント', 'T7a: 欠席×体調不良 → カウント（率が下がる側・除外しない）');
ok(classifyReason('欠席', '入院', REASON_TABLE) === '除外', 'T7b: 欠席×入院 → 除外');
ok(classifyReason('欠席', '通院', REASON_TABLE) === 'カウント', 'T7c: 欠席×通院 → カウント');
ok(classifyReason('欠席', '施設側中止', REASON_TABLE) === '除外', 'T7d: 欠席×施設側中止 → 除外');
ok(classifyReason('欠席', '長期不在', REASON_TABLE) === '除外', 'T7e: 欠席×長期不在 → 除外');

// ===== T8: 未知理由 → 未分類 / type優先 =====
ok(classifyReason('欠席', '謎の理由', REASON_TABLE) === '未分類', 'T8a: 欠席×謎の理由 → 未分類（黙って率を下げない）');
ok(classifyReason('長期休み', '入院', REASON_TABLE) === '除外', 'T8b: 長期休み×入院 → 除外（type優先）');
ok(classifyReason('長期休み', '体調不良', REASON_TABLE) === '除外', 'T8c: 長期休み×体調不良 → 除外（reason問わずtype優先）');
ok(classifyReason('長期休み', '謎の理由', REASON_TABLE) === '除外', 'T8d: 長期休み×謎の理由 → 除外（reason問わず）');

// ===== 堅牢性の基本ケース =====
ok(classifyReason('欠席', undefined, REASON_TABLE) === '未分類', 'R1: 欠席×undefined理由 → 未分類');
ok(classifyReason('欠席', '', REASON_TABLE) === '未分類', 'R2: 欠席×空文字 → 未分類');
ok(classifyReason('欠席', null, REASON_TABLE) === '未分類', 'R3: 欠席×null → 未分類');
ok(classifyReason(undefined, '入院', REASON_TABLE) === '未分類', 'R4: 未知type(undefined)×入院 → 未分類');
ok(classifyReason('', '入院', REASON_TABLE) === '未分類', 'R5: 空type×入院 → 未分類');
ok(classifyReason('出席', '入院', REASON_TABLE) === '未分類', 'R6: 未知type(出席)×入院 → 未分類');
ok(classifyReason(null, null, REASON_TABLE) === '未分類', 'R7: null×null → 未分類');
ok(classifyReason('長期休み', undefined, REASON_TABLE) === '除外', 'R8: 長期休み×undefined → 除外（type優先はreason無くても成立）');
// 既定テーブル（table省略時は内部REASON_TABLEにフォールバック）
ok(classifyReason('欠席', '体調不良') === 'カウント', 'R9: table省略時も内部既定表で カウント');
ok(classifyReason('欠席', '入院') === '除外', 'R10: table省略時も内部既定表で 除外');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
