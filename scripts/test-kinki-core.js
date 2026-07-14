// 禁忌 純関数テスト  実行: node scripts/test-kinki-core.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'kinki-core.js'));
const sb = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));
const norm = sb.sbNormalizeName_;

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }
function eq(a, b, l) { ok(JSON.stringify(a) === JSON.stringify(b), l + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }

const EQUIP = core.KINKI_EQUIPMENT;

// ---- A. 機器マスタ（11種・順序固定・削除語を含まない） ----
eq(EQUIP.length, 11, 'A1: 機器11種');
ok(EQUIP.indexOf('レッグプレス') >= 0 && EQUIP.indexOf('干渉波') >= 0, 'A2: 代表機器を含む');
ok(EQUIP.indexOf('歩行') < 0 && EQUIP.indexOf('徒手') < 0 && EQUIP.indexOf('立位') < 0 && EQUIP.indexOf('全般') < 0, 'A3: 削除語を含まない');

// ---- B. knkParseEquipment_/knkStringifyEquipment_（セルJSON⇄配列・堅牢） ----
eq(core.knkParseEquipment_('["バイク","滑車"]'), ['バイク', '滑車'], 'B1: JSON配列を復元');
eq(core.knkParseEquipment_(''), [], 'B2: 空→[]');
eq(core.knkParseEquipment_(null), [], 'B3: null→[]（落ちない）');
eq(core.knkParseEquipment_('こわれ'), [], 'B4: 壊れ値→[]（例外を投げない）');
eq(core.knkStringifyEquipment_(['バイク', '滑車']), '["バイク","滑車"]', 'B5: 配列→JSON文字列');
eq(core.knkStringifyEquipment_([]), '', 'B6: 空配列→空文字');
eq(core.knkStringifyEquipment_(null), '', 'B7: null→空文字');

// ---- C. knkLabelWithinLimit_（15字ハードリミット） ----
ok(core.knkLabelWithinLimit_('右膝 深屈曲NG'), 'C1: 8字はOK');
ok(core.knkLabelWithinLimit_('123456789012345'), 'C2: ちょうど15字OK');
ok(!core.knkLabelWithinLimit_('1234567890123456'), 'C3: 16字はNG');
ok(!core.knkLabelWithinLimit_(''), 'C4: 空はNG（必須）');
ok(!core.knkLabelWithinLimit_(null), 'C5: nullはNG（落ちない）');

// ---- D. knkBadgeStyle_（forbid→🚫赤 / caution→⚠️黄） ----
eq(core.knkBadgeStyle_('forbid').icon, '🚫', 'D1: forbid→🚫');
eq(core.knkBadgeStyle_('caution').icon, '⚠️', 'D2: caution→⚠️');
ok(core.knkBadgeStyle_('forbid').cls === 'kinki-forbid', 'D3: forbidのcls');
ok(core.knkBadgeStyle_('caution').cls === 'kinki-caution', 'D4: cautionのcls');
ok(core.knkBadgeStyle_('へん').icon === '⚠️', 'D5: 未知値はcaution側に倒す（安全側）');

// ---- E. knkCanRelease_（恒久は解除ボタン非描画＝false） ----
ok(core.knkCanRelease_({ type: 'temporary' }) === true, 'E1: temporaryは解除可');
ok(core.knkCanRelease_({ type: 'permanent' }) === false, 'E2: permanentは解除不可');
ok(core.knkCanRelease_(null) === false, 'E3: null→false（落ちない・安全側）');

// ---- F. knkFilterActive_ ----
const recs = [
  { id: 'a', userId: '比嘉太郎', status: 'active', type: 'temporary', level: 'forbid', label: '右膝NG', targetEquipment: '["レッグプレス"]' },
  { id: 'b', userId: '比嘉太郎', status: 'released', type: 'temporary', level: 'caution', label: '旧制限', targetEquipment: '' },
  { id: 'c', userId: '田中花子', status: 'active', type: 'permanent', level: 'forbid', label: 'ペースメーカー', targetEquipment: '' },
];
eq(core.knkFilterActive_(recs).map(function (r) { return r.id; }), ['a', 'c'], 'F1: activeのみ');
eq(core.knkFilterActive_(null), [], 'F2: null→[]');

// ---- G. knkGroupByUser_（正規化氏名→active配列・注入normで突合） ----
const g = core.knkGroupByUser_(recs, norm);
eq(Object.keys(g).sort(), ['比嘉太郎', '田中花子'].sort(), 'G1: active利用者2名');
eq(g['比嘉太郎'].length, 1, 'G2: 比嘉はactive1件（releasedは除外）');

// ---- H. knkGroupByEquipment_（機器→制限者＋機器指定なし） ----
const active = core.knkFilterActive_(recs);
const byEq = core.knkGroupByEquipment_(active, EQUIP);
eq(byEq['レッグプレス'].map(function (r) { return r.userId; }), ['比嘉太郎'], 'H1: レッグプレスに比嘉');
eq(byEq['バイク'], [], 'H2: 該当なし機器は空配列');
eq(byEq['機器指定なし'].map(function (r) { return r.userId; }), ['田中花子'], 'H3: 機器空は「機器指定なし」へ');
ok(Object.keys(byEq).indexOf('機器指定なし') === Object.keys(byEq).length - 1, 'H4: 機器指定なしは末尾');

// ---- I. knkDetectUnmatched_（D7・台帳氏名集合と突合できないactiveを抽出） ----
const users = ['比嘉太郎', '田中花子'];
eq(core.knkDetectUnmatched_(active, users, norm), [], 'I1: 全員突合→unmatched空');
const orphan = active.concat([{ id: 'z', userId: '存在しない人', status: 'active', type: 'temporary', level: 'forbid', label: '謎', targetEquipment: '' }]);
eq(core.knkDetectUnmatched_(orphan, users, norm).map(function (r) { return r.id; }), ['z'], 'I2: 台帳に無い禁忌を検出（無音化しない）');
eq(core.knkDetectUnmatched_(orphan, [], norm).length, 3, 'I3: 台帳空なら全active unmatched（危険を隠さない）');

// ---- J. knkValidatePayload_（登録検証） ----
function base(over) {
  return Object.assign({ userId: '比嘉太郎', type: 'temporary', level: 'forbid', label: '右膝NG',
    sourceType: 'family', sourceName: '長男', receivedAt: '2026-07-14', receivedBy: '職員A', reviewDate: '2026-09-10' }, over || {});
}
ok(core.knkValidatePayload_(base()).ok === true, 'J1: 正常payloadはok');
ok(core.knkValidatePayload_(base({ label: '' })).ok === false, 'J2: label空はNG');
ok(core.knkValidatePayload_(base({ label: '1234567890123456' })).ok === false, 'J3: label16字はNG');
ok(core.knkValidatePayload_(base({ type: 'temporary', reviewDate: '' })).ok === false, 'J4: temporaryでreviewDate空はNG');
ok(core.knkValidatePayload_(base({ type: 'permanent', reviewDate: '' })).ok === true, 'J5: permanentはreviewDate不要');
ok(core.knkValidatePayload_(base({ userId: '' })).ok === false, 'J6: userId空はNG');
ok(core.knkValidatePayload_(base({ sourceType: 'family', sourceName: '' })).ok === false, 'J7: sourceName空はNG');
ok(core.knkValidatePayload_(base({ level: 'xxx' })).ok === false, 'J8: 不正levelはNG');
ok(core.knkValidatePayload_(base({ type: 'xxx' })).ok === false, 'J9: 不正typeはNG');

// ---- K. knkValidateRelease_（解除検証） ----
function rbase(over) { return Object.assign({ releaseReason: '症状改善により制限解除', releaseSource: '主治医（口頭）', releasedBy: '職員A', releasedAt: '2026-07-14' }, over || {}); }
ok(core.knkValidateRelease_(rbase()).ok === true, 'K1: 正常解除はok');
ok(core.knkValidateRelease_(rbase({ releaseSource: '' })).ok === false, 'K2: 指示元空はNG（なんとなく解除防止）');
ok(core.knkValidateRelease_(rbase({ releaseReason: '' })).ok === false, 'K3: 理由空はNG');
ok(core.knkValidateRelease_(rbase({ releaseReason: 'その他', releaseNote: '' })).ok === false, 'K4: その他で補足空はNG');
ok(core.knkValidateRelease_(rbase({ releaseReason: 'その他', releaseNote: '医師判断' })).ok === true, 'K5: その他＋補足ありはok');

console.log('kinki-core: pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
