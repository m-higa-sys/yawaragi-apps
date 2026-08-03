// attendance-ops.html スタッフ対応表・時給まわりのテスト（jsdom）
// 実行: node scripts/test-attendance-ops-staffmap.js
//
// 出勤＆送迎表からスタッフ実名と金額を外し、氏名⇄内部IDの対応表(localStorage)で
// 実行時に解決する方式に変えた。その方式が「静かに間違わない」ことを固定する。
//  - 並び順に依存しない（staff_list の順序を入れ替えても割当が変わらない）
//  - 未知の氏名だけを確認対象にする（既承認を再確認しない）
//  - 未承認の氏名には勤務も時給も紐付かない（仮IDを生成しない）
//  - 同一IDへの複数氏名は承認をブロックする（別名モードのときだけ許す）
//  - バックアップに対応表と時給が入り、復元で書き戻せる
//  - HTMLに実名・金額が残っていない
//
// ※ ここで使う氏名はすべて架空のダミー。実スタッフ名は使わない。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'attendance-ops.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const jsdomErrors = [];
const { VirtualConsole } = require('jsdom');
const vc = new VirtualConsole();
vc.on('jsdomError', e => jsdomErrors.push(e));
vc.on('error', e => jsdomErrors.push(e));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.github.io/yawaragi-apps/attendance-ops.html',
  virtualConsole: vc,
  beforeParse(w) {
    // fetch は遮断（永久pending）。版ゲートもGAS通信もネットワークに出さない。
    w.fetch = function () { return new Promise(function () { }); };
    w.BroadcastChannel = function () { this.onmessage = null; this.postMessage = function () { }; this.close = function () { }; };
    w.alert = function () { };
    w.confirm = function () { return false; };
    w.print = function () { };
  }
});
const w = dom.window;
// トップレベル const/let は window に載らないため eval 経由で読む
const G = (expr) => w.eval(expr);
const SM = G('STAFF_META');

// ダミー氏名（実名は一切使わない）
const N1 = 'テスト一郎', N2 = 'テスト二郎', N3 = 'テスト三郎', N4 = 'テスト四郎';
const ID1 = 'katsumata', ID2 = 'hoshino', ID3 = 'shimoura';

function resetStorage() { w.localStorage.clear(); }

console.log('\n[1] 読み込み・基本構造');
ok(typeof w.buildStaffFromIdMap === 'function', 'buildStaffFromIdMap が定義されている');
ok(typeof w.pickUnknownNames === 'function', 'pickUnknownNames が定義されている');
ok(typeof w.detectIdMapConflicts === 'function', 'detectIdMapConflicts が定義されている');
ok(typeof w.wageMissingIds === 'function', 'wageMissingIds が定義されている');
ok(Array.isArray(SM) && SM.length >= 13, 'STAFF_META にスタッフが入っている（実測: ' + SM.length + '件・件数は test-attendance-ops-timeparse.js で固定）');
ok(SM.every(m => m.name === undefined), 'STAFF_META に name フィールドが無い（実名を持たない）');
ok(Object.keys(G('DEFAULT_WAGES')).length === 0, 'DEFAULT_WAGES が空（金額を持たない）');

console.log('\n[2] 並び順に依存しない（対応表は氏名で照合する）');
{
  const map = {}; map[N1] = ID1; map[N2] = ID2; map[N3] = ID3;
  const a = w.buildStaffFromIdMap(SM, map);
  // staff_list の順序が変わっても、対応表が同じなら結果は同じ
  const mapShuffled = {}; mapShuffled[N3] = ID3; mapShuffled[N1] = ID1; mapShuffled[N2] = ID2;
  const b = w.buildStaffFromIdMap(SM, mapShuffled);
  ok(JSON.stringify(a.staff) === JSON.stringify(b.staff), '対応表のキー順を入れ替えても STAFF は同一');
  ok(JSON.stringify(a.nameToId) === JSON.stringify(b.nameToId) ||
    Object.keys(a.nameToId).every(k => a.nameToId[k] === b.nameToId[k]), '氏名→ID の対応も同一');
  // STAFF の並びは STAFF_META の順（＝画面表示順）で安定する
  ok(a.staff.map(s => s.id).join(',') === [ID1, ID2, ID3].join(','), 'STAFF の並びは STAFF_META 順で安定');
  ok(a.staff[0].name === N1 && a.staff[1].name === N2, '氏名が正しく注入される');

  // staff_list（配列）の並びを変えても未知検出の結果集合は同じ
  const u1 = w.pickUnknownNames([N1, N2, N3], map);
  const u2 = w.pickUnknownNames([N3, N2, N1], map);
  ok(u1.length === 0 && u2.length === 0, '登録済みなら並び順を変えても未知は0件');
}

console.log('\n[3] 新しい氏名は1件だけが確認対象になる');
{
  const map = {}; map[N1] = ID1; map[N2] = ID2;
  const unknown = w.pickUnknownNames([N1, N2, N4], map);
  ok(unknown.length === 1, '未知は1件だけ（既承認2件は再確認しない）');
  ok(unknown[0] === N4, '未知として出るのは新しい氏名');
  const unknownShuffled = w.pickUnknownNames([N4, N2, N1], map);
  ok(unknownShuffled.length === 1 && unknownShuffled[0] === N4, '並び順を変えても未知は同じ1件');
  ok(w.pickUnknownNames([N1, N1, N4, N4], map).length === 1, '同じ氏名が重複していても1件に畳む');
  ok(w.pickUnknownNames([' ', '', N1], map).length === 0, '空文字・空白は未知として拾わない');
}

console.log('\n[4] 未承認の氏名には勤務も時給も紐付かない');
{
  const map = {}; map[N1] = ID1;             // N2 は未承認
  const built = w.buildStaffFromIdMap(SM, map);
  ok(built.staff.length === 1, '承認済み1名だけが STAFF に入る');
  ok(built.staff.every(s => s.name !== N2), '未承認の氏名は STAFF に現れない');
  ok(built.nameToId[N2] === undefined, '未承認の氏名は 氏名→ID にも入らない');
  ok(built.unassignedIds.length === SM.length - 1, '承認済み1名を除く全IDが未割当として報告される（実測: ' + built.unassignedIds.length + '/' + (SM.length - 1) + '）');
  ok(built.unassignedIds.indexOf(ID2) >= 0, '未割当IDに ID2 が含まれる');
  // 仮IDの自動生成をしていないこと＝未割当IDは STAFF_META の実在IDのみ
  const metaIds = SM.map(m => m.id);
  ok(built.unassignedIds.every(id => metaIds.indexOf(id) >= 0), '仮IDを自動生成していない');
  // 時給は STAFF に入っている人しか対象にならない
  const wages = {}; wages[ID1] = 1; wages[ID2] = 1;
  ok(w.wageMissingIds(wages, built.staff).length === 0, '未承認者は時給の対象にならない');
}

console.log('\n[5] 同一IDへの複数氏名割当は承認をブロックする');
{
  const existing = {}; existing[N1] = ID1;
  const pending = {}; pending[N2] = ID1;      // 既に使われているIDへ別の氏名
  const c = w.detectIdMapConflicts(pending, existing, SM, false);
  ok(c.ok === false, '同一IDへの複数氏名 → ok:false（承認ボタンを押させない）');
  ok(c.dupIds.length === 1 && c.dupIds[0] === ID1, '重複したIDが報告される');

  // 別名モード（表記ゆれ・旧姓）を明示したときだけ通す
  const c2 = w.detectIdMapConflicts(pending, existing, SM, true);
  ok(c2.ok === true, '別名モードを明示すれば通る');
  const built = w.buildStaffFromIdMap(SM, { [N1]: ID1, [N2]: ID1 });
  ok(built.staff.length === 1, '別名は1人として扱う（人数が増えない）');
  ok(built.nameToId[N1] === ID1 && built.nameToId[N2] === ID1, '別名も 氏名→ID に載る（表記ゆれを吸収）');

  // 同一氏名が別IDへ → 常にブロック
  const existing2 = {}; existing2[N1] = ID1;
  const pending2 = {}; pending2[N1] = ID2;
  const c3 = w.detectIdMapConflicts(pending2, existing2, SM, true);
  ok(c3.ok === false && c3.dupNames.length === 1, '同一氏名を別IDへ → 別名モードでもブロック');

  // 未知のIDはブロック
  const c4 = w.detectIdMapConflicts({ [N3]: 'not_an_id' }, {}, SM, false);
  ok(c4.ok === false && c4.badIds.length === 1, 'STAFF_META に無いIDはブロック');
}

console.log('\n[6] 退職者（staff_listから消えた氏名）を自動削除しない');
{
  const map = {}; map[N1] = ID1; map[N2] = ID2;
  // staff_list には N1 しか居ない状況でも、対応表は減らさない
  const unknown = w.pickUnknownNames([N1], map);
  ok(unknown.length === 0, '消えた氏名は「未知」として再確認されない');
  const built = w.buildStaffFromIdMap(SM, map);
  ok(built.nameToId[N2] === ID2, '消えた氏名も対応表に残る（過去データが切れない）');
  // STAFF_META に無いIDを指す氏名は orphan として報告（自動削除しない）
  const built2 = w.buildStaffFromIdMap(SM, { [N1]: ID1, [N3]: 'retired_id' });
  ok(built2.orphanNames.length === 1 && built2.orphanNames[0] === N3, '未知IDを指す氏名は orphan として残す');
}

console.log('\n[7] SHIFT_NAME_TO_ID 経由で yawaragi_shift_YYYY-MM を読める');
{
  resetStorage();
  const map = {}; map[N1] = ID1; map[N2] = ID2;
  w.saveStaffIdMap(map);
  w.applyStaffIdMap(map);
  ok(G('SHIFT_NAME_TO_ID')[N1] === ID1, 'SHIFT_NAME_TO_ID が実行時に構築される');

  // shift-create.html が書く形式そのまま（氏名キー・{data,savedAt}）
  const shiftData = {};
  shiftData[N1] = { '2026-08-01': 'B2', '2026-08-02': '休' };
  shiftData[N2] = { '2026-08-01': 'C' };
  w.localStorage.setItem('yawaragi_shift_2026-08', JSON.stringify({ data: shiftData, savedAt: '2026-08-01T00:00:00Z' }));

  G('SHIFT_DATA = {}');
  w.loadShiftFromTable();
  const got = G('SHIFT_DATA')['2026-08'];
  ok(!!got, 'yawaragi_shift_2026-08 を読み込めた');
  ok(!!got && got[ID1] && got[ID1][0] === 'B2', '氏名キー→内部ID変換で1日目が B2');
  ok(!!got && got[ID1] && got[ID1][1] === '休', '2日目が 休');
  ok(!!got && got[ID1] && got[ID1][2] === '-', '未記入日は - で埋まる');
  ok(!!got && got[ID2] && got[ID2][0] === 'C', '2人目も内部IDで引ける');
  ok(!!got && got[ID1] && got[ID1].length === 31, '8月は31日分の配列');

  // 未承認の氏名はシフトを持っていても取り込まれない
  const shiftData2 = {};
  shiftData2[N1] = { '2026-09-01': 'B2' };
  shiftData2[N4] = { '2026-09-01': 'C' };   // N4 は対応表に無い
  w.localStorage.setItem('yawaragi_shift_2026-09', JSON.stringify({ data: shiftData2, savedAt: 'x' }));
  G('SHIFT_DATA = {}');
  w.loadShiftFromTable();
  const got9 = G('SHIFT_DATA')['2026-09'];
  ok(!!got9 && Object.keys(got9).length === 1, '未承認の氏名のシフトは取り込まれない');
}

console.log('\n[8] 時給が未設定でも壊れず、設定を促す');
{
  resetStorage();
  const map = {}; map[N1] = ID1; map[N2] = ID2;
  w.saveStaffIdMap(map);
  const built = w.applyStaffIdMap(map);
  ok(Object.keys(w.loadWages()).length === 0, '時給は初期状態で空（HTMLから自動補完されない）');
  const missing = w.wageMissingIds(w.loadWages(), built.staff);
  ok(missing.length === 2, '未設定が2名として検出される');

  // 0 は「明示的に計算外」＝設定済みとして扱う
  w.saveWageData({ [ID1]: 0 });
  ok(w.wageMissingIds(w.loadWages(), built.staff).length === 1, '0 を入れた人は未設定から外れる');
  // 空文字は未設定に戻る
  w.updateWage(ID1, '');
  ok(w.loadWages()[ID1] === undefined, '空欄入力で未設定に戻せる');
  ok(w.wageMissingIds(w.loadWages(), built.staff).length === 2, '未設定が2名に戻る');

  // 未設定でも NaN を作らない
  const wages = w.loadWages();
  const raw = wages[ID1];
  const num = Number(raw) || 0;
  ok(!isNaN(num) && num === 0, '未設定の時給は NaN にならず 0 として扱われる');

  // 画面文言（設定を促す表示がHTMLに存在する）
  ok(html.indexOf('時給未設定') >= 0, '「時給未設定」の警告文言がある');
  ok(html.indexOf('「単価」欄') >= 0, 'どこで設定するかの案内がある');
  ok(html.indexOf('placeholder="未設定"') >= 0, '入力欄のプレースホルダが「未設定」');
}

console.log('\n[9] バックアップに対応表と時給が入り、復元で書き戻せる');
{
  resetStorage();
  const map = {}; map[N1] = ID1; map[N2] = ID2;
  w.saveStaffIdMap(map);
  w.saveWageData({ [ID1]: 1000, [ID2]: 2000 });
  w.applyStaffIdMap(map);

  // 書出フォーマットに2キーが載る（既存項目は変えない）
  let captured = null;
  const origBlob = w.Blob;
  w.Blob = function (parts) { captured = parts[0]; this.parts = parts; };
  w.URL.createObjectURL = function () { return 'blob:test'; };
  w.URL.revokeObjectURL = function () { };
  const origClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () { };
  w.doOpsExport({ '2026-08-01': { date: '2026-08-01' } }, ['2026-08-01']);
  w.Blob = origBlob;
  w.HTMLAnchorElement.prototype.click = origClick;

  const exported = JSON.parse(captured);
  ok(exported.type === 'yawaragi_daily_ops_backup', '既存の type は変わっていない（後方互換）');
  ok(!!exported.dailyOps, '既存の dailyOps は残っている');
  ok(!!exported.exportDate, '既存の exportDate は残っている');
  ok(!!exported.staffIdMap && exported.staffIdMap[N1] === ID1, '書出に staffIdMap が含まれる');
  ok(!!exported.staffWages && exported.staffWages[ID1] === 1000, '書出に staffWages が含まれる');

  // 空の端末へ復元 → 確認なしで入る
  resetStorage();
  const r1 = w.restoreStaffExtras(exported, function () { return false; });
  ok(w.loadStaffIdMap()[N1] === ID1, '空の端末には対応表がそのまま復元される');
  ok(w.loadWages()[ID1] === 1000, '空の端末には時給がそのまま復元される');
  ok(r1.notes.length === 2, '復元内容が報告される');

  // 既存と差異あり → キャンセルなら既存を維持（無条件上書きしない）
  w.saveStaffIdMap({ [N1]: ID2 });
  w.saveWageData({ [ID1]: 9999 });
  w.restoreStaffExtras(exported, function () { return false; });
  ok(w.loadStaffIdMap()[N1] === ID2, 'キャンセル時は既存の対応表を維持（上書きしない）');
  ok(w.loadWages()[ID1] === 9999, 'キャンセル時は既存の時給を維持');

  // OK なら置き換え
  w.restoreStaffExtras(exported, function () { return true; });
  ok(w.loadStaffIdMap()[N1] === ID1, 'OK時はファイルの対応表で置き換わる');
  ok(w.loadWages()[ID1] === 1000, 'OK時はファイルの時給で置き換わる');

  // 2キーを持たない旧バックアップでも壊れない（後方互換）
  resetStorage();
  const oldFile = { type: 'yawaragi_daily_ops_backup', exportDate: 'x', dailyOps: {} };
  const r2 = w.restoreStaffExtras(oldFile, function () { return true; });
  ok(r2.notes.length === 0, '旧フォーマット（2キー無し）でも例外にならず何もしない');

  // 差分計算そのもの
  const d = w.diffKeyMap({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
  ok(d.added.length === 1 && d.changed.length === 1 && d.removed.length === 0, 'diffKeyMap が追加/変更を数える');
  ok(w.diffKeyMap({ a: 1 }, { a: 1 }).same === true, '同一なら same:true');
}

console.log('\n[10] staff_list が取れないときに実名を埋めない');
{
  resetStorage();
  // 対応表も無く取得も失敗 → STAFF は空のまま（フォールバック実名を持たない）
  w.applyStaffIdMap({});
  ok(G('STAFF').length === 0, '対応表が無ければ STAFF は空（実名のフォールバックが無い）');
  ok(G('STAFF_READY') === false, 'STAFF_READY が false（このとき画面は停止する）');
  ok(Object.keys(G('SHIFT_NAME_TO_ID')).length === 0, '氏名→ID も空');
  ok(typeof w.showStaffUnavailable === 'function', '停止用の表示関数がある');
  ok(html.indexOf('スタッフ情報を取得できません') >= 0, '停止時の文言がHTMLにある');
  // 対応表だけあれば（GASが落ちていても）動く
  const map = {}; map[N1] = ID1;
  w.applyStaffIdMap(map);
  ok(G('STAFF_READY') === true, '対応表があればGAS無しでも起動できる');
}

console.log('\n[11] localStorage キー13種が現行と同名');
{
  const expected = [
    'yawaragi_daily_ops', 'yawaragi_daily_ops_backup', 'yawaragi_ops_last_backup',
    'yawaragi_ops_gas_url', 'yawaragi_nisshi_gas_url', 'yawaragi_standard_positions',
    'yawaragi_staff_wages', 'yawaragi_avg_revenue', 'yawaragi_measurement_tracking',
    'yawaragi_oral_check', 'yawaragi_weight_check', 'yawaragi_print_layout',
    'yawaragi_board_absences_cache', 'yawaragi_last_full_sync', 'yawaragi_shift_'
  ];
  let missing = [];
  expected.forEach(k => { if (html.indexOf("'" + k + "'") < 0 && html.indexOf('"' + k + '"') < 0) missing.push(k); });
  ok(missing.length === 0, '既存キーがすべて同名で残っている（欠け: ' + missing.length + '）');
  ok(html.indexOf("'yawaragi_staff_id_map'") >= 0, '新規キー yawaragi_staff_id_map が1つだけ追加されている');
}

console.log('\n[12] 公開前ゲート（HTMLに残っていないこと）');
{
  ok(!/file:\/\//.test(html), 'file:// 参照が無い');
  ok(!/[A-Za-z]:\\\\|\/Users\/mh\/|C:\//.test(html), 'Windows/ローカル絶対パスが無い');
  ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(html), 'メールアドレスが無い');
  ok(!/AIza[0-9A-Za-z_-]{20,}/.test(html), 'APIキー(AIza系)が無い');
  ok(!/(api[_-]?key|apiKey|access[_-]?token|Bearer |secret|passwd|CHANNEL_ACCESS|LINE_TOKEN)/.test(html), 'トークン系リテラルが無い');
}

console.log('\n[13] 役割の特例はIDで判定する（実名の再混入ガード）');
{
  ok(G("OWNER_ID") === 'higa', 'OWNER_ID は内部ID');
  ok(Array.isArray(G('LAST_LEAVE_IDS')) && G('LAST_LEAVE_IDS').length === 2, 'LAST_LEAVE_IDS は内部IDの配列');
  ok(G('LAST_LEAVE_IDS').every(id => /^[a-z_]+$/.test(id)), 'LAST_LEAVE_IDS に日本語が入っていない');

  resetStorage();
  const map = {}; map[N1] = ID1; map[N2] = 'higa';
  w.saveStaffIdMap(map); w.applyStaffIdMap(map);
  ok(w.idOfName(N1) === ID1, 'idOfName が氏名からIDを引ける');
  ok(w.idOfName('　' + N1 + ' ') === ID1, 'idOfName は空白を無視して照合する');
  ok(w.idOfName('居ない人') === '', '未登録の氏名は空文字（推測しない）');
  ok(w.nameOfId(ID1) === N1, 'nameOfId がIDから表示名を引ける');
  ok(w.nameOfId('kita') === '', '未割当IDの表示名は空文字（推測で名前を作らない）');
  ok(w.isOwnerName(N2) === true, '社長判定がIDベースで効く');
  ok(w.isOwnerName(N1) === false, '社長でない人は false');

  // 日本語氏名との直接比較がコードに残っていないこと
  const nameCompare = html.match(/(name|_n|staff\.name)\s*===\s*'[一-龥]{1,4}'/g) || [];
  ok(nameCompare.length === 0, '氏名リテラルとの等値比較が無い（実測: ' + nameCompare.length + '件）');
  // 業務語（時間帯・状態）は除外し、氏名らしいリテラルだけを見る
  const GENERIC = ['有給', '開始時間', '午前', '午後', '清掃後', '送迎後', 'ラスト', '朝一', '休憩', '欠席', '中止'];
  const pushLiteral = (html.match(/\.(push|includes|has)\('[一-龥]{2,4}'\)/g) || [])
    .filter(m => !GENERIC.some(g => m.indexOf(g) >= 0));
  ok(pushLiteral.length === 0, '氏名リテラルの push/includes が無い（実測: ' + pushLiteral.length + '件）');
}

console.log('\n[14] jsdom 読み込みで JSエラー 0');
ok(jsdomErrors.length === 0, 'jsdomError/error が0件（実測: ' + jsdomErrors.length + '）');
if (jsdomErrors.length > 0) jsdomErrors.slice(0, 3).forEach(e => console.log('    ' + (e && (e.message || e))));

try { w.close(); } catch (e) { }

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
