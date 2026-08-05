// test-applauncher-teishutsu.js
// LAUNCHER_MAPPING への「ケアマネ提出（10日便）」(teishutsu) 登録の検証（2026-08-05）。
//
// ⚠️前提の確認（2026-08-05 実測）: LAUNCHER_MAPPING はランチャーの正本では「ない」。
//   正本＝社長専用SSの「アプリ台帳」シート（portal.html → getAppRegistry&scope=staff）。
//   ここへの追記は整合性のためであり、これ単体では現場に出ない。
//   実際に出すのは launcherAddTeishutsu_（test-launcher-teishutsu-row.js が担当）。
//   前例 test-applauncher-sokutei.js（2026-07-28）と同型。
// 実行: node scripts/test-applauncher-teishutsu.js

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

const CAT = '相談員業務';

sec('ケアマネ提出（10日便）がマッピングに登録されている');
ok(!!M['teishutsu'], "slug 'teishutsu' が登録されている");
const t = M['teishutsu'] || {};
eq(t.cat, CAT, 'カテゴリは「相談員業務」');
eq(t.name, 'ケアマネ提出（10日便）', '表示名（ケアマネ送付チェックと混同しない名前）');
eq(t.order, 2.5, '表示順は2.5（ケアマネ送付チェック=2 の直後・既存を動かさない）');
ok(!!t.icon, 'アイコンがある');

sec('実体のHTMLが存在する（リンク切れにしない）');
ok(fs.existsSync(path.join(ROOT, 'teishutsu.html')), 'teishutsu.html がリポジトリにある');

sec('★既存エントリを1つも壊していない（追加のみ）');
eq(M['ケアマネ送付チェックリスト'] && M['ケアマネ送付チェックリスト'].order, 2,
  'ケアマネ送付チェックリストの表示順は2のまま（実績便で現役）');
eq(M['ケアマネ送付チェックリスト'] && M['ケアマネ送付チェックリスト'].name, 'ケアマネ送付チェック',
  'ケアマネ送付チェックリストの表示名は不変');
eq(M['after-contract'] && M['after-contract'].order, 1, '担会・契約後の表示順は1のまま');
eq(M['intake'] && M['intake'].order, 3, '見学・体験・新規の表示順は3のまま');

sec('「相談員業務」カテゴリ内で衝突していない');
const inCat = Object.keys(M).filter(k => M[k].cat === CAT).map(k => Object.assign({ slug: k }, M[k]));
eq(inCat.length, 4, '相談員業務は4本（担会・送付チェック・提出10日便・見学）');
const orders = inCat.map(x => x.order);
eq(orders.length, new Set(orders).size, '表示順が重複していない');
const icons = inCat.map(x => x.icon);
eq(icons.filter(i => i === t.icon).length, 1, '新規アイコンが既存と重なっていない');

sec('slug がURLから正しく引ける');
eq(core.launcherSlugFromUrl_('https://m-higa-sys.github.io/yawaragi-apps/teishutsu.html'), 'teishutsu',
  'URL → slug が teishutsu になる');

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
