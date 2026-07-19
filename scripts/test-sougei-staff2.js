// 出勤＆送迎表 担当2（staff2）の表示状態マシンの検証。
// ★実物ロード方式: sougei.html から該当関数群のソースをそのまま抜き、vm で本物を実行する。
//   テスト側に写経しないので、本体を直さない限り緑にならない。
// ★instanceof は使わない（vm の別realmで false になり、緑なのに本番が壊れるため）
// 実行: node scripts/test-sougei-staff2.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function eq(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok   ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + '\n         期待: ' + JSON.stringify(b) + '\n         実際: ' + JSON.stringify(a)); }
}

var SRC = path.join(__dirname, '..', 'sougei.html');
var html = fs.readFileSync(SRC, 'utf8');
// 「const evStaff2Open」から closeEvStaff2 の閉じ括弧までを、本体からそのまま切り出す
var m = html.match(/const evStaff2Open = new WeakSet\(\);[\s\S]*?function closeEvStaff2\(i\)\{[\s\S]*?\n\}/);
if (!m) { console.log('!! 担当2の関数群を sougei.html から抽出できない。中断する。'); process.exit(1); }

// 副作用（描画・保存・Undo）は呼ばれた回数だけ数える
var calls = { render: 0, autoSave: 0, pushUndo: 0 };
var sandbox = {
  D: { events: [] },
  render: function () { calls.render++; },
  autoSave: function () { calls.autoSave++; },
  pushUndo: function () { calls.pushUndo++; },
  console: console
};
vm.createContext(sandbox);
vm.runInContext(m[0], sandbox, { filename: 'sougei.html(staff2)' });

['evStaff2Visible', 'openEvStaff2', 'setEvStaff2', 'closeEvStaff2'].forEach(function (fn) {
  if (typeof sandbox[fn] !== 'function') { console.log('!! ' + fn + ' をロードできない。中断する。'); process.exit(1); }
});

function reset() {
  sandbox.D.events = [{ type: '担会', staff: '', staff2: '' }];
  calls.render = 0; calls.autoSave = 0; calls.pushUndo = 0;
}
var ev = function () { return sandbox.D.events[0]; };

console.log('[1] 既定は1名（担当2の行を描画しない＝印刷レイアウト不変の前提）');
reset();
ok(sandbox.evStaff2Visible(ev()) === false, '★staff2 未設定・未オープンなら非表示');
ok(sandbox.evStaff2Visible(null) === false, 'null でも落ちず false');
ok(sandbox.evStaff2Visible(undefined) === false, 'undefined でも落ちず false');
ok(sandbox.evStaff2Visible({}) === false, 'staff2 プロパティが無くても false');

console.log('[2] ＋担当を押すと表示される（値は未選択のまま）');
reset();
sandbox.openEvStaff2(0);
ok(sandbox.evStaff2Visible(ev()) === true, '★オープンで表示に変わる');
eq(ev().staff2, '', '★値はまだ空（勝手に人を入れない）');
eq(calls.render, 1, '再描画される');
eq(calls.autoSave, 0, '★オープンしただけでは保存しない（Dに入れない設計）');

console.log('[3] 担当2を選ぶと保存される');
reset();
sandbox.openEvStaff2(0);
sandbox.setEvStaff2(0, '職員B');
eq(ev().staff2, '職員B', '値が入る');
ok(sandbox.evStaff2Visible(ev()) === true, '表示のまま');
eq(calls.autoSave, 1, '★保存される');

console.log('[4] 「--」に戻すと1名に戻る（印刷が1枚に戻る条件）');
reset();
sandbox.openEvStaff2(0);
sandbox.setEvStaff2(0, '職員B');
sandbox.setEvStaff2(0, '');
eq(ev().staff2, '', '値が空に戻る');
ok(sandbox.evStaff2Visible(ev()) === false, '★非表示に戻る＝2段にならない');

console.log('[5] ✕ で消すと Undo が積まれる');
reset();
sandbox.openEvStaff2(0);
sandbox.setEvStaff2(0, '職員B');
calls.pushUndo = 0;
sandbox.closeEvStaff2(0);
eq(ev().staff2, '', '値が消える');
ok(sandbox.evStaff2Visible(ev()) === false, '非表示に戻る');
eq(calls.pushUndo, 1, '★Undo が積まれる（誤操作を戻せる）');

console.log('[6] staff2 に値があれば、開いた記録が無くても表示される（読み込み直後）');
reset();
ev().staff2 = '職員C';                 // 保存済みデータを読み込んだ状態を再現
ok(sandbox.evStaff2Visible(ev()) === true, '★値があれば表示（WeakSetに無くても）');

console.log('[7] 範囲外・壊れた入力でも落ちない');
reset();
sandbox.openEvStaff2(99);
sandbox.setEvStaff2(99, 'X');
sandbox.closeEvStaff2(99);
ok(true, '★存在しない index でも例外を投げない');
eq(calls.autoSave, 0, '存在しない行は保存もしない');

console.log('[8] 行ごとに独立している（並び替えに追従する設計）');
sandbox.D.events = [{ staff2: '' }, { staff2: '' }];
calls.render = 0;
sandbox.openEvStaff2(0);
ok(sandbox.evStaff2Visible(sandbox.D.events[0]) === true, '1行目は表示');
ok(sandbox.evStaff2Visible(sandbox.D.events[1]) === false, '★2行目は影響を受けない');
var moved = sandbox.D.events[0];
sandbox.D.events = [sandbox.D.events[1], moved];   // 並び替え
ok(sandbox.evStaff2Visible(sandbox.D.events[1]) === true, '★並び替えても実体で追従する');

console.log('');
console.log('=========================================');
console.log('  pass: ' + pass + ' / fail: ' + fail);
console.log('=========================================');
process.exit(fail === 0 ? 0 : 1);
