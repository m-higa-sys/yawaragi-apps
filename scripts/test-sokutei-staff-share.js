// test-sokutei-staff-share.js
// sokutei.html タブ3「スタッフ別実施バランス（スタッフ%）」の母数の検証。
//
// ■ 直した事象（2026-08-01 実測）
// 表示されている % の合計が 100% にならない（1ヶ月100% / 2ヶ月97% / 3ヶ月93%）。
// renderTab3 が「先に分母へ加算してから測定者の有無で除外」していたため、
// 測定者が空欄の記録が【分母にだけ】入り、誰の分子にもならず % を薄めていた。
// 同じ形の歪みが MEASURER_EXCLUDE（代表・小野・林）にもある＝行が出ないのに分母に入る。
//
// ■ 仕様（クロ決定 2026-08-01）
//   - 見出しの「総測定 N件」は実件数のまま（実際に測った件数なので事実）
//   - % の分母だけを「測定者が判明していて、かつ表示対象のスタッフ」の件数にする
//   - 件数と割合で母数が違うことを注記で明示する
//
// ■ 触ってはいけないもの（このテストが番人になる）
//   - source='paper' の除外（外すと分母が紙台帳60件ぶん膨らんで全員の % が壊れる）
//   - 2ソース和（state.records=個訓シートM/N列 ∪ state.shien=測定記録シート）
//   - 「最終測定日」の全期間参照（期間窓の外も見る）
//   - 集計期間 monthsAgoStr のローリング窓
//   - 件数バーの幅（max は rows から取る＝分母非依存）
//
// 実行: node scripts/test-sokutei-staff-share.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'sokutei.html'), 'utf8');

let pass = 0, fail = 0;
function eq(a, e, l) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('  PASS ' + l); }
  else { fail++; console.log('  FAIL ' + l + '\n    actual  =' + A + '\n    expected=' + E); }
}
function ok(c, l) { eq(!!c, true, l); }
function sec(t) { console.log('\n[' + t + ']'); }

// ---- sokutei.html から必要な関数だけを取り出す（アプリ全体は起動しない）----
function extractFn(src, name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('関数が見つかりません: ' + name);
  const b = src.indexOf('{', s); let d = 0, i = b;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) { i++; break; } } }
  return src.slice(s, i);
}
function extractVarLine(src, decl) {
  const re = new RegExp('^\\s*' + decl + '.*$', 'm');
  const m = src.match(re);
  if (!m) throw new Error('宣言が見つかりません: ' + decl);
  return m[0];
}

// ---- 固定日 2026-08-01（本番の実測値と突き合わせるため）----
const RealDate = Date;
const FIXED = new RealDate(2026, 7, 1);   // 月は0始まり＝8月
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIXED.getTime()); else super(...a); }
  static now() { return FIXED.getTime(); }
}

// ---- DOM スタブ（renderTab3 が触るのは #tab3 の innerHTML と esc 用の createElement だけ）----
const tab3 = { _in: '', set innerHTML(v) { this._in = v; }, get innerHTML() { return this._in; } };
const sandbox = {
  document: {
    getElementById(id) { return id === 'tab3' ? tab3 : null; },
    createElement() {
      return {
        _t: '',
        set textContent(v) { this._t = String(v); },
        get textContent() { return this._t; },
        get innerHTML() { return this._t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
      };
    }
  },
  Date: FakeDate, Math, JSON, String, Number, Object, Array, console
};
vm.createContext(sandbox);
vm.runInContext([
  extractVarLine(html, 'const MEASURER_EXCLUDE'),
  extractVarLine(html, 'let periodMonths'),
  'let state = { today: "2026-08-01", records: [], shien: [], staff: [], errs: {} };',
  extractFn(html, 'esc'),
  extractFn(html, 'pad2'),
  extractFn(html, 'fmtYMD'),
  extractFn(html, 'normDate'),
  extractFn(html, 'fmtMD'),
  extractFn(html, 'monthsAgoStr'),
  extractFn(html, 'errCard'),
  extractFn(html, 'renderTab3'),
  extractFn(html, 'setPeriod'),
  // let/const の束縛は vm のグローバルオブジェクトに載らないため、橋渡しだけ足す
  // （抽出した本体のソースは1バイトも書き換えない）
  'function __run(s, m) { state = s; periodMonths = m; renderTab3(); }',
  'function __exclude() { return MEASURER_EXCLUDE; }'
].join('\n\n'), sandbox);

// ---- 描画結果を読み取るヘルパー ----
function render(months, st) {
  sandbox.__run(Object.assign({ today: '2026-08-01', records: [], shien: [], staff: [], errs: {} }, st), months);
  return tab3.innerHTML;
}
// 「総測定 N件」の N（見出しの実件数）
function headlineTotal(h) { const m = h.match(/総測定 (\d+)件/); return m ? +m[1] : null; }
// 各行の [スタッフ名, 件数, %]
function rows(h) {
  const out = [];
  const re = /<div class="sbar-name">(.*?)<\/div><div class="sbar-track"><div class="sbar-fill" style="width:([\d.]+)%"><\/div><\/div><div class="sbar-val">(\d+)件 \((\d+)%\)<\/div><div class="sbar-last">(.*?)<\/div>/g;
  let m;
  while ((m = re.exec(h))) out.push({ name: m[1], width: +m[2], count: +m[3], pct: +m[4], last: m[5] });
  return out;
}
function sumPct(h) { return rows(h).reduce((s, r) => s + r.pct, 0); }
// 注記に出る母数（無ければ null）
function noteBase(h) { const m = h.match(/割合は測定者が記録されている (\d+) 件/); return m ? +m[1] : null; }

// =====================================================================
// 本番の実データ形（2026-08-01 実測・利用者の氏名は出さない・スタッフ名のみ）
//   個訓シート（state.records / M列 sokutei_date・N列 sokutei_by）: 測定日あり21件
//     2026-05-04 測定者空欄 / 2026-06-26 測定者空欄 / 2026-07 が19件
//   測定記録シート（state.shien）: app 6件（すべて 2026-07）＋ paper 60件
// =====================================================================
const STAFF = ['勝又', '星野', '下浦', '工藤', '髙山', '春山', '大久保', '小野', '林', '石井', '喜多'];

function u(i) { return 'ダミー利用者' + i; }   // 利用者名は一切使わない
let n = 0;
function kk(date, by) { n++; return { userId: u(n), name: u(n), sokutei_date: date, sokutei_by: by }; }
function sh(date, by, source) { n++; return { name: u(n), care: '要支援2', sokutei_date: date, sokutei_by: by, source: source || 'app' }; }

// 個訓シート由来 21件（本番の測定者別内訳: 大久保9 髙山4 勝又2 下浦1 石井1 工藤1 星野1 空欄2）
const REAL_KK = [
  kk('2026-05-04', ''), kk('2026-06-26', ''),
  kk('2026-07-01', '大久保'), kk('2026-07-01', '大久保'), kk('2026-07-01', '大久保'),
  kk('2026-07-02', '大久保'), kk('2026-07-02', '大久保'), kk('2026-07-02', '大久保'),
  kk('2026-07-02', '髙山'), kk('2026-07-02', '髙山'),
  kk('2026-07-03', '髙山'), kk('2026-07-03', '髙山'),
  kk('2026-07-06', '大久保'), kk('2026-07-06', '大久保'), kk('2026-07-06', '大久保'),
  kk('2026-07-06', '勝又'), kk('2026-07-06', '勝又'),
  kk('2026-07-07', '下浦'), kk('2026-07-07', '石井'),
  kk('2026-07-08', '工藤'), kk('2026-07-14', '星野')
];
// 測定記録シート由来 app 6件（大久保2 髙山1 工藤2 下浦1）
const REAL_SH_APP = [
  sh('2026-07-02', '大久保'), sh('2026-07-27', '大久保'), sh('2026-07-03', '髙山'),
  sh('2026-07-22', '工藤'), sh('2026-07-24', '工藤'), sh('2026-07-10', '下浦')
];
// 紙台帳の遡り投入（測定者空欄・日付は月初仮置き）。★これが分母に入ると全員の % が壊れる
const REAL_SH_PAPER = [];
for (let i = 0; i < 60; i++) REAL_SH_PAPER.push(sh('2026-07-01', '', 'paper'));
const REAL = { records: REAL_KK, shien: REAL_SH_APP.concat(REAL_SH_PAPER), staff: STAFF };

// =====================================================================
sec('① 測定者が空欄の記録は % の分母に入らない');
{
  // 3ヶ月窓（2026-05-01〜2026-08-01）＝空欄2件が窓の中にいる
  const h = render(3, REAL);
  eq(headlineTotal(h), 27, '見出しの実件数は空欄2件を含んだまま 27件');
  eq(noteBase(h), 25, '% の母数は測定者が判明している 25件');
  const r = rows(h).find(x => x.name === '大久保');
  eq(r.count, 11, '大久保の件数は 11件');
  eq(r.pct, 44, '大久保の % は 11/25 = 44%（従来の 11/27 = 41% ではない）');
}

sec('② 見出しの「総測定 N件」は実件数のまま（空欄も数える）');
{
  eq(headlineTotal(render(1, REAL)), 25, '1ヶ月: 実件数 25件（空欄は窓外）');
  eq(headlineTotal(render(2, REAL)), 26, '2ヶ月: 実件数 26件（06-26 の空欄1件を含む）');
  eq(headlineTotal(render(3, REAL)), 27, '3ヶ月: 実件数 27件（05-04 も含む）');
}

sec('③ % の合計が 1／2／3ヶ月すべてで 100%');
{
  eq(sumPct(render(1, REAL)), 100, '1ヶ月の % 合計 = 100%');
  eq(sumPct(render(2, REAL)), 100, '2ヶ月の % 合計 = 100%（修正前は 97%）');
  eq(sumPct(render(3, REAL)), 100, '3ヶ月の % 合計 = 100%（修正前は 93%）');
}

sec('④ 母数は「表示されている行の件数の合計」と必ず一致する（丸め前の不変条件）');
{
  [1, 2, 3].forEach(m => {
    const h = render(m, REAL);
    const sum = rows(h).reduce((s, r) => s + r.count, 0);
    const base = noteBase(h) === null ? headlineTotal(h) : noteBase(h);
    eq(base, sum, m + 'ヶ月: % の母数 = 表示行の件数合計（誰のものでもない件数が分母に無い）');
  });
}

sec('⑤ MEASURER_EXCLUDE 該当者は行が出ず、分母にも入らない');
{
  eq(sandbox.__exclude(), ['代表', '小野', '林'], '除外リストは 代表・小野・林');
  const st = {
    records: [kk('2026-07-10', '大久保'), kk('2026-07-11', '小野'), kk('2026-07-12', '林')],
    shien: [], staff: STAFF
  };
  const h = render(1, st);
  eq(headlineTotal(h), 3, '見出しの実件数は除外者ぶんも含めて 3件（実際に測ったので事実）');
  eq(noteBase(h), 1, '% の母数は表示対象の 1件だけ');
  eq(rows(h).filter(r => r.name === '小野' || r.name === '林').length, 0, '小野・林の行は出ない');
  eq(rows(h).find(r => r.name === '大久保').pct, 100, '大久保が 100%（従来は 1/3 = 33%）');
  eq(sumPct(h), 100, '% の合計 = 100%');
}

sec('⑥ source=\'paper\' の除外は従来どおり効いている（★触っていない）');
{
  const h = render(1, REAL);
  eq(headlineTotal(h), 25, 'paper 60件は総測定にも入らない（25件のまま）');
  eq(noteBase(h), null, '1ヶ月は実件数と母数が同じ＝注記は出ない');
  eq(sumPct(h), 100, '% 合計 100%');
  // paper を app に変えたら 60件ぶん増える＝除外が効いていることの裏取り
  const st2 = { records: REAL_KK, shien: REAL_SH_APP.concat(REAL_SH_PAPER.map(r => Object.assign({}, r, { source: 'app' }))), staff: STAFF };
  eq(headlineTotal(render(1, st2)), 85, 'paper を app にすると 25→85件（＝除外が実際に60件を止めている）');
}

sec('⑦ 2ソース和（個訓シート ∪ 測定記録シート）が壊れていない');
{
  const onlyKk = render(1, { records: REAL_KK, shien: [], staff: STAFF });
  const onlySh = render(1, { records: [], shien: REAL_SH_APP, staff: STAFF });
  const both = render(1, REAL);
  eq(headlineTotal(onlyKk), 19, '個訓シートだけ = 19件（7月分）');
  eq(headlineTotal(onlySh), 6, '測定記録シートだけ = 6件');
  eq(headlineTotal(both), 25, '和 = 25件（旧シートが外れていない）');
  eq(rows(both).find(r => r.name === '大久保').count, 11, '大久保 = 個訓9 + 測定記録2 = 11件');
  eq(rows(both).find(r => r.name === '工藤').count, 3, '工藤 = 個訓1 + 測定記録2 = 3件');
}

sec('⑧ 測定が0件の期間で 0除算しない');
{
  const h = render(1, { records: [], shien: [], staff: STAFF });
  eq(headlineTotal(h), 0, '総測定 0件');
  ok(h.indexOf('NaN') < 0, 'NaN が出ない');
  ok(h.indexOf('Infinity') < 0, 'Infinity が出ない');
  eq(rows(h).every(r => r.pct === 0 && r.count === 0), true, '全員 0件 (0%)');
  eq(noteBase(h), null, '0件のときは注記を出さない');
  // 測定者が空欄の記録しかない場合（母数0・実件数1）
  const h2 = render(1, { records: [kk('2026-07-10', '')], shien: [], staff: STAFF });
  eq(headlineTotal(h2), 1, '実件数は 1件');
  ok(h2.indexOf('NaN') < 0, '母数0でも NaN が出ない');
  eq(rows(h2).every(r => r.pct === 0), true, '母数0なら全員 0%');
}

sec('⑨ 件数バーの幅は分母に依存しない（見た目が変わらない）');
{
  // 最大件数のスタッフが 100%、他はその比。母数の定義を変えても幅は変わらない
  const h = render(3, REAL);
  const r = rows(h);
  const top = r.find(x => x.name === '大久保');
  eq(top.width, 100, '最大件数の大久保のバーは 100%幅');
  eq(r.find(x => x.name === '髙山').width, Math.max(5 / 11 * 100, 2), '髙山は 5/11 の幅');
  eq(r.find(x => x.name === '春山').width, 0, '0件のスタッフは幅0');
  // 空欄記録の有無でバー幅が動かないこと（max は rows＝表示行から取るため）
  const noBlank = render(3, { records: REAL_KK.filter(x => x.sokutei_by), shien: REAL.shien, staff: STAFF });
  eq(rows(noBlank).map(x => x.width), r.map(x => x.width), '空欄記録を除いてもバー幅は同一');
}

sec('⑩ 「最終測定日」は期間窓の外も見る（全期間のまま・★触っていない）');
{
  const st = {
    records: [kk('2026-01-15', '春山'), kk('2026-07-20', '大久保')],
    shien: [], staff: STAFF
  };
  const h = render(1, st);   // 1ヶ月窓 = 2026-07-01〜
  const haruyama = rows(h).find(r => r.name === '春山');
  eq(haruyama.count, 0, '春山は窓内0件');
  eq(haruyama.last, '最終 1/15', '窓外の 2026-01-15 が最終測定日として残る');
}

sec('⑪ 除外者の記録は「最終測定日」にも残らない（行自体が無いので副作用なし）');
{
  const h = render(1, { records: [kk('2026-07-10', '小野')], shien: [], staff: STAFF });
  ok(h.indexOf('小野') < 0, '小野は画面に一切現れない');
  eq(headlineTotal(h), 1, '実件数だけは 1件として残る');
}

sec('⑫ 注記の文言（母数が違うときだけ出す）');
{
  const h3 = render(3, REAL);
  ok(h3.indexOf('※割合は測定者が記録されている 25 件を母数にしています') >= 0, '3ヶ月: 注記が出る');
  const h1 = render(1, REAL);
  ok(h1.indexOf('割合は測定者が記録されている') < 0, '1ヶ月: 実件数と母数が同じなので注記は出ない');
}

console.log('\n===== ' + (fail === 0 ? 'ALL PASS' : 'FAILED') + ' : pass=' + pass + ' fail=' + fail + ' =====');
process.exit(fail === 0 ? 0 : 1);
