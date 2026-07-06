// 回帰テスト: 口腔実施記録の「月2回扱い」判定 isOralTwiceMonthly
// 区変中の要支援者を月2回扱いにする仕様（2026-07-06）。
// ★再実装ではなく oral-record.html の実際の function 本体を抽出して実行する。
//
// 判定基準（社長確定 2026-07-06）:
//   月2回扱い ＝ 現care==kaigo
//              OR ( 現care==shien AND ( 区変中フラグ==TRUE OR 予約介護度が要介護1〜5 ) )
//   それ以外 → 月1回
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'oral-record.html'), 'utf8');

// function isOralTwiceMonthly(...) { ... } 本体を抽出（列0の閉じ波括弧まで）
function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  if (!m) throw new Error('function not found: ' + name);
  return m[0];
}
const isOralTwiceMonthly = eval('(' + extractFn('isOralTwiceMonthly') + ')');
const buildKubunIndex = eval('(' + extractFn('buildKubunIndex') + ')');
// escapeAttr は oral-record.html と同一実装（1行関数のため抽出せず直定義）
function escapeAttr(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
const oralCellHtml = eval('(' + extractFn('oralCellHtml') + ')');

let pass = 0, fail = 0;
const assert = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

// 引数: (care, isKubunActive, reservedCare)
//   care: 現介護度 'kaigo'|'shien'（oral側の台帳直読）
//   isKubunActive: 区変中フラグ==TRUE（kubunList由来）
//   reservedCare: 予約介護度の文字列（kubunScheduledList由来・無ければ ''）

// ③④ 要介護は常に月2回（区変情報を見ない）
assert('要介護は区変情報なしでも月2回', isOralTwiceMonthly('kaigo', false, '') === true);
assert('要介護は予約が要支援でも月2回(kaigo優先)', isOralTwiceMonthly('kaigo', false, '要支援1') === true);

// 通常の要支援（区変なし）は月1回（懸念C）
assert('要支援・区変なしは月1回', isOralTwiceMonthly('shien', false, '') === false);

// ① 区変申請中（結果待ち）の要支援 → 月2回
assert('要支援・区変中は月2回', isOralTwiceMonthly('shien', true, '') === true);

// ② 要介護化を予約（適用月待ち）の要支援 → 月2回
assert('要支援・予約介護度=要介護3は月2回', isOralTwiceMonthly('shien', false, '要介護3') === true);
assert('要支援・予約介護度=要介護３(全角)は月2回', isOralTwiceMonthly('shien', false, '要介護３') === true);
assert('要支援・予約介護度=要介護5は月2回', isOralTwiceMonthly('shien', false, '要介護5') === true);

// ⑤ 決着して要支援のまま（予約が要支援 or 空）→ 月1回に戻る（懸念B）
assert('要支援・予約が要支援2は月1回(据置)', isOralTwiceMonthly('shien', false, '要支援2') === false);
assert('要支援・予約が空文字は月1回', isOralTwiceMonthly('shien', false, '') === false);

// 予約が要介護でも区変中でもない要支援は月1回（要介護という文字を含まない値の混入耐性）
assert('要支援・予約が事業対象は月1回', isOralTwiceMonthly('shien', false, '事業対象者') === false);

// ===== buildKubunIndex（区変索引の構築・本番の壊れた応答に耐えること） =====

// 本番 kubunList の実応答（2026-07-06 実測: 水戸忠）
const realKubunList = { count: 1, active: [{ name: '水戸忠', applyDate: '2026-07-01', expectDate: '2026-08-15', prevCareLevel: '要支援２', daysOver: 0 }] };
// 本番 kubunScheduledList の実応答（2026-07-06 実測: 予約リストでない無関係な応答＝デプロイdrift）
const realScheduledGarbage = { success: true, date: '2026-07-06', dayOfWeek: '月' };

const idx1 = buildKubunIndex(realKubunList, realScheduledGarbage);
assert('区変中の氏名がactiveSetに入る', idx1.activeSet['水戸忠'] === true);
assert('壊れた予約応答でもreservedMapは空(クラッシュしない)', Object.keys(idx1.reservedMap).length === 0);

// 予約リストが正しく返る場合（将来デプロイ修正後）
const goodScheduled = { count: 1, scheduled: [{ name: '予約太郎', currentCare: '要支援1', reservedCare: '要介護2', applyMonth: '2026-09' }] };
const idx2 = buildKubunIndex({ count: 0, active: [] }, goodScheduled);
assert('予約介護度がreservedMapに入る', idx2.reservedMap['予約太郎'] === '要介護2');
assert('activeが空ならactiveSetも空', Object.keys(idx2.activeSet).length === 0);

// null 安全（フェッチ失敗時）
const idx3 = buildKubunIndex(null, null);
assert('両方nullでも空オブジェクトを返す', Object.keys(idx3.activeSet).length === 0 && Object.keys(idx3.reservedMap).length === 0);

// 索引→判定の結合（実測: 水戸忠は月2回、予約太郎も月2回）
assert('結合: 水戸忠(shien,区変中)→月2回', isOralTwiceMonthly('shien', !!idx1.activeSet['水戸忠'], idx1.reservedMap['水戸忠'] || '') === true);
assert('結合: 予約太郎(shien,予約要介護2)→月2回', isOralTwiceMonthly('shien', !!idx2.activeSet['予約太郎'], idx2.reservedMap['予約太郎'] || '') === true);

// ===== oralCellHtml（DOM出力・実測A/B/Cの証明） =====
// 2回目セル(si=1)・当月・未チェックのHTMLで「開く/閉じる」を実値で確認する。
const cellOpen = (o) => oralCellHtml(o).indexOf('onclick=') >= 0 && oralCellHtml(o).indexOf('>-<') < 0;

// A. 水戸忠(shien・区変中→twiceMonthly=true) の2回目が「開く」(クリック可・'-'でない)
const twiceA = isOralTwiceMonthly('shien', true, '');
const cellA = oralCellHtml({ userName: '水戸忠', key: '7月_2回目', si: 1, checked: '', twiceMonthly: twiceA, isCurrentMonth: true });
assert('A: 水戸忠の2回目セルが開く(クリック可)', cellA.indexOf("onclick=\"toggleCheck('水戸忠','7月_2回目')\"") >= 0);
assert('A: 水戸忠の2回目セルは - でない', cellA.indexOf('>-<') < 0);
assert('A: 水戸忠の2回目・当月未実施は赤(highlight-undone)', cellA.indexOf('highlight-undone') >= 0);

// C. 通常の要支援(区変なし→twiceMonthly=false) の2回目は「閉じる」(disabled '-')
const twiceC = isOralTwiceMonthly('shien', false, '');
const cellC = oralCellHtml({ userName: '通常支援', key: '7月_2回目', si: 1, checked: '', twiceMonthly: twiceC, isCurrentMonth: true });
assert('C: 通常要支援の2回目は disabled', cellC.indexOf('disabled') >= 0);
assert('C: 通常要支援の2回目は - 表示', cellC.indexOf('>-<') >= 0 || cellC.indexOf('>-</td>') >= 0);
assert('C: 通常要支援の2回目はクリック不可', cellC.indexOf('onclick=') < 0);

// B1. 区変決着→要介護化(kaigo→twiceMonthly=true) の2回目は開いたまま
const twiceB1 = isOralTwiceMonthly('kaigo', false, '');
const cellB1 = oralCellHtml({ userName: '要介護後', key: '7月_2回目', si: 1, checked: '', twiceMonthly: twiceB1, isCurrentMonth: true });
assert('B1: 要介護化後の2回目は開く', cellB1.indexOf('onclick=') >= 0 && cellB1.indexOf('>-<') < 0);

// B2. 区変決着→要支援のまま(twiceMonthly=false) の2回目は月1回に戻る(disabled)
const twiceB2 = isOralTwiceMonthly('shien', false, '要支援2');
const cellB2 = oralCellHtml({ userName: '支援据置', key: '7月_2回目', si: 1, checked: '', twiceMonthly: twiceB2, isCurrentMonth: true });
assert('B2: 要支援のまま決着の2回目は disabled(月1回に戻る)', cellB2.indexOf('disabled') >= 0 && cellB2.indexOf('onclick=') < 0);

// 1回目(si=0)は誰でも開く／当月未実施は赤
const cell1st = oralCellHtml({ userName: '誰か', key: '7月_1回目', si: 0, checked: '', twiceMonthly: false, isCurrentMonth: true });
assert('1回目は月1回の人でも開く', cell1st.indexOf('onclick=') >= 0);
assert('1回目・当月未実施は赤', cell1st.indexOf('highlight-undone') >= 0);
assert('1回目は month-border が付く', cell1st.indexOf('month-border') >= 0);

// モニタリング(si=2)は twiceMonthly 無関係で常に開く・赤にならない
const cellMoni = oralCellHtml({ userName: '誰か', key: '7月_ﾓﾆﾀﾘﾝｸﾞ', si: 2, checked: '', twiceMonthly: false, isCurrentMonth: true });
assert('モニタリングは月1回の人でも開く', cellMoni.indexOf('onclick=') >= 0);
assert('モニタリングは当月でも赤にならない', cellMoni.indexOf('highlight-undone') < 0);

// チェック済みは✓表示＋checkedクラス（'-'でない・onclick保持）
const cellChecked = oralCellHtml({ userName: '誰か', key: '7月_1回目', si: 0, checked: '2026-07-03', twiceMonthly: false, isCurrentMonth: true });
assert('チェック済みは checked クラス', cellChecked.indexOf('checked') >= 0);
assert('チェック済みは日付を表示', cellChecked.indexOf('2026-07-03') >= 0);

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
