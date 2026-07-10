// 週間予定表バックエンド 純コアテスト（P2.2）
// 対象: gas/yawaragi-board/weekly-core.js
// 実行: node scripts/test-weekly-core.js
const path = require('path');
const c = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'weekly-core.js'));
let pass = 0, fail = 0;
function eq(a, e, m){ const A=JSON.stringify(a),E=JSON.stringify(e); if(A===E){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m+'\n    exp '+E+'\n    act '+A);} }
function ok(cnd, m){ if(cnd){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m);} }

console.log('[weeklyCategory_] フェーズ/種別/利用意向→画面カテゴリ（優先順・先勝ち）');
ok(c.weeklyCategory_({利用意向:'保留', フェーズ:'体験', 種別:'trial'})==='保留', '①利用意向=保留が最優先→保留');
ok(c.weeklyCategory_({フェーズ:'契約準備', 種別:'trial'})==='利用決定', '②契約準備→利用決定');
ok(c.weeklyCategory_({フェーズ:'利用開始準備'})==='利用決定', '②利用開始準備→利用決定');
ok(c.weeklyCategory_({利用意向:'あり', フェーズ:'体験', 種別:'trial'})==='利用予定', '③利用意向=あり→利用予定');
ok(c.weeklyCategory_({フェーズ:'体験', 種別:'inquiry'})==='体験', '④フェーズ=体験→体験');
ok(c.weeklyCategory_({フェーズ:'見学', 種別:'inquiry'})==='見学', '⑤フェーズ=見学→見学');
ok(c.weeklyCategory_({フェーズ:'受付', 種別:'trial'})==='体験', '⑥受付+種別trial→体験');
ok(c.weeklyCategory_({フェーズ:'受付', 種別:'visit'})==='見学', '⑦受付+種別visit→見学');
ok(c.weeklyCategory_({フェーズ:'受付', 種別:'inquiry'})==='問い合わせ', '⑧受付+種別inquiry→問い合わせ');
ok(c.weeklyCategory_({})==='問い合わせ', '⑨default→問い合わせ');
ok(c.weeklyCategory_({利用意向:'なし', フェーズ:'見学'})==='見学', '利用意向=なしはフェーズで判定→見学');

console.log('\n[weeklyFeedInclude_] 未ドロップ かつ 台帳反映済でない のみ');
ok(c.weeklyFeedInclude_({フェーズ:'見学', 利用者台帳反映済:false})===true, '見学+未反映→含む');
ok(c.weeklyFeedInclude_({フェーズ:'ドロップ'})===false, 'ドロップ→除外');
ok(c.weeklyFeedInclude_({フェーズ:'契約準備', 利用者台帳反映済:true})===false, '台帳反映済(true)→除外');
ok(c.weeklyFeedInclude_({フェーズ:'受付', 利用者台帳反映済:''})===true, '未反映(空)→含む');

console.log('\n[weeklyLastName_] 姓のみ抽出');
eq(c.weeklyLastName_('山田 太郎'), '山田', '半角空白→姓');
eq(c.weeklyLastName_('鈴木　花子'), '鈴木', '全角空白→姓');
eq(c.weeklyLastName_('柳浦武治'), '柳浦', '空白なし→先頭2文字');
eq(c.weeklyLastName_(''), '', '空→空');
eq(c.weeklyLastName_(null), '', 'null→空(落ちない)');

console.log('\n[weeklyFeedRow_] PII一切なし・5キーのみ');
const row = c.weeklyFeedRow_({
  種別:'trial', フェーズ:'体験', 利用意向:'', 最終決定曜日:'第1:火AM, 第2:木AM', 予定日:'2026-07-20',
  氏名:'柳浦武治', ふりがな:'やなぎうら', 住所詳細:'小松原4-13', TEL:'090-xxxx', 生年月日:'昭和34年', 年齢:67,
  介護度:'支2', 主訴:'腰痛', ペースメーカー:'有', ケアマネ氏名:'関口', フェーズ遷移履歴:'[...]'
});
eq(Object.keys(row).sort(), ['ampm','category','days','displayName','予定日'].sort(), '★キーは5つのみ（PII列ゼロ）');
eq(row.category, '体験', 'category=体験');
eq(row.days, '火木', 'days=火木（最終決定曜日から抽出）');
eq(row.ampm, '午前', 'ampm=午前');
eq(row.displayName, '柳浦', 'trialは姓のみ');
eq(row.予定日, '2026-07-20', '予定日そのまま');
const PII = ['氏名','ふりがな','住所詳細','TEL','生年月日','年齢','介護度','主訴','ペースメーカー','ケアマネ氏名','フェーズ遷移履歴'];
ok(PII.every(k => !(k in row)), '★PII列（氏名/住所/TEL/生年月日/主訴等）が構造的に存在しない');
const rowVisit = c.weeklyFeedRow_({種別:'visit', フェーズ:'見学', 氏名:'田中一郎', 予定日:'2026-07-21'});
eq(rowVisit.displayName, '', 'trial以外はdisplayName空文字');

console.log('\n[weeklyUpsertValid_] order空ガード / memo空可 / type・key検証');
ok(c.weeklyUpsertValid_('order','am','[1,2,3]').ok===true, 'order+非空value→ok');
ok(c.weeklyUpsertValid_('order','am','').ok===false, '★order+空value→拒否（全消し防止）');
ok(c.weeklyUpsertValid_('order','am','   ').ok===false, 'order+空白のみ→拒否');
ok(c.weeklyUpsertValid_('order','am','[]').ok===false, 'order+空配列JSON→拒否');
ok(c.weeklyUpsertValid_('memo','山田','メモ本文').ok===true, 'memo+本文→ok');
ok(c.weeklyUpsertValid_('memo','山田','').ok===true, 'memoは空value可（メモ消去）');
ok(c.weeklyUpsertValid_('badtype','x','y').ok===false, '不正type→拒否');
ok(c.weeklyUpsertValid_('order','','[1]').ok===false, 'key空→拒否');

console.log('\n[weeklyOrderExists_] seed冪等性判定');
const rows = [['am','order','[3,1,2]','2026-07-11','seed'], ['山田','memo','xxx','2026-07-11','A']];
ok(c.weeklyOrderExists_(rows,'am')===true, 'am order既存→true（seedスキップ）');
ok(c.weeklyOrderExists_(rows,'pm')===false, 'pm order無し→false（seed可）');

console.log('\n' + (fail===0?'[OK] ':'[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail===0?0:1);
