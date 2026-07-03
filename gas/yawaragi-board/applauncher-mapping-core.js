// applauncher-mapping-core.js
// ランチャー(portal/admin)レジストリ一本化の純関数コア。
// GAS本体(コード.js)から関数を参照し、Node(scripts/test-*)からも require できる。
// 表示順はカテゴリ内の並び(数値)。カテゴリ間の並びは LAUNCHER_CATEGORY_ORDER。

var LAUNCHER_SHOKAI_URL = 'https://script.google.com/macros/s/AKfycbx1z2qR6sB2ULa5VX5u5tuUojzKaaIv_HvmavxzP7kpIwa7sddHd2o6S7FtFQEJfCGdwQ/exec';

var LAUNCHER_CATEGORY_ORDER = ['メインボード','毎日の業務','利用者の記録','相談員業務','事務・手続き','設備・備品','その他'];

// キー = 既存スタッフ用URLの slug(ファイル名から .html を除いたもの)
// meta: cat=カテゴリ / icon=絵文字 / name=表示名 / order=カテゴリ内表示順 / newUrl?=URL差替 / desc?=説明差替
var LAUNCHER_MAPPING = {
  'yawaragi-board': { cat:'メインボード', icon:'📋', name:'yawaragiボード', order:1, newUrl:'https://m-higa-sys.github.io/yawaragi-apps/genba.html' },
  'genba':          { cat:'メインボード', icon:'📋', name:'yawaragiボード', order:1 }, // 再実行(冪等)用エイリアス

  'sougei_nisshi':  { cat:'毎日の業務', icon:'📝', name:'送迎日誌', order:1 },
  'sched-grid':     { cat:'毎日の業務', icon:'🚐', name:'送迎時間一覧', order:2 },
  'sougei':         { cat:'毎日の業務', icon:'📋', name:'出勤＆送迎表', order:3 },
  'schedule':       { cat:'毎日の業務', icon:'⏰', name:'タイムスケジュール', order:4 },
  'caremanager':    { cat:'毎日の業務', icon:'📧', name:'ケアマネ連絡', order:5 },
  'cleaning':       { cat:'毎日の業務', icon:'🧹', name:'清掃・準備チェック表', order:6 },

  'weight':         { cat:'利用者の記録', icon:'⚖️', name:'体重チェック', order:1 },
  'oral':           { cat:'利用者の記録', icon:'🦷', name:'口腔機能管理', order:2 },
  'height':         { cat:'利用者の記録', icon:'📏', name:'身長チェック', order:3 },
  'monitoring':     { cat:'利用者の記録', icon:'📋', name:'通所介護計画管理', order:4 },
  'tairyoku':       { cat:'利用者の記録', icon:'💪', name:'体力測定', order:5 },
  '個別機能訓練計画書チェック': { cat:'利用者の記録', icon:'📋', name:'個別機能訓練計画書', order:6 },

  'after-contract': { cat:'相談員業務', icon:'📋', name:'担会・契約後', order:1 },
  'ケアマネ送付チェックリスト': { cat:'相談員業務', icon:'📋', name:'ケアマネ送付チェック', order:2 },
  'intake':         { cat:'相談員業務', icon:'🏠', name:'見学・体験・新規', order:3, desc:'見学・体験・新規利用者の受入対応チェック' },

  'caremgr-change': { cat:'事務・手続き', icon:'🔄', name:'ケアマネ変更', order:2 },
  'kubun':          { cat:'事務・手続き', icon:'🔁', name:'区変/更新', order:3 },
  'weekday-change': { cat:'事務・手続き', icon:'🗓️', name:'利用曜日変更', order:4 },
  'furikae-fubi':   { cat:'事務・手続き', icon:'🏦', name:'口座振替不備返却管理', order:5 },
  'furikae':        { cat:'事務・手続き', icon:'💰', name:'振替不能管理', order:6 },
  'provision-check':{ cat:'事務・手続き', icon:'📄', name:'提供票受領', order:7 },

  'vehicle':        { cat:'設備・備品', icon:'🚗', name:'車両メンテナンス管理', order:1 },
  'ink':            { cat:'設備・備品', icon:'🖨️', name:'インク管理', order:2 },
  'stamp':          { cat:'設備・備品', icon:'📮', name:'切手管理', order:3 },

  'birthday':       { cat:'その他', icon:'🎂', name:'誕生日', order:1 },
  'wb':             { cat:'その他', icon:'💧', name:'WB設定表', order:2 },
  'sns-consent':    { cat:'その他', icon:'📷', name:'SNS顔出し可否', order:3 },
  'インスタ写真アップ手順': { cat:'その他', icon:'📸', name:'インスタ写真アップ手順', order:4 },
  'role':           { cat:'その他', icon:'🗂', name:'業務担当', order:5 },
  'shift':          { cat:'その他', icon:'📅', name:'シフト希望入力', order:6 },
  'iryohi':         { cat:'その他', icon:'💴', name:'医療費控除ルール', order:7 }
};

// URL→slug(ファイル名から .html 除去・パーセントデコード)
function launcherSlugFromUrl_(url) {
  if (!url) return '';
  var s = String(url).split('?')[0].split('#')[0];
  var seg = s.substring(s.lastIndexOf('/') + 1);
  try { seg = decodeURIComponent(seg); } catch (e) {}
  return seg.replace(/\.html$/i, '');
}

// 既存行(array-of-arrays・列順=APPREGISTRY_HEADERS)を受け取り、マッピング適用後の行配列＋サマリを返す純関数。
// COLS=14 (… 管理者メモ[11], icon[12], 表示順[13])。retired は公開区分・カテゴリ等そのまま(最終更新日のみ更新)。
function launcherApplyMapping_(rows, todayStr) {
  var COLS = 14;
  var out = [];
  var summary = { mapped:0, internal:0, retiredKept:0, renamed:[], toInternal:[], warnings:[], shokaiAdded:false };
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i].slice();
    while (r.length < COLS) r.push('');
    if (r[4] === 'retired') { r[10] = todayStr; summary.retiredKept++; out.push(r); continue; }
    // 照会回答作成(GAS URL)はslug照合不可→冪等のため明示保護(再実行でinternal化しない)
    if (r[3] === LAUNCHER_SHOKAI_URL || r[0] === '照会回答作成') {
      r[0] = '照会回答作成'; r[1] = '事務・手続き'; r[3] = LAUNCHER_SHOKAI_URL; r[4] = 'staff';
      r[2] = r[2] || 'ケアマネFAX照会へAIで回答→厚労省様式PDF作成'; r[12] = '📨'; r[13] = 1; r[10] = todayStr;
      summary.mapped++; out.push(r); continue;
    }
    var slug = launcherSlugFromUrl_(r[3]);
    var meta = LAUNCHER_MAPPING[slug];
    if (meta) {
      r[1] = meta.cat;
      r[12] = meta.icon;
      r[0] = meta.name;
      r[13] = meta.order;
      r[4] = 'staff';
      if (meta.desc) r[2] = meta.desc;
      if (meta.newUrl) { summary.renamed.push(slug + ' -> ' + launcherSlugFromUrl_(meta.newUrl)); r[3] = meta.newUrl; }
      summary.mapped++;
    } else {
      if (r[4] === 'staff') summary.toInternal.push(slug || r[0]);
      r[4] = 'internal';
      summary.internal++;
    }
    r[10] = todayStr;
    out.push(r);
  }
  // 照会回答作成(GAS) を staff/事務・手続き/📨 で追加(無ければ)
  var hasShokai = out.some(function (r) { return r[0] === '照会回答作成' || r[3] === LAUNCHER_SHOKAI_URL; });
  if (!hasShokai) {
    var nr = []; for (var k = 0; k < COLS; k++) nr.push('');
    nr[0] = '照会回答作成'; nr[1] = '事務・手続き'; nr[2] = 'ケアマネFAX照会へAIで回答→厚労省様式PDF作成';
    nr[3] = LAUNCHER_SHOKAI_URL; nr[4] = 'staff'; nr[9] = todayStr; nr[10] = todayStr; nr[12] = '📨'; nr[13] = 1;
    out.push(nr); summary.shokaiAdded = true;
  }
  // 重複staff URLは先勝ちで残し、後続はinternalへ降格(既存genba行とyawaragi-board→genba.htmlの二重登録を解消)
  var taken = {};
  summary.dedupedToInternal = [];
  out.forEach(function (r) {
    if (r[4] !== 'staff') return;
    if (taken[r[3]]) { r[4] = 'internal'; r[12] = ''; r[13] = ''; summary.dedupedToInternal.push(r[3]); }
    else taken[r[3]] = true;
  });
  // 最終: 残存重複(理論上ゼロ)の検出
  var seen = {};
  out.forEach(function (r) { if (r[4] === 'staff') seen[r[3]] = (seen[r[3]] || 0) + 1; });
  Object.keys(seen).forEach(function (u) { if (seen[u] > 1) summary.warnings.push('重複staff URL: ' + u + ' x' + seen[u]); });
  return { rows: out, summary: summary };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { launcherSlugFromUrl_: launcherSlugFromUrl_, launcherApplyMapping_: launcherApplyMapping_,
    LAUNCHER_MAPPING: LAUNCHER_MAPPING, LAUNCHER_CATEGORY_ORDER: LAUNCHER_CATEGORY_ORDER, LAUNCHER_SHOKAI_URL: LAUNCHER_SHOKAI_URL };
}
