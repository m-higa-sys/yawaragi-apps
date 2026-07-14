// kinki.html フロント スモーク  実行: node scripts/test-kinki-html.js
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'kinki.html'), 'utf8');
// 全 <script> を結合
let code = ''; let re = /<script>([\s\S]*?)<\/script>/g, m;
while ((m = re.exec(html))) code += '\n' + m[1];

let pass = 0, fail = 0;
function ok(c, l){ if(c) pass++; else { fail++; console.error('  [FAIL] '+l); } }

// --- DOMスタブ ---
let appHTML = '';
const appEl = { set innerHTML(v){ appHTML = v; }, get innerHTML(){ return appHTML; } };
function stubEl(){ return { style:{}, value:'', textContent:'', addEventListener(){}, querySelectorAll(){return[];}, appendChild(){}, remove(){} }; }
const sandbox = {
  console, encodeURIComponent, decodeURIComponent, JSON, Array, Object, String, RegExp, Math, performance:{ now:()=>1 },
  location:{ search:'?user=' + encodeURIComponent('比嘉太郎'), href:'' },
  document:{ getElementById:(id)=> id==='app'?appEl:stubEl(), createElement:()=>stubEl(), body:{ appendChild(){} }, querySelectorAll:()=>[], querySelector:()=>({value:'temporary'}) },
  addEventListener(){}, // window === sandbox self-ref below; must live on sandbox itself so window.addEventListener resolves
  fetch:()=>Promise.resolve({}),
};
sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(code, sandbox);

// --- 純ロジック検証 ---
ok(sandbox.KINKI_EQUIPMENT.length === 11, 'H1: 機器11種');
ok(sandbox.knkCanRelease_({ type:'permanent' }) === false, 'H2: permanentは解除不可');
ok(sandbox.knkCanRelease_({ type:'temporary' }) === true, 'H3: temporaryは解除可');
ok(sandbox.knkBadgeStyle_('forbid').icon === '🚫', 'H4: forbid→🚫');
const byEq = sandbox.knkGroupByEquipment_([{ userId:'A', level:'forbid', targetEquipment:'["バイク"]' }, { userId:'B', level:'caution', targetEquipment:'' }], sandbox.KINKI_EQUIPMENT);
ok(byEq['バイク'].length === 1, 'H5: バイクに1名');
ok(byEq['機器指定なし'].length === 1, 'H6: 機器空は機器指定なし');
ok(sandbox.clientValidate({ label:'', type:'temporary', reviewDate:'x', sourceName:'x', receivedBy:'x' }), 'H7: label空はエラー文字列');
ok(!sandbox.clientValidate({ label:'右膝NG', type:'permanent', sourceName:'長男', receivedBy:'職員' }), 'H8: 恒久＋必須充足はOK');

// --- 詳細描画：permanentに解除リンクが出ない（D:恒久解除ボタン非描画） ---
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'p1', userId:'比嘉太郎', type:'permanent', level:'forbid', label:'ペースメーカー', targetEquipment:'', sourceName:'長男', sourceType:'family', receivedAt:'2026-07-10', receivedBy:'職員' }], all:[] }); };
sandbox.renderUserDetail();
ok(appHTML.indexOf('mode=release') < 0, 'H9: permanent詳細に解除リンクが無い（DOM非生成）');
ok(appHTML.indexOf('ペースメーカー') >= 0, 'H10: ラベルは描画される');

// --- 解除の確認モーダル（D10・confirm()不使用・labelとバッジ消える旨・2択） ---
ok(code.indexOf('confirm(') < 0, 'H11: ブラウザ標準confirm()を使っていない');
sandbox.location.search = '?user=' + encodeURIComponent('比嘉太郎') + '&mode=release&id=t1';
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'t1', userId:'比嘉太郎', type:'temporary', level:'forbid', label:'右膝 深屈曲NG', targetEquipment:'' }] }); };
sandbox.renderRelease();
ok(appHTML.indexOf('右膝 深屈曲NG') >= 0, 'H12: 確認モーダルに対象labelを動的表示');
ok(appHTML.indexOf('🚫') >= 0, 'H13: levelに応じたアイコン（forbid→🚫）');
ok(appHTML.indexOf('バッジは消えます') >= 0, 'H14: 「バッジが消える」旨を明記');
ok(appHTML.indexOf('キャンセル') >= 0 && appHTML.indexOf('解除する') >= 0, 'H15: キャンセル/解除するの2択');

console.log('kinki-html: pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
