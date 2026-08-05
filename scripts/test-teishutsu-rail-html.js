// teishutsu.html — レール（手順）表示とボタン補足の回帰テスト（2026-08-05）
// 目的: 「揃った」を押す基準を画面に固定したことを機械的に守る。
//       あわせて「表示だけの改修であること」＝台帳へ書く status の値やGAS呼び出しが
//       1文字も変わっていないことを、同じテストで押さえる。
// 実ブラウザは開かない（本番GASへPOSTが飛ぶ事故の防止・memory: 本番HTMLを実ブラウザで開くな）。
// jsdom は使わず、HTMLを文字列として読んで構造を検査する（外部通信ゼロ）。
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'teishutsu.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}
function count(re) { return (html.match(re) || []).length; }

console.log('\n[A) レール（手順）が画面上部に常時ある]');
ok('rail ブロックが存在する', /<details class="rail" id="rail" open>/.test(html));
ok('初回表示は開いた状態（open 属性）', /<details class="rail"[^>]*\sopen>/.test(html));
ok('見出しがある（折りたたみ可）', /<summary>[^<]*「揃った」を押すまでの手順<\/summary>/.test(html));

console.log('\n[B) レールの4手順が指示どおり並ぶ]');
const railBlock = (html.match(/<details class="rail"[\s\S]*?<\/details>/) || [''])[0];
const steps = railBlock.match(/<li>[\s\S]*?<\/li>/g) || [];
ok('手順が4つある', steps.length === 4, '実測 ' + steps.length + ' 件');
ok('① 計画書を印刷する', /計画書を印刷する/.test(steps[0] || ''));
ok('① 電子サインはリハブ上で署名の注記', /電子サインの方はリハブ上で署名/.test(steps[0] || ''));
ok('② 利用者にサインをもらう', /利用者にサインをもらう/.test(steps[1] || ''));
ok('③ 署名済みPDFを用意する', /署名済みPDFを用意する/.test(steps[2] || ''));
ok('③ 紙＝スキャン／電子＝DLの注記', /紙＝スキャン／電子＝リハブからダウンロード/.test(steps[2] || ''));
ok('④ この画面で「揃った」を押す', /この画面で「揃った」を押す/.test(steps[3] || ''));

console.log('\n[C) 「揃った」の定義が明記されている]');
ok('定義文がレールにある', /「揃った」＝利用者のサインが済んだ（＝いつでも送れる状態）/.test(railBlock));
ok('サイン前は押さないと書いてある', /サイン前は押しません/.test(railBlock));

console.log('\n[D) ボタン近くの補足]');
ok('btn-note を出している', /class="btn-note"/.test(html));
ok('補足の文面が「サイン済み＝押す／サイン前＝押さない」', /サイン済み＝押す<br>サイン前＝押さない/.test(html));
// 2026-08-05: 保留カードでは「揃った」と補足の間に「戻す」ボタンが入るので距離が伸びる。
// 距離ではなく「同じ分岐の中で 揃った → (任意で戻す) → 補足 の順に出ている」ことを見る。
ok('補足は「揃った」ボタン（未操作行）に付く',
   /data-act="sorotta"[^]*?揃った<\/button>'[^]*?class="btn-note"/.test(html));
ok('btn-note の CSS がある', /\.btn-note\s*\{/.test(html));
ok('rail の CSS がある', /\.rail\s*\{/.test(html));

console.log('\n[E) ★表示だけ＝台帳へ書く値とGAS呼び出しは不変]');
// 台帳に書く status 文字列。'揃った'/'送付済'/'clear' 以外を新設していないこと。
ok("doUpsert に渡す status が '揃った' のまま", /doUpsert\(t, '揃った', btn\)/.test(html));
ok("doUpsert に渡す status が '送付済' のまま", /doUpsert\(t, '送付済', btn\)/.test(html));
ok("clear 経路が残っている", /'status=clear'/.test(html));
// 3本 = doUpsert（揃った/送付済）／clearTask（戻す）／pickReason（繰越理由）。
// 変更前の HEAD:teishutsu.html も 3 本であることを実測済み（2026-08-05）。
ok('upsertSoufuStatus の呼び出し本数が 3 本のまま', count(/action=upsertSoufuStatus/g) === 3,
   '実測 ' + count(/action=upsertSoufuStatus/g) + ' 本');
ok('GASエンドポイント(BOARD_API)は1箇所・変更なし',
   count(/const BOARD_API = 'https:\/\/script\.google\.com\/macros\/s\/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw\/exec';/g) === 1);
ok('権限マトリクス PERM は不変（staff:*, owner:[kokun_set]）',
   /sorotta: \{ staff: '\*', owner: \['kokun_set'\] \}/.test(html));
ok('日付・氏名の手入力欄を新設していない（8\/4原則）',
   !/<input[^>]*type="(date|text)"/.test(html) && count(/<input/g) === 0);

console.log('\n[F) 既存の表示要素を壊していない]');
ok('サマリ4カードが残っている', /id="cntTodo"/.test(html) && /id="cntCarry"/.test(html)
   && /id="cntSorotta"/.test(html) && /id="cntSent"/.test(html));
ok('操作者セレクトが残っている', /id="operatorSel"/.test(html));
ok('タスク一覧のホストが残っている', /id="taskList"/.test(html));
ok('Undoトーストが残っている', /id="undoToast"/.test(html));

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
