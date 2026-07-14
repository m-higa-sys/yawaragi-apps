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

// --- #1 Critical: 恒久禁忌にmode=release直リンクしても確認モーダルを出さず再ガードする ---
sandbox.location.search = '?user=' + encodeURIComponent('比嘉太郎') + '&mode=release&id=perm1';
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'perm1', userId:'比嘉太郎', type:'permanent', level:'forbid', label:'ペースメーカー', targetEquipment:'' }] }); };
sandbox.renderRelease();
ok(appHTML.indexOf('解除できません') >= 0, 'H16: permanent直リンクは「解除できません」で再ガード');
ok(appHTML.indexOf('バッジは消えます') < 0, 'H17: permanent再ガード時は確認モーダルを描画しない');

// --- #2 Important: 動的文字列はHTMLエスケープされる（<140 → &lt;140） ---
sandbox.location.search = '?user=' + encodeURIComponent('比嘉太郎');
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'e1', userId:'比嘉太郎', type:'temporary', level:'caution', label:'血圧<140', detail:'<140', targetEquipment:'', sourceName:'長男', sourceType:'family', receivedAt:'2026-07-10', receivedBy:'職員', reviewDate:'2026-09-10' }], all:[] }); };
sandbox.renderUserDetail();
ok(appHTML.indexOf('&lt;140') >= 0, 'H18: 動的文字列はエスケープして描画（&lt;140）');
ok(appHTML.indexOf('<140') < 0, 'H19: 生の<140は描画されない（XSS対策）');

// --- Edit導線: 詳細の「編集」はmode=edit&id（mode=newへは飛ばさない）＝重複active作成を根絶 ---
sandbox.location.search = '?user=' + encodeURIComponent('比嘉太郎');
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'t1', userId:'比嘉太郎', type:'temporary', level:'forbid', label:'右膝NG', targetEquipment:'', sourceName:'長男', sourceType:'family', receivedAt:'2026-07-10', receivedBy:'職員', reviewDate:'2026-09-10' }], all:[] }); };
sandbox.renderUserDetail();
ok(appHTML.indexOf('mode=edit&id=t1') >= 0, 'H20: 詳細の編集リンクはmode=edit&idを指す');
ok(appHTML.indexOf('mode=edit') >= 0, 'H21: temporary activeに編集導線あり');

// --- Edit導線: permanentも編集可（editリンクは出る／releaseは出ない）---
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'p9', userId:'比嘉太郎', type:'permanent', level:'forbid', label:'ペースメーカー', targetEquipment:'', sourceName:'長男', sourceType:'family', receivedAt:'2026-07-10', receivedBy:'職員' }], all:[] }); };
sandbox.renderUserDetail();
ok(appHTML.indexOf('mode=edit&id=p9') >= 0, 'H22: permanentも編集可（mode=edit導線あり）');
ok(appHTML.indexOf('mode=release') < 0, 'H23: permanentは解除導線なし（編集可・解除不可を両立）');

// --- Edit画面: getKinkiByUserからidで引いた記録でフォームをプリフィルし、updateKinkiへ配線 ---
sandbox.location.search = '?user=' + encodeURIComponent('比嘉太郎') + '&mode=edit&id=t1';
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[{ id:'t1', userId:'比嘉太郎', type:'temporary', level:'forbid', label:'右膝NG', detail:'深屈曲は避ける', targetEquipment:'["バイク"]', sourceName:'長男', sourceType:'family', receivedAt:'2026-07-10', receivedBy:'職員', reviewDate:'2026-09-10' }], all:[] }); };
sandbox.renderEdit();
ok(appHTML.indexOf('value="右膝NG"') >= 0, 'H24: 編集フォームのlabel入力に既存値をプリフィル');
ok(appHTML.indexOf('編集') >= 0, 'H25: 編集フォームの見出しは「編集」');
ok(code.indexOf("'updateKinki'") >= 0 && code.indexOf('isEdit ?') >= 0, 'H26: 編集保存はupdateKinkiへ配線（createKinkiでない）');

// --- Edit画面: 対象が既に解除済み等でactiveに無ければ行き止まり ---
sandbox.knkGet = function(params, cb){ cb({ ok:true, active:[], all:[] }); };
sandbox.renderEdit();
ok(appHTML.indexOf('対象が見つかりません') >= 0, 'H27: active不在時は行き止まり表示');

console.log('kinki-html: pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
