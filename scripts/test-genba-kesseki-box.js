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
