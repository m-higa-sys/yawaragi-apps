// seikyu-board DOM配線層(sbRender/sbHandleFiles)のヘッドレスsmokeテスト
// 実ブラウザを開かず（POSTゼロ・安全）、document/FileReader を最小スタブして UI 出力の正しさを検証する。
// 実行: node scripts/test-seikyu-board-render.js
// 純関数の網羅は test-seikyu-board.js 側。こちらは配線(取込集約・描画・ソート・dedup・onerror)の回帰ガード。
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'seikyu-board.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));

const captured = {};
const el = id => ({
  set innerHTML(v) { captured[id + '.innerHTML'] = v; },
  set textContent(v) { captured[id + '.textContent'] = v; },
  addEventListener() {}, style: {},
});
// onload/onerror を同期発火するモック FileReader（readAsArrayBuffer は file.__buf を渡す）
function MockFileReader() {}
MockFileReader.prototype.readAsArrayBuffer = function (file) {
  if (file.__fail) { if (this.onerror) this.onerror(); return; }
  if (this.onload) this.onload({ target: { result: file.__buf } });
};
const sandbox = {
  document: { getElementById: el },
  alert: m => { captured.lastAlert = m; },
  FileReader: MockFileReader, TextDecoder, console,
};
const ctx = `with (S) {\n${script}\n; S.__sbFilesSet = function(a){ sbFiles = a; }; S.__sbFilesGet = function(){ return sbFiles; };`
  + ` S.__render = sbRender; S.__handle = sbHandleFiles; S.__extract = function(buf){ return sbExtractRows(sbToRows(sbDecode(buf))); }; }`;
new Function('S', ctx)(sandbox);

const FX = name => path.join(__dirname, 'fixtures', 'seikyu', name);
const loadRecs = name => sandbox.__extract(fs.readFileSync(FX(name)));
const recs3 = loadRecs('fixture-2026-03-kakuteimae.csv'); // 全空欄→pending
const recs5 = loadRecs('fixture-2026-05.csv');            // 引落し後→unpaid2

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) pass++; else { fail++; console.error('  [FAIL] ' + l); } };

// --- A: 3旧単月（全空欄）→ 誰も赤にならず、全月セルが「—（判定前）」---
sandbox.__sbFilesSet([{ label: '202603', recs: recs3 }]);
sandbox.__render();
const tableA = captured['tableWrap.innerHTML'] || '';
const sumA = (captured['summary.innerHTML'] || '').replace(/<[^>]+>/g, '');
ok(/未入金の利用者:\s*0人/.test(sumA), 'A1: 3旧のみ→未入金0人（誰も赤にならない）: ' + sumA);
ok(tableA.indexOf('st-unpaid') === -1, 'A2: 3旧のみ→赤セル(st-unpaid)が1つも無い');
ok(tableA.indexOf('—（判定前）') >= 0, 'A3: 3旧→「—（判定前）」表示が出る');
ok(tableA.indexOf('st-pending') >= 0, 'A4: pendingセルクラスが出る');

// --- B: 3旧+5月（横断）→ 5月の未入金2人が赤・上位、月ヘッダは古い順 ---
sandbox.__sbFilesSet([{ label: '202603', recs: recs3 }, { label: '202605', recs: recs5 }]);
sandbox.__render();
const tableB = captured['tableWrap.innerHTML'] || '';
const sumB = (captured['summary.innerHTML'] || '').replace(/<[^>]+>/g, '');
ok(/未入金の利用者:\s*2人/.test(sumB), 'B1: 3旧+5月→未入金2人: ' + sumB);
ok((tableB.match(/st-unpaid/g) || []).length === 2, 'B2: 赤セルはちょうど2つ（5月の未入金2件）');
const hIdx3 = tableB.indexOf('2026/03'), hIdx5 = tableB.indexOf('2026/05');
ok(hIdx3 >= 0 && hIdx5 >= 0 && hIdx3 < hIdx5, 'B3: 月ヘッダが古い順（2026/03 が 2026/05 より左）');
const firstUnpaid = tableB.indexOf('st-unpaid'), firstPaid = tableB.indexOf('st-paid');
ok(firstUnpaid >= 0 && (firstPaid === -1 || firstUnpaid < firstPaid), 'B4: 未入金セルが入金済セルより上（未入金上位ソート）');

// --- C: 同月を2回ドロップ → 金額が倍化しない（dedup回帰）---
const buf5 = fs.readFileSync(FX('fixture-2026-05.csv'));
sandbox.__sbFilesSet([]);
sandbox.__handle([{ name: '5月.csv', __buf: buf5 }]);
const sumC1 = (captured['summary.innerHTML'] || '').replace(/<[^>]+>/g, '');
sandbox.__handle([{ name: '5月_again.csv', __buf: buf5 }]);
const sumC2 = (captured['summary.innerHTML'] || '').replace(/<[^>]+>/g, '');
ok(sandbox.__sbFilesGet().length === 1, 'C1: 同月2回取込→sbFilesは1本（dedup）: ' + sandbox.__sbFilesGet().length);
ok(sumC1 === sumC2, 'C2: 同月再取込でサマリが倍化しない: [' + sumC1 + '] vs [' + sumC2 + ']');

// --- D: 読取り失敗(onerror)でも描画が沈黙しない（pending集約の回帰）---
sandbox.__sbFilesSet([]);
captured['tableWrap.innerHTML'] = undefined;
sandbox.__handle([{ name: '壊れ.csv', __fail: true }, { name: '5月.csv', __buf: buf5 }]);
ok(typeof captured['tableWrap.innerHTML'] === 'string', 'D1: 1本読取り失敗でも残りで描画が走る');
ok(captured.lastAlert && captured.lastAlert.indexOf('読取り失敗') >= 0, 'D2: 失敗ファイルはalertで通知');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
