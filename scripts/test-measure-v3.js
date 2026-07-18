// test-measure-v3.js
// 測定アプリ v3（①記録2タップ化 ②測定済み一覧タブ）の純関数 TDD。
//   ① msRecentStaffPush : 直近使った測定者の並び（端末内・localStorage想定。個人情報は名前のみ＝既存画面と同じ）
//   ① msStaffOrder      : スタッフ格子の並び（直近使った人を左上へ）
//   ① msBuildUndo       : 保存の取り消し引数（新actionを作らず既存 updateKeikakusho / deleteShienSokutei で戻す）
//   ② msBuildMeasuredList / msFilterMeasured / msCountByMeasurer / msMonthsBack
// DOM/GAS非依存。実行: node scripts/test-measure-v3.js

const path = require('path');
const core = require(path.join(__dirname, '..', 'measure-core.js'));
const {
  msRecentStaffPush, msStaffOrder, msBuildUndo,
  msBuildMeasuredList, msFilterMeasured, msCountByMeasurer, msMonthsBack
} = core;

let pass = 0, fail = 0;
function eq(a, e, l) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + ' :: exp=' + E + ' act=' + A); } }
function ok(c, l) { eq(!!c, true, l); }

// ===== ① msRecentStaffPush =====
console.log('[msRecentStaffPush] 直近使った測定者を先頭へ（重複除去・上限）');
eq(msRecentStaffPush([], '勝又', 5), ['勝又'], '空→1件');
eq(msRecentStaffPush(['小林'], '勝又', 5), ['勝又', '小林'], '新しい人が先頭');
eq(msRecentStaffPush(['小林', '勝又'], '勝又', 5), ['勝又', '小林'], '既出は重複させず先頭へ移動');
eq(msRecentStaffPush(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b'], '上限3で古いものが落ちる');
eq(msRecentStaffPush(null, '勝又', 5), ['勝又'], 'null（初回起動）でも落ちない');
eq(msRecentStaffPush(['小林'], '', 5), ['小林'], '空名は積まない');

// ===== ① msStaffOrder =====
console.log('[msStaffOrder] スタッフ格子は直近使った人が左上');
eq(msStaffOrder(['勝又', '小林', '田中'], ['田中']), ['田中', '勝又', '小林'], '直近1名が左上・残りは元の順');
eq(msStaffOrder(['勝又', '小林', '田中'], ['田中', '小林']), ['田中', '小林', '勝又'], '直近の順序を保つ');
eq(msStaffOrder(['勝又', '小林'], []), ['勝又', '小林'], '直近なし＝元の順');
eq(msStaffOrder(['勝又', '小林'], ['退職者']), ['勝又', '小林'], '在籍しない直近名は無視（退職・除外設定変更）');
eq(msStaffOrder([], ['田中']), [], 'スタッフ未取得→空');

// ===== ① msBuildUndo =====
console.log('[msBuildUndo] 取り消しは既存actionで元値へ戻す（新action・シート変更なし）');
{
  // 要介護: 保存前が空（＝これが普通。未測定だから対象に出ている）→ 空へ戻す。
  // GAS側 updateKeikakusho は空値で当該セルを消し、行が全部空になれば行ごと削除する＝保存前の状態に戻る。
  const target = { key: 'U001', name: '介護太郎', care: '要介護1', planStart: '2026-04', planMonths: 3 };
  const saved = { action: 'updateKeikakusho', userId: 'U001', year: 2026, month: 2026 && 4 };
  const undo = msBuildUndo(target, saved, { sokuteiDate: '', sokuteiBy: '', outputBy: '' });
  eq(undo.action, 'updateKeikakusho', '要介護は updateKeikakusho で戻す');
  eq(undo.userId, 'U001', '同じ行キー(userId)');
  eq(undo.year, 2026, '同じ年');
  eq(undo.month, 4, '同じ計画月');
  eq(undo.jobs, [
    { field: 'sokutei_date', value: '' },
    { field: 'sokutei_by', value: '' },
    { field: 'output_by', value: '' }
  ], '3項目とも保存前の値（空）へ戻す');
}
{
  // 再測定（保存前に前回値が入っていた）ケース: 空ではなく元の値へ戻す＝データを消さない
  const target = { key: 'U002', name: '介護花子', care: '要介護2', planStart: '2026-04', planMonths: 3 };
  const saved = { action: 'updateKeikakusho', userId: 'U002', year: 2026, month: 4 };
  const undo = msBuildUndo(target, saved, { sokuteiDate: '2026-01-05', sokuteiBy: '小林', outputBy: '勝又' });
  eq(undo.jobs, [
    { field: 'sokutei_date', value: '2026-01-05' },
    { field: 'sokutei_by', value: '小林' },
    { field: 'output_by', value: '勝又' }
  ], '元値があるなら元値へ戻す（空で潰さない）');
}
{
  // 要支援: 追記型なので既存の deleteShienSokutei で「いま書いた1行」だけ消す
  const target = { key: '支援次郎', name: '支援次郎', care: '要支援2' };
  const saved = { action: 'addShienSokutei', name: '支援次郎', date: '2026-07-20', by: '勝又' };
  const undo = msBuildUndo(target, saved, {});
  eq(undo, { action: 'deleteShienSokutei', name: '支援次郎', date: '2026-07-20', by: '勝又' },
    '要支援は deleteShienSokutei（name+date+by 完全一致の1行）');
}
{
  const target = { key: 'x', care: '事業対象者' };
  const saved = { action: 'addShienSokutei', name: 'x', date: '2026-07-20', by: '小林' };
  eq(msBuildUndo(target, saved, {}).action, 'deleteShienSokutei', '事業対象者も要支援系と同じ経路');
}

// ===== ② msMonthsBack =====
console.log('[msMonthsBack] 一覧の既定期間＝直近6ヶ月（測定周期3〜4ヶ月をまたぐ）');
eq(msMonthsBack('2026-07-20', 6), { from: '2026-02-01', to: '2026-07-31' }, '7月起点6ヶ月＝2月〜7月');
eq(msMonthsBack('2026-01-15', 6), { from: '2025-08-01', to: '2026-01-31' }, '年跨ぎ');
eq(msMonthsBack('2026-07-20', 1), { from: '2026-07-01', to: '2026-07-31' }, '1ヶ月＝当月のみ');
eq(msMonthsBack('2026-02-10', 1), { from: '2026-02-01', to: '2026-02-28' }, '2月末=28日');

// ===== ② msBuildMeasuredList =====
console.log('[msBuildMeasuredList] 履歴→一覧（測定日の新しい順・期間で絞る・paper除外は呼び出し側）');
{
  const records = [
    { key: 'U001', sokutei_date: '2026-03-10', sokutei_by: '勝又', careType: '要介護', source: '' },
    { key: '支援次郎', sokutei_date: '2026-07-02', sokutei_by: '小林', careType: '要支援系', source: 'app' },
    { key: 'U001', sokutei_date: '2026-06-28', sokutei_by: '小林', careType: '要介護', source: '' },
    { key: '古い人', sokutei_date: '2025-12-01', sokutei_by: '勝又', careType: '要支援系', source: 'app' }
  ];
  const nameByKey = { U001: '介護太郎' };
  const rows = msBuildMeasuredList(records, nameByKey, { from: '2026-02-01', to: '2026-07-31' });
  eq(rows.map(r => r.date), ['2026-07-02', '2026-06-28', '2026-03-10'], '測定日の新しい順・期間外(2025-12)は除外');
  eq(rows[0].name, '支援次郎', '要支援は key がそのまま氏名');
  eq(rows[1].name, '介護太郎', '要介護は userId を氏名へ解決');
  eq(rows[1].care, '要介護', '区分を持つ');
  eq(rows[0].by, '小林', '測定者を持つ');
  eq(rows[2].key, 'U001', 'key を保持（重複氏名の取り違え防止）');
}
{
  // 氏名が解決できない（台帳から消えた等）→ key をそのまま出す。空欄にして行を消さない
  const rows = msBuildMeasuredList(
    [{ key: 'U999', sokutei_date: '2026-07-01', sokutei_by: '勝又', careType: '要介護' }],
    {}, { from: '2026-02-01', to: '2026-07-31' });
  eq(rows.length, 1, '氏名未解決でも行は残す');
  eq(rows[0].name, 'U999', '氏名未解決は key を表示');
}
eq(msBuildMeasuredList(null, {}, { from: '2026-01-01', to: '2026-12-31' }), [], 'null→空（未取得で落ちない）');
{
  // 日付が空/不正なレコードは一覧に出さない（期限計算側と同じ扱い）
  const rows = msBuildMeasuredList(
    [{ key: 'a', sokutei_date: '', sokutei_by: '勝又' }, { key: 'b', sokutei_date: '2026-07-01', sokutei_by: '勝又' }],
    {}, { from: '2026-01-01', to: '2026-12-31' });
  eq(rows.map(r => r.key), ['b'], '日付なしは除外');
}

// ===== ② msFilterMeasured =====
console.log('[msFilterMeasured] 名前の部分一致検索＋測定者で絞る');
{
  const rows = [
    { key: 'U1', name: '山田太郎', date: '2026-07-02', by: '勝又', care: '要介護' },
    { key: 'U2', name: '山本花子', date: '2026-06-28', by: '小林', care: '要支援' },
    { key: 'U3', name: '田中一郎', date: '2026-05-10', by: '勝又', care: '要介護' }
  ];
  eq(msFilterMeasured(rows, { q: '山' }).map(r => r.key), ['U1', 'U2'], '部分一致（山→山田・山本）');
  eq(msFilterMeasured(rows, { q: '太郎' }).map(r => r.key), ['U1'], '後方の部分一致も効く');
  eq(msFilterMeasured(rows, { by: '勝又' }).map(r => r.key), ['U1', 'U3'], '測定者で絞る');
  eq(msFilterMeasured(rows, { q: '山', by: '勝又' }).map(r => r.key), ['U1'], '検索と測定者の併用はAND');
  eq(msFilterMeasured(rows, {}).length, 3, '条件なし＝全件');
  eq(msFilterMeasured(rows, { q: '' , by: '' }).length, 3, '空文字は条件なし扱い');
  eq(msFilterMeasured(rows, { q: 'いない人' }).length, 0, '該当なし→空');
  eq(msFilterMeasured(rows, { q: '　山 ' }).map(r => r.key), ['U1', 'U2'], '前後の空白（全角含む）は無視');
}

// ===== ② msCountByMeasurer =====
console.log('[msCountByMeasurer] 測定者別の件数＝偏りの可視化（表示中の範囲に追随）');
{
  const rows = [
    { by: '勝又' }, { by: '小林' }, { by: '勝又' }, { by: '勝又' }, { by: '' }
  ];
  eq(msCountByMeasurer(rows), [{ name: '勝又', count: 3 }, { name: '小林', count: 1 }],
    '件数の多い順・測定者空欄は数えない');
  eq(msCountByMeasurer([{ by: 'b' }, { by: 'a' }]), [{ name: 'a', count: 1 }, { name: 'b', count: 1 }],
    '同数は名前順（並びが実行ごとに揺れない）');
  eq(msCountByMeasurer([]), [], '空→空');
  eq(msCountByMeasurer(null), [], 'null→空');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
if (fail > 0) process.exit(1);
