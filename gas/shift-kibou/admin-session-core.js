// 管理者セッション認可の純関数（セキュリティ強化 2026-07-14）
// テスト: scripts/test-admin-session.js ／ 呼び出し元: コード.js（doGet/handleAction 冒頭ガード）
//
// 目的: getAllDataAdmin / getBossRests 等の管理者APIを「無認証で叩けない」状態にする。
//   PIN成功時にランダムトークンを CacheService(TTL) へ発行し、以降の管理者APIで検証する。
//   前例 token-auth-core.js / intake-auth-core.js と同方式（fail-closed・enforce旗・純関数core・TDD）。
//
// 設計:
//   adminSessionReason_(provided, cachedFlag) → 'valid'|'missing'|'expired'
//     - provided 未設定 → 'missing'
//     - cachedFlag 未設定(期限切れ/未発行) → 'expired'
//     - 両方あり → 'valid'
//   checkAdminAuth(provided, cachedFlag, enforce) → { ok, reason }
//     - enforce=false（既定）: reason に関わらず ok:true（ログのみ・素通り＝安全な段階導入）
//     - enforce=true         : reason==='valid' のときだけ ok:true
//     - fail-closed: cachedFlag が無ければ enforce=ON で必ず拒否（発行系が壊れても漏れる方向に倒れない）
//   ※require() は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）

var ADMIN_SESSION_TTL_SEC = 14400; // 4時間（CacheService上限6h以内・スライディング延長）

function adminIsEmpty_(v) {
  return v === null || v === undefined || String(v).length === 0;
}

// トークンの真偽（reason）を判定する純副関数。
function adminSessionReason_(provided, cachedFlag) {
  if (adminIsEmpty_(provided)) return 'missing';
  if (adminIsEmpty_(cachedFlag)) return 'expired'; // provided はあるがサーバに無い＝期限切れ/未発行
  return 'valid';
}

// enforce を畳み込んで最終判定（token-auth-core.checkToken と同スタイル）。
function checkAdminAuth(provided, cachedFlag, enforce) {
  var reason = adminSessionReason_(provided, cachedFlag);
  var ok = enforce ? (reason === 'valid') : true;
  return { ok: ok, reason: reason };
}

// 発行トークンの形式チェック（UUID想定・純関数）。
function adminTokenLooksValid_(token) {
  return typeof token === 'string' && /^[0-9a-fA-F-]{20,}$/.test(token);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    adminSessionReason_: adminSessionReason_,
    checkAdminAuth: checkAdminAuth,
    adminTokenLooksValid_: adminTokenLooksValid_,
    ADMIN_SESSION_TTL_SEC: ADMIN_SESSION_TTL_SEC
  };
}
