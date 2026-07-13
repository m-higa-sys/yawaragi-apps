// stamp-dest-core.js — 切手管理アプリの宛先（ケアマネ事業所）抽出（純関数・ブラウザ+Node共有・UMD）
// 一次情報（実測 2026-07-13）:
//   stamp.html が叩く GAS( AKfycbx7… ) は「利用者台帳」ではなく yawaragi ボードGAS の別デプロイで、
//   応答 top keys = success/date/dayOfWeek/attendance/absences/messages/cmContacts/patterns。
//   json.users は存在しない（旧コードはこれを見て無言 return → 宛先が空になる事故）。
//   json.patterns は「氏名 → {days,unit,kana,care,cmName,cmOffice}」のオブジェクトで、
//   全契約者111名・distinct cmOffice=22（要支援含む最網羅）。cmContacts は空配列で使えない。
// 責務: 応答から distinct な cmOffice を ja ロケール昇順で返す。
//   ・patterns（オブジェクト）を主とし、users（配列・将来の台帳API差し替え耐性）と attendance も拾う。
//   ・何を渡されても throw しない（異常系は []）。固定枠「電算システム/その他」は付与しない（呼び出し側の責務）。
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { root.StampDest = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function addOffice(set, val) {
    if (typeof val !== 'string') return;
    var s = val.trim();
    if (s) set.add(s);
  }

  // 応答 → distinct cmOffice（ja昇順）。異常系は必ず [] を返す。
  function stampExtractOffices(json) {
    var set = new Set();
    if (!json || typeof json !== 'object') return [];

    // 主: patterns（氏名キーのオブジェクト。各値に cmOffice）
    var p = json.patterns;
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      Object.keys(p).forEach(function (name) {
        var rec = p[name];
        if (rec && typeof rec === 'object') addOffice(set, rec.cmOffice);
      });
    }

    // 従: users 配列（将来 台帳API に差し替えた場合の耐性）
    if (Array.isArray(json.users)) {
      json.users.forEach(function (u) { if (u && typeof u === 'object') addOffice(set, u.cmOffice); });
    }

    // 従: attendance.am / pm（本日出席者。念のためのマージ。網羅は patterns 側が担保）
    var at = json.attendance;
    if (at && typeof at === 'object') {
      ['am', 'pm'].forEach(function (k) {
        if (Array.isArray(at[k])) at[k].forEach(function (u) { if (u && typeof u === 'object') addOffice(set, u.cmOffice); });
      });
    }

    return Array.from(set).sort(function (a, b) { return a.localeCompare(b, 'ja'); });
  }

  return { stampExtractOffices: stampExtractOffices };
});
