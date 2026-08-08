// 通所評価の判定語彙に「通所介護評価」を足す（2026-08-08・社長承認）
//
// ■ なぜ足すか（実測）
//   現場が実際に置いているファイル名は「7月通所介護評価・◯◯.pdf」。
//   語彙は ['通所評価','結果報告書','評価表'] で「通所介護評価」を持たないため、
//   氏名は当たるが書類名が読めず weak 止まり＝自動で「送る」へ上がらなかった（8件）。
//
// ■ 何を守るか
//   足すのは tsusho_hyouka に1語だけ。他の書類種別の語彙は1文字も動かさない。
//   氏名マッチ・月絞り込みのロジックにも触らない。誤爆ゼロをここで固定する。
//
// 実行: node scripts/test-pdf-hyouka-word.js
const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}
const find = (files, name, docType, ym) => core.sbFindSignedPdf_(files, name, [], docType, ym);

console.log('\n[A) ★実物のファイル名で strong になる（8件が「送る」へ上がる）]');
// 2026-08-08 実測: 通所評価フォルダに実在する8名のファイル名（現場の付け方そのまま）
const REAL8 = ['貝原信子', '亀山實子', '久保田富子', '川邊アキ子', '福島春代', '木村光夫', '野澤喜治', '鈴木みつ'];
const REAL_FILES = REAL8.map(n => '7月通所介護評価・' + n + '.pdf');
REAL8.forEach((n, i) => {
  const r = find(REAL_FILES, n, 'tsusho_hyouka', '2026-07');
  ok('A' + (i + 1) + ' ' + n + ' が strong', r.match === 'strong' && r.fileName === REAL_FILES[i],
     '実測 match=' + r.match + ' file=' + r.fileName);
});
{
  // 実物には拡張子のドットが落ちたものも在る（「7月通所介護評価・貝原信子pdf」）。従来どおり拾えること。
  const r = find(['7月通所介護評価・貝原信子pdf'], '貝原信子', 'tsusho_hyouka', '2026-07');
  ok('A9 拡張子のドット落ちファイルも strong', r.match === 'strong', '実測 ' + r.match);
}

console.log('\n[B) 既存3語は今までどおり効く（消していない）]');
[['7月通所評価・甲野花子.pdf', '通所評価'],
 ['7月結果報告書・甲野花子.pdf', '結果報告書'],
 ['7月評価表・甲野花子.pdf', '評価表']].forEach((p, i) => {
  const r = find([p[0]], '甲野花子', 'tsusho_hyouka', '2026-07');
  ok('B' + (i + 1) + ' 「' + p[1] + '」は strong のまま', r.match === 'strong', '実測 ' + r.match);
});

console.log('\n[C) 月絞り込み・氏名マッチのロジックは不変]');
{
  const r = find(['6月通所介護評価・甲野花子.pdf'], '甲野花子', 'tsusho_hyouka', '2026-07');
  ok('C1 先月のPDFでは当月を確定させない', !r.found, '実測 ' + JSON.stringify(r));
}
{
  const r = find(['通所介護評価・甲野花子.pdf'], '甲野花子', 'tsusho_hyouka', '2026-07');
  ok('C2 月が読めないファイルは weak 止まり（従来どおり）', r.match === 'weak', '実測 ' + r.match);
}
{
  const r = find(['7月通所介護評価・別人太郎.pdf'], '甲野花子', 'tsusho_hyouka', '2026-07');
  ok('C3 別人には当たらない', !r.found, '実測 ' + JSON.stringify(r));
}
{
  const r = find(['7月通所介護評価・甲野花子.pdf'], '', 'tsusho_hyouka', '2026-07');
  ok('C4 氏名が空なら何も当てない（従来どおり）', !r.found);
}

console.log('\n[D) ★誤爆ゼロ: 他の書類種別の語彙を1文字も動かしていない]');
const EXPECTED = {
  kokun_set:      ['個別機能訓練計画書', '個別機能訓練', '個訓', '機能訓練計画書'],
  tsusho_keikaku: ['通所介護計画書', '通所計画書', '通所介護'],
  tsusho_hyouka:  ['通所評価', '結果報告書', '評価表', '通所介護評価'],   // ← 末尾に1語だけ追加
  tsusho_moni:    ['通所モニタリング', '通所モニ', 'モニタリング'],
  oral_plan:      ['口腔機能向上計画書', '口腔計画書', '口腔'],
  sokutei:        ['アウトカム詳細', 'アウトカム', '測定結果', '測定']
};
Object.keys(EXPECTED).forEach(k => {
  ok('D:' + k + ' の語彙が期待どおり',
     JSON.stringify(core.SB_PDF_DOC_WORDS[k]) === JSON.stringify(EXPECTED[k]),
     '実測 ' + JSON.stringify(core.SB_PDF_DOC_WORDS[k]));
});
ok('D:書類種別の数が増えていない',
   Object.keys(core.SB_PDF_DOC_WORDS).length === Object.keys(EXPECTED).length,
   '実測 ' + Object.keys(core.SB_PDF_DOC_WORDS).length);
ok('D:tsusho_hyouka の追加はちょうど1語',
   core.SB_PDF_DOC_WORDS.tsusho_hyouka.length === 4,
   '実測 ' + core.SB_PDF_DOC_WORDS.tsusho_hyouka.length + ' 語');

console.log('\n[E) 書類種別をまたいだ取り違えが起きない]');
// 突合はフォルダ（書類種別）ごとに、その種別の語彙だけで行う。
// 念のため「通所介護計画書」のファイルを通所評価として判定しても strong にならないことを見る。
{
  const r = find(['7月通所介護計画書・甲野花子.pdf'], '甲野花子', 'tsusho_hyouka', '2026-07');
  ok('E1 通所介護計画書は通所評価として確定しない（weak 止まり）', r.match === 'weak', '実測 ' + r.match);
}
{
  // ★逆向きは語彙単体では当たる（既存の挙動・今回の追加とは無関係）。
  //   tsusho_keikaku の語彙に「通所介護」が在り、「通所介護評価」がそれを含むため。
  //   実害が無いのは、突合が【フォルダ単位】だから＝通所評価のファイルは通所評価フォルダにしか無く、
  //   tsusho_keikaku の判定には通所計画書フォルダの中身しか渡らない（buildTasks が docType 別に渡す）。
  //   ここは「そういう作りである」ことを記録しておく。フォルダ分けをやめるなら語彙も見直すこと。
  const r = find(['7月通所介護評価・甲野花子.pdf'], '甲野花子', 'tsusho_keikaku', '2026-07');
  ok('E2 語彙単体では通所介護計画書にも当たる（既存挙動・フォルダ分けで実害なし）',
     r.match === 'strong', '実測 ' + r.match);
  ok('E2b 突合はフォルダ単位＝docType ごとに files を渡している',
     /const f = d\.pdf\.folders\[docType\];/.test(
       require('fs').readFileSync(path.join(__dirname, '..', 'teishutsu.html'), 'utf8')));
}
{
  const r = find(['7月通所介護評価・甲野花子.pdf'], '甲野花子', 'tsusho_moni', '2026-07');
  ok('E3 通所モニとしても確定しない', r.match === 'weak', '実測 ' + r.match);
}

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
