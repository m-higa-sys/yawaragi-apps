// 伝達ボード「社長宛て投稿の投稿時通知メール」sendDengonOwnerPostMail_ の実コード抽出テスト
// 対象: gas/yawaragi-board/コード.js の sendDengonOwnerPostMail_（宛先=NOTIFY_EMAIL・件名/本文の整形）
// 実行: node scripts/test-dengon-owner-post-mail.js
// ※ addDengonMessage 内の to==='社長' ゲート／dupガード後配置は GAS 実行時仕様（本テストは対象外）。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');

function extractFn(name) {
  const sig = 'function ' + name;
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('コード.js に ' + sig + ' が無い（未実装＝RED）');
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(name + ' の閉じ括弧が見つからない');
}

// 送信をキャプチャするモック環境で関数を実体化
const sent = [];
const env = {
  NOTIFY_EMAIL: 'yawaragi.notify@gmail.com',
  GmailApp: { sendEmail: function (to, subject, body, opts) { sent.push({ to: to, subject: subject, body: body, opts: opts }); } },
  ScriptApp: { getService: function () { return { getUrl: function () { return 'https://script.example/exec'; } }; } },
  Logger: { log: function () {} }
};
const factory = new Function('NOTIFY_EMAIL', 'GmailApp', 'ScriptApp', 'Logger',
  extractFn('sendDengonOwnerPostMail_') + '\nreturn sendDengonOwnerPostMail_;');
const fn = factory(env.NOTIFY_EMAIL, env.GmailApp, env.ScriptApp, env.Logger);

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }

// 1) 基本：宛先・件名・本文の各要素
sent.length = 0;
fn({ from: '勝又', body: '請求の件で確認したいことがあります', deadline: '2026-07-25' });
ok(sent.length === 1, '1通だけ送る');
ok(sent[0].to === 'yawaragi.notify@gmail.com', '宛先=NOTIFY_EMAIL');
ok(sent[0].subject === '[伝達] 社長宛：請求の件で確認したいことがあります', '件名=[伝達] 社長宛：+本文先頭');
ok(sent[0].body.indexOf('投稿者: 勝又') !== -1, '本文に投稿者');
ok(sent[0].body.indexOf('内容: 請求の件で確認したいことがあります') !== -1, '本文に内容');
ok(sent[0].body.indexOf('期限: 2026-07-25') !== -1, '本文に期限');
ok(sent[0].body.indexOf('https://script.example/exec') !== -1, '本文にボードURL');
ok(sent[0].opts && sent[0].opts.charset === 'UTF-8', 'charset=UTF-8');

// 2) 件名は本文先頭30字で切る
sent.length = 0;
const long = 'あ'.repeat(50);
fn({ from: '星野', body: long, deadline: '' });
ok(sent[0].subject === '[伝達] 社長宛：' + 'あ'.repeat(30), '件名は本文30字でスライス');

// 3) 期限空は「なし」
ok(sent[0].body.indexOf('期限: なし') !== -1, '期限空→なし');

// 4) 欠損フィールドでも落ちない（from/deadline 未指定）
sent.length = 0;
fn({ body: 'メモだけ' });
ok(sent.length === 1 && sent[0].body.indexOf('期限: なし') !== -1, '欠損時も送信・期限なし');

console.log('dengon-owner-post-mail: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
