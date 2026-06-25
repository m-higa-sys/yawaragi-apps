// scripts/test-range-pattern.js
// range健全化の純関数テスト: absRangePatternSlots（期間∩パターン）/ absRangeSpanDays（28日境界）。
// genba.html から関数本体を抽出して評価（HTML/JS実コード抽出パターン）。
const fs = require('fs');
const path = require('path');
const GENBA = path.join(__dirname, '..', 'genba.html');
const src = fs.readFileSync(GENBA, 'utf8');

function extractFn(name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('関数が見つかりません: ' + name);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// 互いに参照するので同一スコープに束ねて取り出す
const bundle =
  extractFn('gnbNormalizeSlots') + '\n' +
  extractFn('absRangePatternSlots') + '\n' +
  extractFn('absRangeSpanDays') + '\n' +
  'return { absRangePatternSlots: absRangePatternSlots, absRangeSpanDays: absRangeSpanDays, gnbNormalizeSlots: gnbNormalizeSlots };';
// eslint-disable-next-line no-new-func
const API = (new Function(bundle))();
const { absRangePatternSlots, absRangeSpanDays } = API;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } }
const dates = s => s.map(x => x.date + x.unit).join(',');

// 火金午前（伊藤さんパターン）
const PAT_TUEFRI_AM = [{ day: 2, unit: 'am' }, { day: 5, unit: 'am' }];

// 1. 7/1〜7/31 → 火金の午前9日（土日・月水木は出ない）
const r1 = absRangePatternSlots(PAT_TUEFRI_AM, '2026-07-01', '2026-07-31');
ok('火金午前: 7月全体で9日', r1.length === 9);
ok('火金午前: 全て午前', r1.every(s => s.unit === '午前'));
ok('火金午前: 正しい日付', dates(r1) === ['2026-07-03','2026-07-07','2026-07-10','2026-07-14','2026-07-17','2026-07-21','2026-07-24','2026-07-28','2026-07-31'].map(d => d + '午前').join(','));

// 2. 土日のみの期間 → 0日
ok('土日のみは0日', absRangePatternSlots(PAT_TUEFRI_AM, '2026-07-04', '2026-07-05').length === 0);

// 3. 非利用平日のみ（水7/8・木7/9、火金を含まない）→ 0日
ok('非利用平日のみは0日', absRangePatternSlots(PAT_TUEFRI_AM, '2026-07-08', '2026-07-09').length === 0);

// 4. 単週（7/6月〜7/12日）→ 火7/7・金7/10 の2日
ok('1週間で火金2日', dates(absRangePatternSlots(PAT_TUEFRI_AM, '2026-07-06', '2026-07-12')) === '2026-07-07午前,2026-07-10午前');

// 5. 曜日ごと別コマ（火=午前 / 木=午後）→ unitが曜日に追従
const PAT_MIX = [{ day: 2, unit: 'am' }, { day: 4, unit: 'pm' }];
ok('混在コマ: 火午前・木午後', dates(absRangePatternSlots(PAT_MIX, '2026-07-06', '2026-07-12')) === '2026-07-07午前,2026-07-09午後');

// 6. end<start → []
ok('終了<開始は空', absRangePatternSlots(PAT_TUEFRI_AM, '2026-07-31', '2026-07-01').length === 0);

// 7. パターン空 → []（無パターン利用者）
ok('パターン空は空', absRangePatternSlots([], '2026-07-01', '2026-07-31').length === 0);

// 8. 両方午前午後使う人（火 am+pm）→ 同日2コマ
const PAT_TUE_BOTH = [{ day: 2, unit: 'am' }, { day: 2, unit: 'pm' }];
ok('火両コマ: 同日午前午後', dates(absRangePatternSlots(PAT_TUE_BOTH, '2026-07-07', '2026-07-07')) === '2026-07-07午前,2026-07-07午後');

// --- absRangeSpanDays（28日境界）---
ok('span 7/1..7/1=1日', absRangeSpanDays('2026-07-01', '2026-07-01') === 1);
ok('span 7/1..7/27=27日(<28)', absRangeSpanDays('2026-07-01', '2026-07-27') === 27);
ok('span 7/1..7/28=28日(=28)', absRangeSpanDays('2026-07-01', '2026-07-28') === 28);
ok('span 終了<開始=0', absRangeSpanDays('2026-07-28', '2026-07-01') === 0);

console.log('\n結果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
