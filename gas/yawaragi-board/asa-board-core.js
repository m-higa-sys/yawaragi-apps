// 2026-07-11 朝ボード（当日業務ピックアップ）の判定純関数。
// GAS/node 両用（kesseki-box-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しない。
// 名寄せは全業務ここを通す。判定spec: docs/superpowers/specs/2026-07-11-asa-board-design.md

// 名寄せ正規化＝全突合キーの唯一の正（_normalizeUserName 相当・NFKC＋全空白除去＋末尾敬称除去）
function abNormalizeName_(name) {
  var s = String(name == null ? '' : name);
  if (typeof s.normalize === 'function') s = s.normalize('NFKC');
  s = s.replace(/[\s　]+/g, '');
  s = s.replace(/(様|さま|サマ)$/, '');
  return s;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    abNormalizeName_: abNormalizeName_
  };
}
