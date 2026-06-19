#!/usr/bin/env node
// bump-app-version.js
// キャッシュ自動更新バージョンゲートの版上げを1コマンドで行う（design.md §5-4 準拠）。
// version.txt と genba.html の shared.js?v= を新バージョンへ一括置換する。
// version.txt と HTML は必ず同一コミットで同時更新すること（design.md §9）。
//
// 使い方:  node scripts/bump-app-version.js 2026-06-18-02
//          node scripts/bump-app-version.js            (引数無し＝現バージョン表示のみ)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERSION_TXT = path.join(ROOT, 'version.txt');
const GENBA_HTML = path.join(ROOT, 'genba.html');

function readVersion() {
  return fs.readFileSync(VERSION_TXT, 'utf8').trim();
}

const newVer = (process.argv[2] || '').trim();

if (!newVer) {
  console.log('現バージョン: ' + readVersion());
  console.log('版上げ:  node scripts/bump-app-version.js <新バージョン>  例) 2026-06-18-02');
  process.exit(0);
}

// バージョン文字列の妥当性（design 初版形式 YYYY-MM-DD-NN を基本とする・最低限の安全弁）
if (!/^[0-9A-Za-z._-]+$/.test(newVer)) {
  console.error('不正なバージョン文字列: ' + JSON.stringify(newVer));
  process.exit(1);
}

const oldVer = readVersion();

// 1) version.txt を更新
fs.writeFileSync(VERSION_TXT, newVer + '\n', 'utf8');

// 2) genba.html の shared.js?v=... を差し替え
let html = fs.readFileSync(GENBA_HTML, 'utf8');
const re = /(shared\.js\?v=)[^"']+/g;
const matches = html.match(re) || [];
if (matches.length === 0) {
  console.error('genba.html に shared.js?v= が見つからない（ゲート未適用？）。version.txt のみ更新済。');
  process.exit(1);
}
html = html.replace(re, '$1' + newVer);
fs.writeFileSync(GENBA_HTML, html, 'utf8');

console.log('版上げ完了: ' + oldVer + ' -> ' + newVer);
console.log('  version.txt 更新');
console.log('  genba.html shared.js?v= 更新 (' + matches.length + ' 箇所)');
console.log('※ version.txt と genba.html を必ず同一コミットで push すること（design.md §9）');
