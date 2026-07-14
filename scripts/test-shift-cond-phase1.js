// Phase1 希望条件 純関数テスト（condRowToObj_ / condBuildRow_）
// GAS依存(Utilities)はスタブ化してNodeで実測する。
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'gas', 'shift-kibou', 'コード.js');
const src = fs.readFileSync(SRC, 'utf8');

// --- 関数本体をブレースマッチで抽出 ---
function extractFn(name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) throw new Error('関数が見つからない: ' + name);
  let depth = 0, seen = false, i = start;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seen = true; }
    else if (src[i] === '}') { depth--; if (seen && depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// --- GASスタブ ---
const Utilities = {
  formatDate: (d, tz, fmt) => {
    const yy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${yy}/${mm}/${dd}`;
  }
};

// 抽出した関数を有効化
const factory = new Function('Utilities', extractFn('condRowToObj_') + '\n' + extractFn('condBuildRow_') + '\nreturn { condRowToObj_, condBuildRow_ };');
const { condRowToObj_, condBuildRow_ } = factory(Utilities);

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✅ ' + msg); }
  else { fail++; console.log('  ❌ ' + msg + '\n     期待: ' + e + '\n     実際: ' + a); }
}

console.log('=== condRowToObj_：旧行（A〜Fのみ・G以降undefined）は安全側フォールバック ===');
const oldRow = ['山田', '連続3日は避けたい', new Date(2026, 4, 1), '承認済み', 'OKです', new Date(2026, 4, 2)];
const o = condRowToObj_(oldRow, 3);
eq(o.staff, '山田', 'staff');
eq(o.content, '連続3日は避けたい', 'content');
eq(o.status, '承認済み', 'status');
eq(o.req_id, '', 'req_id 旧行=空');
eq(o.type, 'free', 'type 既定=free');
eq(o.scope, '永久', 'scope 既定=永久');
eq(o.strength, '希望', 'strength 既定=希望');
eq(o.label, '連続3日は避けたい', 'label 未設定→content流用');
eq(o.id, 3, 'id=行index');

console.log('=== condRowToObj_：新行（G〜M入り）は正しくマッピング ===');
const newRow = ['佐藤', '本文', new Date(2026,4,1), '未確認', '', '', 'REQ-1', 'dayoff', '{"d":3}', '当月', '2026-08', '固定休', '必須'];
const n = condRowToObj_(newRow, 5);
eq(n.req_id, 'REQ-1', 'req_id');
eq(n.type, 'dayoff', 'type');
eq(n.params, '{"d":3}', 'params');
eq(n.scope, '当月', 'scope');
eq(n.targetMonth, '2026-08', 'targetMonth');
eq(n.label, '固定休', 'label');
eq(n.strength, '必須', 'strength');

console.log('=== condBuildRow_：A〜M(13列)を組み立て・既定値 ===');
const now = new Date(2026, 6, 14);
const row = condBuildRow_({ staff: '田中', content: '早番希望', type: 'shift', params: 'AM' }, 'REQ-9', now);
eq(row.length >= 13, true, '13列以上');
eq(row[0], '田中', 'A=staff');
eq(row[3], '未確認', 'D=status既定');
eq(row[6], 'REQ-9', 'G=req_id');
eq(row[7], 'shift', 'H=type');
eq(row[8], 'AM', 'I=params');

console.log('=== labelフォールバック（content無し→label使用） ===');
const row2 = condBuildRow_({ staff: '鈴木', label: '固定', type: 'free' }, 'REQ-10', now);
eq(row2[0], '鈴木', 'A=staff');
eq(!!row2[1], true, 'B=content/label が空でない');

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
