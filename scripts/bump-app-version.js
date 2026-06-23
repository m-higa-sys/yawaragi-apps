#!/usr/bin/env node
// bump-app-version.js
// キャッシュ自動更新バージョンゲートの版上げを1コマンドで安全に行う（design.md §5-4 / §9 準拠）。
//
// やること（案A＝add+commitで止め、実pushはしない）:
//   1. 前提チェック: 対象ファイルがdirty / ローカルがorigin/masterよりbehind なら実行拒否（fresh pull前提）
//   2. assume-unchanged フラグを正常化（version.txt / genba.html を通常追跡へ戻す。罠の再発防止）
//   3. version.txt を新版へ更新
//   4. genba.html の shared.js?v= を version.txt と自動一致させる（版同期）
//   5. version.txt と genba.html のみを git add → commit（design.md §9: 必ず同一コミット）
//   6. commit後SHAを表示し、「pushコマンド」と「push後verifyコマンド」を提示（実pushはしない）
//
// 本番反映の確認（push後に別途実行）:
//   node scripts/bump-app-version.js --verify [<版>]
//     本番 version.txt をリトライ付きポーリングし、版切替を確認。時間切れは成功扱いにせず警告（exit 1）。
//
// 使い方:
//   node scripts/bump-app-version.js               現バージョン表示のみ
//   node scripts/bump-app-version.js 2026-06-23-04 版上げ（add+commitまで・pushはしない）
//   node scripts/bump-app-version.js --verify      push後の本番反映確認（版はversion.txtの現値）
//   node scripts/bump-app-version.js --verify 2026-06-23-04  版を明示して確認

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const VERSION_TXT = path.join(ROOT, 'version.txt');
const GENBA_HTML = path.join(ROOT, 'genba.html');
const TRACKED = ['version.txt', 'genba.html']; // 版上げで触る対象（assume-unchanged正常化＋add対象）
const PROD_VERSION_URL = 'https://m-higa-sys.github.io/yawaragi-apps/version.txt';

// --- 本番ポーリング設定 ---
const VERIFY_INTERVAL_MS = 3000; // 3秒間隔
const VERIFY_MAX_TRIES = 60;     // 最大3分（GitHub Pagesビルド待ち）

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}
function shTry(cmd) {
  try { return { ok: true, out: sh(cmd) }; }
  catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
}
function readVersion() {
  return fs.readFileSync(VERSION_TXT, 'utf8').trim();
}
function isValidVer(v) {
  // design 初版形式 YYYY-MM-DD-NN を基本とする・最低限の安全弁
  return /^[0-9A-Za-z._-]+$/.test(v);
}

// 本番 version.txt をno-cacheで1回取得
function fetchProdVersion() {
  return new Promise((resolve, reject) => {
    const url = PROD_VERSION_URL + '?_=' + Date.now();
    const req = https.get(url, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== --verify モード: push後の本番反映をポーリング確認 =====
async function runVerify(argVer) {
  const want = (argVer || readVersion()).trim();
  if (!isValidVer(want)) { console.error('不正なバージョン: ' + JSON.stringify(want)); process.exit(1); }
  console.log('本番反映を確認中… 期待値: ' + want);
  console.log('URL: ' + PROD_VERSION_URL);
  for (let i = 1; i <= VERIFY_MAX_TRIES; i++) {
    let cur = '(取得失敗)';
    try { cur = await fetchProdVersion(); } catch (e) { cur = '(取得失敗: ' + e.message + ')'; }
    if (cur === want) {
      console.log('OK 本番反映 確認 (試行 ' + i + '/' + VERIFY_MAX_TRIES + '): 本番 version.txt = ' + cur);
      process.exit(0);
    }
    process.stdout.write('  …試行 ' + i + '/' + VERIFY_MAX_TRIES + ': 本番=[' + cur + '] 期待=[' + want + ']\n');
    if (i < VERIFY_MAX_TRIES) await sleep(VERIFY_INTERVAL_MS);
  }
  console.error('');
  console.error('時間切れ: 規定時間内に本番が期待値へ切り替わりませんでした。');
  console.error('  → 成功扱いにしないこと。GitHub Pagesビルド遅延 / push漏れ / CDNキャッシュを疑う。');
  console.error('  もう一度: node scripts/bump-app-version.js --verify ' + want);
  process.exit(1);
}

// ===== 前提チェック =====
function preflight() {
  // (a) 対象ファイルに「実差分」（staged/unstaged問わずHEADとの内容差）があれば拒否。
  //     git diff はautocrlf正規化後で判定するため、CRLFのみの見せかけ差分では拒否しない。
  //     別作業（例: genba.htmlの未コミット機能）をbumpコミットに巻き込む事故を防ぐ。
  const clean = shTry('git diff --quiet HEAD -- ' + TRACKED.join(' ')); // exit0=差分なし
  if (!clean.ok) {
    const detail = shTry('git diff --name-status HEAD -- ' + TRACKED.join(' '));
    console.error('実行拒否: 版上げ対象に未コミットの実変更があります（手編集や別作業の混入を防止）。');
    console.error(detail.out);
    console.error('  → 先にその変更をコミット/退避し、対象をクリーンにしてから再実行。');
    process.exit(1);
  }
  // (b) origin/master よりbehind なら拒否（fresh pull前提）。fetchはネット必須なので失敗時は警告のみ。
  const fetched = shTry('git fetch origin master --quiet');
  if (!fetched.ok) {
    console.warn('git fetch 失敗（オフライン？）: behindチェックをスキップして続行します。push時に弾かれる可能性あり。');
  } else {
    const lr = shTry('git rev-list --left-right --count origin/master...HEAD');
    if (lr.ok) {
      const m = lr.out.split(/\s+/);
      const behind = parseInt(m[0], 10) || 0;
      const ahead = parseInt(m[1], 10) || 0;
      if (behind > 0) {
        console.error('実行拒否: ローカルが origin/master より ' + behind + ' コミットbehind（diverged）。');
        console.error('  → 先に fresh pull（git pull --ff-only origin master 等）してから再実行。');
        process.exit(1);
      }
      if (ahead > 0) {
        console.warn('注意: 未pushのローカルコミットが ' + ahead + ' 件あります（このbumpコミットも後で一緒にpushされます）。');
      }
    }
  }
  // (c) assume-unchanged フラグを正常化（二度と罠を踏まない）
  for (const f of TRACKED) {
    shTry('git update-index --no-assume-unchanged ' + f); // 既に正常でも無害
  }
}

// ===== 版上げ本体 =====
function runBump(newVer) {
  if (!isValidVer(newVer)) {
    console.error('不正なバージョン文字列: ' + JSON.stringify(newVer));
    process.exit(1);
  }
  preflight();

  const oldVer = readVersion();
  if (oldVer === newVer) {
    console.error('実行拒否: 新旧バージョンが同一です（' + newVer + '）。版を上げてください。');
    process.exit(1);
  }

  // 1) version.txt を更新（必ずLF・末尾改行1つ）
  fs.writeFileSync(VERSION_TXT, newVer + '\n', 'utf8');

  // 2) genba.html の shared.js?v=... を version.txt と一致させる（版同期）
  let html = fs.readFileSync(GENBA_HTML, 'utf8');
  const re = /(shared\.js\?v=)[^"']+/g;
  const matches = html.match(re) || [];
  if (matches.length === 0) {
    console.error('genba.html に shared.js?v= が見つからない（ゲート未適用？）。version.txt のみ更新済・コミットは中止。');
    process.exit(1);
  }
  html = html.replace(re, '$1' + newVer);
  fs.writeFileSync(GENBA_HTML, html, 'utf8');

  // 3) 対象2ファイルのみ add → commit（他のdirtyファイルは巻き込まない）
  sh('git add -- ' + TRACKED.join(' '));
  const staged = sh('git diff --cached --name-only');
  const stagedList = staged.split(/\r?\n/).filter(Boolean).sort();
  const expect = TRACKED.slice().sort();
  if (JSON.stringify(stagedList) !== JSON.stringify(expect)) {
    console.error('実行拒否: ステージ内容が想定と不一致。');
    console.error('  staged: ' + JSON.stringify(stagedList));
    console.error('  expect: ' + JSON.stringify(expect));
    console.error('  → assume-unchanged残存等を疑う。手動確認のこと。');
    process.exit(1);
  }
  const msg = 'chore(genba): bump app version ' + oldVer + ' -> ' + newVer + '（version.txt + shared.js?v= 同期・キャッシュゲート）';
  // メッセージにスペースや日本語を含むので一時ファイル経由でコミット（シェルエスケープ事故回避）
  const tmpMsg = path.join(ROOT, '.bump-commit-msg.tmp');
  fs.writeFileSync(tmpMsg, msg + '\n', 'utf8');
  try {
    sh('git commit -F "' + tmpMsg + '"');
  } finally {
    try { fs.unlinkSync(tmpMsg); } catch (_) {}
  }
  const head = sh('git rev-parse HEAD');

  // 4) 結果表示（実pushはしない＝案A）
  console.log('');
  console.log('版上げ完了（commitまで・push未実行）: ' + oldVer + ' -> ' + newVer);
  console.log('  version.txt 更新');
  console.log('  genba.html shared.js?v= 更新 (' + matches.length + ' 箇所)');
  console.log('  commit: ' + head);
  console.log('');
  console.log('-- 次の手順（社長承認のうえ手動で）--------------');
  console.log('  1) 本番へ push:');
  console.log('       git push origin master');
  console.log('  2) push後、本番反映を確認:');
  console.log('       node scripts/bump-app-version.js --verify ' + newVer);
  console.log('------------------------------------------------');
}

// ===== エントリ =====
const a0 = (process.argv[2] || '').trim();
if (a0 === '--verify') {
  runVerify((process.argv[3] || '').trim());
} else if (!a0) {
  console.log('現バージョン: ' + readVersion());
  console.log('版上げ:  node scripts/bump-app-version.js <新バージョン>  例) 2026-06-23-04');
  console.log('本番確認: node scripts/bump-app-version.js --verify [<版>]');
  process.exit(0);
} else {
  runBump(a0);
}
