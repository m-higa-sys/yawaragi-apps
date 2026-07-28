// test-applauncher-sokutei.js
// アプリランチャーへの「測定管理」登録の検証（2026-07-28）。
// 測定管理は month-board からのリンクしか無く、現場がランチャーから辿り着けなかった。
// それが「誰も使っていない」の直接原因だったため登録した。ここはその回帰ガード。
//
// カテゴリ内のアイコン重複は既存データに複数あるため（📋 が monitoring と個訓で重複等）、
// 全体には課さない。新規に足した sokutei が既存と重ならないことだけを見る。
// 実行: node scripts/test-applauncher-sokutei.js

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const core = require(path.join(ROOT, 'gas', 'yawaragi-board', 'applauncher-mapping-core.js'));
const M = core.LAUNCHER_MAPPING;

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

const CAT = '利用者の記録';

sec('測定管理がランチャーに登録されている');
ok(!!M['sokutei'], "slug 'sokutei' が登録されている");
const s = M['sokutei'] || {};
eq(s.cat, CAT, 'カテゴリは「利用者の記録」');
eq(s.name, '測定管理', '表示名は「測定管理」');
eq(s.order, 7, 'カテゴリ内の表示順は7（個別機能訓練計画書の次）');
ok(!!s.icon, 'アイコンがある');

sec('実体のHTMLが存在する（リンク切れにしない）');
ok(fs.existsSync(path.join(ROOT, 'sokutei.html')), 'sokutei.html がリポジトリにある');

sec('「利用者の記録」カテゴリ内で衝突していない');
const inCat = Object.keys(M).filter(k => M[k].cat === CAT).map(k => ({ slug: k, ...M[k] }));
const orders = inCat.map(x => x.order);
eq(orders.filter((o, i) => orders.indexOf(o) !== i), [], 'カテゴリ内の order に重複がない');
const others = inCat.filter(x => x.slug !== 'sokutei');
eq(others.filter(x => x.icon === s.icon).map(x => x.slug), [], 'sokutei のアイコンが同カテゴリの他アプリと重ならない');
eq(others.filter(x => x.name === s.name).map(x => x.slug), [], '表示名も重ならない');

sec('既存の測定系アプリの登録を壊していない');
ok(!!M['tairyoku'], 'tairyoku（体力測定）の登録は残っている');
eq(M['tairyoku'].order, 5, 'tairyoku の表示順は5のまま');
eq(M['個別機能訓練計画書チェック'].order, 6, '個別機能訓練計画書の表示順は6のまま');

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
