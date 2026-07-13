// 送迎条件フロント 送迎条件.html の描画スモークテスト（DOMスタブ・素node・jsdom非依存）
// 実行: node scripts/test-sougei-jouken-html.js
// JSONP(getMembersForApp/sougeiCondsGet/getSchedTimes/sougeiCondsUpsert)をモックし、
// load→render の実経路で「要確認⚠/確認済み✓」「hidden除外roster」「プリフィル表示」
// 「保存→confirmed化」「定型ルート表示」を検証する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', '送迎条件.html'), 'utf8');
const lastOpen = html.lastIndexOf('<script>');
const code = html.slice(lastOpen + '<script>'.length, html.indexOf('</script>', lastOpen));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.error('  [FAIL] ' + label); } }

// ── DOMスタブ ──
function mkEl(id) {
  return { id, textContent: '', innerHTML: '', className: '', value: '', style: {}, _h: {},
    addEventListener(ev, fn) { this._h[ev] = fn; }, fire(ev) { if (this._h[ev]) this._h[ev](); },
    classList: { _s: {},
      add(c){ this._s[c]=1; }, remove(c){ delete this._s[c]; },
      toggle(c, on){ if(on===undefined){ if(this._s[c])delete this._s[c]; else this._s[c]=1; } else { if(on)this._s[c]=1; else delete this._s[c]; } },
      contains(c){ return !!this._s[c]; } } };
}

// 送信された Upsert payload を捕捉
const sent = [];
function makeResp(src) {
  if (src.indexOf('action=getMembersForApp') >= 0) {
    return { members: [
      { name: '山田 太郎', displayMode: 'normal' },
      { name: '田中 四郎', displayMode: 'normal' },
      { name: '隠 太郎',   displayMode: 'hidden' }   // ← rosterから除外されるべき
    ] };
  }
  if (src.indexOf('action=sougeiCondsGet') >= 0) {
    return { success: true, conds: {
      '山田 太郎': { transport: 'walk', confirmed: false },              // プリフィル=要確認
      '田中 四郎': { transport: 'normal', no3: true, confirmed: true }   // 確認済み
    } };
  }
  if (src.indexOf('action=getSchedTimes') >= 0) {
    return { routes: { '月': {
      am: { pick: [{ driver: '小野', vehicle: 'ス', stops: [{ user: '山田' }, { user: '鈴木' }] }], drop: [] },
      pm: { pick: [], drop: [{ driver: '林', vehicle: 'シS', stops: [{ user: '佐藤' }] }] }
    } } };
  }
  if (src.indexOf('action=sougeiCondsUpsert') >= 0) {
    var m = src.match(/[?&]p=([^&]+)/);
    var payload = m ? JSON.parse(decodeURIComponent(m[1])) : null;
    sent.push(payload);
    return { success: true, count: 99 };
  }
  return {};
}

const els = {};
function getEl(id) { if (!els[id]) els[id] = mkEl(id); return els[id]; }
// 起動に必要な要素を事前生成（reloadBtn があると load() 自動実行）
['statLine','warnCount','reloadBtn','q','warnOnly','condsList','dayTabs','routesList',
 'viewConds','viewRoutes','tabConds','tabRoutes','toast'].forEach(getEl);

const sandbox = {
  console, Date, JSON, Math, encodeURIComponent, decodeURIComponent, parseInt,
  URL, URLSearchParams, setTimeout: (fn)=>{ /* toastは即無視 */ }, clearTimeout: ()=>{},
  performance: { now: () => Date.now() },
  localStorage: { _s:{}, getItem(k){ return (k in this._s)?this._s[k]:null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } },
  location: { search: '', href: 'https://x/送迎条件.html' }
};
sandbox.window = sandbox;
sandbox.document = {
  getElementById: getEl,
  createElement() { return { _src:'', set src(v){ this._src=v; }, get src(){ return this._src; }, onerror:null, parentNode:null }; },
  head: { appendChild(elm) {
    var src = String(elm.src || '');
    var cbm = src.match(/[?&]callback=([^&]+)/);
    var cb = cbm ? cbm[1] : '';
    var resp = makeResp(src);
    if (cb && typeof sandbox[cb] === 'function') sandbox[cb](resp);
  } }
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);
// 起動（reloadBtn存在→load()が同期発火：JSONP即時コールバック）
getEl('reloadBtn').fire('click');

// ===== A. 純ロジック =====
ok(typeof sandbox.schBuildRows === 'function', 'A0: schBuildRows 露出');
var rowsAll = sandbox.schBuildRows(['甲','乙'], { '甲': { transport:'family', no3:true, confirmed:true } });
ok(rowsAll.length === 2 && rowsAll[0].transport === 'family' && rowsAll[0].no3 === true, 'A1: 登録者はstore値');
ok(rowsAll[1].transport === 'normal' && rowsAll[1].confirmed === false, 'A2: 未登録は既定(送迎)・未確認');
ok(sandbox.schTransportLabel('walk') === '徒歩' && sandbox.schTransportLabel('normal') === '送迎', 'A3: transportラベル');
var rr = sandbox.schRouteRows({ routes:{ '月':{ am:{pick:[{driver:'小',vehicle:'ス',stops:[{user:'A'}]}],drop:[]}, pm:{pick:[],drop:[]} } } }, '月');
ok(rr.length === 1 && rr[0].vehicle === 'ス' && rr[0].users[0] === 'A', 'A4: schRouteRows 車ごと行');
ok(sandbox.schRouteRows(null, '月').length === 0, 'A5: sched=nullで空(落ちない)');

// ===== B. roster: hidden除外 =====
ok(sandbox.state.roster.length === 2 && sandbox.state.roster.indexOf('隠 太郎') < 0, 'B1: displayMode=hiddenはrosterから除外(2名)');

// ===== C. 条件入力 描画（要確認⚠ / 確認済み✓） =====
var condsHtml = getEl('condsList').innerHTML;
ok(condsHtml.indexOf('山田 太郎') >= 0 && condsHtml.indexOf('田中 四郎') >= 0, 'C1: 在籍2名が表示');
ok(condsHtml.indexOf('⚠ 要確認') >= 0, 'C2: プリフィル(山田)に要確認バッジ');
ok(condsHtml.indexOf('✓ 確認済み') >= 0, 'C3: 確認済み(田中)に確認済みバッジ');
ok(getEl('warnCount').textContent.indexOf('要確認 1件') >= 0, 'C4: 要確認カウント=1(山田のみ)');
ok(getEl('statLine').textContent.indexOf('在籍 2名') >= 0, 'C5: 在籍2名表示');

// ===== D. 要確認のみトグル =====
getEl('warnOnly').fire('click');
var onlyWarn = getEl('condsList').innerHTML;
ok(onlyWarn.indexOf('山田 太郎') >= 0 && onlyWarn.indexOf('田中 四郎') < 0, 'D1: 要確認のみ→山田だけ表示');
getEl('warnOnly').fire('click'); // 戻す

// ===== E. 保存 → confirmed化（要確認が消える） =====
sandbox.setField('田中 四郎', 'no3', false); // 田中を編集(no3解除)
sandbox.setField('山田 太郎', 'no3', true);  // 山田に条件付与
sandbox.saveRow('山田 太郎');                 // 山田を確認して保存
ok(sent.length === 1 && sent[0].name === '山田 太郎', 'E1: Upsertが山田で発火');
ok(sent[0].cond.confirmed === true, 'E2: 保存payloadは confirmed=true（確認して保存）');
ok(sent[0].cond.no3 === true, 'E3: 付与した条件(no3)が乗る');
ok(sandbox.state.conds['山田 太郎'].confirmed === true, 'E4: 保存後stateもconfirmed化');
ok(getEl('warnCount').textContent.indexOf('全確認済み') >= 0 || getEl('warnCount').textContent.indexOf('要確認 0') >= 0, 'E5: 山田保存で要確認が解消');

// ===== F. 定型ルート確認ビュー =====
sandbox.switchTab('routes');
var routesHtml = getEl('routesList').innerHTML;
ok(routesHtml.indexOf('小野') >= 0 && routesHtml.indexOf('山田様') >= 0 && routesHtml.indexOf('鈴木様') >= 0, 'F1: 月AM迎え=小野/山田様鈴木様');
ok(routesHtml.indexOf('合ってる') >= 0 && routesHtml.indexOf('ここ違う') >= 0, 'F2: 行ごと確認ボタン');
sandbox.setDay('火');
ok(getEl('routesList').innerHTML.indexOf('未登録') >= 0, 'F3: 火曜は定型ルート未登録表示');

console.log('\n' + (fail === 0 ? '[OK] ' : '[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
