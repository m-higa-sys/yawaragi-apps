#!/usr/bin/env node
/*
 * Phase0 検証付き保存: 純関数 _absenceValueMatches_ のテスト
 * shared.js から実コードを抽出して評価（HTML/JS実コード抽出パターン）。
 *
 * _absenceValueMatches_(serverRow, expected):
 *   送った4項目(reason/unit/contact/contactDate)が、action=absencesの
 *   サーバー行(reason/unit/reporter/contactDate)と一致するか判定。
 *   ・contact は サーバー側 reporter と突合（F列=連絡者）。
 *   ・cmNotified(H列)は検証しない。
 *   ・前後空白は無視(trim)。null/undefined/'' は等価(空)。
 *   ・expected に無い項目は判定対象外（部分編集の許容）。
 */
const fs = require('fs');
const path = require('path');

const SHARED = path.join(__dirname, '..', 'shared.js');
const src = fs.readFileSync(SHARED, 'utf8');

// genba.html の検証付きPOSTから「verifyDate 導出式」を実コード抽出（slots/dates/startDate対応の確認用）
const GENBA = path.join(__dirname, '..', 'genba.html');
const genbaSrc = fs.readFileSync(GENBA, 'utf8');
const _vdMatch = genbaSrc.match(/const verifyDate = (data\.dates[^;]+);/);
if (!_vdMatch) throw new Error('genba.html に verifyDate 導出式が見つかりません（修正未適用?）');
// eslint-disable-next-line no-eval
const deriveVerifyDate = eval('(function(data){ return ' + _vdMatch[1] + '; })');

// --- shared.js から _absenceValueMatches_ 関数本体を波括弧対応で抽出 ---
function extractFn(name) {
  const marker = 'function ' + name;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('関数が見つかりません（未実装?）: ' + name);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// 抽出 → eval で関数定義を取り出す
const _absenceValueMatches_ = (function () {
  const fnSrc = extractFn('_absenceValueMatches_');
  // eslint-disable-next-line no-eval
  return eval('(' + fnSrc + ')');
})();
const _pickAbsenceList_ = (function () {
  const fnSrc = extractFn('_pickAbsenceList_');
  // eslint-disable-next-line no-eval
  return eval('(' + fnSrc + ')');
})();

// --- ミニテストランナー ---
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

const base = { date: '2026-06-15', name: '本郷安子', unit: '午前', reason: '通院', reporter: '工藤', contactDate: '2026-06-15', cmNotified: '送信済' };

// 1. 4項目すべて一致 → true
ok('全4項目一致でtrue', _absenceValueMatches_(base, { reason: '通院', unit: '午前', contact: '工藤', contactDate: '2026-06-15' }) === true);

// 2. reasonだけ違う → false（今回のバグ＝理由が反映されてない状態）
ok('reason不一致でfalse', _absenceValueMatches_(base, { reason: '連絡がつかない', unit: '午前', contact: '工藤', contactDate: '2026-06-15' }) === false);

// 3. unitが違う → false
ok('unit不一致でfalse', _absenceValueMatches_(base, { reason: '通院', unit: '午後', contact: '工藤', contactDate: '2026-06-15' }) === false);

// 4. contact(連絡者=reporter)が違う → false
ok('contact不一致でfalse', _absenceValueMatches_(base, { reason: '通院', unit: '午前', contact: '春山', contactDate: '2026-06-15' }) === false);

// 5. contactDateが違う → false
ok('contactDate不一致でfalse', _absenceValueMatches_(base, { reason: '通院', unit: '午前', contact: '工藤', contactDate: '2026-06-16' }) === false);

// 6. 前後空白は無視して一致 → true
ok('前後空白trimで一致', _absenceValueMatches_(base, { reason: ' 通院 ', unit: '午前', contact: ' 工藤', contactDate: '2026-06-15' }) === true);

// 7. cmNotified(H列)は検証しない（expectedに無くてもtrue）
ok('cmNotifiedは検証対象外', _absenceValueMatches_(base, { reason: '通院', unit: '午前', contact: '工藤', contactDate: '2026-06-15' }) === true);

// 8. サーバー行のreporter空 と expected.contact空('') は等価 → true
ok('空連絡者どうしは等価', _absenceValueMatches_({ unit: '午前', reason: '通院', reporter: '', contactDate: '2026-06-15' }, { reason: '通院', unit: '午前', contact: '', contactDate: '2026-06-15' }) === true);

// 9. expectedにcontact未指定なら判定対象外（部分編集）→ 他3項目一致でtrue
ok('未指定項目は対象外', _absenceValueMatches_(base, { reason: '通院', unit: '午前', contactDate: '2026-06-15' }) === true);

// 10. serverRow が null → false（防御）
ok('serverRow nullでfalse', _absenceValueMatches_(null, { reason: '通院' }) === false);

// --- _pickAbsenceList_: action=absences のネスト構造から配列を取り出す ---
// 11. ネスト形 {absences:{absences:[...]}} → 内側配列
ok('ネスト形から配列を取得', JSON.stringify(_pickAbsenceList_({ absences: { absences: [{ name: 'A' }], longTerm: [] } })) === JSON.stringify([{ name: 'A' }]));
// 12. フラット形 {absences:[...]} → そのまま（将来形変更の保険）
ok('フラット形でも配列を取得', JSON.stringify(_pickAbsenceList_({ absences: [{ name: 'B' }] })) === JSON.stringify([{ name: 'B' }]));
// 13. 欠落 → 空配列
ok('absences欠落で空配列', JSON.stringify(_pickAbsenceList_({ success: true })) === JSON.stringify([]));
// 14. null → 空配列（防御）
ok('null入力で空配列', JSON.stringify(_pickAbsenceList_(null)) === JSON.stringify([]));

// --- verifyAbsenceInGAS 修正: live実測ネスト形に対する存在判定（_pickAbsenceList_().some）---
// 旧コードは data.absences.some をオブジェクトに呼んで TypeError でハングしていた。
const liveResp = {
  success: true, date: '2026-06-25',
  absences: { absences: [{ name: '吉田美ち子', date: '2026-06-25', unit: '午前' }], longTerm: [], resumedToday: [] }
};
// 15. ネスト応答で一致 → true（修正で検証が通る）
ok('検証: live nest形で一致true', _pickAbsenceList_(liveResp).some(a => a.name === '吉田美ち子' && a.date === '2026-06-25') === true);
// 16. 不一致 → false（誤検証しない）
ok('検証: 不一致でfalse', _pickAbsenceList_(liveResp).some(a => a.name === '居ない人' && a.date === '2026-06-25') === false);

// --- verifyDate 導出（genba.html 実コードを抽出して評価）---
// 17. slots ペイロード → slots[0].date（今回の本丸）
ok('導出: slots→slots[0].date', deriveVerifyDate({ name: 'X', slots: [{ date: '2026-07-01', unit: '午前' }] }) === '2026-07-01');
// 18. 旧 dates[] → dates[0]（後方互換）
ok('導出: dates→dates[0]', deriveVerifyDate({ name: 'X', dates: ['2026-07-02', '2026-07-03'] }) === '2026-07-02');
// 19. 長期 startDate → startDate（後方互換）
ok('導出: startDate→startDate', deriveVerifyDate({ name: 'X', startDate: '2026-07-04' }) === '2026-07-04');

console.log('\n結果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
