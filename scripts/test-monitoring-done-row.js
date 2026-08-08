// test-monitoring-done-row.js
// 通所介護計画モニタリング「その行は完了か」の純関数テスト（実コード抽出方式）。
// 対象: monitoringDoneFromRow_（gas/yawaragi-board/コード.js）
// 実行: node scripts/test-monitoring-done-row.js
//
// 仕様（2026-05 の新仕様）: pdfSendDate（列8）または printSendDate（列9）の
// **どちらか一方でも入っていれば完了**。PDFで送っても印刷して渡しても、送付は送付。
//
// なぜテストするか: この判定が壊れても例外は出ず、朝の報告の「未完了N名」が
// 静かにずれるだけで気づけない。仕様そのものなので固定する。
//
// ★二重持ちにせず GAS の実コードを抽出して評価する（test-furikae-tracker.js と同方式）。

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
new Function('sb', extractFn('monitoringDoneFromRow_') + '\nsb.monitoringDoneFromRow_ = monitoringDoneFromRow_;')(sb);
const { monitoringDoneFromRow_ } = sb;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n    expected: ' + expected + '\n    actual  : ' + actual); }
}

// 「モニタリングチェック」シートの1行を模す。
// 列: 0=userId 1=name 2=year 3=month 4=recordDate 5=pdfDate 6=updatedAt
//     7=pdfSendDate 8=printSendDate 9=operator
function row(pdfSend, printSend) {
  return ['u001', '山田太郎', 2026, 8, '2026-08-01', '2026-08-02', '2026-08-02', pdfSend, printSend, '勝又'];
}

console.log('monitoringDoneFromRow_（pdfSendDate か printSendDate のどちらかで完了）');

// --- 1) 両方空 = 未完了 ---------------------------------------------------
eq(monitoringDoneFromRow_(row('', '')), false, '両方空 → 未完了');

// --- 2) 片方だけ入っている = 完了 -----------------------------------------
eq(monitoringDoneFromRow_(row('2026-08-05', '')), true, 'pdfSendDate だけ → 完了');
eq(monitoringDoneFromRow_(row('', '2026-08-05')), true, 'printSendDate だけ → 完了');

// --- 3) 両方入っている = 完了 ---------------------------------------------
eq(monitoringDoneFromRow_(row('2026-08-05', '2026-08-06')), true, '両方あり → 完了');

// --- 4) 空白文字だけは「入っていない」扱い（trim）--------------------------
eq(monitoringDoneFromRow_(row('   ', '')), false, '★半角スペースのみ → 未完了（trimされる）');
eq(monitoringDoneFromRow_(row('', '\t')), false, '★タブのみ → 未完了（trimされる）');
eq(monitoringDoneFromRow_(row('   ', '2026-08-05')), true, '片方が空白でも、もう片方に値があれば完了');

// --- 5) 未入力セルの表現ゆれ（GAS は空セルを '' で返すが念のため）----------
eq(monitoringDoneFromRow_(row(null, null)), false, 'null → 未完了');
eq(monitoringDoneFromRow_(row(undefined, undefined)), false, 'undefined → 未完了');
eq(monitoringDoneFromRow_(row(null, '2026-08-05')), true, '片方 null でももう片方に値があれば完了');

// --- 6) Date オブジェクトが入るケース（シートの日付セルは Date で返る）-----
eq(monitoringDoneFromRow_(row(new Date('2026-08-05T00:00:00Z'), '')), true,
  '★pdfSendDate が Date オブジェクト → 完了（String化して判定される）');
eq(monitoringDoneFromRow_(row('', new Date('2026-08-05T00:00:00Z'))), true,
  '★printSendDate が Date オブジェクト → 完了');

// --- 7) 行そのものが欠けている ---------------------------------------------
eq(monitoringDoneFromRow_(null), false, '行が null → 未完了（落ちない）');
eq(monitoringDoneFromRow_([]), false, '空配列 → 未完了（落ちない）');

// --- 8) 短い行（列が足りない）----------------------------------------------
eq(monitoringDoneFromRow_(['u001', '山田太郎', 2026, 8]), false,
  '列が7列目までしか無い → 未完了（落ちない）');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
