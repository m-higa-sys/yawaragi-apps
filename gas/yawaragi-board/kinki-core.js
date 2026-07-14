// 禁忌・運動制限 純関数コア（Node/GAS両対応・状態を持たない）
// 氏名正規化は session-board-core.js の sbNormalizeName_ を注入して使う（drift防止）。

var KINKI_EQUIPMENT = [
  '干渉波', 'WB', '足温器', '滑車', 'バイク', '足裏マッサージ器',
  '下肢マッサージ器', 'ヒップアブダクション', 'チェストプレス', 'レッグカール', 'レッグプレス'
];

var KINKI_RELEASE_REASONS = [
  '医師より運動制限解除の指示', '症状改善により制限解除', '術後経過良好・主治医許可',
  '骨折治癒・荷重制限解除', '期間満了（一時的制限の終了）', '制限内容の変更（新規登録し直し）',
  '誤登録・重複の取り消し', 'その他'
];

function knkParseEquipment_(cell) {
  if (!cell) return [];
  try {
    var v = JSON.parse(cell);
    return Array.isArray(v) ? v.filter(function (x) { return !!x; }).map(String) : [];
  } catch (e) { return []; }
}

function knkStringifyEquipment_(arr) {
  if (!arr || !arr.length) return '';
  return JSON.stringify(arr.filter(function (x) { return !!x; }).map(String));
}

function knkLabelWithinLimit_(label) {
  if (!label) return false;
  var s = String(label);
  return s.length >= 1 && s.length <= 15;
}

function knkBadgeStyle_(level) {
  if (level === 'forbid') return { icon: '🚫', cls: 'kinki-forbid' };
  return { icon: '⚠️', cls: 'kinki-caution' }; // 未知値は安全側（要注意）に倒す
}

function knkCanRelease_(rec) {
  if (!rec) return false;
  return rec.type === 'temporary'; // permanent は解除ボタンを描画しない
}

function knkFilterActive_(records) {
  if (!records || !records.length) return [];
  return records.filter(function (r) { return r && r.status === 'active'; });
}

function knkGroupByUser_(records, normalizeFn) {
  var out = {};
  var active = knkFilterActive_(records);
  for (var i = 0; i < active.length; i++) {
    var key = normalizeFn(active[i].userId);
    if (!key) continue;
    if (!out[key]) out[key] = [];
    out[key].push(active[i]);
  }
  return out;
}

function knkGroupByEquipment_(activeRecords, equipList) {
  var out = {};
  for (var e = 0; e < equipList.length; e++) out[equipList[e]] = [];
  out['機器指定なし'] = [];
  for (var i = 0; i < (activeRecords || []).length; i++) {
    var rec = activeRecords[i];
    var eqs = knkParseEquipment_(rec.targetEquipment);
    if (!eqs.length) { out['機器指定なし'].push(rec); continue; }
    for (var j = 0; j < eqs.length; j++) {
      if (out.hasOwnProperty(eqs[j])) out[eqs[j]].push(rec);
      else out['機器指定なし'].push(rec); // マスタ外機器も取りこぼさない
    }
  }
  return out;
}

function knkDetectUnmatched_(activeRecords, userList, normalizeFn) {
  var known = {};
  for (var u = 0; u < (userList || []).length; u++) {
    var k = normalizeFn(userList[u]);
    if (k) known[k] = true;
  }
  var out = [];
  for (var i = 0; i < (activeRecords || []).length; i++) {
    var key = normalizeFn(activeRecords[i].userId);
    if (!known[key]) out.push(activeRecords[i]);
  }
  return out;
}

function knkValidatePayload_(p) {
  if (!p) return { ok: false, error: 'payloadがありません' };
  if (!p.userId) return { ok: false, error: 'userId（利用者名）は必須です' };
  if (['permanent', 'temporary'].indexOf(p.type) < 0) return { ok: false, error: 'typeが不正です' };
  if (['forbid', 'caution'].indexOf(p.level) < 0) return { ok: false, error: 'levelが不正です' };
  if (!knkLabelWithinLimit_(p.label)) return { ok: false, error: 'ラベルは1〜15文字で必須です' };
  if (['doctor_doc', 'doctor_oral', 'caremgr', 'family', 'self'].indexOf(p.sourceType) < 0) return { ok: false, error: 'sourceTypeが不正です' };
  if (!p.sourceName) return { ok: false, error: '情報元氏名は必須です' };
  if (!p.receivedAt) return { ok: false, error: '受領日は必須です' };
  if (!p.receivedBy) return { ok: false, error: '受けた職員は必須です' };
  if (p.type === 'temporary' && !p.reviewDate) return { ok: false, error: '期限付き制限は見直し予定日が必須です' };
  return { ok: true };
}

function knkValidateRelease_(p) {
  if (!p) return { ok: false, error: 'payloadがありません' };
  if (!p.releaseReason) return { ok: false, error: '解除理由は必須です' };
  if (!p.releaseSource) return { ok: false, error: '解除の指示元は必須です' };
  if (!p.releasedBy) return { ok: false, error: '解除操作者は必須です' };
  if (p.releaseReason === 'その他' && !p.releaseNote) return { ok: false, error: '「その他」選択時は補足が必須です' };
  return { ok: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KINKI_EQUIPMENT: KINKI_EQUIPMENT,
    KINKI_RELEASE_REASONS: KINKI_RELEASE_REASONS,
    knkParseEquipment_: knkParseEquipment_,
    knkStringifyEquipment_: knkStringifyEquipment_,
    knkLabelWithinLimit_: knkLabelWithinLimit_,
    knkBadgeStyle_: knkBadgeStyle_,
    knkCanRelease_: knkCanRelease_,
    knkFilterActive_: knkFilterActive_,
    knkGroupByUser_: knkGroupByUser_,
    knkGroupByEquipment_: knkGroupByEquipment_,
    knkDetectUnmatched_: knkDetectUnmatched_,
    knkValidatePayload_: knkValidatePayload_,
    knkValidateRelease_: knkValidateRelease_
  };
}
