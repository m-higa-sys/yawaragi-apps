#!/usr/bin/env node
// scripts/run-all-tests.js — yawaragi-apps テスト一括ランナー（dev基盤・product無改修）
//
// 目的：環境要因（jsdom未導入・TZ非JST）で出る「見せかけの赤」を消し、
//       `npm test` 一発で真の緑/赤を判定できるようにする。
//
// 仕組み：
//   - scripts/test-*.js を列挙し、各テストを子プロセスで実行する。
//   - 子プロセスに TZ=Asia/Tokyo を注入（TZはプロセス起動前に効かせる必要があるため）。
//   - NODE_PATH をこのリポジトリの node_modules に向ける。
//     （一部テストが require.resolve('jsdom',{paths:[...]}) で外部パスを指すため、
//      GLOBAL_FOLDERS(=NODE_PATH) 経由で無改修のまま jsdom を解決させる保険）。
//   - SKIP リストは「黙って落とさず」理由付きで明示表示する。
//   - 1件でも fail なら exit 1。最後に PASS/FAIL/SKIP を集計表示する。
//
// 決定的であること：ファイルは名前順に固定。実行日・機種に依存しない。

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const SCRIPTS_DIR = path.join(REPO, "scripts");
const NODE_MODULES = path.join(REPO, "node_modules");
const PER_TEST_TIMEOUT_MS = 120000;

// SKIP リスト：テストでない道具系／本cloneで実行不能な履歴依存。理由を必ず1行で出す。
const SKIP = {
  "test-workrules-phase0.js":
    "道具系（引数必須の回帰ツール：baseline/working HTML を渡して使う。テストではない）",
  "test-workrules-phase1.js":
    "道具系（引数必須の回帰ツール。テストではない）",
  "test-users-api-default-unchanged.js":
    "履歴依存（BASE_COMMIT f6df131 を git show する。本cloneに当該commit不在のため実行不能／別途対応）",
};

function listTests() {
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => /^test-.*\.js$/.test(f))
    .sort();
}

function runOne(file) {
  const env = { ...process.env, TZ: "Asia/Tokyo", NODE_PATH: NODE_MODULES };
  try {
    execFileSync("node", [path.join("scripts", file)], {
      cwd: REPO,
      env,
      timeout: PER_TEST_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (e) {
    const out = ((e.stdout || "") + "" + (e.stderr || "")).toString();
    const code = e.status !== undefined && e.status !== null ? e.status : e.signal || "ERR";
    return { ok: false, code, out };
  }
}

function main() {
  const files = listTests();
  const results = { pass: [], fail: [], skip: [] };

  console.log(`\n=== yawaragi-apps test runner ===`);
  console.log(`TZ=Asia/Tokyo  NODE_PATH=<repo>/node_modules  (${files.length} test files)\n`);

  for (const file of files) {
    if (SKIP[file]) {
      results.skip.push(file);
      console.log(`  SKIP  ${file}  … ${SKIP[file]}`);
      continue;
    }
    const r = runOne(file);
    if (r.ok) {
      results.pass.push(file);
      console.log(`  PASS  ${file}`);
    } else {
      results.fail.push(file);
      console.log(`  FAIL  ${file}  (exit=${r.code})`);
      // 失敗の中身が環境ノイズに埋もれないよう、末尾数行を出す
      const tail = r.out.trim().split("\n").slice(-8).join("\n");
      if (tail) console.log(tail.replace(/^/gm, "        | "));
    }
  }

  console.log(
    `\n==== PASS ${results.pass.length} / FAIL ${results.fail.length} / SKIP ${results.skip.length} ====`
  );
  if (results.fail.length) {
    console.log(`FAIL:\n${results.fail.map((f) => "  - " + f).join("\n")}`);
  }
  process.exit(results.fail.length ? 1 : 0);
}

main();
