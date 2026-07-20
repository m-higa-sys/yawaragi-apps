#!/usr/bin/env node
/*
 * 区変モーダル 自前サジェスト: 純関数 kbnNormalizeName / kbnMatchUser のテスト
 * kubun.html から実コードを抽出して評価（HTML実コード抽出パターン）。
 *
 * kbnNormalizeName(s):
 *   名前検索の正規化。NFKC・カタカナ→ひらがな・空白除去・主要異体字吸収・小文字化。
 * kbnMatchUser(u, q):
 *   氏名(u.name)・ふりがな(u.reading)の両方に対し正規化後の部分一致。
 *   空クエリは false。
 */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'kubun.html');
const src = fs.readFileSync(HTML, 'utf8');

// --- kubun.html から関数本体を波括弧対応で抽出 ---
function extractFn(name) {
  const marker = 'function ' + name;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('関数が見つかりません（未実装?）: ' + name);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const kbnNormalizeName = (function () {
  // eslint-disable-next-line no-eval
  return eval('(' + extractFn('kbnNormalizeName') + ')');
})();
const kbnMatchUser = (function () {
  // eslint-disable-next-line no-eval
  return eval('(' + extractFn('kbnMatchUser') + ')');
})();
const kbnMapUsers = (function () {
  // eslint-disable-next-line no-eval
  return eval('(' + extractFn('kbnMapUsers') + ')');
})();

// --- ミニテストランナー ---
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

// ===== kbnNormalizeName =====
ok('異体字 髙→高', kbnNormalizeName('髙山') === '高山');
ok('異体字 﨑/嵜→崎', kbnNormalizeName('﨑') === '崎' && kbnNormalizeName('嵜') === '崎');
ok('異体字 邊/邉→辺', kbnNormalizeName('邊') === '辺' && kbnNormalizeName('邉') === '辺');
ok('カタカナ→ひらがな', kbnNormalizeName('タナカ') === 'たなか');
ok('半角カナ→NFKC→ひらがな', kbnNormalizeName('ﾀﾅｶ') === 'たなか');
ok('全角/半角空白を除去', kbnNormalizeName('　田中 花子 ') === '田中花子');
ok('英字は小文字化', kbnNormalizeName('ＡB') === 'ab');
ok('空文字は空文字', kbnNormalizeName('') === '');
ok('null/undefinedは空文字', kbnNormalizeName(null) === '' && kbnNormalizeName(undefined) === '');

// ===== kbnMatchUser =====
const tanaka = { name: '田中花子', reading: 'たなかはなこ' };
const takayama = { name: '髙山太郎', reading: 'たかやまたろう' };
const noReading = { name: '佐藤一郎', reading: '' };

// 本丸：ふりがな入力で当たる
ok('★ ひらがな「たなか」で田中がヒット', kbnMatchUser(tanaka, 'たなか') === true);
ok('漢字「田中」でヒット', kbnMatchUser(tanaka, '田中') === true);
ok('カタカナ「タナカ」でヒット', kbnMatchUser(tanaka, 'タナカ') === true);
ok('前後空白trimでヒット', kbnMatchUser(tanaka, ' たなか ') === true);
ok('無関係クエリは不一致', kbnMatchUser(tanaka, 'すずき') === false);

// 異体字：髙山が3表記いずれでもヒット
ok('髙山「たかやま」でヒット', kbnMatchUser(takayama, 'たかやま') === true);
ok('髙山「高山」(異体字)でヒット', kbnMatchUser(takayama, '高山') === true);
ok('髙山「髙山」(原字)でヒット', kbnMatchUser(takayama, '髙山') === true);

// reading空でも氏名で当たる / 空クエリは false
ok('reading空でも漢字氏名でヒット', kbnMatchUser(noReading, '佐藤') === true);
ok('空クエリは常に不一致', kbnMatchUser(tanaka, '') === false && kbnMatchUser(tanaka, '　 ') === false);

// ===== kbnMapUsers（利用者台帳API応答→[{name,reading}]） =====
ok('patterns形からname+reading(kana)',
  JSON.stringify(kbnMapUsers({ patterns: { '利用者059': { kana: 'リヨウシャ059' } } })) === JSON.stringify([{ name: '利用者059', reading: 'リヨウシャ059' }]));
ok('users配列形からname+reading',
  JSON.stringify(kbnMapUsers({ users: [{ name: '田中', kana: 'タナカ' }] })) === JSON.stringify([{ name: '田中', reading: 'タナカ' }]));
ok('users優先(両方あればusers)', kbnMapUsers({ users: [{ name: 'A', kana: 'a' }], patterns: { B: { kana: 'b' } } }).length === 1);
ok('null/空で空配列', kbnMapUsers(null).length === 0 && kbnMapUsers({}).length === 0);
ok('name欠落行は除外', kbnMapUsers({ users: [{ kana: 'x' }, { name: '実在', kana: 'y' }] }).length === 1);

// ===== 統合：台帳ロード→ふりがな照合（本丸 利用者059 の再現） =====
(function () {
  var pool = kbnMapUsers({ patterns: { '利用者059': { kana: 'リヨウシャ059' }, '利用者001': { kana: 'リヨウシャ 001' } } });
  ok('★統合 「りようしゃ」で利用者059ヒット', pool.some(function (u) { return kbnMatchUser(u, 'りようしゃ'); }));
  ok('★統合 「059」で利用者059ヒット', pool.some(function (u) { return kbnMatchUser(u, '059'); }));
  ok('統合 かな空白入り「りようしゃ001」ヒット', pool.some(function (u) { return kbnMatchUser(u, 'りようしゃ001'); }));
})();

console.log('\n結果: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
