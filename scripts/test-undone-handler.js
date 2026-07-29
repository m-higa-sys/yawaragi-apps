// reportUndone_ / undoneDigestForMorning_ のロジック実測（2026-07-30）
// 対象: gas/yawaragi-board/コード.js の reportUndone_ / undoneDigestForMorning_
// 実行: node scripts/test-undone-handler.js
//
// 位置づけ（隠さず明記）:
//   ここは **Node上でシート／LockService／Utilities をフェイクした実測**。
//   本番スプレッドシートには1バイトも書かない（段4の社長承認前のため）。
//   本番シートへの実書込の実測は段4で別途行う。
//
// 検証する完了条件:
//   ・1回POST → 1行増える
//   ・同日に連続2回POST → 増えない（冪等）
//   ・5連打 → active行は1本のみ／ロックを読み取りの前に取っている
//   ・cancel → status=cancelled + cancelledAt が入り、行は消えない
//   ・cancel対象なし → success:true / status:'none'（エラーにしない）
//   ・date / reportedAt が JST（ambient TZ に依存しない）

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const codeSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'コード.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(REPO, 'gas', 'yawaragi-board', 'undone-report-core.js'), 'utf8');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('関数が見つからない: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, e, label) {
  if (JSON.stringify(a) === JSON.stringify(e)) pass++;
  else { fail++; console.error('  [FAIL] ' + label + '  期待=' + JSON.stringify(e) + ' 実際=' + JSON.stringify(a)); }
}

const HEADER = ['id', 'date', 'app', 'app_label', 'reportedAt', 'status', 'cancelledAt'];
// 本番シートの既存2行（削除も編集もしない対象。読めることを保証する）
function seedRows() {
  return [
    ['un_1777440403504', new Date('2026-04-28T07:00:00Z'), 'sougei_nisshi', '送迎日誌',
      '2026-04-29T14:28:11+09:00', 'cancelled', '2026-04-29T14:28:15+09:00'],
    ['un_1777444258098', new Date('2026-04-29T07:00:00Z'), 'sougei_nisshi', '送迎日誌',
      '2026-04-29T15:30:58+09:00', 'active', '']
  ];
}

// ---- GAS ランタイムのフェイク ----------------------------------------------
function makeEnv(opts) {
  const o = opts || {};
  const trace = [];
  const grid = [HEADER.slice()].concat(o.rows || seedRows());
  const sheet = {
    getDataRange: () => { trace.push('read'); return { getValues: () => grid.map(r => r.slice()) }; },
    appendRow: (arr) => { trace.push('append'); grid.push(arr.slice()); },
    getRange: (row, col) => ({ setValue: (v) => { trace.push('write'); grid[row - 1][col - 1] = v; } })
  };
  let held = false, maxHeld = 0, cur = 0;
  const ctx = {
    JSON, Date, String, Number, isNaN, Object, Array, RegExp, Error,
    SpreadsheetApp: { flush: () => { trace.push('flush'); } },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          trace.push('waitLock');
          if (held) throw new Error('同時取得された（直列化されていない）');
          held = true; cur++; if (cur > maxHeld) maxHeld = cur;
        },
        releaseLock: () => { trace.push('releaseLock'); held = false; cur--; }
      })
    },
    Utilities: {
      // Asia/Tokyo 固定の最小実装。ambient TZ に依存しないよう UTC+9h で組む。
      formatDate: (d, tz, fmt) => {
        if (tz !== 'Asia/Tokyo') throw new Error('TZ が Asia/Tokyo で明示されていない: ' + tz);
        const j = new Date(d.getTime() + 9 * 3600 * 1000);
        const p = n => String(n).padStart(2, '0');
        const ymd = j.getUTCFullYear() + '-' + p(j.getUTCMonth() + 1) + '-' + p(j.getUTCDate());
        const hms = p(j.getUTCHours()) + ':' + p(j.getUTCMinutes()) + ':' + p(j.getUTCSeconds());
        if (fmt === 'yyyy-MM-dd') return ymd;
        if (fmt === "yyyy-MM-dd'T'HH:mm:ssXXX") return ymd + 'T' + hms + '+09:00';
        throw new Error('未対応フォーマット: ' + fmt);
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(coreSrc.replace(/if \(typeof module[\s\S]*$/, '') + '\n'
    + extractFn(codeSrc, 'reportUndone_') + '\n'
    + extractFn(codeSrc, 'undoneDigestForMorning_') + '\n', ctx);
  const ss = { getSheetByName: (n) => (n === ' 未実施報告'.trim() ? sheet : null) };
  return {
    ctx, ss, grid, trace,
    dataRows: () => grid.slice(1),
    activeCount: (app, date) => grid.slice(1).filter(r =>
      r[2] === app && r[5] === 'active' && ctx.undoneNormalizeDateCell_(r[1]) === date).length,
    lockMax: () => maxHeld
  };
}

const DATE = '2026-07-30';
const P = { action: 'report_undone', app: 'sougei_nisshi', app_label: '送迎日誌', date: DATE };

// ===== 1回POST → 1行増える =====
{
  const env = makeEnv();
  const before = env.dataRows().length;
  const r = env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  eq(r.success, true, 'A1: success:true');
  eq(r.status, 'active', 'A2: status=active');
  ok(/^un_\d+$/.test(r.id), 'A3: id が払い出される（実測=' + r.id + '）');
  eq(env.dataRows().length, before + 1, 'A4: 行が1本だけ増える（' + before + '→' + env.dataRows().length + '）');
  const row = env.dataRows()[env.dataRows().length - 1];
  eq(row.length, HEADER.length, 'A5: 7列のまま（列を増やさない）');
  eq(row[1], DATE, 'A6: date は文字列 ' + DATE + '（Date型を渡していない）');
  ok(typeof row[1] === 'string', 'A7: date の型が string');
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(row[4]),
    'A8: reportedAt は +09:00 付き文字列（実測=' + row[4] + '）');
  eq(row[5], 'active', 'A9: status=active');
  eq(row[6], '', 'A10: cancelledAt は空');
  ok(env.trace.indexOf('waitLock') === 0, 'A11: 最初の操作が waitLock（読む前にロックを取る）');
  ok(env.trace.indexOf('waitLock') < env.trace.indexOf('read'), 'A12: waitLock が read より前');
  ok(env.trace[env.trace.length - 1] === 'releaseLock', 'A13: 最後に releaseLock（finally で必ず解放）');
  ok(env.trace.indexOf('flush') >= 0, 'A14: flush で確定させる');
}

// ===== 同日に連続2回 → 増えない（冪等）=====
{
  const env = makeEnv();
  const r1 = env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  const n1 = env.dataRows().length;
  const r2 = env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  eq(env.dataRows().length, n1, 'B1: 2回目で行が増えない（' + n1 + '→' + env.dataRows().length + '）');
  eq(r2.success, true, 'B2: 2回目も success:true');
  eq(r2.id, r1.id, 'B3: 同じ id を返す（既存行を返す）');
  eq(r2.duplicate, true, 'B4: duplicate:true で冪等だったことが分かる');
  eq(env.activeCount('sougei_nisshi', DATE), 1, 'B5: (app,date) の active は1本');
}

// ===== 5連打 → active は1本／ロックは直列 =====
{
  const env = makeEnv();
  for (let i = 0; i < 5; i++) env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  eq(env.activeCount('sougei_nisshi', DATE), 1, 'C1: 5連打しても active は1本のみ');
  eq(env.dataRows().length, seedRows().length + 1, 'C2: 増えた行は合計1本のみ');
  eq(env.lockMax(), 1, 'C3: ロックの同時保持は最大1（二重取得なら fake が例外を投げる）');
  eq((env.trace.filter(x => x === 'waitLock')).length, 5, 'C4: 5回すべてロックを経由');
  eq((env.trace.filter(x => x === 'releaseLock')).length, 5, 'C5: 5回すべて解放');
}

// ===== 別アプリは別行（app列は汎用のまま）=====
{
  const env = makeEnv();
  env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  const r = env.ctx.reportUndone_(env.ss, { app: 'oral', app_label: '口腔記録', date: DATE, toggle: 'report' });
  eq(r.status, 'active', 'E1: 別アプリは新規 active');
  eq(env.activeCount('oral', DATE), 1, 'E2: oral の active 1本');
  eq(env.activeCount('sougei_nisshi', DATE), 1, 'E3: sougei_nisshi の active も1本のまま');
}

// ===== cancel → cancelled になり、行は消えない =====
{
  const env = makeEnv();
  const rep = env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  const n = env.dataRows().length;
  const can = env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'cancel' }));
  eq(can.success, true, 'F1: cancel は success:true');
  eq(can.status, 'cancelled', 'F2: status=cancelled を返す');
  eq(can.id, rep.id, 'F3: 対象 id を返す');
  eq(env.dataRows().length, n, 'F4: 行は消えていない（' + n + '行のまま）');
  const row = env.dataRows().find(r => r[0] === rep.id);
  eq(row[5], 'cancelled', 'F5: シート上の status が cancelled');
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(row[6]),
    'F6: cancelledAt に +09:00 付き文字列（実測=' + row[6] + '）');
  eq(env.activeCount('sougei_nisshi', DATE), 0, 'F7: active は0本');
  // report → cancel → report で、cancelled を残したまま新しい active が1本
  const again = env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  eq(env.dataRows().length, n + 1, 'F8: 再reportで新しい行が1本追加される');
  eq(env.activeCount('sougei_nisshi', DATE), 1, 'F9: active は1本');
  ok(again.id !== rep.id, 'F10: 新しい id（cancelled 行と衝突しない・同一ms連続でも）');
  eq(env.dataRows().filter(r => r[5] === 'cancelled' && r[0] === rep.id).length, 1, 'F11: cancelled 行は残存');
  const ids = env.dataRows().map(r => r[0]);
  eq(ids.length, new Set(ids).size, 'F12: シート全体で id が一意（重複ゼロ）');
}

// ===== id の一意性（同一ミリ秒で report/cancel を多数回まわす）=====
{
  const env = makeEnv();
  for (let i = 0; i < 20; i++) {
    env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
    env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'cancel' }));
  }
  const ids = env.dataRows().map(r => r[0]);
  eq(ids.length, new Set(ids).size, 'K1: report/cancel 20往復でも id 重複ゼロ（実測 ' + ids.length + '件）');
  eq(env.activeCount('sougei_nisshi', DATE), 0, 'K2: 最後は cancel なので active 0本');
  eq(env.dataRows().filter(r => r[5] === 'cancelled').length, 21, 'K3: cancelled 行が全部残る（既存1+新規20）');
}

// ===== cancel 対象なし → success:true / status:'none' =====
{
  const env = makeEnv();
  const r = env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'cancel' }));
  eq(r, { success: true, status: 'none' }, 'G1: 対象なしの cancel はエラーにしない');
  eq(env.dataRows().length, seedRows().length, 'G2: 何も書かない');
  ok(env.trace.indexOf('append') < 0 && env.trace.indexOf('write') < 0, 'G3: 書込操作ゼロ');
}

// ===== 既存4月行を壊さない =====
{
  const env = makeEnv();
  const before = JSON.stringify(env.dataRows().slice(0, 2));
  env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'report' }));
  env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'cancel' }));
  eq(JSON.stringify(env.dataRows().slice(0, 2)), before, 'H1: 4月の既存2行は1バイトも変わらない');
}

// ===== 入力の検証 =====
{
  const env = makeEnv();
  eq(env.ctx.reportUndone_(env.ss, { toggle: 'report', date: DATE }).success, false, 'I1: app なしは失敗');
  eq(env.ctx.reportUndone_(env.ss, Object.assign({}, P, { toggle: 'xxx' })).success, false, 'I2: 不正 toggle は失敗');
  // date が読めない場合はサーバのJST当日で補う（黙って落とさない）
  const r = env.ctx.reportUndone_(env.ss, { app: 'sougei_nisshi', app_label: '送迎日誌', date: 'ゴミ', toggle: 'report' });
  eq(r.success, true, 'I3: date が読めなくても保存する（サーバJST当日で補う）');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(env.dataRows()[env.dataRows().length - 1][1]), 'I4: 補った date も yyyy-MM-dd');
  // シート不在は明示的な失敗（黙って消えない）
  const r2 = env.ctx.reportUndone_({ getSheetByName: () => null }, Object.assign({}, P, { toggle: 'report' }));
  eq(r2.success, false, 'I5: シート不在は success:false');
  ok(/未実施報告/.test(r2.error), 'I6: 失敗理由が画面に出せる文言');
}

// ===== 朝報告セクション（0件なら null）=====
{
  const env = makeEnv({ rows: [] });
  eq(env.ctx.undoneDigestForMorning_(env.ss, '2026-07-30'), null, 'J1: データなし → null（セクション非表示）');
  const env2 = makeEnv();
  env2.ctx.reportUndone_(env2.ss, Object.assign({}, P, { toggle: 'report' }));
  const sec = env2.ctx.undoneDigestForMorning_(env2.ss, '2026-07-30');
  eq(sec, { count: 1, items: [{ date: DATE, app: 'sougei_nisshi', app_label: '送迎日誌' }] },
    'J2: active 1件が朝報告に出る（4月の active は14日窓の外で落ちる）');
  env2.ctx.reportUndone_(env2.ss, Object.assign({}, P, { toggle: 'cancel' }));
  eq(env2.ctx.undoneDigestForMorning_(env2.ss, '2026-07-30'), null,
    'J3: cancel すると朝報告から消える（終わるまで方式）');
}

// ===== morningDigest の配線そのものを実測（コピーではなく実ソースを切り出して評価）=====
{
  const s = codeSrc.indexOf("  safe('undone', function () {");
  ok(s > 0, 'L0: morningDigest に safe(\'undone\', ...) が存在する');
  const e = codeSrc.indexOf('\n  }\n', codeSrc.indexOf('delete sections.undone;', s)) + 4;
  const wiring = codeSrc.slice(s, e);
  ok(/undoneDigestForMorning_\(ss, dateStr\)/.test(wiring),
    'L1: dateStr を渡している（?date= 指定に追随する）');

  function runWiring(digestResult, throwIt) {
    const sections = {}, errors = [];
    const ctx = {
      sections, errors,
      safe: (name, fn) => {
        try { sections[name] = fn(); }
        catch (err) { sections[name] = null; errors.push({ section: name, error: String(err.message || err) }); }
      },
      undoneDigestForMorning_: () => { if (throwIt) throw new Error('boom'); return digestResult; },
      ss: {}, dateStr: '2026-07-30'
    };
    vm.createContext(ctx);
    vm.runInContext(wiring, ctx);
    return { sections, errors };
  }
  // 0件（null）→ キー自体が立たない＝セクション非表示
  const r0 = runWiring(null, false);
  eq('undone' in r0.sections, false, 'L2: 0件ならキーを立てない（セクションを出さない）');
  eq(r0.errors.length, 0, 'L3: 0件はエラーではない');
  // 1件以上 → セクションが入る
  const r1 = runWiring({ count: 1, items: [{ date: '2026-07-29', app: 'sougei_nisshi', app_label: '送迎日誌' }] }, false);
  eq(r1.sections.undone, { count: 1, items: [{ date: '2026-07-29', app: 'sougei_nisshi', app_label: '送迎日誌' }] },
    'L4: 1件以上ならセクションが入る');
  // 例外 → null を残し errors に痕跡（障害を隠さない）
  const rE = runWiring(null, true);
  eq('undone' in rE.sections, true, 'L5: 例外時は null のままキーを残す（障害を隠さない）');
  eq(rE.sections.undone, null, 'L6: 例外時の値は null');
  eq(rE.errors.length, 1, 'L7: errors に1件記録される');
  eq(rE.errors[0].section, 'undone', 'L8: errors の section が undone');
}

console.log('\ntest-undone-handler: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
