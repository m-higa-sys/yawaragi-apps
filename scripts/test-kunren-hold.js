// 個訓「保険未登録・作成不可」保留 → 伝達ボード連動の純関数テスト
// 対象:
//   - gas/yawaragi-board/kunren-hold-core.js（kunrenHoldKey_/kunrenHoldValidKey_/kunrenHoldDecide_）
//   - 個別機能訓練計画書チェック.html（buildKunrenHoldMessage / blockedLabel）※jsdom実ロード
// 実行: node scripts/test-kunren-hold.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'kunren-hold-core.js'));

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }

const HEADER = ['id', 'from', 'to', 'body', 'deadline', 'createdAt', 'done', 'doneAt', 'doneBy', 'recipients', 'readBy'];

// ===== A. 決定的キー生成 =====
ok(core.kunrenHoldKey_('田中太郎', 2026, 8) === 'kunren-hold-田中太郎-2026-8', 'A1: キーは kunren-hold-<userId>-<year>-<month>');
ok(core.kunrenHoldKey_('田中太郎', 2026, 8) === core.kunrenHoldKey_('田中太郎', 2026, 8), 'A2: 同一入力で常に同じキー（冪等）');
ok(core.kunrenHoldKey_('田中太郎', 2026, 8) !== core.kunrenHoldKey_('田中太郎', 2026, 9), 'A3: 月が違えば別キー');
ok(core.kunrenHoldKey_('佐藤花子', 2026, 8) !== core.kunrenHoldKey_('田中太郎', 2026, 8), 'A4: 利用者が違えば別キー');

// ===== B. キー厳格化（他メッセージに触れない）=====
const K = core.kunrenHoldKey_('田中太郎', 2026, 8);
ok(core.kunrenHoldValidKey_(K) === true, 'B1: kunren-hold-接頭辞 → 有効');
ok(core.kunrenHoldValidKey_('kunren-hold-') === false, 'B2: 接頭辞のみ → 無効');
ok(core.kunrenHoldValidKey_('db_123') === false, 'B3: 伝達メッセージid → 無効');
ok(core.kunrenHoldValidKey_('furikae-funou-2026-05') === false, 'B4: 振替不能キー → 無効（別名前空間）');
ok(core.kunrenHoldValidKey_('nyukin-dashboard') === false, 'B5: 移行シードid → 無効');
ok(core.kunrenHoldValidKey_('') === false, 'B6: 空 → 無効');
ok(core.kunrenHoldValidKey_(null) === false, 'B7: null → 無効');

// ===== C. upsert 判定（notify 経路：本文あり）=====
const empty = [HEADER];
ok(core.kunrenHoldDecide_(empty, K, '相談員さんへ…').op === 'add', 'C1: 未存在＋本文 → add');
const withKey = [HEADER, [K, '個訓保留', '相談員', '相談員さんへ…', '', '2026-08-01 10:00:00', false, '', '', '[]', '[]']];
ok(core.kunrenHoldDecide_(withKey, K, '相談員さんへ…（改）').op === 'update', 'C2: 既存＋本文 → update（重複せず1件）');

// ===== D. close 判定（clear 経路：本文なし）=====
ok(core.kunrenHoldDecide_(withKey, K, '').op === 'close', 'D1: 既存＋空本文 → close（done化）');
ok(core.kunrenHoldDecide_(empty, K, '').op === 'noop', 'D2: 未存在＋空本文 → noop');

// ===== E. 他メッセージを絶対に巻き込まない =====
const withOthers = [HEADER,
    ['db_111', '社長', '社長', '既存の大事な伝言', '', '2026-08-01', false, '', '', '[]', '[]'],
    ['furikae-funou-2026-08', '振替不能', '全員', '振替不能・要対応（2件）', '', '2026-08-01', false, '', '', '', ''],
    ['nyukin-dashboard', '社長', '社長', '入金管理…', '', '2026-06-14', false, '', '', '[]', '[]']];
const dAdd = core.kunrenHoldDecide_(withOthers, K, '相談員さんへ…');
ok(dAdd.op === 'add' && dAdd.rowIndex === -1, 'E1: 他メッセージだけの盤面 → addのみ（既存行を指さない）');
ok(core.kunrenHoldDecide_(withOthers, 'db_111', '乗っ取り').op === 'reject', 'E2: 伝達メッセージidをキーにしたら reject');
ok(core.kunrenHoldDecide_(withOthers, 'furikae-funou-2026-08', '乗っ取り').op === 'reject', 'E3: 振替不能キーをキーにしたら reject（名前空間分離）');

// ===== F. rowIndex は正しい行を指す（他行を指さない）=====
const mixed = [HEADER,
    ['db_111', '社長', '社長', 'x', '', '', false, '', '', '[]', '[]'],
    [K, '個訓保留', '相談員', '相談員さんへ…', '', '', false, '', '', '[]', '[]']];
const dUpd = core.kunrenHoldDecide_(mixed, K, '相談員さんへ…（改）');
ok(dUpd.op === 'update' && dUpd.rowIndex === 2, 'F1: rowIndex は該当キー行（2）を指す・db_111(1)ではない');
const dClose = core.kunrenHoldDecide_(mixed, K, '');
ok(dClose.op === 'close' && dClose.rowIndex === 2, 'F2: close も該当キー行（2）を指す');

// ===== G. HTML純関数（buildKunrenHoldMessage / blockedLabel）実ロード =====
const html = fs.readFileSync(path.join(__dirname, '..', '個別機能訓練計画書チェック.html'), 'utf8');
const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.test/kunren.html',
    beforeParse(window) {
        window.fetch = () => Promise.reject(new Error('no-net')); // version.txt・cloudLoad を遮断
    }
});
const run = (js) => dom.window.eval(js);

ok(run('typeof buildKunrenHoldMessage') === 'function', 'G1: buildKunrenHoldMessage が定義されている');
const msg = run('buildKunrenHoldMessage("田中太郎", 8)');
ok(msg.indexOf('田中太郎') >= 0, 'G2: メッセージに氏名が入る');
ok(msg.indexOf('8月') >= 0, 'G3: メッセージに対象月が入る');
ok(msg.indexOf('介護保険情報') >= 0 && msg.indexOf('作成できません') >= 0, 'G4: 未登録で作成できない旨が入る');
ok(msg.indexOf('相談員') >= 0, 'G5: 相談員宛ての依頼型');

// ===== G′. 宛名は toLabel に追従（宛先セレクタ連動）=====
ok(msg.indexOf('相談員さんへ') === 0, 'G5a: toLabel省略時は「相談員さんへ」で始まる（後方互換）');
const msgNs = run('buildKunrenHoldMessage("田中太郎", 8, "看護師")');
ok(msgNs.indexOf('看護師さんへ') === 0, 'G5b: toLabel=看護師 → 「看護師さんへ」で始まる');
ok(msgNs.indexOf('田中太郎') >= 0 && msgNs.indexOf('8月') >= 0, 'G5c: 宛先変更後も氏名・対象月は保持');
const msgIndiv = run('buildKunrenHoldMessage("田中太郎", 8, "山田")');
ok(msgIndiv.indexOf('山田さんへ') === 0, 'G5d: toLabel=特定個人 → 「〇〇さんへ」で始まる');
ok(run('buildKunrenHoldMessage("田中太郎", 8, "")').indexOf('相談員さんへ') === 0, 'G5e: 空toLabelは相談員にフォールバック');

ok(run('typeof blockedLabel') === 'function', 'G6: blockedLabel が定義されている');
ok(run('blockedLabel("保険未登録")') === '保険未登録・作成不可', 'G7: 保険未登録 → 表示は「保険未登録・作成不可」');
ok(run('blockedLabel("利用継続未確定")') === '利用継続未確定', 'G8: 他理由は表示変換しない');
ok(run('blockedLabel("ケアマネ未提出")') === 'ケアマネ未提出', 'G9: 他理由は表示変換しない（2）');

// ===== 結果 =====
if (fail === 0) console.log('ALL GREEN  (pass=' + pass + ')');
else { console.error('FAILED: ' + fail + ' / total ' + (pass + fail)); process.exit(1); }
