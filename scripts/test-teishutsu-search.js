// teishutsu.html — 検索ボックス（利用者名・カナ・事業所名の絞り込み）のテスト（2026-08-05）
//
// 背景: 7月分93件の締めで件数が増え、社長が根岸さんのカードに辿り着けなかった。
//       探せない＝押されない＝仕組みが死ぬ。
//
// ★このテストは teishutsu.html から実際の純関数を抽出して動かす（文字列検査ではない）。
//   画面に出ているのと同じコードが本当に引けるかを見る。
// 実行: node scripts/test-teishutsu-search.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'teishutsu.html'), 'utf8');

// HTMLから関数を1つ抜き出す（先頭が function 名、閉じは行頭の }）
function grab(name) {
  const m = html.match(new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm'));
  if (!m) { console.error('[FAIL] 関数を抽出できません: ' + name); process.exit(1); }
  return m[0];
}
const src = ['searchNorm', 'searchTokens', 'matchesSearch', 'officeRemainMap'].map(grab).join('\n');
const api = new Function(src + '\nreturn { searchNorm, searchTokens, matchesSearch, officeRemainMap };')();
const { searchNorm, searchTokens, matchesSearch, officeRemainMap } = api;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}
// テスト用タスク（画面が持っている形と同じ）
const T = (userId, furigana, office, status) => ({ userId, furigana, office, status: status || '' });
const hit = (t, q) => matchesSearch(t, searchTokens(q));

const negishi = T('根岸花子', 'ネギシハナコ', 'わかばの丘居宅介護支援事業所');
const yamada  = T('山田太郎', 'ヤマダタロウ', 'ひなぎく居宅');
const satou   = T('佐藤　次郎', 'サトウ ジロウ', 'わかばの丘居宅介護支援事業所');

console.log('\n[A) ★利用者名で引ける（根岸さん問題）]');
ok('A1 「根岸」で根岸さんがヒット', hit(negishi, '根岸'));
ok('A2 「根岸」で山田さんはヒットしない', !hit(yamada, '根岸'));
ok('A3 フルネームでもヒット', hit(negishi, '根岸花子'));
ok('A4 名前の途中（花子）でもヒット＝部分一致', hit(negishi, '花子'));

console.log('\n[B) 事業所名で引ける]');
ok('B1 「わかば」で根岸さんがヒット', hit(negishi, 'わかば'));
ok('B2 「わかば」で佐藤さんもヒット（同じ事業所）', hit(satou, 'わかば'));
ok('B3 「わかば」で山田さんはヒットしない（別事業所）', !hit(yamada, 'わかば'));
ok('B4 「ひなぎく」で山田さんがヒット', hit(yamada, 'ひなぎく'));

console.log('\n[C) ★カナ・ひらがな・漢字のどれで打っても引ける]');
ok('C1 カタカナ「ネギシ」でヒット', hit(negishi, 'ネギシ'));
ok('C2 ひらがな「ねぎし」でヒット（ひらがな→カタカナ変換）', hit(negishi, 'ねぎし'));
ok('C3 漢字「根岸」でヒット', hit(negishi, '根岸'));
ok('C4 半角カナ「ﾈｷﾞｼ」でヒット（NFKC正規化）', hit(negishi, 'ﾈｷﾞｼ'));
ok('C5 ひらがな「やまだ」で山田さんがヒット', hit(yamada, 'やまだ'));
ok('C6 別人のカナは引っかからない', !hit(yamada, 'ねぎし'));

console.log('\n[D) 表記ゆれの吸収]');
ok('D1 氏名の全角スペースを無視（佐藤次郎で引ける）', hit(satou, '佐藤次郎'));
ok('D2 カナの空白も無視（サトウジロウで引ける）', hit(satou, 'サトウジロウ'));
ok('D3 検索語の前後の空白は無視', hit(negishi, '  根岸  '));
ok('D4 空の検索は全部通す（絞り込みなし）', hit(yamada, '') && hit(negishi, ''));
ok('D5 空白だけの検索も全部通す', hit(yamada, '　 '));

console.log('\n[E) 複数語はAND（「わかば 根岸」で絞り込める）]');
ok('E1 「わかば 根岸」で根岸さんがヒット', hit(negishi, 'わかば 根岸'));
ok('E2 「わかば 根岸」で佐藤さんはヒットしない（事業所は合うが名前が違う）', !hit(satou, 'わかば 根岸'));
ok('E3 「ひなぎく 根岸」は誰にも当たらない（両方満たす人がいない）', !hit(negishi, 'ひなぎく 根岸'));

console.log('\n[F) フィールドをまたいだ誤ヒットが無い]');
{
  // 名前の末尾＋事業所の先頭が偶然つながって一致する事故を防ぐ
  const t = T('田中', 'タナカ', '中央ケアプラン');
  ok('F1 名前末尾と事業所先頭の連結では一致しない', !hit(t, '田中中央'));
  ok('F2 それぞれ単独なら一致する', hit(t, '田中') && hit(t, '中央'));
}

console.log('\n[G) ★「あと○件」バッジは検索で変動しない]');
{
  // バッジの母数は「検索前」の集合から数える。この純関数に渡すのは検索前の配列。
  const base = [
    T('根岸花子', 'ネギシハナコ', 'わかばの丘', ''),
    T('佐藤次郎', 'サトウジロウ', 'わかばの丘', '揃った'),
    T('鈴木三郎', 'スズキサブロウ', 'わかばの丘', '送付済'),
    T('山田太郎', 'ヤマダタロウ', 'ひなぎく', '')
  ];
  const m = officeRemainMap(base);
  ok('G1 わかばの丘は2件（送付済を除く）', m['わかばの丘'] === 2, 'got=' + m['わかばの丘']);
  ok('G2 ひなぎくは1件', m['ひなぎく'] === 1, 'got=' + m['ひなぎく']);
  ok('G3 送付済だけの事業所はキーごと出ない', m['未登録'] === undefined);

  // 検索で1件に絞っても、バッジ用の母数は検索前を渡す限り変わらない
  const searched = base.filter(t => hit(t, '根岸'));
  ok('G4 検索結果は1件', searched.length === 1);
  ok('G5 検索後もバッジ母数は2件のまま（検索前配列から数えているため）',
     officeRemainMap(base)['わかばの丘'] === 2);
  ok('G6 もし検索後の配列を渡すと1件に減る＝渡す配列を間違えないこと',
     officeRemainMap(searched)['わかばの丘'] === 1);
}

console.log('\n[H) 画面側の配線（描画コードの静的検査）]');
ok('H1 検索ボックスがある', /id="searchBox"/.test(html));
ok('H2 ✕クリアボタンがある', /id="searchClear"/.test(html));
ok('H3 件数表示の枠がある', /id="searchHit"/.test(html));
ok('H4 入力のたびに絞り込む（input イベント）', /searchBox'\)\.oninput/.test(html));
ok('H5 検索状態を localStorage に保存していない',
   !/localStorage\.(setItem|getItem)\([^)]*[Ss]earch/.test(html));
ok('H6 バッジは検索前の集合(baseFiltered)から数えている',
   /officeRemainMap\(baseFiltered\)/.test(html));
ok('H7 描画は検索後の集合(filtered)を使う', /filtered = baseFiltered\.filter/.test(html));
ok('H8 既存フィルタ（書類・未完了のみ）とAND', /state\.docFilter !== 'all'/.test(html) && /state\.unsentOnly/.test(html));
ok('H9 並び順(sortDanger)を変えていない', /groups\[office\]\.slice\(\)\.sort\(sortDanger\)/.test(html));

console.log('\n[I) 表示層のみ＝台帳・GASを触っていない]');
// 3本 = doUpsert（揃った/送付済）／clearTask（戻す）／applyReason（理由・保留）。検索では増えない。
ok('I1 upsertSoufuStatus の呼び出し本数が3本のまま',
   (html.match(/action=upsertSoufuStatus/g) || []).length === 3,
   '実測 ' + (html.match(/action=upsertSoufuStatus/g) || []).length);
ok('I2 検索語をGASへ送っていない', !/(search|q)=' \+ encodeURIComponent\(state\.search/.test(html));
ok('I3 権限マトリクス PERM は不変', /sorotta: \{ staff: '\*', owner: \['kokun_set'\] \}/.test(html));

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
