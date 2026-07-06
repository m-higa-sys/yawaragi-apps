// 本日の欠席連絡ボックス: コア判定 + genba構造証明
// 実行: node scripts/test-genba-kesseki-box.js
const path = require('path');
const fs = require('fs');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'kesseki-box-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// ===== A. kbIsAlreadyNotified_（済み判定＝二重送信ガードの心臓） =====
ok(core.kbIsAlreadyNotified_('送信済') === true,  'A1: 送信済 → 済み');
ok(core.kbIsAlreadyNotified_('電話連絡済') === true, 'A2: 電話連絡済 → 済み');
ok(core.kbIsAlreadyNotified_('手動メール送信済') === true, 'A3: 手動メール送信済 → 済み');
ok(core.kbIsAlreadyNotified_('ケアマネ把握済') === true, 'A4: ケアマネ把握済 → 済み');
ok(core.kbIsAlreadyNotified_('下書き保存') === true, 'A5: 下書き保存 → 済み扱い(再送不可)');
ok(core.kbIsAlreadyNotified_('メール未送信') === false, 'A6: メール未送信 → 未対応');
ok(core.kbIsAlreadyNotified_('要電話連絡') === false, 'A7: 要電話連絡 → 未対応');
ok(core.kbIsAlreadyNotified_('メールなし') === false, 'A8: メールなし → 未対応(電話派として扱う)');
ok(core.kbIsAlreadyNotified_('') === false, 'A9: 空 → 未対応');
ok(core.kbIsAlreadyNotified_(null) === false, 'A10: null → 未対応(落ちない)');

// ===== B. kbFilterTodayTargets_（本日の通常欠席のみ） =====
const abs = [
  { date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-07', name: '明日花子', unit: '午後', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-06', name: '長期次郎', unit: '終日', isLongTerm: true,  cmNotified: '' },
];
const targets = core.kbFilterTodayTargets_(abs, '2026-07-06');
ok(targets.length === 1 && targets[0].name === '当日太郎', 'B1: 当日+通常欠席のみ（明日と長期休みは除外）');
ok(core.kbFilterTodayTargets_(null, '2026-07-06').length === 0, 'B2: null入力で空配列(落ちない)');

// ===== C. kbClassifyCard_（カード分類・初期チェック） =====
const mail = core.kbClassifyCard_({ method: 'メール', email: 'a@b.jp', cmNotified: '' });
ok(mail.kind === 'mail' && mail.done === false && mail.defaultChecked === true, 'C1: メール派未対応 → mail/チェックON');
const mailDone = core.kbClassifyCard_({ method: 'メール', email: 'a@b.jp', cmNotified: '送信済' });
ok(mailDone.kind === 'mail' && mailDone.done === true && mailDone.defaultChecked === false, 'C2: 送信済 → done/チェック不可');
const tel = core.kbClassifyCard_({ method: '電話', email: '', cmNotified: '' });
ok(tel.kind === 'phone' && tel.done === false, 'C3: 電話派 → phone(一括送信対象外)');
const telDone = core.kbClassifyCard_({ method: '電話', email: '', cmNotified: '電話連絡済' });
ok(telDone.done === true, 'C4: 電話連絡済 → done');
const noAddr = core.kbClassifyCard_({ method: 'メール', email: '', cmNotified: '' });
ok(noAddr.kind === 'phone', 'C5: メール派だがメアド無し → 電話フローに倒す(誤送信防止)');
const empty = core.kbClassifyCard_({ method: '', email: 'a@b.jp', cmNotified: '' });
ok(empty.kind === 'phone', 'C6: 連絡手段未設定 → 電話フローに倒す(勝手にメールしない)');

// ===== F. kbAddDaysYMD_（JST安全±日・月/年境界） =====
ok(core.kbAddDaysYMD_('2026-07-31', 1) === '2026-08-01', 'F1: +1 月跨ぎ');
ok(core.kbAddDaysYMD_('2026-07-01', -1) === '2026-06-30', 'F2: -1 月跨ぎ');
ok(core.kbAddDaysYMD_('2026-07-06', 0) === '2026-07-06', 'F3: 0 同日');
ok(core.kbAddDaysYMD_('2025-12-31', 1) === '2026-01-01', 'F4: +1 年跨ぎ');
ok(core.kbAddDaysYMD_('2026-01-01', -1) === '2025-12-31', 'F5: -1 年跨ぎ');

// ===== G. kbJstYmdFromEpoch_（JST当日・深夜/早朝境界＝始業4:30事故の回帰） =====
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 14, 30)) === '2026-07-06', 'G1: 23:30 JST → 当日(07-06)');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 19, 30)) === '2026-07-07', 'G2: 4:30 JST → 当日(07-07)・前日化しない');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6,  3,  0)) === '2026-07-06', 'G3: 12:00 JST → 07-06');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 15,  0)) === '2026-07-07', 'G4: 0:00 JST翌日 → 07-07');
// JST日付繰り上がりの1秒境界（オフバイワンの丸め方向を殺す）
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 14, 59, 59)) === '2026-07-06', 'G5: JST23:59:59 → 07-06');
ok(core.kbJstYmdFromEpoch_(Date.UTC(2026, 6, 6, 15,  0,  0)) === '2026-07-07', 'G6: JST00:00:00 → 07-07');

// ===== H. kbUpcomingAbsenceDates_（機能B: 今日以降の欠席日distinct昇順） =====
const _hAbs = [
  { date: '2026-07-08', name: 'a', isLongTerm: false },
  { date: '2026-07-06', name: 'b', isLongTerm: false },   // 当日は含む
  { date: '2026-07-05', name: 'c', isLongTerm: false },   // 過去は除外
  { date: '2026-07-08', name: 'd', isLongTerm: false },   // 同日重複 → 1つに
  { date: '2026-07-15', name: 'e', isLongTerm: true  },   // 長期休みは除外
  { date: '2026-07-10', name: 'f', isLongTerm: false },
];
const _hOut = core.kbUpcomingAbsenceDates_(_hAbs, '2026-07-06');
ok(JSON.stringify(_hOut) === JSON.stringify(['2026-07-06','2026-07-08','2026-07-10']), 'H1: distinct昇順・過去/長期除外・当日含む');
ok(core.kbUpcomingAbsenceDates_(null, '2026-07-06').length === 0, 'H2: null入力で空配列(落ちない)');
// H3: spec要件「未来方向のみ」を単独で明示（H1の間接証明に頼らない）
const _h3 = core.kbUpcomingAbsenceDates_([
  { date: '2026-07-01', name: 'p', isLongTerm: false },
  { date: '2026-07-05', name: 'q', isLongTerm: false },
], '2026-07-06');
ok(_h3.length === 0, 'H3: 基準日より前の日付は結果に含まれない(未来方向のみ)');
// H4: 長期除外を単独で明示（H1依存にしない）
const _h4 = core.kbUpcomingAbsenceDates_([
  { date: '2026-07-08', name: 'r', isLongTerm: true },
  { date: '2026-07-10', name: 's', isLongTerm: true },
], '2026-07-06');
ok(_h4.length === 0, 'H4: isLongTerm のみ入力 → 空配列(長期除外)');

// ===== I. kbMergeDedupAbs_（④継ぎ目: primary=前進窓GET正本, secondary=月キャッシュ補完） =====
const _iPrimary = [
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '送信済' },   // 正本(最新)
];
const _iSecondary = [
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '' },          // 同一key → 捨てる(primary優先)
  { name: '花子', date: '2026-07-04', unit: '午後', cmNotified: '電話連絡済' }, // primaryに無い → 補完
];
const _iOut = core.kbMergeDedupAbs_(_iPrimary, _iSecondary);
ok(_iOut.length === 2, 'I1: overlapは1つ・非重複は補完で計2件');
const _iTaro = _iOut.filter(function (x) { return x.name === '太郎'; });
ok(_iTaro.length === 1 && _iTaro[0].cmNotified === '送信済', 'I2: overlap日はprimary(前進窓GET)が正本');
ok(_iOut.some(function (x) { return x.name === '花子'; }), 'I3: primaryに無いsecondaryは補完される');
ok(core.kbMergeDedupAbs_(null, null).length === 0, 'I4: 両方null/空で落ちない');
// I5: dedupキーが(name,date,unit)三点である証明。同一人・同一日でも午前/午後は別スロット→畳まない
const _i5 = core.kbMergeDedupAbs_([
  { name: '太郎', date: '2026-07-06', unit: '午前', cmNotified: '送信済' },
  { name: '太郎', date: '2026-07-06', unit: '午後', cmNotified: '' },
], []);
ok(_i5.length === 2, 'I5: 太郎/07-06/午前 と 太郎/07-06/午後 は畳まれず2件(unitを鍵に含む)');

// ===== J. kbIsViewToday_（機能Cガード判定・両者JST yyyy-mm-dd前提） =====
ok(core.kbIsViewToday_('2026-07-06', '2026-07-06') === true,  'J1: 一致 → true');
ok(core.kbIsViewToday_('2026-07-08', '2026-07-06') === false, 'J2: 未来 → false');
ok(core.kbIsViewToday_('2026-07-04', '2026-07-06') === false, 'J3: 過去 → false');
ok(core.kbIsViewToday_('', '2026-07-06') === false, 'J4: 空 → false(落ちない)');
// 型頑健性（例外を投げずfalse・jstTodayStr()が想定外を返した時の保険）
ok(core.kbIsViewToday_(null, '2026-07-06') === false, 'J5: null片方 → false');
ok(core.kbIsViewToday_('2026-07-06', undefined) === false, 'J6: undefined片方 → false');

console.log(`kesseki-box core: ${pass} PASS / ${fail} FAIL`);

// ===== D/E. genba.html 構造証明（Task3/3.5で緑化。ファイル未変更なら赤） =====
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');
function extractFn(name) {
  const sig = 'function ' + name;
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
  let i = html.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}
function tryOk(fn, label) { try { fn(); } catch (e) { fail++; console.error('  [FAIL] ' + label + ' :: ' + e.message); } }

let pass2 = 0, fail2 = 0;
function ok2(cond, label) { if (cond) pass2++; else { fail2++; console.error('  [FAIL] ' + label); } }

// D. ボックスUI + originガード構造
tryOk(() => {
  ok2(html.indexOf('id="kbox-section"') >= 0, 'D1: kboxセクションが存在');
  const kbInitSrc = extractFn('kbInit');
  ok2(/if\s*\(!\w+\)\s*return/.test(kbInitSrc), 'D2: kbInitに要素不在ガード（f774228型の回避）');
  const kbSendSrc = extractFn('kbExecuteSend');
  ok2(kbSendSrc.indexOf('gnbGuardProdWrite') >= 0 &&
      kbSendSrc.indexOf('gnbGuardProdWrite') < kbSendSrc.indexOf('fetch'),
      'D3: 一括送信はfetch前にoriginガード');
  const kbTelSrc = extractFn('kbMarkPhoneDone');
  ok2(kbTelSrc.indexOf('gnbGuardProdWrite') >= 0 &&
      kbTelSrc.indexOf('gnbGuardProdWrite') < kbTelSrc.indexOf('fetch'),
      'D4: 電話済みもfetch前にoriginガード');
  ok2(html.indexOf('id="kbox-summary-modal"') >= 0, 'D5: 送信は最終サマリーモーダル経由');
}, 'D群(ボックスUI)');

// K. 過去+未来ビュー DOM（月グリッド無し・3要素のみ）
tryOk(() => {
  ok2(html.indexOf('id="kbox-datenav"') >= 0, 'K1: 日付送り帯が存在');
  ok2(html.indexOf('id="kbox-prev"') >= 0 && html.indexOf('kbGoDate(-1)') >= 0, 'K2: ◀=kbGoDate(-1)');
  ok2(html.indexOf('id="kbox-next"') >= 0 && html.indexOf('kbGoDate(1)') >= 0, 'K3: ▶=kbGoDate(1)');
  ok2(html.indexOf('id="kbox-datelabel"') >= 0, 'K4: 中央日付ラベルが存在');
  ok2(html.indexOf('id="kbox-viewonly-banner"') >= 0, 'K5: 閲覧のみ帯が存在');
  ok2(html.indexOf('id="kbox-jumpchips"') >= 0, 'K6: ジャンプチップ行が存在');
}, 'K群(日付ビューDOM)');

// L. kbState.viewDate と インライン純関数の存在
tryOk(() => {
  const kbStateSrc = html.slice(html.indexOf('let kbState ='), html.indexOf('let kbState =') + 200);
  ok2(/viewDate\s*:/.test(kbStateSrc), 'L1: kbStateにviewDate');
  ok2(html.indexOf('function kbAddDaysYMD_') >= 0, 'L2: インラインkbAddDaysYMD_');
  ok2(html.indexOf('function kbUpcomingAbsenceDates_') >= 0, 'L3: インラインkbUpcomingAbsenceDates_');
  ok2(html.indexOf('function kbMergeDedupAbs_') >= 0, 'L4: インラインkbMergeDedupAbs_');
  ok2(html.indexOf('function kbIsViewToday_') >= 0, 'L5: インラインkbIsViewToday_');
  ok2(html.indexOf('function kbFilterTodayTargets_') >= 0, 'L6: インラインkbFilterTodayTargets_(日付引数版)');
}, 'L群(状態+インライン純関数)');

// E. 登録折衷案（急ぎトグル）
tryOk(() => {
  ok2(html.indexOf('id="abs-urgent-send"') >= 0, 'E1: 急ぎトグルが存在');
  ok2(/id="abs-urgent-send"[^>]*type="checkbox"|type="checkbox"[^>]*id="abs-urgent-send"/.test(html.replace(/\n/g, ' ')), 'E2: チェックボックス型');
  const submitSrc = extractFn('absSubmit');
  ok2(submitSrc.indexOf('abs-urgent-send') >= 0, 'E3: absSubmitが急ぎトグルを参照');
  const urgentIdx = submitSrc.indexOf('abs-urgent-send');
  const previewIdx = submitSrc.indexOf('absOpenPreview');
  ok2(urgentIdx >= 0 && previewIdx >= 0 && urgentIdx < previewIdx, 'E4: トグル判定がabsOpenPreviewより前');
}, 'E群(急ぎトグル)');

// F. 使い方ヘルプモーダル（指示書④・表示専用）
tryOk(() => {
  ok2(html.indexOf('id="kbox-help-modal"') >= 0, 'F1: 使い方ヘルプモーダルが存在');
  ok2(html.indexOf('kbShowHelp()') >= 0, 'F2: ❓使い方ボタンがkbShowHelpを呼ぶ');
  const helpSrc = extractFn('kbShowHelp');
  ok2(/if\s*\(!\w+\)\s*return/.test(helpSrc), 'F3: kbShowHelpに要素不在ガード（f774228型回避）');
  // 表示専用＝送信/POST/registerを一切呼ばない
  ok2(helpSrc.indexOf('fetch') < 0 && helpSrc.indexOf('POST') < 0 && helpSrc.indexOf('absDoRegister') < 0,
      'F4: kbShowHelpは表示専用（fetch/POST/登録を呼ばない）');
  // 手順テキストの主要見出しが含まれる（静的テキスト埋め込み確認）
  ok2(html.indexOf('本日の欠席連絡の使い方') >= 0, 'F5: 手順テキスト本文が埋め込まれている');
}, 'F群(使い方ヘルプ)');

console.log(`genba構造証明: ${pass2} PASS / ${fail2} FAIL`);

if (fail > 0 || fail2 > 0) process.exit(1);
