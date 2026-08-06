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
// ★2026-08-06: ③を「PDFを用意する」から「フォルダに入れる」へ変更（社長決定）。
//   入れた事実そのものを完了の証拠にするため（＝「揃った」の自己申告に頼らない）。
//   電子と紙で作業が違うので言い分ける。担当は決めない＝気づいた人が入れる。
// ★2026-08-06（同日・実物調査を受けて再修正）: 新フォルダを作らせるのをやめ、
//   既に運用されている書類フォルダ（共有ドライブ yawaragi／実績 配下）を使う現状追認へ。
//   ファイル名の新ルールも撤回＝現場に覚え直しをさせない。守ってもらうのはフルネームだけ。
ok('③ いつもの書類フォルダに入れる（新フォルダを作らせない）',
   /署名済みPDFを、いつもの書類フォルダに入れる/.test(steps[2] || ''));
ok('③ ファイル名は今までどおりでよい（新ルールを強制しない）',
   /ファイル名は今までどおりで構いません/.test(steps[2] || ''));
ok('③ フルネームだけは必須と書いてある（同姓が実在するため）',
   /フルネームだけ必ず入れてください/.test(steps[2] || ''));
ok('③ 電子サインの方の手順（リハブからPDF）', /電子サインの方[\s\S]*リハブからPDF/.test(steps[2] || ''));
ok('③ 紙サインの方の手順（スキャン）', /紙にサインをもらった方[\s\S]*スキャン/.test(steps[2] || ''));
ok('③ 担当を決めない（気づいた人が入れる）', /気づいた人がその場で入れます/.test(steps[2] || ''));
ok('③ 今月のフォルダへの導線がある', /id="pdfFolderLink"/.test(steps[2] || ''));
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
// 8/4原則の意図は「台帳へ書く値を人に打たせない」。
// 2026-08-05 に検索ボックス（type="search"・絞り込み専用でGASへ送らない）を1つ足したので、
// 「日付・氏名の入力欄が無い」かつ「input は検索専用の1つだけ」で判定する。
ok('日付・氏名の手入力欄を新設していない（8/4原則）',
   !/<input[^>]*type="(date|text)"/.test(html)
   && count(/<input/g) === 1
   && /<input id="searchBox" type="search"/.test(html),
   '実測 input ' + count(/<input/g) + '個');

console.log('\n[F) 既存の表示要素を壊していない]');
ok('サマリ4カードが残っている', /id="cntTodo"/.test(html) && /id="cntCarry"/.test(html)
   && /id="cntSorotta"/.test(html) && /id="cntSent"/.test(html));
ok('操作者セレクトが残っている', /id="operatorSel"/.test(html));
ok('タスク一覧のホストが残っている', /id="taskList"/.test(html));
ok('Undoトーストが残っている', /id="undoToast"/.test(html));

// 2026-08-06: 署名済みPDFの検知を「並走表示」で足した回の回帰ガード。
// ★並走＝「揃った」ボタンは残したまま検知結果を先に見せる。1ヶ月一致を見てから廃止を判断する。
//   ここで守るのは「勝手に自動判定へ切り替わっていないこと」と「判定を画面に書いていないこと」。
console.log('\n[G) 署名済みPDFの検知（並走表示・2026-08-06）]');
ok('判定は core を読む（画面に判定を書かない）',
   /<script src="gas\/yawaragi-board\/session-board-core\.js/.test(html));
ok('書類種別ごとの実物フォルダをまとめて取りに行く', /action=scanSignFolders/.test(html));
// ★実物のフォルダはフラット（7月分と8月分が同居）so、月で絞らないと先月のPDFで今月が揃ってしまう。
ok('★対象月を渡して月で絞っている（先月のPDFで今月を揃ったにしない）',
   /sbBuildPdfFoundMap_\([^)]*,\s*ym\s*\)/.test(html));
ok('旧姓・別表記を取りに行く（照合の別名キー）', /action=getSignCols/.test(html));
ok('突合は core の sbBuildPdfFoundMap_ に委譲している', /sbBuildPdfFoundMap_\(/.test(html));
ok('画面側に照合ロジックを書いていない（indexOf での氏名突合を持たない）',
   !/fileName[\s\S]{0,40}indexOf/.test(html) && !/files[\s\S]{0,30}\.indexOf\(/.test(html));
ok('PDF確認済みバッジ（strong）', /b-pdfok[\s\S]{0,80}PDF確認済み/.test(html));
ok('書類名が読めないPDFは別表示（weak）', /b-pdfweak[\s\S]{0,80}書類名が読めません/.test(html));
ok('バッジのCSSがある', /\.b-pdfok\s*\{/.test(html) && /\.b-pdfweak\s*\{/.test(html));
ok('今月のフォルダへの導線がある', /id="pdfFolderLink"/.test(html) && /folder-btn/.test(html));
ok('フォルダが読めないときも黙らない（名指しで出す）',
   /フォルダの確認ができませんでした/.test(html) && /読めなかったフォルダ/.test(html));
ok('★並走: 「揃った」ボタンは残っている（自動判定へ切り替えていない）',
   /data-act="sorotta"/.test(html) && /class="btn btn-sorotta"/.test(html));
ok('★PDF検知が status を書き換えていない（upsert は 3本のまま）',
   count(/action=upsertSoufuStatus/g) === 3);

console.log('\n=== 結果 ===');
console.log('PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
