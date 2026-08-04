// intake 必須判定の「画面 ⇄ サーバー」一致テスト（2026-08-04 Phase①）
// 対象: intake.html saveIntakeModalNew（画面判定） × gas/yawaragi-board/intake-required-core.js（サーバー判定）
// 実行: node scripts/test-intake-required-parity.js
//
// 背景:
//   2026-07-29 の事故は「画面が通した保存をサーバーが黙って捨てた」こと（＋no-corsで拒否が読めなかったこと）が本体。
//   intake-required-core.js と test-intake-required-core.js は "サーバー側の仕様" を単体で固定しているが、
//   画面側の条件が動いたときに両者がズレたことを検知する仕組みは無かった。
//   本テストは画面の実コードを intake.html から抽出して実際に走らせ、サーバー判定と突き合わせる。
//
// 守る不変条件:
//   【A】画面が保存に進めた入力は、サーバーも必ず受理する（＝黙って捨てられる経路をゼロにする）★本命・一方向
//   【B】画面が止めた入力は、サーバーも受理しない（現時点では A と対で成立。段階入力フェーズで画面側だけ
//        緩める設計のため、B は将来意図的に破られうる。破るときはこのテストを一緒に更新すること）
//
// 判定の範囲:
//   氏名 / ふりがな / TEL の3項目のみ。種別・介護度・ペースメーカー・連絡元区分の妥当性は
//   createIntake 側に据え置き（cherry-pick でも未変更）なので、本テストでは常に充足させて
//   「名前とTELの軸だけ」が結果を決めるようにしている。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INTAKE = fs.readFileSync(path.join(ROOT, 'intake.html'), 'utf8');
const core = require(path.join(ROOT, 'gas', 'yawaragi-board', 'intake-required-core.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// ===== 画面関数の抽出（test-intake-post-verify.js と同方式・ブレース対応） =====
function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function ' + name + ' が無い（未実装＝RED）');
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  const braceOpen = src.indexOf('{', start);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const FRONT_SRC = extractFn(INTAKE, 'saveIntakeModalNew');

// 画面の実コードを、DOM依存だけスタブして実際に走らせる。
// 戻り: { accepted:boolean, posted:object|null } … posted はサーバーへ実際に送られる payload。
async function runFront(fields, suspend) {
  let posted = null;
  const stubs = {
    // モーダルの値収集だけ差し替え（判定ロジック本体には触らない）
    collectIntakeModalPayload: () => Object.assign({
      // 名前/TEL 以外の本保存ゲートは充足させ、判定軸を氏名・ふりがな・TELに絞る
      連絡元区分: 'self',
      種別: 'visit',
      介護度: '要介護1'
    }, fields),
    alert: () => {},
    gstepOpen: () => {},
    formatJPPhone: (t) => t,
    localStorage: { getItem: () => 'テスト職員' },
    closeIntakeModal: () => {},
    loadIntakeList: () => {},
    setTimeout: () => {},
    gasPostIntake: async (p) => { posted = p; return true; }
  };
  const names = Object.keys(stubs);
  const factory = new Function(...names, 'return (' + FRONT_SRC + ');');
  const fn = factory(...names.map(n => stubs[n]));
  await fn(suspend);
  return { accepted: posted !== null, posted: posted };
}

// サーバー判定。画面が送るはずの payload（全記入済 込み）で評価する。
function serverAccepts(fields, suspend) {
  const payload = Object.assign({}, fields, { 全記入済: !suspend });
  return core.intakeRequiredCheck_(payload).ok === true;
}

// ===== 真理値表: 氏名 / ふりがな / TEL の在無 8通り × 中断保存 / 本保存 =====
const V = { 氏名: '比嘉太郎', ふりがな: 'ひがたろう', TEL: '0493-00-0000' };
const COMBOS = [];
for (let bits = 0; bits < 8; bits++) {
  const f = {};
  f.氏名     = (bits & 1) ? V.氏名 : '';
  f.ふりがな = (bits & 2) ? V.ふりがな : '';
  f.TEL      = (bits & 4) ? V.TEL : '';
  COMBOS.push(f);
}
const label = (f) => '氏名=' + (f.氏名 ? '有' : '－') + ' ふりがな=' + (f.ふりがな ? '有' : '－') + ' TEL=' + (f.TEL ? '有' : '－');

(async () => {
  for (const mode of [{ suspend: true, name: '中断保存' }, { suspend: false, name: '本保存' }]) {
    console.log('\n[' + mode.name + '] 画面 ⇄ サーバー 一致（' + COMBOS.length + '通り）');
    for (const f of COMBOS) {
      const front = await runFront(f, mode.suspend);
      const server = serverAccepts(f, mode.suspend);

      // 【A】画面が通したらサーバーも通す（★本命・これが破れると入力が黙って消える）
      if (front.accepted) {
        ok(server === true, '【A】' + label(f) + ' → 画面OK かつ サーバーOK');
      }
      // 【B】画面が止めたらサーバーも止める
      if (!front.accepted) {
        ok(server === false, '【B】' + label(f) + ' → 画面NG かつ サーバーNG');
      }
    }
  }

  // ===== 画面が実際に送る payload の 全記入済 が、サーバー判定の分岐と噛み合っているか =====
  // （中断=false／本保存=true。ここがズレると本保存が中断ルールで通る等の穴になる）
  console.log('\n[payload] 全記入済 フラグが保存モードと一致する');
  const susp = await runFront({ ふりがな: V.ふりがな }, true);
  ok(susp.accepted && susp.posted.全記入済 === false, '中断保存の payload は 全記入済:false');
  const full = await runFront({ 氏名: V.氏名, TEL: V.TEL }, false);
  ok(full.accepted && full.posted.全記入済 === true, '本保存の payload は 全記入済:true');

  // ===== 事故の本命ケースを名指しで固定 =====
  console.log('\n[事故再現] 2026-07-29 に消えていた入力が、いまは画面もサーバーも通す');
  for (const c of [
    { f: { ふりがな: V.ふりがな }, n: 'ふりがなだけ 中断保存' },
    { f: { TEL: V.TEL }, n: 'TELだけ 中断保存' },
    { f: { 氏名: V.氏名 }, n: '氏名だけ（TELなし）中断保存' }
  ]) {
    const front = await runFront(c.f, true);
    ok(front.accepted === true, c.n + ' → 画面が保存に進む');
    ok(serverAccepts(c.f, true) === true, c.n + ' → サーバーが受理する（旧コードは黙って捨てていた）');
  }
  // 本保存で「ふりがな＋TEL・氏名なし」＝旧 `!data.氏名` が捨てていた本命
  const kana = await runFront({ ふりがな: V.ふりがな, TEL: V.TEL }, false);
  ok(kana.accepted === true, 'ふりがな＋TEL・氏名なし 本保存 → 画面が保存に進む');
  ok(serverAccepts({ ふりがな: V.ふりがな, TEL: V.TEL }, false) === true,
     'ふりがな＋TEL・氏名なし 本保存 → サーバーが受理する（旧 !data.氏名 では捨てられていた）');

  console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})();
