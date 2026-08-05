// teishutsu.html — 保留ステータスUI（理由チップ2グループ／黄カード／戻す）の回帰テスト（2026-08-05）
//
// 実ブラウザは開かない（本番GASへPOSTが飛ぶ事故の防止）。HTMLを文字列として検査する。
// 実行: node scripts/test-teishutsu-hoyu-html.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'teishutsu.html'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}
const count = re => (html.match(re) || []).length;

console.log('\n[A) 理由チップが2グループ＋その他]');
ok('A1 REASON_GROUPS を定義している', /const REASON_GROUPS = \[/.test(html));
// cls: まで見る。METHOD_GROUPS にも { key: 'other' } があるので key だけでは拾いすぎる。
ok('A2 グループは3つ（相手待ち／こちら側／その他）',
   count(/\{ key: '(aite|kochira|other)',\s*cls:/g) === 3, '実測 ' + count(/\{ key: '(aite|kochira|other)',\s*cls:/g));
ok('A3 🟠 計画書が作れない（相手待ち）', /🟠 計画書が作れない（相手待ち）/.test(html));
ok('A4 🔴 作れたが出せない（こちら側）', /🔴 作れたが出せない（こちら側）/.test(html));
ok('A5 ⚪ その他', /⚪ その他/.test(html));
ok('A6 相手待ちのチップ＝ケアプラン待ち／保険証到着待ち', /chips: \['ケアプラン待ち', '保険証到着待ち'\]/.test(html));
ok('A7 こちら側のチップ＝サイン待ち／作成中', /chips: \['サイン待ち', '作成中'\]/.test(html));

console.log('\n[B) ★台帳にはチップ文字列だけを保存する（新列を作らない）]');
ok('B1 kurikoshiRiyu へ保存している', /'kurikoshiRiyu=' \+ encodeURIComponent\(val\)/.test(html));
ok('B2 グループ名(key/cls)を送信していない', !/kurikoshiRiyuGroup|reasonGroup=|'group='/.test(html));
// この番人の意図は「台帳へ書く値を人に打たせない（表記ゆれを台帳に入れない）」。
// 2026-08-05 に検索ボックス（type="search"・絞り込み専用でGASへ送らない）を1つ足したので、
// 「input が0個」ではなく「台帳へ書く input が0個」で判定する。
ok('B3 台帳へ書く手入力欄を作っていない（inputは検索専用の1つだけ）',
   count(/<input/g) === 1 && /<input id="searchBox" type="search"/.test(html),
   '実測 input ' + count(/<input/g) + '個');
ok('B3b その1つは検索専用でGASへ送っていない', !/searchBox[\s\S]{0,400}upsertSoufuStatus/.test(html));
ok('B4 prompt() による番号入力をやめた', !/prompt\(/.test(html));

console.log('\n[C) ★未作成カードからでも理由を押せる（拒否の撤去）]');
// 実際の拒否コード（alert して return）が消えたことを見る。
// 経緯を説明したコメント中の同じ文言まで拾わないよう alert( を含めて判定する。
ok('C1 旧「『揃った』にしてから理由を付けられます」拒否が消えている',
   !/alert\('「揃った」にしてから理由を付けられます'\)/.test(html));
ok('C2 未作成からは status=保留 で送る', /const status = t\.status \|\| '保留';/.test(html));
ok('C3 未作成カードにも理由バッジを出す条件が入っている',
   /t\.isCarry \|\| t\.kurikoshiRiyu \|\| !t\.status \|\| t\.status === '保留'/.test(html));
ok('C4 旧 status決め打ち \'揃った\' が理由送信から消えている',
   !/'status=' \+ encodeURIComponent\(t\.status \|\| '揃った'\)/.test(html));

console.log('\n[D) 保留カードの見た目と操作]');
ok('D1 保留＝黄の色分けがある', /t\.status === '保留' \? 'state-yellow'/.test(html));
ok('D2 state-yellow の CSS がある', /\.task\.state-yellow\s*\{/.test(html));
ok('D3 未作成は赤のまま（保留と区別）', /: 'state-red'/.test(html));
ok('D4 保留バッジを出す', /class="badge b-hold">⏸ 保留/.test(html));
ok('D5 理由が空の保留は「理由未記録」と出す', /t\.status === '保留' \? '理由未記録' : '理由'/.test(html));
ok('D6 保留カードに「戻す」ボタン', /t\.status === '保留'\) action \+= '<button class="btn btn-clear" data-act="clear"/.test(html));
ok('D7 「戻す」は既存の clear（行削除）を使う＝新経路を作っていない',
   count(/data-act="clear"/g) === 3, '実測 ' + count(/data-act="clear"/g) + '（送付済・揃った・保留の3箇所）');
ok('D8 保留カードでも「揃った」は押せる', /if \(showSorotta\) \{\s*\n\s*action = '<button class="btn btn-sorotta"/.test(html));

console.log('\n[E) Undo が保留を巻き込まない]');
ok('E1 送付済→戻すのみ「揃った」へ、他は clear', /if \(state\.lastUndo\.status === '送付済'\) doUpsert\(t, '揃った'/.test(html));
ok('E2 旧 else 分岐（保留を取り消すと揃ったになる）が消えている',
   !/if \(state\.lastUndo\.status === '揃った'\) clearTask/.test(html));

console.log('\n[F) レールに「気づいた相談員がその場で押す」が明記されている]');
ok('F1 その場で押す旨がある', /気づいた相談員がその場で押す/.test(html));
ok('F2 押すと黄色（保留）になると書いてある', /カードが黄色（保留）になり/.test(html));
ok('F3 押した人と日時が自動で残ると書いてある', /押した人と日時が自動で残ります/.test(html));

console.log('\n[G) 既存の 揃った / 送付済 を壊していない]');
ok('G1 揃った の送信が残っている', /doUpsert\(t, '揃った', btn\)/.test(html));
ok('G2 送付済 の送信が残っている', /doUpsert\(t, '送付済', btn\)/.test(html));
ok('G3 権限マトリクス PERM は不変', /sorotta: \{ staff: '\*', owner: \['kokun_set'\] \}/.test(html));
ok('G4 GASエンドポイントは1箇所・不変',
   count(/const BOARD_API = 'https:\/\/script\.google\.com\/macros\/s\/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw\/exec';/g) === 1);
ok('G5 旧チップ（作成遅れ／ケアマネ都合）の表示は残す＝過去データが読める',
   /'作成遅れ': '✏️ 作成遅れ'/.test(html) && /'ケアマネ都合': '🏢 ケアマネ都合'/.test(html));
ok('G6 レール（前回実装）が消えていない', /<details class="rail" id="rail" open>/.test(html));

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
