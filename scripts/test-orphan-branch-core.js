// test-orphan-branch-core.js
// 孤立ブランチ検知の純関数テスト（正本）。対象: scripts/orphan-branch-core.js
// 実行: node scripts/test-orphan-branch-core.js
//
// 背景（2026-07-23 near-miss）: check-orphan-branches.js が
//   git branch --no-merged origin/master --format=%(refname:short)
// を execSync（/bin/sh 経由）で実行しており、`%(...)` の丸括弧がシェルの
// メタ文字と解釈されて syntax error。shTry がそれを握り潰して unmerged=[] となり、
// 「未マージのローカルブランチ: なし」＋全ワークツリーが「master反映済み→削除候補」に化けた。
// 実際には未マージ2ブランチ・約1,700行の実装（新規テスト含む）が残っていた。
// 教訓＝①シェルに渡す引数はメタ文字を含ませない ②判定不能を「安全」に倒さない（fail-closed）。

const assert = require('assert');
const core = require('./orphan-branch-core.js');

let pass = 0, fail = 0;
function t(label, fn) {
  try { fn(); pass++; console.log('  PASS ' + label); }
  catch (e) { fail++; console.log('  FAIL ' + label + '\n    ' + e.message); }
}

console.log('parseBranchList');

t('通常の git branch 出力から枝名を取り出す', () => {
  const raw = '  feat/haichi-2nin-reason\n  feat/kunren-deadline\n* master';
  assert.deepStrictEqual(core.parseBranchList(raw),
    ['feat/haichi-2nin-reason', 'feat/kunren-deadline', 'master']);
});

t('カレント印 * を除去する', () => {
  assert.deepStrictEqual(core.parseBranchList('* fix/foo'), ['fix/foo']);
});

t('worktree の + 印も除去する', () => {
  assert.deepStrictEqual(core.parseBranchList('+ feat/in-worktree'), ['feat/in-worktree']);
});

t('detached HEAD 行は枝名として拾わない', () => {
  const raw = '* (HEAD detached at 5461885)\n  feat/foo';
  assert.deepStrictEqual(core.parseBranchList(raw), ['feat/foo']);
});

t('空文字・空行は無視', () => {
  assert.deepStrictEqual(core.parseBranchList(''), []);
  assert.deepStrictEqual(core.parseBranchList('\n\n  \n'), []);
});

t('シェルメタ文字を含む書式指定を使わない（コマンド文字列の回帰防止）', () => {
  // %(refname:short) を含むコマンドは /bin/sh で syntax error になるため使ってはならない
  assert.ok(!core.UNMERGED_CMD.includes('%('),
    'UNMERGED_CMD に %( が含まれている: ' + core.UNMERGED_CMD);
  assert.ok(!/[()]/.test(core.UNMERGED_CMD),
    'UNMERGED_CMD に丸括弧が含まれている: ' + core.UNMERGED_CMD);
});

console.log('\nclassifyWorktree');

t('未コミット差分ありは常に「削除しない」', () => {
  const r = core.classifyWorktree({ branch: 'feat/x', dirtyN: 3, unmergedKnown: true, unmerged: [] });
  assert.strictEqual(r.safeToRemove, false);
  assert.match(r.note, /未コミット/);
});

t('クリーン＆master反映済みは削除候補', () => {
  const r = core.classifyWorktree({ branch: 'feat/x', dirtyN: 0, unmergedKnown: true, unmerged: ['feat/other'] });
  assert.strictEqual(r.safeToRemove, true);
  assert.match(r.note, /削除候補/);
});

t('クリーンでも未マージなら削除候補にしない（本件の回帰テスト）', () => {
  const r = core.classifyWorktree({ branch: 'feat/kunren-deadline', dirtyN: 0, unmergedKnown: true, unmerged: ['feat/kunren-deadline'] });
  assert.strictEqual(r.safeToRemove, false);
  assert.match(r.note, /未マージ/);
});

t('★fail-closed: 未マージ判定に失敗したら削除候補にしない（本件の真因）', () => {
  const r = core.classifyWorktree({ branch: 'feat/x', dirtyN: 0, unmergedKnown: false, unmerged: [] });
  assert.strictEqual(r.safeToRemove, false,
    '判定不能を「削除して安全」に倒してはいけない');
  assert.match(r.note, /判定不能|失敗/);
});

t('detached はブランチ判定を行わず削除候補にしない', () => {
  const r = core.classifyWorktree({ branch: '', detached: true, dirtyN: 0, unmergedKnown: true, unmerged: [] });
  assert.strictEqual(r.safeToRemove, false);
});

t('status 取得失敗（dirtyN=-1）も削除候補にしない', () => {
  const r = core.classifyWorktree({ branch: 'feat/x', dirtyN: -1, unmergedKnown: true, unmerged: [] });
  assert.strictEqual(r.safeToRemove, false);
  assert.match(r.note, /取得失敗/);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
