// test-newmail-check.js
// Gmail新着チェック（checkNewMail）の判定ロジックの純関数テスト。
//
// 背景（2026-07-12・指示書_Gmail新着チェックGAS.md ＋ 指示書_checkNewMail_EXCLUDE追加.md）:
//   過去にGmailデータ経由のプロンプトインジェクションが起きたためGmailコネクタは遮断済み。
//   AIにメール本文を読ませないのが絶対条件。GAS自身がGmailApp で受信箱を検索し、
//   差出人・件名・日時だけを抽出して「重要メールの見落とし」と「その他の全新着」を返す。
//
// ここでテストするのは checkNewMail 本体（GmailApp依存＝GAS実行が必要）ではなく、
// 本文を一切見ずに from/subject だけで仕分ける純関数2本:
//   - nmExtractSender_(from)         : Fromヘッダ文字列 → 小文字アドレス（<...>優先）
//   - nmClassifyMail_(from, subject) : → { important, matchedBy, excluded }
//
// 判定仕様:
//   第1段(important): 差出人ドメイン自尾一致（.lg.jp/.go.jp/carezou.net/densan-s.co.jp/
//     moneyforward.com/e-seikyuu.jp/jm-academy.jp/keepfitlife.com）
//     または 件名キーワード（請求書/領収書/補助金/助成金/交付決定/口座振替/応募/国保伝送）
//     → important:true。matchedBy に一致条件（"domain:.lg.jp"/"subject:請求書"）を記録。
//   EXCLUDE(ノイズ除去): important非該当のとき、EXCLUDEドメイン自尾一致で excluded:true。
//     → checkNewMail は excluded を important にも others にも入れない（完全除外）。
//     important該当は EXCLUDE より優先（誤設定でも重要メールを落とさない安全設計）。
//   本文は判定に一切使わない。
//
// 方式: 出荷コード（GASファイル）から純関数を実コード抽出して評価する。
//       テストと出荷コードのドリフトを防ぐ（repo既存テストと同一方式）。
//
// 実行: node scripts/test-newmail-check.js

const fs = require('fs');
const path = require('path');

const GAS_FILE = path.join('gas', 'yawaragi-board', 'コード.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', GAS_FILE), 'utf8');

// 出荷GASから純関数を抽出（未実装なら RED）。関数本体の中間 } は必ずインデント前提。
function extractFn(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error(`${GAS_FILE} に ${name}() が無い（未実装＝RED）`);
  return m[0];
}

function loadFns() {
  const src = extractFn(SRC, 'nmExtractSender_') + '\n' +
              extractFn(SRC, 'nmClassifyMail_') + '\n' +
              'sandbox.nmExtractSender_ = nmExtractSender_;' +
              'sandbox.nmClassifyMail_ = nmClassifyMail_;';
  const sandbox = {};
  (function () { eval(src); })();
  return sandbox;
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (actual === expected) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + ' :: expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual)); }
}
function eqJson(actual, expected, label) {
  eq(JSON.stringify(actual), JSON.stringify(expected), label);
}

let F;
try {
  F = loadFns();
} catch (e) {
  console.log('RED: ' + e.message);
  console.log('RESULT pass=0 fail=1');
  process.exit(1);
}
const { nmExtractSender_: sender, nmClassifyMail_: classify } = F;

// ===== nmExtractSender_: Fromヘッダ → 小文字アドレス =====
console.log('[nmExtractSender_]');
eq(sender('山田太郎 <yamada@city.matsuyama.lg.jp>'), 'yamada@city.matsuyama.lg.jp', '表示名+<>付き');
eq(sender('<info@keepfitlife.com>'), 'info@keepfitlife.com', '<>のみ');
eq(sender('plain@densan-s.co.jp'), 'plain@densan-s.co.jp', '山括弧なし素のアドレス');
eq(sender('INFO@KEEPFITLIFE.COM'), 'info@keepfitlife.com', '大文字→小文字正規化');
eq(sender('"担当 aaa@ダミー表示" <real@carezou.net>'), 'real@carezou.net', '表示名に@混入でも<>を優先');
eq(sender('ケアズ通知 noreply@carezou.net'), 'noreply@carezou.net', '山括弧なし・表示名+アドレス');
eq(sender(''), '', '空文字 → 空');
eq(sender(null), '', 'null → 空');
eq(sender(undefined), '', 'undefined → 空');

// ===== nmClassifyMail_: important判定 + matchedBy + excluded =====
console.log('[nmClassifyMail_]');

// --- 第1段: ドメイン自尾一致（excluded:false） ---
eqJson(classify('松山市 <x@city.matsuyama.lg.jp>', 'お知らせ'),
  { important: true, matchedBy: ['domain:.lg.jp'], excluded: false }, '.lg.jp サブドメインは自尾一致');
eqJson(classify('厚労省 <x@kaigokensaku.mhlw.go.jp>', '介護事業所検索'),
  { important: true, matchedBy: ['domain:.go.jp'], excluded: false }, '.go.jp 自尾一致');
eqJson(classify('<x@carezou.net>', 'ふつうのお知らせ'),
  { important: true, matchedBy: ['domain:carezou.net'], excluded: false }, 'carezou.net 完全一致');
eqJson(classify('<x@mail.carezou.net>', 'ふつうのお知らせ'),
  { important: true, matchedBy: ['domain:carezou.net'], excluded: false }, 'carezou.net サブドメインも一致');
eqJson(classify('MoneyForward <x@moneyforward.com>', '通知'),
  { important: true, matchedBy: ['domain:moneyforward.com'], excluded: false }, 'moneyforward.com 一致');
eqJson(classify('<x@e-seikyuu.jp>', 'お知らせ'),
  { important: true, matchedBy: ['domain:e-seikyuu.jp'], excluded: false }, 'e-seikyuu.jp 一致');
eqJson(classify('<x@jm-academy.jp>', '研修案内'),
  { important: true, matchedBy: ['domain:jm-academy.jp'], excluded: false }, 'jm-academy.jp 一致');
eqJson(classify('yawaragi <info@keepfitlife.com>', '通知'),
  { important: true, matchedBy: ['domain:keepfitlife.com'], excluded: false }, 'keepfitlife.com 一致');
eqJson(classify('X <x@CITY.MATSUYAMA.LG.JP>', 'お知らせ'),
  { important: true, matchedBy: ['domain:.lg.jp'], excluded: false }, '大文字ドメインでも一致（正規化）');

// --- 第1段: 件名キーワード（excluded:false） ---
eqJson(classify('取引先 <x@example.com>', '5月分請求書の送付'),
  { important: true, matchedBy: ['subject:請求書'], excluded: false }, '件名キーワード:請求書');
eqJson(classify('<x@example.com>', '領収書を発行しました'),
  { important: true, matchedBy: ['subject:領収書'], excluded: false }, '件名キーワード:領収書');
eqJson(classify('<x@example.com>', '補助金交付決定のお知らせ'),
  { important: true, matchedBy: ['subject:補助金', 'subject:交付決定'], excluded: false }, '件名キーワード複数（補助金+交付決定）');
eqJson(classify('<x@example.com>', '助成金申請について'),
  { important: true, matchedBy: ['subject:助成金'], excluded: false }, '件名キーワード:助成金');
eqJson(classify('<x@example.com>', '応募がありました'),
  { important: true, matchedBy: ['subject:応募'], excluded: false }, '件名キーワード:応募');

// --- ドメイン＋件名の両方一致 ---
eqJson(classify('電算 <x@densan-s.co.jp>', '口座振替 締め日のご案内'),
  { important: true, matchedBy: ['domain:densan-s.co.jp', 'subject:口座振替'], excluded: false }, 'ドメイン+件名 両方（順序=domain→subject）');
eqJson(classify('<x@carezou.net>', '国保伝送の結果'),
  { important: true, matchedBy: ['domain:carezou.net', 'subject:国保伝送'], excluded: false }, 'carezou + 国保伝送');

// --- 非important・非EXCLUDE（others 行き） ---
eqJson(classify('友人 <friend@example.com>', 'ランチどうですか'),
  { important: false, matchedBy: [], excluded: false }, 'ドメインも件名も非該当 → others');
eqJson(classify('', ''),
  { important: false, matchedBy: [], excluded: false }, '空from/空subject → others');
eqJson(classify('<x@lg.jp.evil.com>', 'お知らせ'),
  { important: false, matchedBy: [], excluded: false }, 'なりすまし: lg.jp.evil.com は .lg.jp で終わらない → others');
eqJson(classify('<x@notlg.jp>', 'お知らせ'),
  { important: false, matchedBy: [], excluded: false }, '部分文字列すり抜け防止: notlg.jp は .lg.jp 自尾でない → others');
eqJson(classify('<x@example.com>', '請求はしません'),
  { important: false, matchedBy: [], excluded: false }, '「請求書」を含まない「請求」だけでは others');

// ===== EXCLUDE（ノイズ除去・2026-07-12追加）: important にも others にも入れない =====
console.log('[nmClassifyMail_ / EXCLUDE]');
eqJson(classify('さとふる <news@satofull.co.jp>', '2026年のお得なお知らせ'),
  { important: false, matchedBy: [], excluded: true }, 'さとふる(satofull.co.jp) 除外');
eqJson(classify('ECOVACS <info@ecovacs.com>', 'セール開催中'),
  { important: false, matchedBy: [], excluded: true }, 'ECOVACS(ecovacs.com) 除外');
eqJson(classify('ZOZOTOWN <x@zozo.jp>', 'タイムセール'),
  { important: false, matchedBy: [], excluded: true }, 'ZOZO(zozo.jp) 除外');
eqJson(classify('NEW ERA <x@neweraonlinestore.jp>', '新作入荷'),
  { important: false, matchedBy: [], excluded: true }, 'ニューエラ(neweraonlinestore.jp) 除外');
eqJson(classify('<x@apj.media>', '今週の注目ニュース'),
  { important: false, matchedBy: [], excluded: true }, 'apj.media メルマガ 除外');
eqJson(classify('Instagram <security@mail.instagram.com>', '新しいログイン'),
  { important: false, matchedBy: [], excluded: true }, 'Instagram(mail.instagram.com) 除外');
eqJson(classify('三井住友カード <statement@vpass.ne.jp>', 'ご利用のお知らせ'),
  { important: false, matchedBy: [], excluded: true }, '三井住友カード(vpass.ne.jp) 除外');
eqJson(classify('三井住友カード <x@mkpf.vpass.ne.jp>', 'お支払い金額確定'),
  { important: false, matchedBy: [], excluded: true }, 'vpass.ne.jp サブドメインも除外');

// --- 安全策: EXCLUDE該当ドメインでも important条件に一致すれば important 優先（落とさない） ---
eqJson(classify('三井住友カード <x@vpass.ne.jp>', '請求書の発行について'),
  { important: true, matchedBy: ['subject:請求書'], excluded: false }, '安全策: vpass由来でも件名「請求書」なら important 優先');
eqJson(classify('<x@satofull.co.jp>', '交付決定のご連絡'),
  { important: true, matchedBy: ['subject:交付決定'], excluded: false }, '安全策: satofull由来でも件名「交付決定」なら important 優先');

// --- なりすまし: EXCLUDEドメインの部分文字列すり抜け防止 ---
eqJson(classify('<x@zozo.jp.evil.com>', 'お知らせ'),
  { important: false, matchedBy: [], excluded: false }, 'なりすまし: zozo.jp.evil.com は zozo.jp 自尾でない → EXCLUDEに拾わせない(others)');

console.log(`RESULT pass=${pass} fail=${fail}`);
if (fail) process.exit(1);
