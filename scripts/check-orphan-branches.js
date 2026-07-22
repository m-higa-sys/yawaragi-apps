#!/usr/bin/env node
// check-orphan-branches.js — 孤立ブランチ / 残留ワークツリー検知
//
// 背景: 2026-07-02 利用者00729件事故。範囲展開バグの修正（7e5e09b）が
//       fix/range-pattern-filter ブランチに孤立してmaster未反映のまま
//       「修正済み」扱いになり、同一バグが本番で再発した。
//       「ブランチ上で完成」と「本番反映済み」の乖離を毎セッション可視化する。
//
// 使い方:
//   node scripts/check-orphan-branches.js            一覧警告（終了コード常に0）
//   node scripts/check-orphan-branches.js --strict   警告ありなら exit 1（自動化ゲート用）
//
// 実行タイミング: セッション開始時（CLAUDE.md 参照）＋朝の報告 Step 4.72

const { execSync } = require('child_process');
const path = require('path');
const core = require('./orphan-branch-core.js'); // 純関数コア（テスト: test-orphan-branch-core.js）

const ROOT = path.join(__dirname, '..');
const STRICT = process.argv.includes('--strict');

function sh(cmd, cwd) {
  return execSync(cmd, { cwd: cwd || ROOT, encoding: 'utf8' }).trim();
}
function shTry(cmd, cwd) {
  try { return { ok: true, out: sh(cmd, cwd) }; }
  catch (e) { return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).trim() }; }
}

// 0) origin/master を最新化（オフラインなら警告して続行）
const fetched = shTry('git fetch origin master --quiet');
if (!fetched.ok) {
  console.warn('⚠️ git fetch 失敗（オフライン？）: 手元の origin/master 参照で判定します。');
}

// 1) ワークツリー一覧（メイン以外を列挙・dirty有無つき）
//    ブランチ→チェックアウト先パスのマップも作る
const wtPorcelain = sh('git worktree list --porcelain');
const worktrees = [];
let cur = null;
for (const line of wtPorcelain.split(/\r?\n/)) {
  if (line.startsWith('worktree ')) { cur = { path: line.slice(9), branch: '', detached: false }; worktrees.push(cur); }
  else if (line.startsWith('branch ') && cur) { cur.branch = line.slice(7).replace('refs/heads/', ''); }
  else if (line === 'detached' && cur) { cur.detached = true; }
}
const mainWt = worktrees[0];
const extraWts = worktrees.slice(1);
const branchToWt = {};
for (const w of worktrees) { if (w.branch) branchToWt[w.branch] = w.path; }

// 2) origin/master 未マージのローカルブランチ
//    ⚠️ 書式指定 `--format=%(refname:short)` は /bin/sh で丸括弧がメタ文字と解釈され
//    syntax error になる（2026-07-23 near-miss の真因）。素の出力を自前パースする。
const unmergedRaw = shTry(core.UNMERGED_CMD);
const unmergedKnown = unmergedRaw.ok;
const unmerged = unmergedKnown ? core.parseBranchList(unmergedRaw.out) : [];
if (!unmergedKnown) {
  // 判定不能を「未マージなし」と見せない。ここを黙って通すと削除して良いものに化ける。
  console.warn('🛑 未マージブランチの判定に失敗しました（削除可否は判定できません）');
  console.warn('   コマンド: ' + core.UNMERGED_CMD);
  console.warn('   出力: ' + (unmergedRaw.out || '(なし)').split(/\r?\n/)[0]);
}

let warnCount = 0;

console.log('===== 孤立ブランチ / 残留ワークツリー チェック =====');
console.log('基準: origin/master = ' + sh('git rev-parse --short origin/master'));
console.log('');

if (!unmergedKnown) {
  console.log('⚠️ origin/master 未マージのローカルブランチ: 判定不能（上記エラー参照）');
  warnCount++;
} else if (unmerged.length === 0) {
  console.log('✅ origin/master 未マージのローカルブランチ: なし');
} else {
  console.log('⚠️ origin/master 未マージのローカルブランチ: ' + unmerged.length + ' 件');
  for (const br of unmerged) {
    const ahead = shTry('git rev-list --count origin/master..' + br);
    const last = shTry('git log -1 --format=%cd│%s --date=format:%Y-%m-%d ' + br);
    const [date, subj] = last.ok ? last.out.split('│') : ['?', '?'];
    const wtNote = branchToWt[br] ? '  [WT: ' + branchToWt[br] + ']' : '';
    console.log('  - ' + br + '  (+' + (ahead.ok ? ahead.out : '?') + 'コミット / 最終 ' + date + ')' + wtNote);
    console.log('      └ ' + (subj || '').slice(0, 80));
    warnCount++;
  }
  console.log('  → 各ブランチを「master反映」「削除」「残す理由をmemoryに記録」のどれかへ。');
}
console.log('');

if (extraWts.length === 0) {
  console.log('✅ メイン以外のワークツリー: なし');
} else {
  console.log('⚠️ メイン以外のワークツリー: ' + extraWts.length + ' 件');
  for (const w of extraWts) {
    const st = shTry('git -C "' + w.path + '" status --porcelain');
    const dirtyN = st.ok ? st.out.split(/\r?\n/).filter(Boolean).length : -1;
    const label = w.detached ? '(detached)' : (w.branch || '(?)');
    // 判定は純関数へ集約（fail-closed＝迷ったら削除候補にしない）
    const verdict = core.classifyWorktree({
      branch: w.branch, detached: w.detached, dirtyN: dirtyN,
      unmergedKnown: unmergedKnown, unmerged: unmerged
    });
    console.log('  - ' + w.path + '  [' + label + ']' + verdict.note);
    warnCount++;
  }
  console.log('  → クリーン＆master反映済みのWTは `git worktree remove <path>` で削除。');
  console.log('  → ⚠️付きWTは先に未コミット差分の中身を確認（本番未反映の作業の可能性）。');
}

console.log('');
console.log(warnCount === 0
  ? '✅ 問題なし。'
  : '⚠️ 合計 ' + warnCount + ' 件。放置せず処遇を決めること（完了定義: CLAUDE.md 参照）。');

process.exit(STRICT && warnCount > 0 ? 1 : 0);
