// 週間予定表.html 需給サマリーバー 純関数テスト（jukyuSummary_）
// 実行: node scripts/test-weekly-jukyu-bar.js
// 週間予定表.html から slotSet_/attendsCell_/jukyuSummary_ を抽出して検証（PIIゼロ＝件数のみ）。
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '週間予定表.html'), 'utf8');

function grab(name) {
  const start = html.indexOf('function ' + name);
  if (start < 0) throw new Error('not found: ' + name);
  let i = html.indexOf('{', start), depth = 0, j = i;
  for (; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return html.slice(start, j);
}
const vars = `
var WEEKDAY_CHARS = ['月','火','水','木','金','土','日'];
var SLOT_OF = { am:'午前', pm:'午後' };
var DAYS = ['月','火','水','木','金'];
var MAX = 18;
`;
eval([vars, grab('slotSet_'), grab('attendsCell_'), grab('feedVisible_'), grab('jukyuSummary_')].join('\n'));

let pass = 0, fail = 0;
function eq(m, a, e) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m + '\n    exp ' + E + '\n    act ' + A); } }

console.log('[jukyuSummary_ 空き枠]');
eq('空データ→空き枠180(10セル×18)', jukyuSummary_([], []).空き枠, 180);
eq('全曜日午前午後の在籍1名→10セル埋め→170', jukyuSummary_([{ days: '月火水木金', ampm: '午前午後' }], []).空き枠, 170);
// 複合ampm（宮さん型）＝曜日別パース流用so月午前・木午後の2セルのみ→178（naiveなら誤って4セル減=176）
eq('複合ampm 月午前、木午後→2セルのみ減→178', jukyuSummary_([{ days: '月木', ampm: '月午前、木午後' }], []).空き枠, 178);

console.log('[jukyuSummary_ 見込みバケット（feedVisible_通過後で集計）]');
{
  // 体験は displayName 有り＝可視（姓なし体験はアーカイブ相当で除外されるため）。daicho=[]so同姓除外は無し。
  const feed = [
    { category: '利用決定' },                                    // 開始待ち（姓なしでも体験以外は可視）
    { category: '体験', displayName: '佐藤' }, { category: '利用予定' }, // 体験
    { category: '見学' }, { category: '問い合わせ' }, { category: '保留' }, // 見学
    { category: '空き待ち' }                                     // どのバケットにも入らない
  ];
  const s = jukyuSummary_([], feed);
  eq('開始待ち=利用決定1', s.開始待ち, 1);
  eq('体験=体験1+利用予定1=2', s.体験, 2);
  eq('見学=見学1+問い合わせ1+保留1=3', s.見学, 3);
}

console.log('[★不一致修正: アーカイブ相当(体験・姓なし)はバーにも数えない]');
{
  // 実バグ再現: feed=体験1件・displayName空（グリッド非表示・経営タブもアーカイブ除外）→ バー体験0
  const s = jukyuSummary_([], [{ category: '体験', displayName: '', days: '水', ampm: '午前' }]);
  eq('姓なし体験→体験0（feedVisible_で除外）', s.体験, 0);
  eq('姓なし体験→見学/開始待ちも0', [s.開始待ち, s.見学], [0, 0]);
}

console.log('[台帳同姓の重複はバーにも数えない（グリッドと同基準）]');
{
  // feed の displayName が在籍daichoの姓に含まれる→feedVisible_で除外
  const s = jukyuSummary_([{ days: '月', ampm: '午前', name: '鈴木一郎' }],
    [{ category: '見学', displayName: '鈴木' }]);
  eq('台帳同姓→見学0', s.見学, 0);
}

console.log('[PII非表示＝返りは件数キーのみ]');
{
  const s = jukyuSummary_([{ days: '月', ampm: '午前', name: '山田太郎', kana: 'ヤマダ' }],
    [{ category: '体験', displayName: '佐藤', 予定日: '2026-07-20', name: '佐藤花子' }]);
  eq('キーは4つ(空き枠/開始待ち/体験/見学)のみ', Object.keys(s).sort(), ['体験', '空き枠', '見学', '開始待ち'].sort());
  eq('氏名/displayName/予定日が値に混入しない', JSON.stringify(s).indexOf('山田') < 0 && JSON.stringify(s).indexOf('佐藤') < 0 && JSON.stringify(s).indexOf('2026-07-20') < 0, true);
}

console.log('\n[' + (fail ? 'FAIL' : 'OK') + '] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
