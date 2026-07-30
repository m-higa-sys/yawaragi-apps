// 個別機能訓練 1ヶ月1列・口腔式バッジ 純関数テスト（HTMLインライン関数を抽出注入・drift防止）
// 実行: node scripts/test-kobetsu-grid-badge.js
// 対象:
//   kbPlanBadges(rec) … 計画月ノードのバッジ配列 [計画/測定]（plan緑）
//   kbEvalBadges(rec) … 評価月ノードのバッジ配列 [評価]（plan緑）
//   ★2026-07-30: 「提出」（ケアマネ送付）は個訓アプリの管轄外になったので外した。
//     送付は ケアマネ送付チェックリスト.html の担当。kbBadgeHtml の submit(青) は残置。
//   kbBadgeHtml(badge) … バッジ1個のHTML（済の色2系統: plan=緑 / submit=青、未=赤）
const fs = require('fs');
const path = require('path');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('個別機能訓練計画書チェック.html に ' + name + ' が無い');
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) { i++; break; } } }
  return src.slice(start, i);
}
const htmlSrc = fs.readFileSync(path.join(__dirname, '..', '個別機能訓練計画書チェック.html'), 'utf8');
// kbPlanBadges/kbEvalBadges の依存ヘルパ
// 2026-07-30: 測定を2ソースの和で見るため kbPickSokuteiDate を追加（kbPlanBadges が呼ぶ）
const helper = extractFn(htmlSrc, 'kbBadgeObj') + '\n' + extractFn(htmlSrc, 'kbPickSokuteiDate') + '\n';
const kbPlanBadges = new Function(helper + extractFn(htmlSrc, 'kbPlanBadges') + '; return kbPlanBadges;')();
const kbEvalBadges = new Function(helper + extractFn(htmlSrc, 'kbEvalBadges') + '; return kbEvalBadges;')();
const kbBadgeHtml = new Function(
  extractFn(htmlSrc, 'formatMD') + '\n' + extractFn(htmlSrc, 'escapeHtml') + '\n'
  + extractFn(htmlSrc, 'kbBadgeHtml') + '; return kbBadgeHtml;')();

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }
function find(arr, label) { return arr.find(x => x.label === label); }

// ===== A. kbPlanBadges（計画/測定） =====
var pa0 = kbPlanBadges({});
eq(pa0.length, 2, 'A0: 計画バッジは2個(計画/測定)');
eq(find(pa0, '計画').state, 'todo', 'A1: 計画=未(空)');
eq(find(pa0, '測定').state, 'todo', 'A1b: 測定=未(空)');
eq(find(pa0, '提出'), undefined, 'A1c: ★提出バッジは無い（送付アプリの担当）');
eq(find(pa0, '計画').kind, 'plan', 'A2: 計画のkind=plan(緑)');
eq(find(pa0, '測定').kind, 'plan', 'A2b: 測定のkind=plan(緑)');

var pa1 = kbPlanBadges({ keikaku_date: '2026-07-02', sokutei_date: '2026-07-03', keikaku_sent_date: '2026-07-09' });
eq(find(pa1, '計画').state, 'done', 'A3: 計画=済');
eq(find(pa1, '計画').date, '2026-07-02', 'A3b: 計画の日付');
eq(find(pa1, '測定').state, 'done', 'A3c: 測定=済(sokutei_date)');
eq(pa1.length, 2, 'A3d: ★送付日が入っていてもバッジは2個のまま');

var pa2 = kbPlanBadges({ keikaku_date: '2026-07-02' });
eq(find(pa2, '計画').state, 'done', 'A4: 計画のみ済');
eq(find(pa2, '測定').state, 'todo', 'A4b: 測定=未');

// ===== B. kbEvalBadges（評価） =====
var eb0 = kbEvalBadges({});
eq(eb0.length, 1, 'B0: 評価バッジは1個(評価)');
eq(find(eb0, '提出'), undefined, 'B1: ★提出バッジは無い（送付アプリの担当）');
eq(find(eb0, '評価').state, 'todo', 'B1b: 評価=未');
eq(find(eb0, '評価').kind, 'plan', 'B2b: 評価のkind=plan(緑)');

eq(kbEvalBadges({ hyouka_pdf_date: '2026-07-09' }).length, 1, 'B3: ★PDF送付日があってもバッジは評価1個');
eq(find(kbEvalBadges({ hyouka_print_date: '2026-07-10' }), '評価').state, 'todo', 'B3b: ★印刷送付日は評価の済判定に影響しない');
var eb1 = kbEvalBadges({ hyouka_pdf_date: '2026-07-09', tasseido_date: '2026-07-02' });
eq(find(eb1, '評価').state, 'done', 'B4: 評価=済(tasseido_date)');
eq(find(eb1, '評価').date, '2026-07-02', 'B4b: 評価の日付=tasseido_date');

// ===== C. kbBadgeHtml（色2系統・追加指示3） =====
var htmlTodo = kbBadgeHtml({ label: '提出', state: 'todo', date: '', kind: 'submit' });
ok(htmlTodo.indexOf('#ffebee') >= 0, 'C1: 未=背景#ffebee(赤)');
ok(htmlTodo.indexOf('#c53030') >= 0, 'C1b: 未=文字#c53030');
ok(htmlTodo.indexOf('#ef9a9a') >= 0, 'C1c: 未=枠#ef9a9a');
ok(/未/.test(htmlTodo), 'C1d: 未の表示テキスト「未」');

var htmlPlanDone = kbBadgeHtml({ label: '計画', state: 'done', date: '2026-07-02', kind: 'plan' });
ok(htmlPlanDone.indexOf('#e8f5e9') >= 0, 'C2: 計画済=背景#e8f5e9(緑)');
ok(htmlPlanDone.indexOf('#2e7d32') >= 0, 'C2b: 計画済=文字#2e7d32');
ok(htmlPlanDone.indexOf('#66bb6a') >= 0, 'C2c: 計画済=枠#66bb6a');
ok(htmlPlanDone.indexOf('✓') >= 0 && htmlPlanDone.indexOf('7/2') >= 0, 'C2d: 済=✓+formatMD(7/2)');

var htmlSubmitDone = kbBadgeHtml({ label: '提出', state: 'done', date: '2026-07-09', kind: 'submit' });
ok(htmlSubmitDone.indexOf('#e3f2fd') >= 0, 'C3: 提出済=背景#e3f2fd(青)');
ok(htmlSubmitDone.indexOf('#0d47a1') >= 0, 'C3b: 提出済=文字#0d47a1');
ok(htmlSubmitDone.indexOf('#e8f5e9') < 0, 'C3c: 提出済は緑を使わない(青系のみ)');
ok(htmlSubmitDone.indexOf('7/9') >= 0, 'C3d: 提出済=✓+formatMD(7/9)');

// 未はkindによらず全て赤（submit未でも赤）
var htmlSubmitTodo = kbBadgeHtml({ label: '提出', state: 'todo', date: '', kind: 'submit' });
ok(htmlSubmitTodo.indexOf('#e3f2fd') < 0, 'C4: submit未は青にしない(赤)');
ok(htmlSubmitTodo.indexOf('#ffebee') >= 0, 'C4b: submit未も背景#ffebee(赤)');

// ラベルがHTMLに含まれる
ok(kbBadgeHtml({ label: '測定', state: 'todo', date: '', kind: 'plan' }).indexOf('測定') >= 0, 'C5: ラベル文字を含む');

// バッジ文字は口腔(0.56〜0.64rem)より大きい（社長指示・読みやすさ／高さ一定は維持）
var fsMatch = kbBadgeHtml({ label: '計画', state: 'done', date: '2026-07-02', kind: 'plan' }).match(/font-size:\s*([0-9.]+)rem/);
ok(fsMatch && parseFloat(fsMatch[1]) > 0.64, 'C6: バッジfont-sizeが0.64remより大きい（口腔超え） :: act=' + (fsMatch && fsMatch[1]));

console.log('個別機能訓練 1ヶ月1列バッジ 純関数: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
