// 長期休み 月1連絡 → 伝達ボード連動の純関数テスト
// 対象: gas/yawaragi-board/longleave-notice-core.js
// 実行: node scripts/test-longleave-notice.js
//
// 設計（2026-07-31 社長承認）:
//   ・単一キー longleave-contact の繰り越し方式（常に0件か1件）
//   ・O列ゲート方式：デフォルト＝載せない。'対象' の人だけが投稿本文に載る
//   ・月1判定は既存 computeLongLeaveFlags_ の「月1超過」と同一ルール（J列28日 / 未連絡は開始日28日）
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'longleave-notice-core.js'));

let pass = 0, fail = 0;
function ok(c, l) { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } }

const HEADER = ['id', 'from', 'to', 'body', 'deadline', 'createdAt', 'done', 'doneAt', 'doneBy', 'recipients', 'readBy'];
const KEY = core.LONGLEAVE_NOTICE_KEY;

// ===== A. 単一キー =====
ok(KEY === 'longleave-contact', 'A1: キーは固定文字列 longleave-contact');
ok(core.longleaveValidKey_(KEY) === true, 'A2: 正規キー → 有効');
ok(core.longleaveValidKey_('longleave-contact-2026-07') === false, 'A3: 月次キー形式 → 無効（単一キー方式のため）');
ok(core.longleaveValidKey_('db_123') === false, 'A4: 伝達メッセージid → 無効');
ok(core.longleaveValidKey_('furikae-funou-2026-08') === false, 'A5: 振替不能キー → 無効');
ok(core.longleaveValidKey_('kunren-hold-x-2026-8') === false, 'A6: 個訓保留キー → 無効');
ok(core.longleaveValidKey_('') === false, 'A7: 空 → 無効');
ok(core.longleaveValidKey_(null) === false, 'A8: null → 無効');

// ===== B. upsert / close 判定 =====
const empty = [HEADER];
const withKey = [HEADER, [KEY, '長期休み連絡', '勝又', '本文', '', '2026-07-31 06:00:00', false, '', '', '["勝又"]', '[]']];
ok(core.longleaveDecide_(empty, KEY, '本文').op === 'add', 'B1: 未存在＋本文 → add');
ok(core.longleaveDecide_(withKey, KEY, '本文（改）').op === 'update', 'B2: 既存＋本文 → update（1件のまま）');
ok(core.longleaveDecide_(withKey, KEY, '').op === 'close', 'B3: 既存＋空本文 → close（0名で締め）');
ok(core.longleaveDecide_(empty, KEY, '').op === 'noop', 'B4: 未存在＋空本文 → noop');
ok(core.longleaveDecide_(withKey, KEY, '本文').rowIndex === 1, 'B5: rowIndex は values の0基準行');

// ===== C. 他メッセージを絶対に巻き込まない =====
const withOthers = [HEADER,
  ['db_111', '社長', '社長', '既存の大事な伝言', '', '2026-07-30', false, '', '', '[]', '[]'],
  ['furikae-funou-2026-06', '振替不能', '全員', '振替不能・要対応あり（3件）', '', '2026-07-12', false, '', '', '', ''],
  ['nyukin-dashboard', '社長', '社長', '入金管理…', '', '2026-06-14', false, '', '', '[]', '[]']];
const dAdd = core.longleaveDecide_(withOthers, KEY, '本文');
ok(dAdd.op === 'add' && dAdd.rowIndex === -1, 'C1: 他メッセージだけの盤面 → add（既存行を指さない）');
ok(core.longleaveDecide_(withOthers, 'db_111', '乗っ取り').op === 'reject', 'C2: 伝達メッセージidをキーにしたら reject');
ok(core.longleaveDecide_(withOthers, 'furikae-funou-2026-06', '乗っ取り').op === 'reject', 'C3: 振替不能キー → reject');

// ===== D. O列ゲートの正規化 =====
ok(core.longleaveGateOf_('対象') === '対象', 'D1: 対象');
ok(core.longleaveGateOf_('対象外') === '対象外', 'D2: 対象外');
ok(core.longleaveGateOf_(' 対象 ') === '対象', 'D3: 前後の空白は無視');
ok(core.longleaveGateOf_('　対象外　') === '対象外', 'D4: 全角空白も無視');
ok(core.longleaveGateOf_('') === '', 'D5: 空欄＝承認待ち');
ok(core.longleaveGateOf_(null) === '', 'D6: null＝承認待ち');
ok(core.longleaveGateOf_(undefined) === '', 'D7: undefined＝承認待ち');
ok(core.longleaveGateOf_('たいしょう') === '', 'D8: 想定外の値は承認待ち扱い（載せない側に倒す）');
ok(core.longleaveGateOf_('対象外です') === '', 'D9: 部分一致では通さない（完全一致のみ）');

// ===== E. 月1超過判定（computeLongLeaveFlags_ と同一ルール） =====
ok(core.longleaveIsOverdue_({ lastContact: '', elapsedDays: 28 }) === true, 'E1: 未連絡＋開始から28日 → 超過');
ok(core.longleaveIsOverdue_({ lastContact: '', elapsedDays: 27 }) === false, 'E2: 未連絡＋27日 → まだ');
ok(core.longleaveIsOverdue_({ lastContact: '2026-07-01', daysSinceLastContact: 28 }) === true, 'E3: 最終連絡から28日 → 超過');
ok(core.longleaveIsOverdue_({ lastContact: '2026-07-01', daysSinceLastContact: 27 }) === false, 'E4: 最終連絡から27日 → まだ');
ok(core.longleaveIsOverdue_({ lastContact: '2026-07-30', daysSinceLastContact: 1, elapsedDays: 200 }) === false,
  'E5: 連絡済みなら経過日数が長くても超過にしない（J列が起点）');
ok(core.longleaveIsOverdue_({}) === false, 'E6: 空レコードは超過にしない');

// ===== F. 対象抽出（ゲート × 月1判定）=====
const mk = (name, gate, over) => over
  ? { name: name, monthlyContactGate: gate, lastContact: '', elapsedDays: 40 }
  : { name: name, monthlyContactGate: gate, lastContact: '2026-07-30', daysSinceLastContact: 1 };

const sel1 = core.longleaveSelectTargets_([
  mk('A', '対象', true),    // 載る
  mk('B', '対象', false),   // 対象だが期限前 → 載らない
  mk('C', '', true),        // 承認待ち → 載らない・pendingに計上
  mk('D', '対象外', true),  // 永久除外 → 載らない・pendingにも入れない
]);
ok(sel1.targets.join(',') === 'A', 'F1: 対象かつ月1超過の人だけが本文に載る');
ok(sel1.pendingCount === 1, 'F2: 空欄の人は承認待ちとして件数計上');
ok(sel1.excludedCount === 1, 'F3: 対象外は除外として計上（承認待ちに混ぜない）');

const sel2 = core.longleaveSelectTargets_([mk('C', '', true), mk('D', '対象外', true)]);
ok(sel2.targets.length === 0, 'F4: 承認済みが0名なら投稿対象は0＝締め');
ok(sel2.pendingCount === 1, 'F5: 承認待ちは0名でも件数として残る（朝報告で出す）');

ok(core.longleaveSelectTargets_([]).targets.length === 0, 'F6: 空リストで落ちない');
ok(core.longleaveSelectTargets_(null).targets.length === 0, 'F7: null で落ちない');

// 承認待ちは「期限前」でも計上する（社長が判断していない事実そのものを出す）
const sel3 = core.longleaveSelectTargets_([mk('E', '', false)]);
ok(sel3.pendingCount === 1, 'F8: 承認待ちは月1超過の前でも計上（放置の検知が目的）');

// 順序は入力順を保つ（getLongLeaveList は経過日数の降順＝古い人が上）
const sel4 = core.longleaveSelectTargets_([mk('X', '対象', true), mk('Y', '対象', true)]);
ok(sel4.targets.join(',') === 'X,Y', 'F9: 本文の並びは入力順（経過日数の長い人が上）を保つ');

// ===== G. 本文生成（社長承認済みテンプレ）=====
const body = core.longleaveBuildBody_(['甲野 一郎', '乙野 二郎']);
ok(body.indexOf('【勝又さん】長期休み中の方への月1連絡のお願い') === 0, 'G1: 承認済みの見出しで始まる');
ok(body.indexOf('下記2名が未連絡です') !== -1, 'G2: 人数が実数に差し替わる');
ok(body.indexOf('■ 甲野 一郎さん') !== -1 && body.indexOf('■ 乙野 二郎さん') !== -1, 'G3: 氏名が並ぶ');
ok(body.indexOf('・次回連絡予定日 → 空欄のままでOK') !== -1, 'G4: 次回連絡予定日は「空欄のままでOK」（新仕様）');
ok(body.indexOf('自動で入るので触らなくてOK') === -1, 'G5: 旧文言は残っていない');
ok(body.indexOf('leave-terminate.html') !== -1, 'G6: 記録画面のURLを含む');
ok(body.indexOf('🔄 再開登録」は押さないで') !== -1, 'G7: 再開登録の注意を含む');
ok(core.longleaveBuildBody_([]) === '', 'G8: 0名なら空文字（＝close要求になる）');
ok(core.longleaveBuildBody_(null) === '', 'G9: null なら空文字');

// ===== H. メール通知は「増減があった時だけ」 =====
ok(core.longleaveRosterChanged_(['A', 'B'], ['A', 'B']) === false, 'H1: 同じ顔ぶれ → 送らない');
ok(core.longleaveRosterChanged_(['A', 'B'], ['A']) === true, 'H2: 減った → 送る');
ok(core.longleaveRosterChanged_(['A'], ['A', 'B']) === true, 'H3: 増えた → 送る');
ok(core.longleaveRosterChanged_(['A', 'B'], ['B', 'A']) === false, 'H4: 並び替えだけ → 送らない（集合で比較）');
ok(core.longleaveRosterChanged_([], []) === false, 'H5: 0名のまま → 送らない（毎朝メールを出さない）');
ok(core.longleaveRosterChanged_([], ['A']) === true, 'H6: 0名→1名 → 送る');
ok(core.longleaveRosterChanged_(['A'], []) === true, 'H7: 1名→0名（全員完了）→ 送る');
ok(core.longleaveRosterChanged_(null, ['A']) === true, 'H8: 前回記録なし（初回）→ 送る');
ok(core.longleaveRosterChanged_(null, []) === false, 'H9: 前回なし＆今回0名 → 送らない');

// ===== I. 旧タスクの掃除対象（169件の完了化）=====
ok(core.longleaveIsLegacyTask_('嶋多晴夫様 長期休み利用連絡') === true, 'I1: 旧タスク名 → 掃除対象');
ok(core.longleaveIsLegacyTask_('  芳賀和子様 長期休み利用連絡  ') === true, 'I2: 前後空白があっても対象');
ok(core.longleaveIsLegacyTask_('長期休み利用連絡') === false, 'I3: 「○○様」が無い → 対象外（誤爆防止）');
ok(core.longleaveIsLegacyTask_('個別機能訓練計画書の作成') === false, 'I4: 無関係タスク → 対象外');
ok(core.longleaveIsLegacyTask_('') === false, 'I5: 空 → 対象外');
ok(core.longleaveIsLegacyTask_(null) === false, 'I6: null → 対象外');

console.log('test-longleave-notice.js: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
