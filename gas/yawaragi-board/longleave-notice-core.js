// 長期休み 月1連絡 → 伝達ボード通知の判定・本文生成（純関数）
// テスト: scripts/test-longleave-notice.js ／ 呼び出し元: コード.js longleaveNotify()
//
// 設計（2026-07-31 社長承認）:
//   ・伝達ボードの id 列(col0)に固定キー 'longleave-contact' を使う「単一キー・繰り越し方式」。
//     未連絡が残る限り同じ1行の本文を更新し続け、0名になったら done=true で締める（履歴に残す）。
//     月次キーにすると前月分が未完了のまま2件並ぶため、社長判断で単一キーを採用。
//   ・O列ゲート方式：デフォルト＝載せない。'対象' と明示された人だけが本文に載る。
//     「載ってはいけない人（ご逝去・家族と別の話が進行中 等）が自動で載る」事故を構造的に潰すため。
//   ・月1判定は既存 computeLongLeaveFlags_ の「月1超過」と同一ルール。判定を二重に持たない。
//   ・キーは他メッセージ（db_*・furikae-funou-*・kunren-hold-*・移行シード）に絶対に触れないよう厳格化。
//   ※これは通知の状態管理であって台帳の破壊ではない（連絡実績の正本は「出欠変更」J/K列）。

var LONGLEAVE_NOTICE_KEY = 'longleave-contact';

// 単一キー方式。完全一致のみ有効＝月次キー形式や他メッセージidは弾く。
function longleaveValidKey_(key) {
  return String(key == null ? '' : key).trim() === LONGLEAVE_NOTICE_KEY;
}

// values: 伝達シート getDataRange().getValues()（行0=ヘッダ・ID列=0）。
// 戻り値: { op:'add'|'update'|'close'|'noop'|'reject', rowIndex } rowIndex=values 0基準行（無ければ-1）
//   本文あり: 未存在=add / 既存=update
//   本文なし: 既存=close(done化＝全員完了) / 未存在=noop
//   キー不正: reject（＝他行を絶対に指さない）
function longleaveDecide_(values, key, body) {
  if (!longleaveValidKey_(key)) return { op: 'reject', rowIndex: -1 };
  var target = LONGLEAVE_NOTICE_KEY;
  var idx = -1;
  if (values) {
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === target) { idx = i; break; }
    }
  }
  var b = String(body == null ? '' : body).trim();
  if (!b) return { op: idx === -1 ? 'noop' : 'close', rowIndex: idx };
  return { op: idx === -1 ? 'add' : 'update', rowIndex: idx };
}

// O列「月1連絡」の正規化。完全一致のみ採用し、想定外の値は '' （＝載せない側）に倒す。
// '対象外' を '対象' の部分一致で拾わないよう、必ず完全一致で判定する。
function longleaveGateOf_(v) {
  var s = String(v == null ? '' : v).replace(/^[\s　]+|[\s　]+$/g, '');
  return (s === '対象' || s === '対象外') ? s : '';
}

// 月1超過判定。computeLongLeaveFlags_（コード.js）の「月1超過」と同一ルール:
//   最終連絡日があれば そこから28日 / 一度も連絡が無ければ 長期休み開始日から28日。
function longleaveIsOverdue_(rec) {
  if (!rec) return false;
  var hasLast = !!rec.lastContact;
  var dslc = rec.daysSinceLastContact || 0;
  var elapsed = rec.elapsedDays || 0;
  return (dslc >= 28 && hasLast) || (!hasLast && elapsed >= 28);
}

// getLongLeaveList の配列から、投稿対象・承認待ち・除外を仕分ける。
//   targets: 本文に載せる氏名（'対象' かつ 月1超過）。入力順＝経過日数の降順を保つ。
//   pendingCount: O列が空欄＝社長がまだ「対象/対象外」を決めていない人数（朝報告に出す）。
//     期限前でも計上する。放置されると永久に投稿されず連絡漏れになるため、検知対象は「未判断」そのもの。
//   excludedCount: '対象外'。承認待ちに混ぜない（社長が判断済みなので督促しない）。
function longleaveSelectTargets_(list) {
  var targets = [], pendingCount = 0, excludedCount = 0;
  var arr = Array.isArray(list) ? list : [];
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i] || {};
    var gate = longleaveGateOf_(r.monthlyContactGate);
    if (gate === '対象外') { excludedCount++; continue; }
    if (gate === '') { pendingCount++; continue; }
    if (longleaveIsOverdue_(r)) targets.push(String(r.name || '').trim());
  }
  return { targets: targets, pendingCount: pendingCount, excludedCount: excludedCount };
}

// 伝達ボード本文（2026-07-31 社長承認済みテンプレ。氏名と人数だけが差し替わる）。
// 「次回連絡予定日」の行は同日の仕様変更（L列 自動入力の廃止）を反映済み。
// 0名なら空文字を返す＝longleaveDecide_ が close（締め）を返す。
//
// 2026-08-01 社長指示: スタッフ個人名を本文から外し、役割名（相談員）で書く。
//   毎月自動で飛ぶ文面なので、担当が代わるたびにテンプレを直す運用にしないため。
//   宛先も個人('勝又')から '相談員' グループへ変更（recipients はマスタから自動確定）。
function longleaveBuildBody_(names) {
  var list = (Array.isArray(names) ? names : []).filter(function (n) { return String(n || '').trim(); });
  if (!list.length) return '';
  var lines = [
    '【相談員】長期休み中の方への月1連絡のお願い',
    '',
    '長期でお休み中の方には、月に1回こちらから状況確認の',
    'お電話を入れる決まりになっています。',
    '下記' + list.length + '名が未連絡です。上から順にお願いします。',
    ''
  ];
  for (var i = 0; i < list.length; i++) lines.push('■ ' + String(list[i]).trim() + 'さん');
  return lines.concat([
    '',
    '【聞くこと】',
    '・お体の具合はいかがか',
    '・復帰の見通しが立ちそうか（未定でもOK）',
    'ご家族が対応された場合は、そのままご家族に伺って結構です。',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '【記録のしかた】※電話のあと必ず入れてください',
    '',
    '▼ 開く画面',
    'https://m-higa-sys.github.io/yawaragi-apps/leave-terminate.html',
    '開くとすぐ「長期休み」の一覧が出ます。',
    '',
    '▼ 手順',
    '1. 連絡した方の行の、赤い「📞 連絡入力」を押す',
    '2. 出てきた画面で上から順に押す',
    '   ・担当者 → ご自身の名前を押す',
    '   ・連絡方法 → 電話',
    '   ・結果 → 次の3つから1つ',
    '       「予定通り再開」',
    '       「再開日を変更」→ 右の日付欄に新しい日を入れる',
    '       「再開日 未定」',
    '   ・メモ → 任意（空でもOK）',
    '   ・次回連絡予定日 → 空欄のままでOK',
    '     （退院日が決まっているなど、個別に日を決めたい時だけ入力）',
    '3. 右下の「保存」を押す',
    '',
    '▼ ここが一番大事です',
    '保存を押したあと、画面を一度読み込み直して、',
    'その方の表示が',
    '   🔴 まだ連絡なし → ⏳ 前回連絡 ○/○',
    'に変わっているか目で見て確認してください。',
    '',
    '保存に失敗していても画面には「✅成功」と出てしまいます。',
    '表示が変わっていることだけが、記録できた証拠です。',
    '変わっていなければ、もう一度入力し直してください。',
    '',
    '▼ 注意',
    '緑の「🔄 再開登録」は押さないでください。',
    'これは実際に利用を再開する方の登録ボタンで、別ものです。',
    '連絡の記録は赤い「📞 連絡入力」だけです。'
  ]).join('\n');
}

// 社長へのメール通知は「対象者の顔ぶれに増減があった時だけ」。並び替えだけでは送らない。
// prev が null/undefined＝初回。今回0名なら送らない（何も起きていないのに毎朝メールを出さないため）。
function longleaveRosterChanged_(prev, next) {
  var a = Array.isArray(prev) ? prev.slice() : null;
  var b = (Array.isArray(next) ? next : []).slice();
  if (a === null) return b.length > 0;
  if (a.length !== b.length) return true;
  a.sort(); b.sort();
  for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return true; }
  return false;
}

// 旧 dailyLongLeaveReminder が量産したタスクボード行かどうか（掃除対象の判定）。
// 「○○様 長期休み利用連絡」の形だけを拾う。「様」の前に氏名が無いものは誤爆防止で対象外。
function longleaveIsLegacyTask_(taskName) {
  var s = String(taskName == null ? '' : taskName).trim();
  return /^.+様 長期休み利用連絡$/.test(s);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LONGLEAVE_NOTICE_KEY: LONGLEAVE_NOTICE_KEY,
    longleaveValidKey_: longleaveValidKey_,
    longleaveDecide_: longleaveDecide_,
    longleaveGateOf_: longleaveGateOf_,
    longleaveIsOverdue_: longleaveIsOverdue_,
    longleaveSelectTargets_: longleaveSelectTargets_,
    longleaveBuildBody_: longleaveBuildBody_,
    longleaveRosterChanged_: longleaveRosterChanged_,
    longleaveIsLegacyTask_: longleaveIsLegacyTask_
  };
}
