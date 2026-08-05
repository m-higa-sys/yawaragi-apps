// 提出送付台帳 状態遷移コア（'保留' 追加）の純関数テスト（2026-08-05）
//
// ★このテストが守る地雷（調査報告 2026-08-05 09:18 の申し送り）:
//   旧 コード.js:3021-3033 は「'揃った' でなければ else で '送付済' 決め打ち」だった。
//   '保留' を素朴に足すと、保留を送ったつもりが台帳に「送付済」と書かれ、
//   sofu_at（送付日）と soufusha（送付者）まで捏造される。実害＝出していない書類が
//   出したことになる。よって「保留を送っても送付済にならない」を最上位のテストに置く。
//
// 実行: node scripts/test-soufu-status-core.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'soufu-status-core.js'));
const nextRow = core.soufuNextRow_;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}
const KEY = { userId: '山田太郎', docType: 'tsusho_moni', taishoTsuki: '2026-07' };
const NOW = '2026-08-05 10:00:00';
const NOW2 = '2026-08-06 11:11:11';

// 既存行のひな形
function row(over) {
  return Object.assign({
    userId: '山田太郎', docType: 'tsusho_moni', taishoTsuki: '2026-07', tekiyoTsuki: '2026-07',
    status: '', sorotta_at: '', sorotta_by: '', sofu_at: '', soufusha: '',
    soufuHouhou: '', kurikoshiRiyu: '', signKigen: '', updatedBy: '', updatedAt: ''
  }, over || {});
}

console.log('\n[A) ★地雷: 保留を送っても送付済にならない]');
{
  const r = nextRow(null, KEY, '保留', NOW, '勝又');
  ok('A1 未作成 → 保留: status が "保留"', r.status === '保留', 'got=' + r.status);
  ok('A2 未作成 → 保留: 送付済になっていない', r.status !== '送付済', 'got=' + r.status);
}
{
  const r = nextRow(row({ status: '揃った', sorotta_at: NOW, sorotta_by: '星野' }), KEY, '保留', NOW2, '勝又');
  ok('A3 揃った → 保留: status が "保留"', r.status === '保留', 'got=' + r.status);
}

console.log('\n[B) ★保留行に sofu_at / soufusha が書かれない]');
{
  const r = nextRow(null, KEY, '保留', NOW, '勝又');
  ok('B1 未作成 → 保留: sofu_at が空', r.sofu_at === '', 'got=' + JSON.stringify(r.sofu_at));
  ok('B2 未作成 → 保留: soufusha が空', r.soufusha === '', 'got=' + JSON.stringify(r.soufusha));
  ok('B3 未作成 → 保留: sorotta_at も空（揃っていないので押した記録は作らない）', r.sorotta_at === '');
  ok('B4 未作成 → 保留: sorotta_by も空', r.sorotta_by === '');
}
{
  // 送付済からの差戻し。保留行が「送付日を持ったまま」になると台帳が矛盾するので消えること。
  const r = nextRow(row({ status: '送付済', sofu_at: NOW, soufusha: '代表' }), KEY, '保留', NOW2, '勝又');
  ok('B5 送付済 → 保留: sofu_at が消える', r.sofu_at === '', 'got=' + JSON.stringify(r.sofu_at));
  ok('B6 送付済 → 保留: soufusha が消える', r.soufusha === '', 'got=' + JSON.stringify(r.soufusha));
}
{
  // 「揃った」を押した人の記録は属人化集計の核なので、保留へ落ちても保全する（送付済遷移と同じ思想）
  const r = nextRow(row({ status: '揃った', sorotta_at: NOW, sorotta_by: '星野' }), KEY, '保留', NOW2, '勝又');
  ok('B7 揃った → 保留: sorotta_at は保全', r.sorotta_at === NOW, 'got=' + r.sorotta_at);
  ok('B8 揃った → 保留: sorotta_by は保全', r.sorotta_by === '星野', 'got=' + r.sorotta_by);
}

console.log('\n[C) 既存の 揃った / 送付済 の挙動が1ミリも変わっていない]');
{
  const r = nextRow(null, KEY, '揃った', NOW, '勝又');
  ok('C1 未作成 → 揃った: sorotta_at = now', r.sorotta_at === NOW);
  ok('C2 未作成 → 揃った: sorotta_by = 操作者', r.sorotta_by === '勝又');
  ok('C3 未作成 → 揃った: sofu_at は空', r.sofu_at === '');
  ok('C4 未作成 → 揃った: soufusha は空', r.soufusha === '');
}
{
  const r = nextRow(row({ status: '揃った', sorotta_at: NOW, sorotta_by: '星野' }), KEY, '送付済', NOW2, '代表');
  ok('C5 揃った → 送付済: sofu_at = now', r.sofu_at === NOW2);
  ok('C6 揃った → 送付済: soufusha = 操作者', r.soufusha === '代表');
  ok('C7 揃った → 送付済: sorotta_at 保全（属人化集計を守る）', r.sorotta_at === NOW);
  ok('C8 揃った → 送付済: sorotta_by 保全', r.sorotta_by === '星野');
}
{
  // 送付済 → 揃った（差戻し）。既存コードの '揃った' 分岐は sofu_at/soufusha をクリアする。
  const r = nextRow(row({ status: '送付済', sofu_at: NOW, soufusha: '代表' }), KEY, '揃った', NOW2, '勝又');
  ok('C9 送付済 → 揃った: sofu_at がクリアされる', r.sofu_at === '');
  ok('C10 送付済 → 揃った: soufusha がクリアされる', r.soufusha === '');
}

console.log('\n[D) 冪等: 同じ status を再送しても時刻・操作者が動かない]');
[['揃った', 'sorotta_at', 'sorotta_by'], ['送付済', 'sofu_at', 'soufusha'], ['保留', null, null]].forEach(([st, atK, byK]) => {
  const base = row({ status: st, sorotta_at: st === '揃った' ? NOW : '', sorotta_by: st === '揃った' ? '星野' : '',
                     sofu_at: st === '送付済' ? NOW : '', soufusha: st === '送付済' ? '代表' : '' });
  const r = nextRow(base, KEY, st, NOW2, '別人');
  ok('D:' + st + ' status が変わらない', r.status === st);
  if (atK) ok('D:' + st + ' ' + atK + ' が NOW2 に書き換わらない', r[atK] === NOW, 'got=' + r[atK]);
  if (byK) ok('D:' + st + ' ' + byK + ' が別人に書き換わらない', r[byK] !== '別人', 'got=' + r[byK]);
});

console.log('\n[E) 未知の status は黙って送付済に落とさず、はっきり落ちる]');
{
  let threw = false;
  try { nextRow(null, KEY, 'てきとう', NOW, '勝又'); } catch (e) { threw = true; }
  ok('E1 未知の status は例外（else送付済決め打ちの再発防止）', threw);
}

console.log('\n[F) 繰越理由は状態遷移では触らない（任意フィールドは呼び出し側の担当）]');
{
  const r = nextRow(row({ status: '保留', kurikoshiRiyu: 'ケアプラン待ち' }), KEY, '揃った', NOW2, '勝又');
  ok('F1 保留→揃った でも kurikoshiRiyu を消さない', r.kurikoshiRiyu === 'ケアプラン待ち', 'got=' + r.kurikoshiRiyu);
}
{
  const r = nextRow(null, KEY, '保留', NOW, '勝又');
  ok('F2 新規保留の kurikoshiRiyu は空（理由は任意・後から付く）', r.kurikoshiRiyu === '');
}

console.log('\n[G) 語彙定数に 保留 が入っている]');
ok('G1 SOUFU_STATUSES に 揃った/送付済/保留 の3つ', JSON.stringify(core.SOUFU_STATUSES_) === JSON.stringify(['揃った', '送付済', '保留']),
   'got=' + JSON.stringify(core.SOUFU_STATUSES_));

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
