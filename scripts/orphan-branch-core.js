// orphan-branch-core.js
// 孤立ブランチ／残留ワークツリー検知の純関数コア。
// テスト: scripts/test-orphan-branch-core.js（同時に直すこと）
//
// 2026-07-23: check-orphan-branches.js が `--format=%(refname:short)` を
// execSync（/bin/sh 経由）に渡していたため、丸括弧がシェルのメタ文字と解釈され
// syntax error → 例外を握り潰して unmerged=[] → 全ワークツリーが
// 「master反映済み→削除候補」に化けた（未マージ2ブランチ・約1,700行が消えかけた）。
// ここでは ①書式指定を使わず素の出力を自前パースする ②判定不能を安全側に倒さない
// （fail-closed）の2点で再発を止める。

// 未マージブランチ一覧を取るコマンド。**シェルのメタ文字を含めないこと**。
// `--format=%(refname:short)` は /bin/sh で壊れるため使わない（テストで固定）。
const UNMERGED_CMD = 'git branch --no-merged origin/master';

// `git branch` の素の出力から枝名だけを取り出す。
// 行頭の `* `（カレント）/ `+ `（他ワークツリーでチェックアウト中）/ 空白を除去し、
// `(HEAD detached at ...)` のような枝名でない行は落とす。
function parseBranchList(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map(function (s) { return s.replace(/^[*+]?\s+/, '').replace(/^[*+]/, '').trim(); })
    .filter(function (s) { return s && s.indexOf('(') === -1; });
}

// ワークツリー1件の処遇を判定する。
// 入力: { branch, detached, dirtyN, unmergedKnown, unmerged }
//   dirtyN: 未コミット差分の件数（-1 = status取得失敗）
//   unmergedKnown: 未マージ判定が成功したか（false = 判定不能）
// 出力: { safeToRemove, note }
// 原則: **迷ったら削除しない**。safeToRemove=true は全条件が確認できた時だけ。
function classifyWorktree(w) {
  const dirtyN = w.dirtyN;

  if (dirtyN > 0) {
    // ブランチが反映済みでも未コミット差分は未反映の実作業かもしれない
    // （2026-07-02: 連続欠席バッジ撤去がWTの未コミット差分に眠っていた教訓）
    return { safeToRemove: false, note: ' / 未コミット作業 ' + dirtyN + ' 件 ⚠️要確認（中身を反映するまで削除しない）' };
  }
  if (dirtyN < 0) {
    return { safeToRemove: false, note: ' / 状態取得失敗 ⚠️（判定できないので削除しない）' };
  }
  if (w.detached) {
    return { safeToRemove: false, note: ' / クリーン（detached・枝の反映状況は未判定）' };
  }
  if (!w.branch) {
    return { safeToRemove: false, note: ' / クリーン（ブランチ不明のため未判定）' };
  }
  if (!w.unmergedKnown) {
    // ★ fail-closed。ここを「反映済み」に倒したのが 2026-07-23 の near-miss の真因。
    return { safeToRemove: false, note: ' / クリーン ⚠️未マージ判定に失敗（判定不能につき削除しない）' };
  }
  const isUnmerged = (w.unmerged || []).indexOf(w.branch) !== -1;
  return isUnmerged
    ? { safeToRemove: false, note: ' / クリーン / ⚠️未マージ（master反映前・削除しない）' }
    : { safeToRemove: true, note: ' / クリーン / master反映済み→削除候補' };
}

module.exports = { UNMERGED_CMD: UNMERGED_CMD, parseBranchList: parseBranchList, classifyWorktree: classifyWorktree };
