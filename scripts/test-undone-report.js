// 未実施報告（report_undone）純関数のテスト（2026-07-30）
// 対象: gas/yawaragi-board/undone-report-core.js
//   - UNDONE_SHEET / UNDONE_HEADER            … 既存シートの列構成（変更禁止）
//   - undoneNormalizeDateCell_(v)             … Date型/文字列/空 → JST 'yyyy-MM-dd'
//   - undoneBuildRow_(header, obj)            … header順に並べた配列（列ズレ防止）
//   - undoneFindActiveRow_(rows, header, app, date)
//                                             … (app,date) の active 行を1本だけ引く（冪等の芯）
//   - buildUndoneDigestSection_(rows, header, todayStr, days)
//                                             … 朝報告「昨日できなかった業務」。0件なら null
// 実行: node scripts/test-undone-report.js
//
// 設計の背景（社長指示・2026-07-30）:
//   スプレッドシート 1blasas... の TZ は UTC−7（Asia/Tokyo ではない）。実測校正で
//   「セル値 = JST − 16h」。よって Date型セルを素で日付化すると日がずれる。
//   normalize は ambient TZ に依存せず算術で JST(+09:00) へ寄せる（Node/GAS で同一挙動）。
//   シートTZ設定そのものは絶対に変えない（60シート・利用者台帳を含むため別案件）。

const path = require('path');
const {
  UNDONE_SHEET,
  UNDONE_HEADER,
  UNDONE_CLIENT_DATE_TOLERANCE_DAYS,
  undoneNormalizeDateCell_,
  undoneBuildRow_,
  undoneFindActiveRow_,
  undoneDayDiff_,
  undoneIsAcceptableClientDate_,
  buildUndoneDigestSection_
} = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'undone-report-core.js'));

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++; else { fail++; console.error('  [FAIL] ' + label + '  期待=' + e + ' 実際=' + a); }
}

// ===== 既存シートの列構成（追記のみ・列は増やさない・減らさない）=====
eq(UNDONE_SHEET, '未実施報告', 'S1: シート名');
eq(UNDONE_HEADER,
  ['id', 'date', 'app', 'app_label', 'reportedAt', 'status', 'cancelledAt'],
  'S2: 7列・順序固定（本番シートの実測ヘッダと一致）');

// ===== normalize: (a) Date型セル =====
// 実測: 既存1行目の date セル生シリアル 46140.0 ＝ シートTZ(UTC−7)の 2026-04-28 00:00:00。
//       GAS の getValues() はこれを「その瞬間」の Date で返す ＝ 2026-04-28T07:00:00Z。
//       JST では 2026-04-28 16:00 → '2026-04-28'（画面表示と一致すべき）。
eq(undoneNormalizeDateCell_(new Date('2026-04-28T07:00:00Z')), '2026-04-28',
  'a1: Date型・日付のみセル（UTC−7の00:00）→ JSTでも同日');
// 境界値: シートTZの壁時計が 2026-04-28 22:28:11（UTC−7）＝ 2026-04-29T05:28:11Z。
//         UTC−7 で読むと 4/28 だが JST では 4/29。JST を正とする。
eq(undoneNormalizeDateCell_(new Date('2026-04-29T05:28:11Z')), '2026-04-29',
  'a2: Date型・境界値（UTC−7では前日/JSTでは翌日）→ JST側を採る');
// UTC 日付が JST 日付より前になる境界（JST 00:30 は UTC 前日 15:30）
eq(undoneNormalizeDateCell_(new Date('2026-07-29T15:30:00Z')), '2026-07-30',
  'a3: Date型・JST 00:30（UTCでは前日）→ JST日付');
// JST 23:59 は UTC 同日 14:59（日を跨がない）
eq(undoneNormalizeDateCell_(new Date('2026-07-30T14:59:59Z')), '2026-07-30',
  'a4: Date型・JST 23:59 → 同日');

// ===== normalize: (b) 'yyyy-MM-dd' 文字列 =====
eq(undoneNormalizeDateCell_('2026-07-30'), '2026-07-30', 'b1: 日付文字列はそのまま');
eq(undoneNormalizeDateCell_(' 2026-07-30 '), '2026-07-30', 'b2: 前後空白は落とす');

// ===== normalize: (c) '+09:00' 付き ISO 文字列 =====
eq(undoneNormalizeDateCell_('2026-07-30T09:12:33+09:00'), '2026-07-30', 'c1: +09:00付きISO');
eq(undoneNormalizeDateCell_('2026-07-29T23:30:00+09:00'), '2026-07-29',
  'c2: +09:00付きISO・23:30（UTC換算で翌日にしてはいけない）');
eq(undoneNormalizeDateCell_('2026-07-30T00:30:00+09:00'), '2026-07-30',
  'c3: +09:00付きISO・00:30（UTC換算で前日にしてはいけない）');

// ===== normalize: (d) 空セル =====
eq(undoneNormalizeDateCell_(''), '', 'd1: 空文字');
eq(undoneNormalizeDateCell_(null), '', 'd2: null');
eq(undoneNormalizeDateCell_(undefined), '', 'd3: undefined');
eq(undoneNormalizeDateCell_('   '), '', 'd4: 空白のみ');
eq(undoneNormalizeDateCell_('これは日付ではない'), '', 'd5: 解釈不能は空（推測で埋めない）');
eq(undoneNormalizeDateCell_(new Date('invalid')), '', 'd6: Invalid Date は空');

// ===== 行組立: header順に並べる（列ズレ防止・未指定は空文字）=====
eq(undoneBuildRow_(UNDONE_HEADER, {
  id: 'un_1', date: '2026-07-30', app: 'sougei_nisshi', app_label: '送迎日誌',
  reportedAt: '2026-07-30T09:12:33+09:00', status: 'active'
}), ['un_1', '2026-07-30', 'sougei_nisshi', '送迎日誌', '2026-07-30T09:12:33+09:00', 'active', ''],
  'R1: active行（cancelledAt は空）');
// header の順序が変わっても値が追従すること（実シートのヘッダを正とするため）
eq(undoneBuildRow_(['app', 'id'], { id: 'un_2', app: 'oral' }), ['oral', 'un_2'],
  'R2: header順に従う（決め打ちしない）');

// ===== active行の検索（冪等の芯）=====
const H = UNDONE_HEADER;
const rows = [
  // 既存4月行（削除も編集もしない。読めることを保証する）
  ['un_1777440403504', new Date('2026-04-28T07:00:00Z'), 'sougei_nisshi', '送迎日誌',
    '2026-04-29T14:28:11+09:00', 'cancelled', '2026-04-29T14:28:15+09:00'],
  ['un_1777444258098', new Date('2026-04-29T07:00:00Z'), 'sougei_nisshi', '送迎日誌',
    '2026-04-29T15:30:58+09:00', 'active', ''],
  ['un_a', '2026-07-29', 'sougei_nisshi', '送迎日誌', '2026-07-29T09:00:00+09:00', 'active', ''],
  ['un_b', '2026-07-29', 'oral', '口腔記録', '2026-07-29T09:05:00+09:00', 'active', ''],
  ['un_c', '2026-07-28', 'sougei_nisshi', '送迎日誌', '2026-07-28T09:00:00+09:00', 'cancelled',
    '2026-07-28T18:00:00+09:00']
];
eq(undoneFindActiveRow_(rows, H, 'sougei_nisshi', '2026-07-29'), { index: 2, id: 'un_a' },
  'F1: (app,date) の active を引く');
eq(undoneFindActiveRow_(rows, H, 'oral', '2026-07-29'), { index: 3, id: 'un_b' },
  'F2: app が違えば別行（app列は汎用のまま扱う）');
eq(undoneFindActiveRow_(rows, H, 'sougei_nisshi', '2026-07-28'), null,
  'F3: cancelled は active ではない → null');
eq(undoneFindActiveRow_(rows, H, 'sougei_nisshi', '2026-07-27'), null,
  'F4: 該当日なし → null');
eq(undoneFindActiveRow_(rows, H, 'sougei_nisshi', '2026-04-29'), { index: 1, id: 'un_1777444258098' },
  'F5: Date型セルの既存行も引ける（normalize経由）');
eq(undoneFindActiveRow_([], H, 'sougei_nisshi', '2026-07-29'), null, 'F6: 空シート → null');

// ===== 端末日付の受け入れ判定（「今日」の定義が2つに割れるのを止める）=====
// 端末時計が狂うと朝報告に嘘の日付が黙って出るため、±1日を超える食い違いは拒否する。
// 日跨ぎ（施設が翌日／端末が前日）は正当なので潰さない。クランプもしない。
eq(UNDONE_CLIENT_DATE_TOLERANCE_DAYS, 1, 'T0: 許容差は暦日で±1日');

// 日数差（ambient TZ 非依存・暦日）
eq(undoneDayDiff_('2026-07-30', '2026-07-30'), 0, 'T1: 差 0');
eq(undoneDayDiff_('2026-07-31', '2026-07-30'), 1, 'T2: 差 +1');
eq(undoneDayDiff_('2026-07-29', '2026-07-30'), -1, 'T3: 差 -1');
eq(undoneDayDiff_('2026-08-01', '2026-07-30'), 2, 'T4: 差 +2');
eq(undoneDayDiff_('2026-07-28', '2026-07-30'), -2, 'T5: 差 -2');
// 月末・年末・うるう年の跨ぎでも暦日で正しく出る
eq(undoneDayDiff_('2026-08-01', '2026-07-31'), 1, 'T6: 月跨ぎ +1');
eq(undoneDayDiff_('2027-01-01', '2026-12-31'), 1, 'T7: 年跨ぎ +1');
eq(undoneDayDiff_('2028-03-01', '2028-02-29'), 1, 'T8: うるう日跨ぎ +1');
eq(undoneDayDiff_('2026-07-30', '2025-07-30'), 365, 'T9: 差 +365');
eq(undoneDayDiff_('ゴミ', '2026-07-30'), null, 'T10: 解釈不能は null');
eq(undoneDayDiff_('2026-07-30', ''), null, 'T11: 相手が空でも null');

// 採用（-1 / 0 / +1）
eq(undoneIsAcceptableClientDate_('2026-07-29', '2026-07-30'), true, 'T12: -1 は採用');
eq(undoneIsAcceptableClientDate_('2026-07-30', '2026-07-30'), true, 'T13:  0 は採用');
eq(undoneIsAcceptableClientDate_('2026-07-31', '2026-07-30'), true, 'T14: +1 は採用');
// 拒否（-2 / +2 / +30 / -365）
eq(undoneIsAcceptableClientDate_('2026-07-28', '2026-07-30'), false, 'T15: -2 は拒否');
eq(undoneIsAcceptableClientDate_('2026-08-01', '2026-07-30'), false, 'T16: +2 は拒否');
eq(undoneIsAcceptableClientDate_('2026-08-29', '2026-07-30'), false, 'T17: +30 は拒否');
eq(undoneIsAcceptableClientDate_('2025-07-30', '2026-07-30'), false, 'T18: -365 は拒否');
// 解釈不能は「採用しない」（ハンドラ側が serverToday へフォールバックする）
eq(undoneIsAcceptableClientDate_('', '2026-07-30'), false, 'T19: 空は採用しない');
eq(undoneIsAcceptableClientDate_('ゴミ', '2026-07-30'), false, 'T20: 解釈不能は採用しない');
// '+09:00' 付きISOやDate型も normalize を通して比較できる
eq(undoneIsAcceptableClientDate_('2026-07-30T23:30:00+09:00', '2026-07-30'), true,
  'T21: +09:00付きISO（同日）は採用');
eq(undoneIsAcceptableClientDate_(new Date('2026-07-29T07:00:00Z'), '2026-07-30'), true,
  'T22: Date型（前日）は採用');

// ===== 朝報告セクション（0件なら null／新しい順／終わるまで方式）=====
// 並び順の検証は窓を広げて行う（4月行を窓内に入れるため days=200）
eq(buildUndoneDigestSection_(rows, H, '2026-07-30', 200), {
  count: 3,
  items: [
    { date: '2026-07-29', app: 'oral', app_label: '口腔記録' },
    { date: '2026-07-29', app: 'sougei_nisshi', app_label: '送迎日誌' },
    { date: '2026-04-29', app: 'sougei_nisshi', app_label: '送迎日誌' }
  ]
}, 'D1: active のみ・日付降順・同日は app 昇順（決定的）');
// 本番の既定は 14日窓。4月の active 行はここで落ちる（朝報告を過去で埋めない）
eq(buildUndoneDigestSection_(rows, H, '2026-07-30', 14), {
  count: 2,
  items: [
    { date: '2026-07-29', app: 'oral', app_label: '口腔記録' },
    { date: '2026-07-29', app: 'sougei_nisshi', app_label: '送迎日誌' }
  ]
}, 'D1b: days=14（本番既定）→ 窓外の4月行は出さない');
eq(buildUndoneDigestSection_(rows, H, '2026-07-30', 2), {
  count: 2,
  items: [
    { date: '2026-07-29', app: 'oral', app_label: '口腔記録' },
    { date: '2026-07-29', app: 'sougei_nisshi', app_label: '送迎日誌' }
  ]
}, 'D2: days=2 なら 07-29 と 07-30 のみ（4月行は窓外で落ちる）');
eq(buildUndoneDigestSection_(rows, H, '2026-07-30', 1), null,
  'D3: 窓内に active 0件 → null（セクションを出さない）');
eq(buildUndoneDigestSection_([], H, '2026-07-30', 14), null, 'D4: 空シート → null');
eq(buildUndoneDigestSection_(
  [['un_x', '2026-07-30', 'sougei_nisshi', '送迎日誌', '2026-07-30T08:00:00+09:00', 'active', '']],
  H, '2026-07-30', 14),
  { count: 1, items: [{ date: '2026-07-30', app: 'sougei_nisshi', app_label: '送迎日誌' }] },
  'D5: 当日分も出す（cancel されるまで出続ける）');
eq(buildUndoneDigestSection_(
  [['un_y', '2026-08-05', 'sougei_nisshi', '送迎日誌', '2026-08-05T08:00:00+09:00', 'active', '']],
  H, '2026-07-30', 14),
  null, 'D6: 未来日は出さない（窓は today まで）');
// 空セル混入・列不足でも落ちない（部分縮退）
eq(buildUndoneDigestSection_(
  [['un_z', '', 'sougei_nisshi', '送迎日誌', '', 'active', ''], ['', '', '', '', '', '', '']],
  H, '2026-07-30', 14),
  null, 'D7: date が読めない行は無視（例外を投げない）');

console.log('\ntest-undone-report: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
