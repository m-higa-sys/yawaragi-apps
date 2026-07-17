// 前回欠席理由バッジ フロント配線の jsdom 回帰テスト
// 対象: genba.html の attRenderUser（実物を抽出して実行）
// 実行: node scripts/test-genba-prev-absent-badge-dom.js
//
// 「バッジが出る/出ない条件」が従来と不変であることも検証する。
// ※テストデータは実在しないダミー名のみを使う（本番データに触れない）。

const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: ['C:/tmp/node_modules', 'C:/tmp'] }));
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name + '(';
  const start = html.indexOf(sig);
  if (start < 0) throw new Error('genba.html に ' + sig + ' が無い（未実装＝RED）');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

// usageAlertMap は同一参照を保ったままテストごとに中身を差し替える
const sandbox = { usageAlertMap: {} };
new Function('sb',
  'const ATT_DAY_NAMES = ["日","月","火","水","木","金","土"];\n' +
  'let attCurrentDate = new Date(2026, 6, 17);\n' +          // 2026-07-17(金) 固定
  'const absLongTermMap = {};\n' +
  'const absResumedTodayList = [];\n' +
  'const usageAlertMap = sb.usageAlertMap;\n' +
  'function usageNormalizeName(n) { return String(n || ""); }\n' +
  'function absContactStatus(c) { return { cls: "", label: "" }; }\n' +
  'function attLookupCmNotified(n, d) { return ""; }\n' +
  extractFn('attFormatDate') + '\n' +
  extractFn('attPrevScheduledDate') + '\n' +
  extractFn('absReasonCategory') + '\n' +
  extractFn('absPrevAbsentView') + '\n' +
  extractFn('attRenderUser') + '\n' +
  'sb.attRenderUser = attRenderUser;'
)(sandbox);
const { attRenderUser, usageAlertMap } = sandbox;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error('  [FAIL] ' + label + '\n    expected: ' + JSON.stringify(expected) + '\n    actual:   ' + JSON.stringify(actual)); }
}

// ダミー利用者「テスト太郎」: 月・水・金 契約。基準日 2026-07-17(金) の前回利用予定日は 2026-07-15(水)。
const DUMMY = 'テスト太郎';
function setup(recentAbsences) {
  usageAlertMap[DUMMY] = { weekdaysRaw: '月・水・金', badge: null, recentAbsences: recentAbsences };
}
// attRenderUser の戻り HTML から前回休みバッジを取り出す（無ければ null）
function badgeOf(status) {
  const out = attRenderUser({ name: DUMMY, status: status || '出席', care: '要介護1' });
  const el = new JSDOM('<div>' + out + '</div>').window.document.querySelector('.att-prev-absent');
  return el ? { text: el.textContent.trim(), style: el.getAttribute('style') } : null;
}

// ----- 理由ごとの表示 -----
setup([{ date: '2026-07-15', dow: '水', unit: '午前', reason: '通院' }]);
eq(badgeOf().text, '🩺 前回休・体調', 'health: 通院 → 体調バッジ');
eq(badgeOf().style, 'background:#FAECE7;color:#993C1D;', 'health: 色');

setup([{ date: '2026-07-15', dow: '水', unit: '午前', reason: '私用' }]);
eq(badgeOf().text, '前回休・私用', 'personal: 私用 → 私用バッジ（アイコンなし）');
eq(badgeOf().style, 'background:#F1EFE8;color:#5F5E5A;', 'personal: 色');

setup([{ date: '2026-07-15', dow: '水', unit: '午前', reason: '' }]);
eq(badgeOf().text, '❓ 前回休・不明', 'unknown: 理由なしの過去データ → 不明バッジ');
eq(badgeOf().style, 'background:#FAEEDA;color:#854F0B;', 'unknown: 色');

setup([{ date: '2026-07-15', dow: '水', unit: '午前', reason: '孫の運動会' }]);
eq(badgeOf().text, '❓ 前回休・不明', 'unknown: 「その他」自由入力 → 不明バッジ');

setup([{ date: '2026-07-15', dow: '水', unit: '午前', reason: '本人の意欲低下' }]);
eq(badgeOf().text, '🩺 前回休・体調', 'health: 本人の意欲低下 → 体調バッジ（社長確定）');

// ----- 既存挙動の不変性（出る/出ない条件は1ミリも変えない）-----
setup([{ date: '2026-07-14', dow: '火', unit: '午前', reason: '通院' }]);
eq(badgeOf(), null, '不変: 前回利用予定日(7/15)以外の欠席ではバッジを出さない');

setup([{ date: '2026-07-15', dow: '水', unit: '午前', reason: '通院' }]);
eq(badgeOf('欠席'), null, '不変: 本人が当日欠席ならバッジを出さない');

setup([]);
eq(badgeOf(), null, '不変: 欠席履歴が空ならバッジを出さない');

delete usageAlertMap[DUMMY];
eq(badgeOf(), null, '不変: 利用率データが無ければバッジを出さない');

// ----- 旧表示が残っていないこと -----
eq(html.indexOf('🌼 前回お休み'), -1, '旧バッジ文言「🌼 前回お休み」が genba.html から消えている');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
