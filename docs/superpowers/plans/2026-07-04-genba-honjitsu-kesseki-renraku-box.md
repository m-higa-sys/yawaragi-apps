# 指示書③「本日の欠席連絡ボックス」実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** genba.html 欠席登録タブに「本日の欠席者だけ」を集めた連絡ボックスを新設し、朝9:00〜9:30にメール派へまとめて送信／電話派へ電話済み記録ができるようにする（誤送信の構造的ゼロ化）。

**Architecture:** 判定ロジックは `kesseki-box-core.js`（node テスト可能な *-core.js 流儀）に分離。GAS 側は新 POST アクション `send_box_cm_mails` 1本のみ追加（送信実体は既存 `sendAbsenceEmail` 流用・宛先は既存 `getUserCmContact`＝N列単一マスター再取得・二重送信ガードはサーバ側で `cmNotified` 再チェック）。電話済みは既存 POST `updateAbsenceCmNotified` をそのまま使用。一覧は既存 GET（`absences` + `cm_method_audit` + 既存 `absCmEmailMap`）のクライアントマージで新 GET 不要。

**Tech Stack:** genba.html（vanilla JS・版ゲート対象）／board GAS（clasp・同一URL @301へ）／node 構造証明テスト（scripts/test-*.js 流儀）

---

## 0. spec調査サマリ（既存部品の在庫）

| 必要機能 | 既存部品 | 状態 |
|---|---|---|
| 本日の欠席者一覧+連絡状態 | GET `?action=absences&month=` → date/name/unit/reason/reporter/**cmNotified**/lastOperator/lastMethod | ✅そのまま使える（指示書②ステップ3で実証済み） |
| メール/電話派・事業所・担当 | GET `?action=cm_method_audit` → userName/method/hasEmail/cmOffice/cmStaff（113名） | ✅そのまま |
| 宛先メアド表示 | genba既存 `absCmEmailMap`（name→cmEmail・getUserList併読済み） | ✅そのまま |
| 送信実体 | `sendAbsenceEmail(userName, dates, unit, reason, supplement, cmEmail, cmName, cmOffice, reporter, customBody)` | ✅流用（新規送信関数は作らない） |
| 宛先の単一マスター | `getUserCmContact(ss, name)`＝台帳N列「ケアマネ個人メアド」再取得 | ✅流用 |
| 電話済み+担当者記録 | POST `updateAbsenceCmNotified` {name,date,cmNotified,operator} → H列更新+`_appendCmLog_`にoperator記録 | ✅そのまま（新規GAS不要） |
| 担当者選択UI | 既存受付者バー `absReceptionist`（localStorage `yawaragi_receptionist`・社長除外済み） | ✅共用（提案C-2） |
| 送信済/電話済の表示素材 | `cmNotified` 値（送信済/電話連絡済/手動メール送信済/ケアマネ把握済/メール未送信/要電話連絡/メールなし） | ✅そのまま |
| 新規に作るGAS | POST `send_box_cm_mails`（バッチ送信+H列更新+ログ） | ★新設1本のみ |

## 0.5 設計判断（社長承認ポイント）

**C-1. 登録時送信との関係 → 【社長確定】折衷案（2026-07-04）**
- 基本運用: 欠席登録時はケアマネへ送信しない。送信は毎朝の「本日の欠席連絡ボックス」からまとめて行う。
- 例外: 登録時に「⚡今すぐ送る（急ぎ）」を明示ONにしたときだけ、その場で手動送信できる。**デフォルトOFF＝押さない限り送らない。**
- 急ぎ送信した人は朝ボックスで「送信済（担当・時刻）」と表示され、二重送信ガードで再送されない（`kbIsAlreadyNotified_('送信済')===true` がそのまま効く）。
- 電話派は登録時に送信対象にしない（従来どおり朝ボックスで電話→チェック）。
- **ピッカー本体非接触**: 変更は `absSubmit()` 末尾の送信分岐（genba.html:5187付近・日付選択の後段）＋登録ボタン直前にトグル1個のみ。日付選択/コマ構築/パターン絞り込み（dateType/flatSlots/absRangePatternSlots/absBuildSlotsFromManual）には触らない。→ Task 3.5 参照。

**C-2. 担当者の指定方法 → 既存受付者バー共用を推奨**
- ボックス上部に「操作者: ◯◯」を表示し、未選択なら送信/電話済みボタンを無効化。選択は既存の受付者バー（欠席登録タブ上部・localStorage共有）をそのまま使う。
- 代替案: ボックス専用の操作者バー新設（teishutsu.html方式）。→ 同一タブに選択バーが2つ並び混乱するため非推奨。

**C-3. 対象は「本日」の通常欠席のみ**
- `absences` の isLongTerm=false かつ date=今日。長期休みは既存の連絡ログ運用（addContactLog）があるため対象外。
- 未来日の未送信は v1 対象外（毎朝そのうち当日になった時点でボックスに出る＝漏れない）。

**C-4. 宛先のその場訂正 → 一時上書き（toOverride）+ 台帳修正の促し**
- 訂正した宛先はその1通のみ有効（`isValidCmEmail_` でサーバ検証・ログに上書き記録）。台帳N列は変更しない。カードに「※台帳も修正してください」を表示。

## 0.6 制約の実装対応

- **メールゲート非接触**: absence-mail-guard-core.js は0行変更。`send_box_cm_mails` は `ABSENCE_AUTO_EMAIL`・`isValidCmEmail_`・`DRAFT_MODE` を既存のまま尊重。registerAbsence 非接触。
- **①originガード維持**: 新規の書込 fetch 2本（バッチ送信・電話済み）は必ず fetch 前に `gnbGuardProdWrite()`。test-genba-origin-guard.js の POST網羅リストに2本追加（不変条件「未ガードPOSTで落ちる」を維持）。
- **②改名コード非接触**: findCol行・importCmContacts に触らない。
- **f774228型の回避**: `kbInit()` は独立関数・全 `getElementById` 直後に null ガード・既存 init 連鎖（DOMContentLoaded / タブ切替）には「あれば呼ぶ」1行のみ追加し、kbInit 内部で要素不在なら黙って return。
- **版ゲート**: genba.html 変更 → `node scripts/bump-app-version.js` → push前停止 → 社長承認 → verify。

## ファイル構成

- Create: `gas/yawaragi-board/kesseki-box-core.js` — 判定純関数（済み判定・対象抽出・カード分類）。GAS/node 両用（absence-mail-guard-core.js と同じ module ガード流儀）
- Modify: `gas/yawaragi-board/コード.js` — doPost に case `send_box_cm_mails` + 関数 `sendBoxCmMails(ss, data)`（約90行追加）
- Modify: `genba.html` — tab-absence 受付者バー直後に kbox セクション + JS（kbInit/kbRender/モーダル2つ/fetch2本・約300行）
- Create: `scripts/test-genba-kesseki-box.js` — core ユニット + genba 構造証明
- Modify: `scripts/test-genba-origin-guard.js` — POST網羅リストに kbox 2本追加

---

### Task 1: kesseki-box-core.js（判定純関数・TDD）

**Files:**
- Create: `gas/yawaragi-board/kesseki-box-core.js`
- Test: `scripts/test-genba-kesseki-box.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// scripts/test-genba-kesseki-box.js
// 本日の欠席連絡ボックス: コア判定 + genba構造証明
// 実行: node scripts/test-genba-kesseki-box.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'kesseki-box-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// ===== A. kbIsAlreadyNotified_（済み判定＝二重送信ガードの心臓） =====
ok(core.kbIsAlreadyNotified_('送信済') === true,  'A1: 送信済 → 済み');
ok(core.kbIsAlreadyNotified_('電話連絡済') === true, 'A2: 電話連絡済 → 済み');
ok(core.kbIsAlreadyNotified_('手動メール送信済') === true, 'A3: 手動メール送信済 → 済み');
ok(core.kbIsAlreadyNotified_('ケアマネ把握済') === true, 'A4: ケアマネ把握済 → 済み');
ok(core.kbIsAlreadyNotified_('下書き保存') === true, 'A5: 下書き保存 → 済み扱い(再送不可)');
ok(core.kbIsAlreadyNotified_('メール未送信') === false, 'A6: メール未送信 → 未対応');
ok(core.kbIsAlreadyNotified_('要電話連絡') === false, 'A7: 要電話連絡 → 未対応');
ok(core.kbIsAlreadyNotified_('メールなし') === false, 'A8: メールなし → 未対応(電話派として扱う)');
ok(core.kbIsAlreadyNotified_('') === false, 'A9: 空 → 未対応');
ok(core.kbIsAlreadyNotified_(null) === false, 'A10: null → 未対応(落ちない)');

// ===== B. kbFilterTodayTargets_（本日の通常欠席のみ） =====
const abs = [
  { date: '2026-07-06', name: '当日太郎', unit: '午前', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-07', name: '明日花子', unit: '午後', isLongTerm: false, cmNotified: '' },
  { date: '2026-07-06', name: '長期次郎', unit: '終日', isLongTerm: true,  cmNotified: '' },
];
const targets = core.kbFilterTodayTargets_(abs, '2026-07-06');
ok(targets.length === 1 && targets[0].name === '当日太郎', 'B1: 当日+通常欠席のみ（明日と長期休みは除外）');
ok(core.kbFilterTodayTargets_(null, '2026-07-06').length === 0, 'B2: null入力で空配列(落ちない)');

// ===== C. kbClassifyCard_（カード分類・初期チェック） =====
// method: X列連絡手段 / email: 表示用メアド / cmNotified: H列
const mail = core.kbClassifyCard_({ method: 'メール', email: 'a@b.jp', cmNotified: '' });
ok(mail.kind === 'mail' && mail.done === false && mail.defaultChecked === true, 'C1: メール派未対応 → mail/チェックON');
const mailDone = core.kbClassifyCard_({ method: 'メール', email: 'a@b.jp', cmNotified: '送信済' });
ok(mailDone.kind === 'mail' && mailDone.done === true && mailDone.defaultChecked === false, 'C2: 送信済 → done/チェック不可');
const tel = core.kbClassifyCard_({ method: '電話', email: '', cmNotified: '' });
ok(tel.kind === 'phone' && tel.done === false, 'C3: 電話派 → phone(一括送信対象外)');
const telDone = core.kbClassifyCard_({ method: '電話', email: '', cmNotified: '電話連絡済' });
ok(telDone.done === true, 'C4: 電話連絡済 → done');
const noAddr = core.kbClassifyCard_({ method: 'メール', email: '', cmNotified: '' });
ok(noAddr.kind === 'phone', 'C5: メール派だがメアド無し → 電話フローに倒す(誤送信防止)');
const empty = core.kbClassifyCard_({ method: '', email: 'a@b.jp', cmNotified: '' });
ok(empty.kind === 'phone', 'C6: 連絡手段未設定 → 電話フローに倒す(勝手にメールしない)');

console.log(`kesseki-box core: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: FAIL（`Cannot find module ... kesseki-box-core.js`）

- [ ] **Step 3: 最小実装**

```js
// gas/yawaragi-board/kesseki-box-core.js
// 2026-07-04 指示書③: 本日の欠席連絡ボックスの判定純関数。
// GAS/node 両用（absence-mail-guard-core.js と同じ流儀）。SpreadsheetApp 等の GAS API に依存しないこと。

// 済み判定＝二重送信ガードの唯一の正（クライアント表示とサーバガードの両方がこれを使う）
function kbIsAlreadyNotified_(cmNotified) {
  var v = String(cmNotified || '').trim();
  return v === '送信済' || v === '電話連絡済' || v === '手動メール送信済' ||
         v === 'ケアマネ把握済' || v === '下書き保存';
}

// absences 配列から「本日の通常欠席」だけを返す（長期休み・他日は除外）
function kbFilterTodayTargets_(absList, todayYMD) {
  return (absList || []).filter(function (a) {
    return a && !a.isLongTerm && String(a.date) === String(todayYMD);
  });
}

// カード分類: kind 'mail'（一括送信対象）| 'phone'（電話フロー）
// メール派でもメアド無し/連絡手段未設定は phone に倒す＝勝手にメールしない
function kbClassifyCard_(info) {
  var method = String((info && info.method) || '').trim();
  var email = String((info && info.email) || '').trim();
  var done = kbIsAlreadyNotified_(info && info.cmNotified);
  var isMail = method.indexOf('メール') >= 0 && email.indexOf('@') >= 0;
  return {
    kind: isMail ? 'mail' : 'phone',
    done: done,
    defaultChecked: isMail && !done
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    kbIsAlreadyNotified_: kbIsAlreadyNotified_,
    kbFilterTodayTargets_: kbFilterTodayTargets_,
    kbClassifyCard_: kbClassifyCard_
  };
}
```

- [ ] **Step 4: テスト実行 → 全PASS確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: `kesseki-box core: 20 PASS / 0 FAIL`

- [ ] **Step 5: Commit**

```bash
git add gas/yawaragi-board/kesseki-box-core.js scripts/test-genba-kesseki-box.js
git commit -m "feat(kbox): 欠席連絡ボックス コア判定純関数（済み判定/当日抽出/カード分類）+テスト"
```

---

### Task 2: GAS `send_box_cm_mails`（バッチ送信アクション）

**Files:**
- Modify: `gas/yawaragi-board/コード.js`（doPost switch 内 + 関数追加）

- [ ] **Step 1: doPost に case 追加（`case 'updateAbsenceCmNotified':` の直前に挿入）**

```js
      // 2026-07-04 指示書③: 本日の欠席連絡ボックス まとめて送信
      case 'send_box_cm_mails':
        return jsonResp(sendBoxCmMails(ss, data));
```

- [ ] **Step 2: 関数実装（`updateAbsenceCmNotified` 関数の直前に挿入）**

```js
// ===== 2026-07-04 指示書③: 本日の欠席連絡ボックス まとめて送信 =====
// data: { operator: '担当者名', items: [{ name, date, unit, customBody?, toOverride? }] }
// 送信実体は sendAbsenceEmail 流用・宛先は getUserCmContact(N列)再取得＝単一マスター。
// サーバ側二重送信ガード: H列 cmNotified を送信直前に再読して済みならスキップ。
function sendBoxCmMails(ss, data) {
  var operator = String(data.operator || '').trim();
  if (!operator) return { success: false, error: '操作者(operator)が必要です' };
  var items = data.items || [];
  if (!items.length) return { success: false, error: '送信対象(items)が空です' };
  if (items.length > 40) return { success: false, error: '一度に送れるのは40件までです' };

  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { success: false, error: '出欠変更シートがありません' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (e) { return { success: false, error: '他の操作が実行中です。少し待って再試行してください' }; }

  var sent = [], skipped = [], failed = [];
  try {
    var rows = sheet.getDataRange().getValues();
    items.forEach(function (item) {
      var name = String(item.name || '').trim();
      var dateStr = String(item.date || '').trim();
      if (!name || !dateStr) { skipped.push({ name: name, reason: 'name/date欠落' }); return; }

      // 1) 該当欠席行を検索し cmNotified をサーバ側で再チェック（二重送信ガードの本体）
      var foundRow = -1, curNotified = '';
      var normName = _normalizeNameForMatch_(name);
      for (var i = 1; i < rows.length; i++) {
        if (_normalizeNameForMatch_(rows[i][1]) !== normName) continue;
        if (String(rows[i][3] || '').trim() !== '欠席') continue;
        if (fmtDate(rows[i][0]) !== dateStr) continue;
        foundRow = i + 1;
        curNotified = String(rows[i][7] || '').trim();
        break;
      }
      if (foundRow < 0) { skipped.push({ name: name, reason: '欠席行が見つかりません' }); return; }
      if (kbIsAlreadyNotified_(curNotified)) { skipped.push({ name: name, reason: '既に対応済（' + curNotified + '）' }); return; }

      // 2) 宛先は台帳N列を再取得（クライアント値は信用しない）。toOverride は明示訂正時のみ・検証必須。
      var cmInfo = getUserCmContact(ss, name);
      if (!cmInfo.found) { skipped.push({ name: name, reason: '台帳に利用者がいません' }); return; }
      if (String(cmInfo.method || '').indexOf('メール') < 0) { skipped.push({ name: name, reason: 'メール派ではありません（' + (cmInfo.method || '未設定') + '）' }); return; }
      var to = String(item.toOverride || '').trim() || String(cmInfo.email || '').trim();
      if (!isValidCmEmail_(to)) { skipped.push({ name: name, reason: '宛先メアド無効（' + to + '）' }); return; }
      if (!ABSENCE_AUTO_EMAIL) { skipped.push({ name: name, reason: '送信マスターOFF(ABSENCE_AUTO_EMAIL)' }); return; }

      // 3) 送信（既存テンプレ・既存差出人・複数日ではなく当日1日）
      try {
        var rowUnit = String(rows[foundRow - 1][2] || '').trim() || String(item.unit || '').trim() || '終日';
        var rowReason = String(rows[foundRow - 1][4] || '').trim();
        sendAbsenceEmail(name, [dateStr], rowUnit, rowReason, '',
          to, cmInfo.cmName || '', cmInfo.cmOffice || '', operator, String(item.customBody || ''));
        // 4) H列更新 + ケアマネ連絡ログ（担当者記録）
        sheet.getRange(foundRow, 8).setValue(DRAFT_MODE ? '下書き保存' : '送信済');
        _appendCmLog_(ss, {
          userName: name, date: dateStr, action: 'ボックス一括送信',
          method: '自動メール', contactedAddr: to, operator: operator,
          result: DRAFT_MODE ? '下書き' : '成功',
          note: item.toOverride ? ('宛先上書き:' + to) : ''
        });
        sent.push({ name: name, to: to });
      } catch (mailErr) {
        _appendCmLog_(ss, {
          userName: name, date: dateStr, action: 'ボックス一括送信',
          method: '自動メール', contactedAddr: to, operator: operator,
          result: 'エラー', note: String(mailErr && mailErr.message || mailErr)
        });
        failed.push({ name: name, error: String(mailErr && mailErr.message || mailErr) });
      }
    });
  } finally {
    lock.releaseLock();
  }
  return { success: true, sent: sent, skipped: skipped, failed: failed, operator: operator };
}
```

- [ ] **Step 3: 構文チェック**

Run: `node -c gas/yawaragi-board/コード.js && node -c gas/yawaragi-board/kesseki-box-core.js`
Expected: エラーなし

- [ ] **Step 4: 既存テスト全部＋新テストが緑のまま**

Run: `for f in scripts/test-*.js; do node "$f" || echo "FAIL: $f"; done`
Expected: 全ファイル PASS（origin-guard 32件含む）

- [ ] **Step 5: Commit**

```bash
git add gas/yawaragi-board/コード.js
git commit -m "feat(kbox): GAS send_box_cm_mails（sendAbsenceEmail流用・N列再取得・サーバ側二重送信ガード・operator記録）"
```

---

### Task 3: genba.html ボックスUI（一覧・バッジ・独立init）

**Files:**
- Modify: `genba.html` — ① `tab-absence` の受付者バー `abs-receptionist-selected`（1558行付近）の直後に kbox セクション HTML、② `</script>` 前に kbox JS 一式

- [ ] **Step 1: 構造証明テストを test-genba-kesseki-box.js に追記（失敗を先に確認）**

```js
// ===== D. genba.html 構造証明 =====
const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '..', 'genba.html'), 'utf8');
function extractFn(name) { /* test-genba-origin-guard.js と同一実装をコピー */ }

ok(html.indexOf('id="kbox-section"') >= 0, 'D1: kboxセクションが存在');
const kbInitSrc = extractFn('kbInit');
ok(/if\s*\(!\w+\)\s*return/.test(kbInitSrc), 'D2: kbInitに要素不在ガード（f774228型の回避）');
const kbSendSrc = extractFn('kbExecuteSend');
ok(kbSendSrc.indexOf('gnbGuardProdWrite') >= 0 &&
   kbSendSrc.indexOf('gnbGuardProdWrite') < kbSendSrc.indexOf('fetch'),
   'D3: 一括送信はfetch前にoriginガード');
const kbTelSrc = extractFn('kbMarkPhoneDone');
ok(kbTelSrc.indexOf('gnbGuardProdWrite') >= 0 &&
   kbTelSrc.indexOf('gnbGuardProdWrite') < kbTelSrc.indexOf('fetch'),
   'D4: 電話済みもfetch前にoriginガード');
ok(kbSendSrc.indexOf('kbox-summary-modal') >= 0 || extractFn('kbOpenSummary').length > 0,
   'D5: 送信は最終サマリー経由でのみ実行できる構造');
```

- [ ] **Step 2: HTML（受付者バー直後に挿入）**

```html
<!-- 2026-07-04 指示書③: 本日の欠席連絡ボックス（欠席者だけの朝ルーティン画面） -->
<div id="kbox-section" style="margin:12px 0; border:2px solid #2c7a7b; border-radius:10px; padding:10px; background:#f0fdfa;">
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <strong style="font-size:1.05rem;">📮 本日の欠席連絡</strong>
    <span id="kbox-pending-badge" style="display:none; background:#c0392b; color:#fff; border-radius:12px; padding:2px 10px; font-weight:700;"></span>
  </div>
  <div id="kbox-operator-note" style="font-size:.85rem; color:#666; margin:4px 0;"></div>
  <div id="kbox-list"></div>
  <button id="kbox-send-btn" class="abs-contact-btn" style="width:100%; margin-top:8px; background:#2c7a7b; color:#fff;" onclick="kbOpenSummary()">チェックした人にまとめて送信</button>
</div>
```

- [ ] **Step 3: JS 骨子（kbInit / kbLoad / kbRender / バッジ）**

```js
// ===== 2026-07-04 指示書③: 本日の欠席連絡ボックス =====
// 独立init（f774228型回避: 要素不在なら黙ってreturn・既存init連鎖に新id依存を差し込まない）
let kbState = { items: [], checked: {}, methodMap: {}, loaded: false };

function kbInit() {
    const sec = document.getElementById('kbox-section');
    if (!sec) return;                      // 要素不在ガード
    kbLoad();
}

async function kbLoad() {
    const listEl = document.getElementById('kbox-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="color:#888;">読み込み中…</div>';
    try {
        const today = /* 既存の absToday()/fmtDate 流儀で YYYY-MM-DD */;
        // ① 本日の欠席（cmNotified付き・既存GET）
        const aj = await fetch(GAS_URL + '?action=absences').then(r => r.json());
        const flat = (aj.absences && aj.absences.absences) || [];
        // ② method/事業所/担当（既存GET・1回だけ）
        if (!kbState.loaded) {
            const mj = await fetch(GAS_URL + '?action=cm_method_audit').then(r => r.json());
            (mj.audit || []).forEach(a => { kbState.methodMap[a.userName] = a; });
            kbState.loaded = true;
        }
        // ③ 表示用メアドは既存 absCmEmailMap を流用
        kbState.items = kbFilterTodayTargets_(flat, today).map(a => {
            const m = kbState.methodMap[a.name] || {};
            const email = (absCmEmailMap && absCmEmailMap[a.name]) || '';
            const cls = kbClassifyCard_({ method: m.method, email, cmNotified: a.cmNotified });
            return { ...a, cmOffice: m.cmOffice || '', cmStaff: m.cmStaff || '', email, cls };
        });
        kbState.items.forEach(it => {
            if (!(it.name in kbState.checked)) kbState.checked[it.name] = it.cls.defaultChecked;
        });
        kbRender();
    } catch (e) {
        listEl.innerHTML = '<div style="color:#c0392b;">取得失敗: ' + esc(String(e.message || e)) + '</div>';
    }
}

function kbRender() { /* カード描画＋未対応バッジ更新（下記仕様） */ }
```

カード仕様（kbRender 内で生成）:
- 共通: 氏名／単位／ケアマネ名・事業所／宛先メアド（メール派）／連絡手段バッジ
- `cls.kind==='mail' && !done`: チェックボックス（初期ON・kbState.checked連動）＋「内容を見る」ボタン
- `cls.kind==='phone' && !done`: 「☎電話してください」＋「電話済みにする」ボタン
- `done`: 「✅送信済（担当:◯◯）」/「✅電話済（担当:◯◯）」表示（lastOperator流用）・全ボタン無効
- バッジ: `未対応 N件`（N = done でない件数）。N===0 なら「✅全員対応済み」に変わり当日中は表示継続（終わるまで方式はバッジの残存で担保）
- 操作者: 既存 `absReceptionist` を参照。空なら `kbox-operator-note` に「先に受付者（操作者）を選んでください」を出し送信/電話済みボタン無効化

- [ ] **Step 4: タブ表示時に kbInit を呼ぶ（既存タブ切替ハンドラに1行・try/catch付き）**

既存のタブ切替処理（`data-tab==='absence'` 分岐）に `try { kbInit(); } catch (e) { console.warn('kbox init skip', e); }` を追加。

- [ ] **Step 5: テスト実行（D1/D2は緑・D3-D5はまだ赤）→ 骨子コミット**

```bash
node scripts/test-genba-kesseki-box.js   # D1,D2 PASS を確認
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "feat(kbox): 本日の欠席連絡ボックス 一覧UI+未対応バッジ+独立init（nullガード）"
```

---

### Task 3.5: 登録フロー折衷案（急ぎトグル・ピッカー本体非接触）

**Files:**
- Modify: `genba.html` — ① 登録ボタン直前(1663)にトグルHTML、② `absSubmit()` 送信分岐(5187-5200)を差替
- Test: `scripts/test-genba-kesseki-box.js`（構造証明追記）

- [ ] **Step 1: 構造証明テスト追記（先に失敗確認）**

```js
// ===== E. 登録フロー折衷案（急ぎトグル） =====
ok(html.indexOf('id="abs-urgent-send"') >= 0, 'E1: 急ぎトグルが存在');
ok(/id="abs-urgent-send"[^>]*type="checkbox"/.test(html.replace(/\n/g,' ')), 'E2: チェックボックス型');
const submitSrc = extractFn('absSubmit');
ok(submitSrc.indexOf('abs-urgent-send') >= 0, 'E3: absSubmitが急ぎトグルを参照');
// 急ぎOFFの既定経路＝absOpenPreviewを無条件には呼ばない（トグル判定でガード）
const urgentIdx = submitSrc.indexOf('abs-urgent-send');
const previewIdx = submitSrc.indexOf('absOpenPreview');
ok(urgentIdx >= 0 && previewIdx >= 0 && urgentIdx < previewIdx, 'E4: トグル判定がabsOpenPreviewより前');
```

- [ ] **Step 2: 実行して E1-E4 が赤を確認**

Run: `node scripts/test-genba-kesseki-box.js`
Expected: E1-E4 FAIL

- [ ] **Step 3: HTML トグル追加（登録ボタン直前・1663行の `<button ... id="abs-submit-btn">` の直前に挿入）**

```html
            <label style="display:flex; align-items:center; gap:8px; margin:8px 0; font-size:.9rem; color:#c0392b; font-weight:600;">
                <input type="checkbox" id="abs-urgent-send" style="width:18px; height:18px;">
                ⚡今すぐケアマネに送る（急ぎ）※通常はチェックせず朝の連絡ボックスからまとめて送信
            </label>
```

- [ ] **Step 4: `absSubmit()` 送信分岐（5187-5200）を差替**

差替前（現行）:
```js
    // ケアマネメアドで分岐（a: プレビュー送信 / b: 要電話連絡案内 / c: メールなし）
    const em = String((absState.selectedUser && absState.selectedUser.cmEmail) || '').trim();
    if (em.indexOf('@') >= 0) {
        absOpenPreview(slots, reason, contact, em);
    } else if (em === 'なし' || em !== '') {
        alert('このケアマネはメール連絡できません（メアド未登録/無効）。\nお手数ですが電話で連絡してください。');
        absDoRegister(slots, reason, contact, { doSendEmail: false });
    } else {
        absDoRegister(slots, reason, contact, { doSendEmail: false });
    }
```

差替後（折衷案）:
```js
    // 2026-07-04 指示書③ 折衷案: 既定は「送らず登録」→朝ボックスへ集約。
    //   「⚡今すぐ送る（急ぎ）」を明示ONにしたときだけ、その場送信フローに入る。
    const urgentEl = document.getElementById('abs-urgent-send');
    const urgent = !!(urgentEl && urgentEl.checked);
    const em = String((absState.selectedUser && absState.selectedUser.cmEmail) || '').trim();
    if (!urgent) {
        // 既定＝送信しない。全員そのまま登録（cmNotifiedは未送信状態→朝ボックスに出る）
        absDoRegister(slots, reason, contact, { doSendEmail: false });
    } else if (em.indexOf('@') >= 0) {
        // 急ぎON＋メアド有り: 現行どおりプレビュー→「送信」で doSendEmail:true
        absOpenPreview(slots, reason, contact, em);
    } else {
        // 急ぎON＋メアド無/なし: 送れないので案内＋登録のみ
        alert('このケアマネはメール連絡できません（メアド未登録/無効）。\nお手数ですが電話で連絡してください。');
        absDoRegister(slots, reason, contact, { doSendEmail: false });
    }
```

- [ ] **Step 5: 送信後にトグルをOFFへ戻す（絞り込み: `absClearName()` 内、または absDoRegister/absOpenPreview 完了後）**

`absClearName()` の先頭付近に追記（次の登録に急ぎ状態を持ち越さない）:
```js
    const _u = document.getElementById('abs-urgent-send'); if (_u) _u.checked = false;
```

- [ ] **Step 6: E1-E4 PASS＋既存テスト全緑 → commit**

```bash
node scripts/test-genba-kesseki-box.js
node scripts/test-genba-absence-slots.js   # ピッカー本体デグレなし確認
git add genba.html scripts/test-genba-kesseki-box.js
git commit -m "feat(kbox): 登録折衷案 急ぎトグル（既定=送らず朝ボックス集約・ピッカー本体非接触）"
```

---

### Task 4: 内容確認・訂正モーダル

**Files:**
- Modify: `genba.html`（独立モーダルDOM + kbOpenPreview/kbApplyEdit）

- [ ] **Step 1: モーダルDOM（既存プレビューモーダル 1667行の独立要素流儀を踏襲・id衝突なし）**

```html
<div id="kbox-preview-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:9000;">
  <div style="background:#fff; max-width:520px; margin:40px auto; padding:16px; border-radius:10px;">
    <h3 id="kbox-pv-title" style="margin:0 0 8px;"></h3>
    <label>宛先: <input id="kbox-pv-to" type="email" style="width:100%;"></label>
    <div id="kbox-pv-to-warn" style="display:none; color:#c0392b; font-size:.8rem;">※宛先を変更した場合は利用者台帳のN列（ケアマネ個人メアド）も修正してください</div>
    <label>本文: <textarea id="kbox-pv-body" rows="10" style="width:100%;"></textarea></label>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button onclick="kbApplyEdit()">この内容にする</button>
      <button onclick="document.getElementById('kbox-preview-modal').style.display='none'">閉じる</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: JS（本文の叩き台は既存 absBuildPreviewBody 流儀で生成・編集値は kbState.items[i].customBody / toOverride に保持）**

宛先が台帳値と異なるときのみ `toOverride` を設定し、警告表示。本文未編集なら customBody 空＝GAS既定テンプレ使用（既存流儀）。

- [ ] **Step 3: commit**

```bash
git add genba.html
git commit -m "feat(kbox): 内容確認・訂正モーダル（宛先一時上書き+台帳修正促し・本文編集）"
```

---

### Task 5: 最終サマリー + 一括送信（誤送信防止の最後の砦）

**Files:**
- Modify: `genba.html`（kbOpenSummary / kbExecuteSend + サマリーモーダルDOM）

- [ ] **Step 1: サマリーモーダル**

```html
<div id="kbox-summary-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:9001;">
  <div style="background:#fff; max-width:520px; margin:40px auto; padding:16px; border-radius:10px;">
    <h3>以下の<span id="kbox-sum-count"></span>人のケアマネにお休みを連絡します</h3>
    <ul id="kbox-sum-list"></ul>
    <div style="display:flex; gap:8px;">
      <button id="kbox-sum-send" style="background:#c0392b; color:#fff;" onclick="kbExecuteSend()">送信する</button>
      <button onclick="document.getElementById('kbox-summary-modal').style.display='none'">やめる</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: kbOpenSummary（チェックON かつ 未済 かつ mail のみを対象化・0件なら開かない）／kbExecuteSend**

```js
function kbExecuteSend() {
    if (!gnbGuardProdWrite('欠席連絡の一括送信')) return;   // ★fetch前 originガード（9本目）
    const operator = absReceptionist;
    if (!operator) { showToast('先に受付者（操作者）を選んでください'); return; }
    const items = kbState.items
        .filter(it => it.cls.kind === 'mail' && !it.cls.done && kbState.checked[it.name])
        .map(it => ({ name: it.name, date: it.date, unit: it.unit,
                      customBody: it.customBody || '', toOverride: it.toOverride || '' }));
    if (!items.length) return;
    const btn = document.getElementById('kbox-sum-send');
    btn.disabled = true; btn.textContent = '送信中…';          // 二度押し防止
    fetch(GAS_URL, { method: 'POST',
        body: JSON.stringify({ action: 'send_box_cm_mails', operator, items }) })
      .then(r => r.json())
      .then(res => {
          document.getElementById('kbox-summary-modal').style.display = 'none';
          const s = (res.sent || []).length, k = (res.skipped || []).length, f = (res.failed || []).length;
          showToast(`送信 ${s}件 / スキップ ${k}件 / 失敗 ${f}件`);
          if (k || f) alert('スキップ/失敗:\n' + [...(res.skipped||[]), ...(res.failed||[])]
              .map(x => `・${x.name}: ${x.reason || x.error}`).join('\n'));
          kbLoad();                                            // 送信済み反映＝再読込（サーバ値が正）
      })
      .catch(e => { showToast('送信失敗: ' + e.message); })
      .finally(() => { btn.disabled = false; btn.textContent = '送信する'; });
}
```

- [ ] **Step 3: テストD3/D5 PASS 確認 → commit**

```bash
node scripts/test-genba-kesseki-box.js
git add genba.html
git commit -m "feat(kbox): 最終サマリー→まとめて送信（originガード・二度押し防止・結果は再読込で反映）"
```

---

### Task 6: 電話派フロー（電話済みにする）

**Files:**
- Modify: `genba.html`（kbMarkPhoneDone）

- [ ] **Step 1: 実装（既存POST `updateAbsenceCmNotified` 流用・新規GASなし）**

```js
function kbMarkPhoneDone(name, date) {
    if (!gnbGuardProdWrite('電話済みマーク')) return;          // ★fetch前 originガード（10本目）
    const operator = absReceptionist;
    if (!operator) { showToast('先に受付者（操作者）を選んでください'); return; }
    if (!confirm(name + ' さんのケアマネに電話連絡済みにしますか？（担当: ' + operator + '）')) return;
    fetch(GAS_URL, { method: 'POST',
        body: JSON.stringify({ action: 'updateAbsenceCmNotified',
            name, date, cmNotified: '電話連絡済', operator }) })
      .then(r => r.json())
      .then(res => { showToast(res.success ? '電話済みにしました' : '失敗: ' + res.error); kbLoad(); })
      .catch(e => showToast('失敗: ' + e.message));
}
```

- [ ] **Step 2: テストD4 PASS → commit**

```bash
node scripts/test-genba-kesseki-box.js
git add genba.html
git commit -m "feat(kbox): 電話派の電話済みマーク（既存updateAbsenceCmNotified流用・operator記録）"
```

---

### Task 7: origin-guard POST網羅テストの更新（不変条件の維持）

**Files:**
- Modify: `scripts/test-genba-origin-guard.js`

- [ ] **Step 1: 書込POST関数リストに `kbExecuteSend`・`kbMarkPhoneDone` を追加**（既存の「全書込POSTにfetch前ガード」検証ループに2エントリ追加。追加しないとテスト自体が新規未ガードPOSTを検知して落ちる設計＝それが正しい挙動なので、まず落ちることを確認してから追加）

- [ ] **Step 2: 全テストスイート緑確認**

Run: `for f in scripts/test-*.js; do node "$f" || echo "FAIL: $f"; done`
Expected: 全 PASS（origin-guard は 32→36件程度に増える）

- [ ] **Step 3: commit**

```bash
git add scripts/test-genba-origin-guard.js
git commit -m "test(kbox): originガードPOST網羅にkbox2本を追加（未ガードPOST検知の不変条件維持）"
```

---

### Task 8: GASデプロイ + 実測（テスト行→ボックス→送信→掃除）

- [ ] **Step 1: clasp pull 突合（改修前と本番一致確認）→ `clasp push -f` → `clasp deploy -i AKfycbwo1UGx… -d "指示書③ send_box_cm_mails"` → @301**
- [ ] **Step 2: 実測シナリオ（指示書②で実証済みの手順を流用）**
  1. `maintenance_upsert_test_user_row`（クロコテスト・N列=社長メアド・X列=メール）
  2. 当日日付で欠席登録（doSendEmail:false ＝「メール未送信」状態を作る）
  3. GET absences で cmNotified='メール未送信' 確認 → ボックス表示対象であることをAPIレベルで確認
  4. POST send_box_cm_mails {operator:'クロコ', items:[{name:'クロコテスト', date:今日}]} → sent:1
  5. cmNotified='送信済' 確認 ＋ **再度同じPOST → skipped:1「既に対応済」＝二重送信ガード実証**
  6. 社長Gmail実受信確認（依頼）
  7. 掃除: cancel_absence(unit:'終日')→deleted:1 → maintenance_delete_test_user_row → user_list 113名復元
- [ ] **Step 3: ブラウザ実機（github.io）でボックス表示・電話済み・サマリーフローを目視確認**

---

### Task 9: 非接触diff証明 + 版上げ + push前停止

- [ ] **Step 1: diff証明**: `git diff master --stat` で absence-mail-guard-core.js=0行・registerAbsence非接触・②改名行非接触をファイル出力→Read確認
- [ ] **Step 2: `node scripts/bump-app-version.js <次版>`**（genba.html変更のため版ゲート必須・スクリプトがversion.txt+shared.js?v=同期コミット）
- [ ] **Step 3: push前停止・社長承認**。承認後: `git push origin master` → `node scripts/bump-app-version.js --verify <版>` → SHA一致確認

---

## 完了条件マッピング（指示書🏁 → Task）

| 完了条件 | Task |
|---|---|
| その日の欠席者だけ表示 | 1(kbFilterTodayTargets_) + 3 |
| メール派: 一覧→確認/訂正→チェック→まとめて→サマリー→送信 | 3+4+5 |
| 電話派: 電話済みが動き一括対象外 | 1(kbClassifyCard_) + 6 |
| 担当者名の記録・表示 | 2(_appendCmLog_ operator) + 6 + 3(lastOperator表示) |
| 未対応件数が全員済むまで残る | 3(バッジ) |
| 二重送信ガード | 1(kbIsAlreadyNotified_) + 2(サーバ再チェック) + 5(ボタン無効) |
| 既存デグレなし | 7(テスト全緑) + 9(非接触diff) |
| テスト行実送信→掃除・SHA・diff証明 | 8 + 9 |
| push前社長承認 | 9 |
