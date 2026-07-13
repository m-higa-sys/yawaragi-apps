// セッションボード 測定チェック（要支援・Phase1）フロントUI テスト — 素node（vm sandbox）
// 実行: node scripts/test-session-board-check.js
// staff_list / addShienSokutei / cancelSessionSokutei の JSONP をモックし、
// チェックフロー（測定者必須）・today-onlyゲート・降格・重複拒否・取消・連打防止 を検証。
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'session-board.html'), 'utf8');
const lastOpen = html.lastIndexOf('<script>');
const code = html.slice(lastOpen + '<script>'.length, html.indexOf('</script>', lastOpen));

function pad2(n){ return (n<10?'0':'')+n; }
function ymd(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function addDays(s,delta){ var p=s.split('-'); return ymd(new Date(+p[0],+p[1]-1,+p[2]+delta)); }
const TODAY = ymd(new Date());

function makeFixture(date){ var p=date.split('-'); return {
  ok:true, date:date, year:+p[0], month:+p[1], presentAm:5, presentPm:5, ampmConflict:[],
  sokutei:[
    { name:'佐藤 一郎', key:'佐藤一郎', care:'事業対象', track:'shien', session:'am', unmeasured:true, last:'', remaining:-999, weeklyVisits:2, remainingVisits:2, absenceRate:0.1 },
    { name:'田中 次郎', key:'田中次郎', care:'要介護2', track:'kaigo', session:'am', remaining:5, weeklyVisits:1, remainingVisits:1, absenceRate:0.2 }
  ],
  koukuMoni:[], koukuTaisou:[], kotan:[], birthday:[], residue:[]
};}
const staffFixture = { ok:true, staff:['代表','比嘉','林','大久保','工藤','小野','中村'] };

let pass=0, fail=0;
function ok(name,cond){ if(cond) pass++; else { fail++; console.error('  [FAIL] '+name); } }

function runBoard(store0, opts){
  opts = opts || {};
  const els = {};
  function mk(id){ return { id, textContent:'', innerHTML:'', className:'', value:'', disabled:false, style:{}, _attrs:{}, _h:{},
    addEventListener(ev,fn){ this._h[ev]=fn; }, fire(ev){ if(this._h[ev]) this._h[ev](); },
    getAttribute(a){ return this._attrs[a]; }, setAttribute(a,v){ this._attrs[a]=String(v); if(a==='class') this.className=String(v); } }; }
  function getEl(id){ if(!els[id]) els[id]=mk(id); return els[id]; }
  const amBtn=mk('tab-am'); amBtn._attrs['data-tab']='am';
  const pmBtn=mk('tab-pm'); pmBtn._attrs['data-tab']='pm';
  const store=Object.assign({},store0||{});
  const ls={ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };
  const sb={ localStorage:ls, location:{search:'',href:'https://x/'}, console, Date, JSON, Math,
    encodeURIComponent, decodeURIComponent, parseInt, URL, URLSearchParams, setTimeout, clearTimeout };
  sb.window=sb;
  const requests=[], pending=[]; let inited=false;
  function classify(src){
    if(/action=sessionBoard/.test(src)) return 'board';
    if(/action=staff_list/.test(src)) return 'staff';
    if(/action=addShienSokutei/.test(src)) return 'record';
    if(/action=cancelSessionSokutei/.test(src)) return 'cancel';
    return 'other';
  }
  function respFor(rec){
    if(rec.kind==='board') return makeFixture(rec.date||TODAY);
    if(rec.kind==='staff') return staffFixture;
    if(rec.kind==='record') return opts.recordResp||{ok:true};
    if(rec.kind==='cancel') return opts.cancelResp||{ok:true,deleted:1};
    return {ok:true};
  }
  function fire(rec){ if(typeof sb[rec.cb]==='function') sb[rec.cb](respFor(rec)); }
  sb.document={ getElementById:getEl,
    querySelectorAll(s){ return s==='#tabs .tab'?[amBtn,pmBtn]:[]; },
    createElement(){ return { _src:'', set src(v){this._src=v;}, get src(){return this._src;}, onerror:null }; },
    head:{ appendChild(e){ var src=String(e.src||''); var cbm=src.match(/[?&]callback=([^&]+)/); var dm=src.match(/[?&]date=([^&]+)/);
      var rec={ cb:cbm?cbm[1]:'', date:dm?decodeURIComponent(dm[1]):'', src:src, kind:classify(src) };
      requests.push(rec); pending.push(rec);
      var isWrite=(rec.kind==='record'||rec.kind==='cancel');
      if(!isWrite || !opts.manualWrite) fire(rec);
    } },
    body:{ appendChild(){} } };
  vm.createContext(sb); vm.runInContext(code, sb); inited=true;
  return { getEl, amBtn, pmBtn, store, requests, pending, sb, fireAt(i){ fire(pending[i]); },
    lastReq(kind){ for(var i=requests.length-1;i>=0;i--) if(!kind||requests[i].kind===kind) return requests[i]; return null; },
    countReq(kind){ var c=0; for(var i=0;i<requests.length;i++) if(requests[i].kind===kind) c++; return c; } };
}

// ===== S. staff_list 名簿（MEASURER_EXCLUDE 踏襲） =====
var r = runBoard({ 'sessionBoard_tab': JSON.stringify({ date:TODAY, tab:'am' }) });
ok('S1 起動時に staff_list を取得', r.countReq('staff') >= 1);

// ===== G. today-only ゲート =====
ok('G1 今日はチェック可', r.sb.sbCanCheck_() === true);

// ===== C. チェックフロー（測定者必須） =====
r.sb.sbCheckTap('佐藤一郎');
ok('C1 tapで測定者モーダルが開く', r.getEl('measurerModal').className.indexOf('on') >= 0);
ok('C2 対象者名がモーダルに出る', r.getEl('measurerTarget').textContent.indexOf('佐藤') >= 0);
var opts = r.getEl('measurerSelect').innerHTML;
ok('C3 名簿に比嘉/大久保あり', opts.indexOf('比嘉') >= 0 && opts.indexOf('大久保') >= 0);
ok('C4 除外(代表/小野/林)は名簿に無い', opts.indexOf('代表') < 0 && opts.indexOf('小野') < 0 && opts.indexOf('林') < 0);
// 測定者未選択で確定→送信されない（必須）
r.getEl('measurerSelect').value = '';
r.sb.sbRecordConfirm();
ok('C5 測定者未選択なら記録送信しない', r.countReq('record') === 0);
// 測定者選択→確認文言
r.getEl('measurerSelect').value = '比嘉';
r.sb.sbMeasurerChanged();
ok('C6 確認文言に測定者と対象者', r.getEl('measurerConfirmText').textContent.indexOf('比嘉') >= 0 && r.getEl('measurerConfirmText').textContent.indexOf('佐藤') >= 0);
// 確定→addShienSokutei 送信（source=セッションボード・by=比嘉・date=TODAY）
r.sb.sbRecordConfirm();
var rec = r.lastReq('record');
ok('C7 addShienSokutei が送られる', !!rec);
ok('C8 source=セッションボード', rec && rec.src.indexOf('source=' + encodeURIComponent('セッションボード')) >= 0);
ok('C9 by=比嘉', rec && rec.src.indexOf('by=' + encodeURIComponent('比嘉')) >= 0);
ok('C10 date=今日', rec && rec.date === TODAY);
ok('C11 name=佐藤 一郎', rec && rec.src.indexOf('name=' + encodeURIComponent('佐藤 一郎')) >= 0);

// ===== D. 成功→降格（除去でなく「余裕があれば」へ） =====
var board = r.getEl('board').innerHTML;
var idxToday = board.indexOf('▶ 今日やる');
var idxRest = board.indexOf('余裕があれば');
var idxSato = board.indexOf('佐藤 一郎');
ok('D1 佐藤は盤面に残る（除去でない）', idxSato >= 0);
ok('D2 佐藤は「余裕があれば」側（降格）', idxRest >= 0 && idxSato > idxRest);
ok('D3 モーダルは閉じる', r.getEl('measurerModal').className.indexOf('on') < 0);
ok('D4 取消ボタンが出る', board.indexOf('取消') >= 0);

// ===== E. 重複ガード（サーバ拒否）→ 降格しない＋メッセージ =====
var r2 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date:TODAY, tab:'am' }) }, { recordResp:{ ok:false, error:'already_done', message:'今月は実施済みです' } });
r2.sb.sbCheckTap('佐藤一郎'); r2.getEl('measurerSelect').value='比嘉'; r2.sb.sbMeasurerChanged(); r2.sb.sbRecordConfirm();
ok('E1 拒否メッセージ表示', r2.getEl('checkMsg').textContent.indexOf('実施済み') >= 0);
var b2 = r2.getEl('board').innerHTML;
ok('E2 拒否時は降格しない（今日やるに残る）', b2.indexOf('佐藤 一郎') >= 0 && b2.indexOf('佐藤 一郎') < b2.indexOf('余裕があれば') || b2.indexOf('余裕があれば') < 0);

// ===== T. today-only ゲート（過去/未来はチェB不可） =====
var r3 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date:TODAY, tab:'am' }) });
r3.getEl('nextDay').fire('click'); // 明日へ
ok('T1 明日表示ではゲートfalse', r3.sb.sbCanCheck_() === false);
r3.sb.sbCheckTap('佐藤一郎');
ok('T2 明日ではモーダル開かない', r3.getEl('measurerModal').className.indexOf('on') < 0);
ok('T3 「今日に戻って」案内', r3.getEl('checkMsg').textContent.indexOf('今日に戻って') >= 0);

// ===== X. 取消（source=セッションボード・当日のみ） =====
var r4 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date:TODAY, tab:'am' }) });
r4.sb.sbCheckTap('佐藤一郎'); r4.getEl('measurerSelect').value='比嘉'; r4.sb.sbMeasurerChanged(); r4.sb.sbRecordConfirm();
r4.sb.sbCancelTap('佐藤一郎');
var can = r4.lastReq('cancel');
ok('X1 cancelSessionSokutei が送られる', !!can);
ok('X2 cancelにname/date', can && can.src.indexOf('name=' + encodeURIComponent('佐藤 一郎')) >= 0 && can.date === TODAY);
var b4 = r4.getEl('board').innerHTML;
ok('X3 取消後は今日やるに復帰', b4.indexOf('佐藤 一郎') >= 0 && b4.indexOf('佐藤 一郎') < b4.indexOf('余裕があれば') || b4.indexOf('余裕があれば') < 0);

// ===== R. 連打防止（記録中は二重送信しない） =====
var r5 = runBoard({ 'sessionBoard_tab': JSON.stringify({ date:TODAY, tab:'am' }) }, { manualWrite:true });
r5.sb.sbCheckTap('佐藤一郎'); r5.getEl('measurerSelect').value='比嘉'; r5.sb.sbMeasurerChanged();
r5.sb.sbRecordConfirm(); // 1回目（保留）
r5.sb.sbRecordConfirm(); // 2回目（busyで無視されるべき）
ok('R1 記録中は1回だけ送信', r5.countReq('record') === 1);
ok('R2 記録中インジケータ', r5.getEl('measurerConfirm').textContent.indexOf('記録中') >= 0 || r5.getEl('measurerConfirm').disabled === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
