// 送迎条件 純関数（段階0・2026-07-13）
// テスト: scripts/test-sougei-conds.js ／ 呼び出し元: コード.js（sougeiCondsGet/Upsert）・送迎条件.html
//
// 目的: +1判定（段階1）の土台となる乗車条件・自力通所データを、社長がタップで一括入力できる
//   画面のバックエンド純関数。保存先は board GAS の sougei_conds シート（V66Udd 送迎GASは
//   clasp管理外＝改修禁止のため。実測根拠 2026-07-13）。既存 schedTime/routes 等は一切触らない。
//
// データモデル（1人分 cond）:
//   { transport:'walk'|'family'|'normal', no3:bool, step:bool, frontPref:bool, memo:str, confirmed:bool }
//   transport … walk=徒歩 / family=家族送迎 / normal=送迎（既定・要送迎）
//   no3        … 3列目不可（乗降困難）
//   step       … ステップ乗降要
//   frontPref  … 前席指定あり
//   confirmed  … 社長が行を開いて確認/修正した=true。プリフィル直後は false（＝要確認⚠）。
//
// ※require() は持たない（GAS本番でロード時に停止しない・他 *-core.js と同方式）。
// ※グローバルは SC_ / sc*_ プレフィクス徹底（巨大単一コード.js の scope 衝突回避）。

var SC_CONDS_SHEET  = 'sougei_conds';
var SC_CONDS_HEADER = ['name', 'transport', 'no3', 'step', 'frontPref', 'memo', 'confirmed', 'updatedAt', 'updatedBy'];

// 送迎区分を3値に正規化。未知/空は normal（＝送迎が要る、が安全側）。
function scNormTransport_(v) {
  var s = String(v == null ? '' : v).trim();
  if (s === 'walk' || s === '徒歩') return 'walk';
  if (s === 'family' || s === '家族送迎') return 'family';
  // 'shuttle'（sakura由来）/'normal'/'送迎'/空/不明 → normal
  return 'normal';
}

function scTransportLabel_(v) {
  var t = scNormTransport_(v);
  return t === 'walk' ? '徒歩' : t === 'family' ? '家族送迎' : '送迎';
}

// 1人分条件を正規化（型を固定・欠けは既定値・truthy→bool・memo trim）。
function scNormCond_(obj) {
  obj = obj || {};
  return {
    transport: scNormTransport_(obj.transport),
    no3: !!obj.no3,
    step: !!obj.step,
    frontPref: !!obj.frontPref,
    memo: String(obj.memo == null ? '' : obj.memo).trim(),
    confirmed: !!obj.confirmed
  };
}

// sakura transportマップ {name:{transport}} → プリフィル store。
// transport だけ引き継ぎ、乗車条件(no3/step/frontPref)は空・全員 confirmed:false（要確認）。
function scBuildPrefill_(transportMap) {
  transportMap = transportMap || {};
  var out = {};
  for (var name in transportMap) {
    if (!Object.prototype.hasOwnProperty.call(transportMap, name)) continue;
    var src = transportMap[name] || {};
    out[name] = scNormCond_({ transport: src.transport, confirmed: false });
  }
  return out;
}

// 1人分の非破壊 upsert。元 store は変更せず、新しい store を返す（該当名だけ差し替え/追加）。
function scUpsert_(store, name, cond) {
  var out = {};
  for (var k in store) {
    if (Object.prototype.hasOwnProperty.call(store, k)) out[k] = store[k];
  }
  out[name] = scNormCond_(cond);
  return out;
}

// 台帳在籍名リスト × store → 1人1行ビュー。未登録者は既定(送迎/false)・confirmed:false（要確認）。
function scBuildRows_(roster, store) {
  roster = roster || [];
  store = store || {};
  var out = [];
  for (var i = 0; i < roster.length; i++) {
    var name = roster[i];
    var cond = scNormCond_(store[name]);
    out.push({
      name: name,
      transport: cond.transport,
      no3: cond.no3,
      step: cond.step,
      frontPref: cond.frontPref,
      memo: cond.memo,
      confirmed: cond.confirmed
    });
  }
  return out;
}

// 送迎時間JSON.routes[曜日] → 定型ルート行（stopsが1件以上ある便だけ・車ごと1行）。
// 段階1の判定はこの定型ルートを土台にするため、実態とのズレを画面で潰す用の表示モデル。
function scParseRouteRows_(sched, weekday) {
  if (!sched || !sched.routes || !sched.routes[weekday]) return [];
  var day = sched.routes[weekday];
  var out = [];
  ['am', 'pm'].forEach(function(ap) {
    if (!day[ap]) return;
    ['pick', 'drop'].forEach(function(tp) {
      var arr = day[ap][tp];
      if (!Array.isArray(arr)) return;
      arr.forEach(function(route) {
        if (!route) return;
        var stops = Array.isArray(route.stops) ? route.stops : [];
        var users = [];
        stops.forEach(function(s) { if (s && s.user) users.push(s.user); });
        if (users.length === 0) return; // 空の便は行にしない
        out.push({
          ampm: ap,
          type: tp,
          vehicle: route.vehicle || '',
          driver: route.driver || '',
          users: users
        });
      });
    });
  });
  return out;
}

// シートのセル値を真偽に正規化。★スプレッドシートのチェックボックスは 'TRUE'/'FALSE' 文字列で
// 返ることがあり、文字列'FALSE'はJSの truthy 判定で true になる罠がある。明示的に潰す。
function scCellBool_(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  var s = String(v).trim().toUpperCase();
  if (s === '' || s === 'FALSE' || s === '0' || s === 'NO') return false;
  return true;
}

// シート2次元配列 [header, ...rows] → store {name: normCond}。空name行はスキップ。
function scRowsToStore_(values) {
  if (!Array.isArray(values) || values.length < 2) return {};
  var store = {};
  for (var i = 1; i < values.length; i++) {
    var r = values[i] || [];
    var name = String(r[0] == null ? '' : r[0]).trim();
    if (!name) continue;
    // 列順: name,transport,no3,step,frontPref,memo,confirmed,updatedAt,updatedBy
    store[name] = scNormCond_({
      transport: r[1],
      no3: scCellBool_(r[2]),
      step: scCellBool_(r[3]),
      frontPref: scCellBool_(r[4]),
      memo: r[5],
      confirmed: scCellBool_(r[6])
    });
  }
  return store;
}

// store → シート2次元配列 [header, ...rows]。bool はそのまま（setValuesでチェックボックス化）。
function scStoreToRows_(store, updatedAt, updatedBy) {
  store = store || {};
  var out = [SC_CONDS_HEADER.slice()];
  for (var name in store) {
    if (!Object.prototype.hasOwnProperty.call(store, name)) continue;
    var c2 = scNormCond_(store[name]);
    out.push([name, c2.transport, c2.no3, c2.step, c2.frontPref, c2.memo, c2.confirmed,
              updatedAt == null ? '' : updatedAt, updatedBy == null ? '' : updatedBy]);
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SC_CONDS_SHEET: SC_CONDS_SHEET,
    SC_CONDS_HEADER: SC_CONDS_HEADER,
    scNormTransport_: scNormTransport_,
    scTransportLabel_: scTransportLabel_,
    scNormCond_: scNormCond_,
    scBuildPrefill_: scBuildPrefill_,
    scUpsert_: scUpsert_,
    scBuildRows_: scBuildRows_,
    scParseRouteRows_: scParseRouteRows_,
    scCellBool_: scCellBool_,
    scRowsToStore_: scRowsToStore_,
    scStoreToRows_: scStoreToRows_
  };
}
