# 禁忌・運動制限管理 P1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 医師等からの運動制限（禁忌）を現場の動線上（セッションボードのバッジ・配置登録の機器別ビュー）に必ず出し、登録・解除・履歴を本アプリで完結させる（P1）。

**Architecture:** 既存yawaragi-boardの3層に準拠。純関数コア `kinki-core.js`（Node/vmでTDD）＋ `コード.js` に `action=kinki*` を additive 配線＋新アプリ `kinki.html`（版ゲート自己完結）。バッジは `session-board.html`、機器別ビュー導線は `genba.html` に最小改修。`userId`=利用者名（既存規約）。物理削除せず `status` で履歴保持。氏名突合できない禁忌は `unmatched[]` で必ず表面化（D7）。

**Tech Stack:** Google Apps Script（clasp・rootDir=`gas/yawaragi-board/`）、素のJS純関数、Node標準のみのテスト（jsdom不使用・`vm`＋DOMスタブ）、GitHub Pages配信＋version.txt版ゲート。

**設計書:** `docs/superpowers/specs/2026-07-14-kinki-management-design.md`（D1〜D9）

---

## 前提・環境ルール（着手前に必読）

- **本体は master 固定。** 実装は専用worktreeで行う：
  ```bash
  git fetch origin
  git worktree add C:/tmp/wt-kinki -b feat/kinki-management origin/master
  ```
  以降の作業・コミットは `C:/tmp/wt-kinki` で行う。
- **コアとテストの置き場所（重要）:**
  - コア `gas/yawaragi-board/kinki-core.js` … clasp rootに含まれGASへpushされる（`module.exports` はGASで無害）。
  - テスト `scripts/test-*.js` … clasp root外なのでpushされない（`.claspignore`不要）。
- **jsdomは未導入。** HTMLテストは `scripts/test-session-board-html.js` と同じ `vm`＋DOMスタブ方式で書く。
- **コード.js改修前に必ず本番と突合**（本番のみの関数を消さない）。clasp操作はBashを `dangerouslyDisableSandbox:true` で。
- テスト実行は各ファイル `node scripts/test-xxx.js`（フレームワーク無し・`pass/fail` 自前集計）。

## ファイル構成（このP1で触るファイル）

| ファイル | 種別 | 責務 |
|---|---|---|
| `gas/yawaragi-board/kinki-core.js` | 新規 | 純関数（検証・active抽出・氏名/機器グルーピング・unmatched検出・解除可否・バッジ色・機器JSON変換） |
| `scripts/test-kinki-core.js` | 新規 | 上記の純関数テスト（Node） |
| `gas/yawaragi-board/コード.js` | 改修(additive) | `ensureKinkiSheet_` ＋ 7関数 ＋ doGet/doPost の `action=kinki*` 分岐 |
| `kinki.html` | 新規 | 詳細モーダル／機器別ビュー／登録／解除／履歴（版ゲート自己完結） |
| `scripts/test-kinki-html.js` | 新規 | kinki.html 描画/分岐スモーク（vm＋DOMスタブ） |
| `session-board.html` | 改修(最小) | バッジ描画＋unmatched赤字警告＋kinki.html導線 |
| `scripts/test-session-board-html.js` | 改修 | バッジ/警告の描画テスト追加 |
| `genba.html` | 改修(最小) | 「禁忌・制限を表示」ボタン1個（差分10行未満・カンバンDOM不変） |
| `portal`（getAppRegistry） | 改修 | kinki.html をアプリ台帳に登録 |
| `version.txt` / 版ゲート | 改修 | `bump-app-version.js` 経由で版上げ |

---

## Task 1: 純関数コア `kinki-core.js`（TDD）

**Files:**
- Create: `gas/yawaragi-board/kinki-core.js`
- Test: `scripts/test-kinki-core.js`

純関数は本アプリ全体の判定の唯一の正。氏名正規化は `session-board-core.js` の `sbNormalizeName_` を**注入**して使う（drift防止・二重定義しない）。

- [ ] **Step 1: 失敗するテストを書く**

Create `scripts/test-kinki-core.js`:

```javascript
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node scripts/test-kinki-core.js`
Expected: FAIL（`Cannot find module ... kinki-core.js`）

- [ ] **Step 3: `kinki-core.js` を実装**

Create `gas/yawaragi-board/kinki-core.js`:

```javascript
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node scripts/test-kinki-core.js`
Expected: PASS（`kinki-core: pass=NN fail=0`）

- [ ] **Step 5: session-board-core のテストも壊れていないことを確認（回帰）**

Run: `node scripts/test-session-board.js`
Expected: PASS（既存緑のまま）

- [ ] **Step 6: コミット**

```bash
git add gas/yawaragi-board/kinki-core.js scripts/test-kinki-core.js
git commit -m "feat(kinki): 純関数コア kinki-core.js（機器/氏名グルーピング・unmatched検出・検証）TDD"
```

---

## Task 2: GAS バックエンド（`コード.js` additive）

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（末尾に禁忌セクションを追記＋doGet/doPostに分岐）

> **着手前:** `clasp pull` で本番と突合し、本番のみの関数を消していないことを確認（memory `clasp-gas-deploy-url-iji`）。追記は既存関数に触れない additive のみ。

禁忌シート列（21列・設計書§3.1順）:
```
id, userId, type, level, label, detail, targetEquipment, sourceType, sourceName,
receivedAt, receivedBy, background, reviewDate, status, releasedAt, releaseReason,
releaseNote, releaseSource, releasedBy, createdAt, updatedAt
```

- [ ] **Step 1: 禁忌セクションを `コード.js` 末尾に追記**

以下をファイル末尾に追加（`SS_ID`・`respond`・`sbNormalizeName_`・`KINKI_EQUIPMENT` 等はGAS内グローバルとして既存/Task1で利用可能）:

```javascript
// ===== 禁忌・運動制限管理（2026-07-14・additive・物理削除しない）=====
var KINKI_SHEET_NAME = '禁忌';
var KINKI_HEADERS = [
  'id', 'userId', 'type', 'level', 'label', 'detail', 'targetEquipment', 'sourceType', 'sourceName',
  'receivedAt', 'receivedBy', 'background', 'reviewDate', 'status', 'releasedAt', 'releaseReason',
  'releaseNote', 'releaseSource', 'releasedBy', 'createdAt', 'updatedAt'
];

function ensureKinkiSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(KINKI_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(KINKI_SHEET_NAME);
    sheet.getRange(1, 1, 1, KINKI_HEADERS.length).setValues([KINKI_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, KINKI_HEADERS.length).setBackground('#9b2c2c').setFontColor('#ffffff').setFontWeight('bold');
    // TZずれ回避：日付/日時列はテキスト書式で保持（memory: シートTZ罠）
    sheet.getRange(1, 1, sheet.getMaxRows(), KINKI_HEADERS.length).setNumberFormat('@');
  }
  return sheet;
}

function knkRowToObj_(row) {
  var o = {};
  for (var i = 0; i < KINKI_HEADERS.length; i++) o[KINKI_HEADERS[i]] = row[i] === undefined ? '' : String(row[i]);
  return o;
}

function knkReadAll_() {
  var sheet = ensureKinkiSheet_();
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue; // id空行スキップ
    out.push(knkRowToObj_(values[i]));
  }
  return out;
}

function knkNow_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'); }
function knkToday_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }

// --- 台帳の在籍利用者名一覧（unmatched突合用・非中止のみ）---
function knkActiveUserNames_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var uSheet = ss.getSheetByName('利用者台帳');
  if (!uSheet) return [];
  var uv = uSheet.getDataRange().getValues();
  if (uv.length < 2) return [];
  var uh = uv[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(uh, ['名前', '氏名', '利用者名']);
  var stCol = findCol(uh, ['利用ステータス']);
  if (stCol < 0) stCol = findColP(uh, 'ステータス');
  var names = [];
  for (var i = 1; i < uv.length; i++) {
    var nm = String(uv[i][nameCol] || '').trim();
    if (!nm) continue;
    if (stCol >= 0) {
      var st = String(uv[i][stCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    names.push(nm);
  }
  return names;
}

function createKinki(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var p;
  try { p = JSON.parse(e.parameter.payload); } catch (err) { return respond({ ok: false, error: 'payload不正' }, callback); }
  var v = knkValidatePayload_(p);
  if (!v.ok) return respond({ ok: false, error: v.error }, callback);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = ensureKinkiSheet_();
    var now = knkNow_();
    var id = 'knk_' + Utilities.getUuid();
    var eq = knkStringifyEquipment_(p.targetEquipment || []);
    var row = [
      id, p.userId, p.type, p.level, p.label, p.detail || '', eq, p.sourceType, p.sourceName,
      p.receivedAt, p.receivedBy, p.background || '', p.type === 'temporary' ? (p.reviewDate || '') : '',
      'active', '', '', '', '', '', now, now
    ];
    sheet.appendRow(row);
    return respond({ ok: true, id: id }, callback);
  } finally { lock.releaseLock(); }
}

function updateKinki(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var id = e.parameter.id;
  var p;
  try { p = JSON.parse(e.parameter.payload); } catch (err) { return respond({ ok: false, error: 'payload不正' }, callback); }
  var v = knkValidatePayload_(p);
  if (!v.ok) return respond({ ok: false, error: v.error }, callback);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = ensureKinkiSheet_();
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) !== id) continue;
      var eq = knkStringifyEquipment_(p.targetEquipment || []);
      var updated = [
        id, p.userId, p.type, p.level, p.label, p.detail || '', eq, p.sourceType, p.sourceName,
        p.receivedAt, p.receivedBy, p.background || '',
        p.type === 'temporary' ? (p.reviewDate || '') : '',
        values[i][13], values[i][14], values[i][15], values[i][16], values[i][17], values[i][18],
        values[i][19] || knkNow_(), knkNow_()
      ];
      sheet.getRange(i + 1, 1, 1, KINKI_HEADERS.length).setValues([updated]);
      return respond({ ok: true, id: id }, callback);
    }
    return respond({ ok: false, error: 'no_such_id' }, callback);
  } finally { lock.releaseLock(); }
}

function releaseKinki(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var id = e.parameter.id;
  var p;
  try { p = JSON.parse(e.parameter.payload); } catch (err) { return respond({ ok: false, error: 'payload不正' }, callback); }
  var v = knkValidateRelease_(p);
  if (!v.ok) return respond({ ok: false, error: v.error }, callback);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = ensureKinkiSheet_();
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) !== id) continue;
      if (String(values[i][2]) === 'permanent') return respond({ ok: false, error: '恒久禁忌は解除できません' }, callback);
      // status=released を上書き（物理削除しない）
      sheet.getRange(i + 1, 14).setValue('released');           // status
      sheet.getRange(i + 1, 15).setValue(p.releasedAt || knkToday_()); // releasedAt
      sheet.getRange(i + 1, 16).setValue(p.releaseReason);      // releaseReason
      sheet.getRange(i + 1, 17).setValue(p.releaseNote || '');  // releaseNote
      sheet.getRange(i + 1, 18).setValue(p.releaseSource);      // releaseSource
      sheet.getRange(i + 1, 19).setValue(p.releasedBy);         // releasedBy
      sheet.getRange(i + 1, 21).setValue(knkNow_());            // updatedAt
      return respond({ ok: true, id: id }, callback);
    }
    return respond({ ok: false, error: 'no_such_id' }, callback);
  } finally { lock.releaseLock(); }
}

function getKinkiByUser(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var userId = String((e.parameter.userId || '')).trim();
  var all = knkReadAll_();
  var target = String(sbNormalizeName_(userId));
  var mine = all.filter(function (r) { return String(sbNormalizeName_(r.userId)) === target; });
  return respond({ ok: true, userId: userId, active: knkFilterActive_(mine), all: mine, equipment: KINKI_EQUIPMENT }, callback);
}

function getKinkiHistory(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var userId = String((e.parameter.userId || '')).trim();
  var all = knkReadAll_();
  var target = String(sbNormalizeName_(userId));
  var mine = all.filter(function (r) { return String(sbNormalizeName_(r.userId)) === target; });
  return respond({ ok: true, userId: userId, history: mine }, callback);
}

function getKinkiForSession(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var all = knkReadAll_();
  var active = knkFilterActive_(all);
  var matched = knkGroupByUser_(active, sbNormalizeName_);
  var users = knkActiveUserNames_();
  var unmatched = knkDetectUnmatched_(active, users, sbNormalizeName_);
  return respond({ ok: true, matched: matched, unmatched: unmatched, equipment: KINKI_EQUIPMENT }, callback);
}
```

- [ ] **Step 2: doGet に GET系の分岐を追記**

`doGet(e)` 内の既存 `action` 分岐群（`morningDigest`/`sessionBoard` の近く・line 1149-1160付近）に追加:

```javascript
  if (e && e.parameter && e.parameter.action === 'getKinkiForSession') { return getKinkiForSession(e); }
  if (e && e.parameter && e.parameter.action === 'getKinkiByUser') { return getKinkiByUser(e); }
  if (e && e.parameter && e.parameter.action === 'getKinkiHistory') { return getKinkiHistory(e); }
```

- [ ] **Step 3: doPost に POST系の分岐を追記**

`doPost(e)`（line 3827付近）の action 分岐に追加（フロントは `no-cors` POST・`e.parameter.payload` にJSON文字列を載せる）:

```javascript
  if (e && e.parameter && e.parameter.action === 'createKinki') { return createKinki(e); }
  if (e && e.parameter && e.parameter.action === 'updateKinki') { return updateKinki(e); }
  if (e && e.parameter && e.parameter.action === 'releaseKinki') { return releaseKinki(e); }
```

- [ ] **Step 4: 構文チェック（Node）**

Run: `node -e "new Function(require('fs').readFileSync('gas/yawaragi-board/コード.js','utf8')); console.log('syntax OK')"`
Expected: `syntax OK`（構文エラーが無いこと。GAS固有APIは実行しないので参照エラーは出ない）

- [ ] **Step 5: 純関数依存が壊れていないか再確認**

Run: `node scripts/test-kinki-core.js`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add gas/yawaragi-board/コード.js
git commit -m "feat(kinki): GAS配線 ensureKinkiSheet_＋7関数＋doGet/doPost分岐（additive・物理削除なし）"
```

> **本番pull突合と clasp push/deploy は Task 6（リリース）でまとめて社長承認のうえ実施。** ここではコード追記のみ。

---

## Task 3: `kinki.html`（新アプリ・詳細/機器別ビュー/登録/解除/履歴）

**Files:**
- Create: `kinki.html`
- Test: `scripts/test-kinki-html.js`

版ゲート自己完結（既存アプリと同じ `shared.js?v=` 参照＋version.txt ゲート）。GASエンドポイントURLは既存アプリ（session-board.html 等）と同じボードGASの exec URL を使う。純ロジックは Task1 のコアと同一実装を `<script>` 内にも持つ（フロントは独立配信のためインライン複製・値はコアと一致させる）。

画面モード（URLパラメータ）:
- `?user=氏名` … 利用者の詳細モーダル＋履歴（既定）
- `?view=equipment&date=YYYY-MM-DD` … 機器別ビュー
- `?user=氏名&mode=new` … 新規登録
- `?user=氏名&mode=release&id=knk_...` … 解除

- [ ] **Step 1: kinki.html の骨組み（version-gate＋ヘッダ＋ルーティング）を作る**

Create `kinki.html`。`<head>` は既存アプリ（例: `oral-plan.html`）の version-gate ブロックをそのまま踏襲。`<body>` 末尾 `<script>` に以下のコア定数・純関数を**インラインで複製**（Task1と同一の値・シグネチャ）:

```html
<script>
// --- kinki-core（フロント複製・値はgas/yawaragi-board/kinki-core.jsと一致させる）---
var KINKI_EQUIPMENT = ['干渉波','WB','足温器','滑車','バイク','足裏マッサージ器','下肢マッサージ器','ヒップアブダクション','チェストプレス','レッグカール','レッグプレス'];
var KINKI_RELEASE_REASONS = ['医師より運動制限解除の指示','症状改善により制限解除','術後経過良好・主治医許可','骨折治癒・荷重制限解除','期間満了（一時的制限の終了）','制限内容の変更（新規登録し直し）','誤登録・重複の取り消し','その他'];
function knkParseEquipment_(cell){ if(!cell) return []; try{ var v=JSON.parse(cell); return Array.isArray(v)?v.filter(function(x){return !!x;}).map(String):[]; }catch(e){ return []; } }
function knkBadgeStyle_(level){ return level==='forbid'?{icon:'🚫',cls:'kinki-forbid'}:{icon:'⚠️',cls:'kinki-caution'}; }
function knkCanRelease_(rec){ return !!rec && rec.type==='temporary'; }
function knkGroupByEquipment_(active, equipList){
  var out={}; for(var e=0;e<equipList.length;e++) out[equipList[e]]=[]; out['機器指定なし']=[];
  for(var i=0;i<(active||[]).length;i++){ var rec=active[i]; var eqs=knkParseEquipment_(rec.targetEquipment);
    if(!eqs.length){ out['機器指定なし'].push(rec); continue; }
    for(var j=0;j<eqs.length;j++){ if(out.hasOwnProperty(eqs[j])) out[eqs[j]].push(rec); else out['機器指定なし'].push(rec); } }
  return out;
}
// GASエンドポイント（session-board.html と同じ exec URL を貼る）
var KINKI_GAS_URL = 'https://script.google.com/macros/s/AKfycbwo…/exec'; // ← session-board.html の値と一致させる
// JSONP GET
function knkGet(params, cb){ var s=document.createElement('script'); var name='knkcb_'+Math.floor(performance.now()); window[name]=function(d){ cb(d); delete window[name]; s.remove(); }; var q=Object.keys(params).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);}).join('&'); s.src=KINKI_GAS_URL+'?'+q+'&callback='+name; document.body.appendChild(s); }
// no-cors POST（genbaのPOST同様・成否はUI楽観・memory: genba-nocors-post）
function knkPost(action, fields){ var fd=new FormData(); fd.append('action',action); Object.keys(fields).forEach(function(k){ fd.append(k, fields[k]); }); return fetch(KINKI_GAS_URL,{method:'POST',mode:'no-cors',body:fd}); }
function knkParam(name){ var m=new RegExp('[?&]'+name+'=([^&]*)').exec(location.search); return m?decodeURIComponent(m[1]):''; }
function knkRoute(){ var view=knkParam('view'); if(view==='equipment') return renderEquipmentView(); var mode=knkParam('mode'); if(mode==='new') return renderRegister(); if(mode==='release') return renderRelease(); return renderUserDetail(); }
window.addEventListener('DOMContentLoaded', knkRoute);
</script>
```

CSS（`<style>`）に最低限:
```css
.kinki-forbid{color:#9b2c2c;font-weight:700}
.kinki-caution{color:#975a16;font-weight:700}
.kinki-badge{display:inline-block;margin-right:8px;font-size:15px}
/* 解除の確認モーダル（自前・confirm()不使用）*/
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000}
.modal{background:#fff;padding:20px;border-radius:10px;max-width:90%;width:340px;text-align:center}
.modal-actions{margin-top:16px;display:flex;gap:12px;justify-content:center}
.modal-actions button{padding:10px 18px;font-size:15px}
```

- [ ] **Step 2: 詳細モーダル＋履歴（renderUserDetail）を実装**

`renderUserDetail` は `getKinkiByUser` を呼び、active を上部にカード表示、`all.filter(status===released)` を「過去の制限（解除済み）」折りたたみに表示。各activeカードに `[編集]`、`knkCanRelease_(rec)===true` のときのみ `[解除する][期限を延ばす]` を **DOM生成**（permanentは生成しない）。

```html
<script>
function renderUserDetail(){
  var user = knkParam('user');
  document.getElementById('app').innerHTML = '<p>読込中…</p>';
  knkGet({ action:'getKinkiByUser', userId:user }, function(d){
    if(!d || !d.ok){ document.getElementById('app').innerHTML='<p>取得失敗</p>'; return; }
    var active = d.active || [];
    var released = (d.all||[]).filter(function(r){ return r.status==='released'; });
    var h = '<h2>'+user+' 様</h2>';
    if(!active.length) h += '<p>現在有効な禁忌・制限はありません。</p>';
    active.forEach(function(r){
      var st = knkBadgeStyle_(r.level);
      h += '<div class="card"><div class="'+st.cls+'">'+st.icon+' '+r.label+(r.type==='permanent'?'（恒久）':'（期限付き）')+'</div>';
      h += '<div>内容：'+(r.detail||'')+'</div>';
      var eqs = knkParseEquipment_(r.targetEquipment);
      if(eqs.length) h += '<div>対象機器：'+eqs.join(' / ')+'</div>';
      h += '<div>情報元：'+r.sourceName+'（'+sourceLabel(r.sourceType)+'）／受領 '+r.receivedAt+'／受けた職員 '+r.receivedBy+'</div>';
      if(r.background) h += '<div>経緯：'+r.background+'</div>';
      if(r.type==='temporary') h += '<div>見直し予定 '+r.reviewDate+'</div>';
      h += '<div class="actions"><a href="?user='+encodeURIComponent(user)+'&mode=new">編集はこちら（新規登録）</a>';
      if(knkCanRelease_(r)){ h += ' <a href="?user='+encodeURIComponent(user)+'&mode=release&id='+r.id+'">解除する</a>'; }
      h += '</div></div>';
    });
    h += '<details><summary>過去の制限（解除済み） '+released.length+'件</summary>';
    released.forEach(function(r){ h += '<div class="card released">'+r.label+'（解除 '+r.releasedAt+'・理由：'+r.releaseReason+'）</div>'; });
    h += '</details>';
    h += '<p><a href="?user='+encodeURIComponent(user)+'&mode=new">＋ 新規登録</a></p>';
    document.getElementById('app').innerHTML = h;
  });
}
function sourceLabel(t){ return ({doctor_doc:'医師（文書）',doctor_oral:'医師（口頭伝達）',caremgr:'ケアマネ経由',family:'家族',self:'本人'})[t]||t; }
</script>
```

- [ ] **Step 3: 機器別ビュー（renderEquipmentView）を実装**

`getKinkiForSession` を呼び `matched` を全active配列に展開して `knkGroupByEquipment_` で機器別表示。`unmatched>0` なら上部に赤字警告も出す（配置登録から来た担当者にも見せる）。

```html
<script>
function renderEquipmentView(){
  var date = knkParam('date') || '';
  knkGet({ action:'getKinkiForSession', date:date }, function(d){
    if(!d || !d.ok){ document.getElementById('app').innerHTML='<p>取得失敗</p>'; return; }
    var active = [];
    Object.keys(d.matched||{}).forEach(function(k){ active = active.concat(d.matched[k]); });
    var byEq = knkGroupByEquipment_(active, d.equipment || KINKI_EQUIPMENT);
    var h = '<h2>機器別 禁忌・制限</h2>';
    if((d.unmatched||[]).length) h += '<div class="warn">⚠️ 突合できない禁忌が '+d.unmatched.length+' 件あります（氏名を確認してください）</div>';
    Object.keys(byEq).forEach(function(eq){
      var list = byEq[eq];
      h += '<div class="eqrow"><b>■ '+eq+'</b> ';
      h += list.length ? list.map(function(r){ var s=knkBadgeStyle_(r.level); return '<span class="'+s.cls+'">'+r.userId+s.icon+'</span>'; }).join(' / ') : '（なし）';
      h += '</div>';
    });
    document.getElementById('app').innerHTML = h;
  });
}
</script>
```

CSS に `.warn{color:#9b2c2c;font-weight:700;border:2px solid #9b2c2c;padding:8px;margin:8px 0}` を追加。

- [ ] **Step 4: 登録画面（renderRegister）を実装**

設計書§5.4の入力順で9項目。`type=temporary` のときだけ見直し予定日を表示・必須。labelは `maxlength=15`＋文字数カウンタ。機器は11チェックボックス（任意）。送信時にフロント検証→`knkPost('createKinki', {payload:JSON.stringify(payload)})`→成功楽観で `?user=...` に戻る。

```html
<script>
function renderRegister(){
  var user = knkParam('user');
  var eqBoxes = KINKI_EQUIPMENT.map(function(e){ return '<label><input type="checkbox" class="eqchk" value="'+e+'"> '+e+'</label>'; }).join(' ');
  document.getElementById('app').innerHTML =
    '<h2>'+user+' 様 / 禁忌・制限の登録</h2>'+
    '<div>種別：<label><input type="radio" name="ktype" value="permanent"> 恒久禁忌</label>'+
    '<label><input type="radio" name="ktype" value="temporary" checked> 期限付き制限</label></div>'+
    '<div>レベル：<label><input type="radio" name="klevel" value="forbid" checked> 🚫禁止</label>'+
    '<label><input type="radio" name="klevel" value="caution"> ⚠️要注意</label></div>'+
    '<div>対象機器（任意・複数可）：'+eqBoxes+'</div>'+
    '<div>バッジ文言（15字以内・必須）：<input id="klabel" maxlength="15" oninput="document.getElementById(\'kcnt\').textContent=this.value.length"> <span id="kcnt">0</span>/15</div>'+
    '<div>詳細：<textarea id="kdetail"></textarea></div>'+
    '<div>情報元：<select id="ksrc"><option value="doctor_doc">医師（文書）</option><option value="doctor_oral">医師（口頭伝達）</option><option value="caremgr">ケアマネ経由</option><option value="family" selected>家族</option><option value="self">本人</option></select>'+
    ' 氏名・続柄：<input id="ksrcname"></div>'+
    '<div>受領日：<input id="krecv" type="date"> 受けた職員：<input id="kby"></div>'+
    '<div>経緯（任意）：<textarea id="kbg"></textarea></div>'+
    '<div id="kreviewwrap">見直し予定日：<input id="kreview" type="date"></div>'+
    '<button id="ksubmit">登録する</button> <a href="?user='+encodeURIComponent(user)+'">戻る</a>';
  document.getElementById('krecv').value = new Date().toISOString().slice(0,10);
  document.querySelectorAll('input[name=ktype]').forEach(function(r){ r.addEventListener('change', function(){ document.getElementById('kreviewwrap').style.display = (document.querySelector('input[name=ktype]:checked').value==='temporary')?'block':'none'; }); });
  document.getElementById('ksubmit').addEventListener('click', function(){
    var payload = {
      userId: user,
      type: document.querySelector('input[name=ktype]:checked').value,
      level: document.querySelector('input[name=klevel]:checked').value,
      label: document.getElementById('klabel').value.trim(),
      detail: document.getElementById('kdetail').value.trim(),
      targetEquipment: Array.prototype.slice.call(document.querySelectorAll('.eqchk:checked')).map(function(c){ return c.value; }),
      sourceType: document.getElementById('ksrc').value,
      sourceName: document.getElementById('ksrcname').value.trim(),
      receivedAt: document.getElementById('krecv').value,
      receivedBy: document.getElementById('kby').value.trim(),
      background: document.getElementById('kbg').value.trim(),
      reviewDate: document.getElementById('kreview').value
    };
    var err = clientValidate(payload);
    if(err){ alert(err); return; }
    document.getElementById('ksubmit').disabled = true; // 連打防止
    knkPost('createKinki', { payload: JSON.stringify(payload) }).then(function(){ location.href = '?user='+encodeURIComponent(user); });
  });
}
function clientValidate(p){
  if(!p.label || p.label.length>15) return 'バッジ文言は1〜15字で必須です';
  if(!p.sourceName) return '情報元氏名は必須です';
  if(!p.receivedBy) return '受けた職員は必須です';
  if(p.type==='temporary' && !p.reviewDate) return '期限付きは見直し予定日が必須です';
  return '';
}
</script>
```

- [ ] **Step 5: 解除フロー（確認モーダル → 入力画面）を実装（D10）**

**2段構成。まず自前の確認モーダル（`confirm()` 禁止）を出し、[解除する] で入力画面へ。** 確認モーダルは対象 `label` を動的表示し、`level` で 🚫/⚠️ を切替、「解除後バッジが消える」旨を明記、`[キャンセル]`/`[解除する]` の2択。誤タップ防止が目的。対象レコードは `getKinkiByUser` の active から `id` で引く。

```html
<script>
// 解除エントリ：確認モーダル（自前・confirm()は使わない）を先に出す
function renderRelease(){
  var user = knkParam('user'); var id = knkParam('id');
  knkGet({ action:'getKinkiByUser', userId:user }, function(d){
    var rec = ((d && d.active) || []).filter(function(r){ return r.id === id; })[0];
    if(!rec){ document.getElementById('app').innerHTML = '<p>対象が見つかりません（既に解除済みの可能性）。</p><a href="?user='+encodeURIComponent(user)+'">戻る</a>'; return; }
    var st = knkBadgeStyle_(rec.level);
    // 確認モーダル（オーバーレイ）
    document.getElementById('app').innerHTML =
      '<div class="modal-overlay"><div class="modal"><p>この禁忌を解除します。</p>'+
      '<p class="'+st.cls+'" style="font-size:18px">'+st.icon+' '+rec.label+'</p>'+
      '<p>解除後、セッションボードのバッジは消えます。</p>'+
      '<div class="modal-actions"><button id="rcancel">キャンセル</button> <button id="rok">解除する</button></div></div></div>';
    document.getElementById('rcancel').addEventListener('click', function(){ location.href = '?user='+encodeURIComponent(user); });
    document.getElementById('rok').addEventListener('click', function(){ renderReleaseForm(user, id); });
  });
}
// 入力画面（確認モーダルで [解除する] 押下後）
function renderReleaseForm(user, id){
  var opts = KINKI_RELEASE_REASONS.map(function(r){ return '<option>'+r+'</option>'; }).join('');
  document.getElementById('app').innerHTML =
    '<h2>'+user+' 様 / 制限の解除</h2>'+
    '<div>解除理由：<select id="rreason">'+opts+'</select></div>'+
    '<div id="rnotewrap">補足（「その他」選択時は必須）：<textarea id="rnote"></textarea></div>'+
    '<div>解除の指示元（氏名・続柄・口頭/文書）：<input id="rsrc"></div>'+
    '<div>解除日：<input id="rdate" type="date"></div>'+
    '<div>解除操作者：<input id="rby"></div>'+
    '<button id="rsubmit">解除する</button> <a href="?user='+encodeURIComponent(user)+'">戻る</a>';
  document.getElementById('rdate').value = new Date().toISOString().slice(0,10);
  document.getElementById('rsubmit').addEventListener('click', function(){
    var payload = { releaseReason: document.getElementById('rreason').value, releaseNote: document.getElementById('rnote').value.trim(),
      releaseSource: document.getElementById('rsrc').value.trim(), releasedAt: document.getElementById('rdate').value, releasedBy: document.getElementById('rby').value.trim() };
    if(!payload.releaseSource){ alert('解除の指示元は必須です'); return; }
    if(payload.releaseReason==='その他' && !payload.releaseNote){ alert('「その他」選択時は補足が必須です'); return; }
    if(!payload.releasedBy){ alert('解除操作者は必須です'); return; }
    document.getElementById('rsubmit').disabled = true;
    knkPost('releaseKinki', { id: id, payload: JSON.stringify(payload) }).then(function(){ location.href = '?user='+encodeURIComponent(user); });
  });
}
</script>
```

- [ ] **Step 6: kinki.html のスモークテストを書く（vm＋DOMスタブ）**

Create `scripts/test-kinki-html.js`（`test-session-board-html.js` と同型：最後の `<script>` 群を結合し vm で実行、`document`/`window`/`fetch`/JSONP をスタブ。`knkGroupByEquipment_`・`knkCanRelease_`・`knkBadgeStyle_`・`clientValidate` の分岐と、`?user=` 詳細で fixture を描画したとき **permanent行に解除リンクが無い** ことを検証）:

```javascript
// kinki.html フロント スモーク  実行: node scripts/test-kinki-html.js
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'kinki.html'), 'utf8');
// 全 <script> を結合
let code = ''; let re = /<script>([\s\S]*?)<\/script>/g, m;
while ((m = re.exec(html))) code += '\n' + m[1];

let pass = 0, fail = 0;
function ok(c, l){ if(c) pass++; else { fail++; console.error('  [FAIL] '+l); } }

// --- DOMスタブ ---
let appHTML = '';
const appEl = { set innerHTML(v){ appHTML = v; }, get innerHTML(){ return appHTML; } };
function stubEl(){ return { style:{}, value:'', textContent:'', addEventListener(){}, querySelectorAll(){return[];}, appendChild(){}, remove(){} }; }
const sandbox = {
  console, encodeURIComponent, decodeURIComponent, JSON, Array, Object, String, RegExp, Math, performance:{ now:()=>1 },
  location:{ search:'?user=' + encodeURIComponent('比嘉太郎'), href:'' },
  document:{ getElementById:(id)=> id==='app'?appEl:stubEl(), createElement:()=>stubEl(), body:{ appendChild(){} }, querySelectorAll:()=>[], querySelector:()=>({value:'temporary'}) },
  window:{ addEventListener(){} },
  fetch:()=>Promise.resolve({}),
};
sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(code, sandbox);

// --- 純ロジック検証 ---
ok(sandbox.KINKI_EQUIPMENT.length === 11, 'H1: 機器11種');
ok(sandbox.knkCanRelease_({ type:'permanent' }) === false, 'H2: permanentは解除不可');
ok(sandbox.knkCanRelease_({ type:'temporary' }) === true, 'H3: temporaryは解除可');
ok(sandbox.knkBadgeStyle_('forbid').icon === '🚫', 'H4: forbid→🚫');
const byEq = sandbox.knkGroupByEquipment_([{ userId:'A', level:'forbid', targetEquipment:'["バイク"]' }, { userId:'B', level:'caution', targetEquipment:'' }], sandbox.KINKI_EQUIPMENT);
ok(byEq['バイク'].length === 1, 'H5: バイクに1名');
ok(byEq['機器指定なし'].length === 1, 'H6: 機器空は機器指定なし');
ok(sandbox.clientValidate({ label:'', type:'temporary', reviewDate:'x', sourceName:'x', receivedBy:'x' }), 'H7: label空はエラー文字列');
ok(!sandbox.clientValidate({ label:'右膝NG', type:'permanent', sourceName:'長男', receivedBy:'職員' }), 'H8: 恒久＋必須充足はOK');

// --- 詳細描画：permanentに解除リンクが出ない（D:恒久解除ボタン非描画） ---
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'p1', userId:'比嘉太郎', type:'permanent', level:'forbid', label:'ペースメーカー', targetEquipment:'', sourceName:'長男', sourceType:'family', receivedAt:'2026-07-10', receivedBy:'職員' }], all:[] }); };
sandbox.renderUserDetail();
ok(appHTML.indexOf('mode=release') < 0, 'H9: permanent詳細に解除リンクが無い（DOM非生成）');
ok(appHTML.indexOf('ペースメーカー') >= 0, 'H10: ラベルは描画される');

// --- 解除の確認モーダル（D10・confirm()不使用・labelとバッジ消える旨・2択） ---
ok(code.indexOf('confirm(') < 0, 'H11: ブラウザ標準confirm()を使っていない');
sandbox.location.search = '?user=' + encodeURIComponent('比嘉太郎') + '&mode=release&id=t1';
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'t1', userId:'比嘉太郎', type:'temporary', level:'forbid', label:'右膝 深屈曲NG', targetEquipment:'' }] }); };
sandbox.renderRelease();
ok(appHTML.indexOf('右膝 深屈曲NG') >= 0, 'H12: 確認モーダルに対象labelを動的表示');
ok(appHTML.indexOf('🚫') >= 0, 'H13: levelに応じたアイコン（forbid→🚫）');
ok(appHTML.indexOf('バッジは消えます') >= 0, 'H14: 「バッジが消える」旨を明記');
ok(appHTML.indexOf('キャンセル') >= 0 && appHTML.indexOf('解除する') >= 0, 'H15: キャンセル/解除するの2択');

console.log('kinki-html: pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 7: テスト実行**

Run: `node scripts/test-kinki-html.js`
Expected: PASS（`kinki-html: pass=NN fail=0`）。落ちる場合はスタブ不足を `test-session-board-html.js` を参照して補う。

- [ ] **Step 8: コミット**

```bash
git add kinki.html scripts/test-kinki-html.js
git commit -m "feat(kinki): kinki.html（詳細/機器別ビュー/登録/解除/履歴・恒久解除ボタン非描画）＋vmスモーク"
```

---

## Task 4: `session-board.html` バッジ＋unmatched警告（最小改修）

**Files:**
- Modify: `session-board.html`（描画に禁忌データ取得＋バッジ＋赤字警告を追加）
- Modify: `scripts/test-session-board-html.js`（テスト追加）

セッションボードは既存の1コールに加え、`getKinkiForSession(date)` を **もう1コール**取得（設計§4.1「1日1コール」＝禁忌用に独立1コール）。取得後、各利用者名の描画箇所で `matched[正規化名]` があればバッジを名前の後ろに付与、`unmatched>0` なら画面上部に赤字バナー。バッジ／名前タップで `kinki.html?user=氏名`。

- [ ] **Step 1: テストを先に追加（失敗確認）**

`scripts/test-session-board-html.js` に、禁忌 fixture を返す JSONP スタブと以下の検証を追加:
- `matched` にバッジ対象がいるとき、描画HTMLに `🚫`＋label が含まれる。
- `unmatched:[{...}]` のとき、上部に「突合できない禁忌」警告文字列が含まれる。
- `unmatched:[]` のとき、警告文字列が含まれない。

（既存のfixtureエコー関数に `getKinkiForSession` 分岐を足し、`renderKinkiBadges` 呼び出し後のDOMを検査する。具体アサーションは既存の `ok()` ヘルパを使う。）

Run: `node scripts/test-session-board-html.js` → 新規アサーションがFAIL。

- [ ] **Step 2: session-board.html に禁忌取得＋描画関数を追加**

`<script>` 内、既存 `boot`/`render` の近くに（正規化は既存 `sbNormalizeName_` 相当がボード内にあればそれを、無ければ簡易版を用意）:

```javascript
var KINKI_STATE = { matched: {}, unmatched: [] };
function knkNormName(s){ return String(s||'').replace(/\s|　/g,'').replace(/様$/,''); }
function fetchKinki(date, done){
  var name = 'knkcb_' + Date.now();
  window[name] = function(d){ if(d && d.ok){ KINKI_STATE.matched=d.matched||{}; KINKI_STATE.unmatched=d.unmatched||[]; } delete window[name]; if(done) done(); };
  var s = document.createElement('script');
  s.src = GAS_URL + '?action=getKinkiForSession&date=' + encodeURIComponent(date) + '&callback=' + name;
  document.body.appendChild(s);
}
function kinkiBadgeHTML(name){
  var list = KINKI_STATE.matched[knkNormName(name)] || [];
  if(!list.length) return '';
  return ' ' + list.map(function(r){ var icon = r.level==='forbid'?'🚫':'⚠️'; var cls = r.level==='forbid'?'kinki-forbid':'kinki-caution';
    return '<a class="kinki-badge '+cls+'" href="kinki.html?user='+encodeURIComponent(name)+'">'+icon+r.label+'</a>'; }).join('');
}
function kinkiWarnHTML(){
  if(!KINKI_STATE.unmatched.length) return '';
  return '<div class="kinki-warn">⚠️ 突合できない禁忌が '+KINKI_STATE.unmatched.length+' 件あります（氏名を確認してください）</div>';
}
```

CSS 追加:
```css
.kinki-forbid{color:#9b2c2c;font-weight:700}
.kinki-caution{color:#975a16;font-weight:700}
.kinki-badge{text-decoration:none;margin-left:4px}
.kinki-warn{color:#9b2c2c;font-weight:700;border:2px solid #9b2c2c;padding:8px;margin:8px 0;border-radius:6px}
```

- [ ] **Step 3: render に組み込む（最小差分）**

- ボード上部（既存ヘッダ描画直後）に `kinkiWarnHTML()` を挿入。
- 利用者名を出している各所（`sokutei`/`koukuMoni`/`koukuTaisou`/`kotan`/`birthday`/`residue` の name 描画箇所）で、名前の直後に `kinkiBadgeHTML(name)` を連結する。**既存のname出力を書き換えるのではなく末尾に付与するだけ**（差分最小）。
- 既存の `fetchBoard` 完了後に `fetchKinki(date, render)` を呼ぶ（1回）。既に描画済みなら再renderで反映。

- [ ] **Step 4: テスト実行**

Run: `node scripts/test-session-board-html.js`
Expected: PASS（既存＋新規アサーション全緑）

- [ ] **Step 5: コミット**

```bash
git add session-board.html scripts/test-session-board-html.js
git commit -m "feat(kinki): セッションボードに禁忌バッジ＋unmatched赤字警告（最小改修）"
```

---

## Task 5: `genba.html`（配置登録）に機器別ビュー導線（最小・カンバン不変）

**Files:**
- Modify: `genba.html`（ボタン1個・差分10行未満）

- [ ] **Step 1: 表示専用リンクボタンを1個追加**

配置登録画面のヘッダ付近（既存カンバン描画コンテナの外側・POSTを増やさない位置）に:

```html
<a id="kinki-eqview-link" class="btn"
   href="kinki.html?view=equipment"
   target="_blank" rel="noopener">禁忌・制限を表示</a>
```

表示中の対象日を持っているなら、既存の日付変数（例 `currentDate`／`selectedDate`）を使って `href` に `&date=YYYY-MM-DD` を付ける小関数を1つ追加（無ければ日付なしでも機器別ビューは当日扱いで動く）:

```javascript
(function(){
  var el = document.getElementById('kinki-eqview-link');
  if(el && typeof currentDate !== 'undefined' && currentDate){ el.href = 'kinki.html?view=equipment&date=' + encodeURIComponent(currentDate); }
})();
```

> **既存カンバンDOM・save_haichi・originガード周辺には一切触らない。** 追加は表示専用リンクのみ（書込POSTを増やさない）。

- [ ] **Step 2: 差分が10行未満・既存機能不変を目視確認**

Run: `git diff --stat genba.html`
Expected: 追加行 < 10。`save_haichi` 等の既存行に変更が無いこと（`git diff genba.html` で確認）。

- [ ] **Step 3: コミット**

```bash
git add genba.html
git commit -m "feat(kinki): 配置登録genba.htmlに機器別ビュー導線ボタン1個（表示専用・カンバン不変）"
```

---

## Task 6: リリース（portal登録・本番pull突合・clasp・版bump・push・verify）

> **本番書き込みは社長の手で。** クロコは直前で止まり、push/verify コマンドを提示する（CLAUDE.md ハードルール）。

**Files:**
- Modify: portal のアプリ台帳（`getAppRegistry`）
- Modify: `version.txt` ほか版ゲート（`bump-app-version.js` 経由のみ）

- [ ] **Step 1: portal台帳に kinki.html を登録**

`getAppRegistry`（コード.js内）に kinki.html のタイル1行を additive 追記（既存アプリ行に倣う。カテゴリ＝現場系、URL＝GitHub Pages上の `kinki.html`）。

- [ ] **Step 2: 全テスト緑を確認（リリース前ゲート）**

Run:
```bash
node scripts/test-kinki-core.js
node scripts/test-kinki-html.js
node scripts/test-session-board.js
node scripts/test-session-board-html.js
```
Expected: すべて `fail=0`。

- [ ] **Step 3: origin/master と揃える（先祖返り防止）**

```bash
git fetch origin
git rebase origin/master   # non-FFは正常。--force厳禁
```

- [ ] **Step 4: 本番GASと突合してから clasp push/deploy（社長承認のうえ）**

Bash を `dangerouslyDisableSandbox:true` で:
```bash
cd gas/yawaragi-board && clasp pull   # 本番差分を取り込み、コード.jsに本番のみ関数が消えていないか突合
# 突合OKなら:
clasp push
clasp deploy -i "<既存デプロイID>"    # 同一URL維持（新規作成禁止）
```
`ensureKinkiSheet_` は初回 `getKinkiForSession`/`createKinki` 呼び出し時に「禁忌」シートを自動作成する。

- [ ] **Step 5: 版bump（bump-app-version.js 経由のみ・手編集禁止）**

```bash
git fetch origin   # 版番号衝突の再確認
node scripts/bump-app-version.js <新版>   # 例 2026-07-14-01。version.txt＋session-board.html/genba.htmlのshared.js?v=を同時更新しcommit
```
> `kinki.html` も版ゲート対象なら、その `shared.js?v=` も同版に揃っていることを確認（bumpスクリプトの対象に含める）。

- [ ] **Step 6: 社長承認 → 手push → verify**

クロコは以下を提示して停止:
```
git push origin master
node scripts/bump-app-version.js --verify <新版>
git rev-parse HEAD; git rev-parse origin/master   # 一致確認
```
push 後、本番配信物（github.io の kinki.html / session-board.html / genba.html）に実際に変更が含まれることを Read で確認（memory `tool-output-corruption-trap`）。

- [ ] **Step 7: 完了メモリ更新**

`MEMORY.md` の進行中に禁忌P1の状態行を追加／更新（本番反映SHA・版・portal登録済みを証跡として記録）。P2（見直しリマインド＋伝達投稿）を宿題として残す。

---

## Self-Review（この計画の点検結果）

- **Spec coverage:** §2データ構造→Task2シート／§2.2機器→Task1 `KINKI_EQUIPMENT`／§3解除プリセット→Task1 `KINKI_RELEASE_REASONS`＋Task3解除画面／§4.1バッジ→Task4／§4.2詳細（恒久は解除非描画）→Task3 Step2＋Task3 Step6 H9／§4.3登録→Task3 Step4／§4.4解除→Task3 Step5／§5.3機器別ビュー→Task3 Step3／D7 unmatched→Task1 I＋Task2 getKinkiForSession＋Task4／D8他利用者非参照→モデルに項目を作らない（Task1/2に該当フィールド無し）で担保／D9 genba導線→Task5／§7 API 6関数（P1分）→Task2。P2（getPendingReviews/extendReview/morningDigest/伝達投稿）は本計画の対象外（別計画）。
- **Placeholder scan:** `KINKI_GAS_URL` と `clasp deploy -i "<既存デプロイID>"` は環境値。前者は「session-board.html の exec URL と一致させる」、後者は既存デプロイIDを使う旨を明記済み（TBDではなく参照指示）。他に未定義の関数・型は無し。
- **Type consistency:** コア関数名（`knkGroupByEquipment_`/`knkDetectUnmatched_`/`knkCanRelease_` 等）はTask1定義とTask3/4呼び出しで一致。シート列順（21列）はTask2の `KINKI_HEADERS` と `createKinki`/`updateKinki`/`releaseKinki` の列インデックスで一致（status=14列目・releasedAt=15…）。`matched`/`unmatched`/`equipment` のレスポンスキーはTask2定義とTask3/4消費で一致。

---

## 実装順まとめ
Task1（コアTDD）→ Task2（GAS配線）→ Task3（kinki.html）→ Task4（ボードバッジ）→ Task5（genba導線）→ Task6（リリース：社長承認push＋verify）。
Task1〜5はworktree `C:/tmp/wt-kinki` 上で完結。Task6の本番書込のみ社長の手。
