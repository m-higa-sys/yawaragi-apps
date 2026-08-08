/* day-gate.js — 日付またぎ検知（2026-08-07 新規）
 *
 * ■ 何を塞ぐか
 *   現場のiPadはアプリを開きっぱなしにする。0時をまたいでも画面は再読み込みされないため、
 *   「今日」を起点にした表示（当日の一覧・当日データ・"未来の日付を表示中" バナー）が
 *   前日のまま固まり、スタッフがそれと気づかずに使ってしまう。
 *   2026-08-07 に session-board で実際に発生（日付欄は8/7なのにバナーは「1日後」のまま）。
 *   注意喚起ではなく構造で塞ぐのがこのファイルの役目。
 *
 * ■ 使い方（各アプリ側）
 *     <script src="day-gate.js?v=..."></script>       ← <head> に1行足すだけ
 *     ywToday()                                        // 今日（JST固定・YYYY-MM-DD）
 *     ywOnDayChange(function (newToday, prevToday) {   // 日付をまたいだ瞬間に1回だけ呼ばれる
 *       if (表示中の日付 === prevToday) { ...(A) 表示日付を newToday へ進めて当日データを読み直す }
 *       else                           { ...(B) 表示日付は動かさず、バナーの基準日だけ引き直す }
 *     });
 *
 * ■ 「今日」は JST固定
 *   端末のタイムゾーンがズレても境界判定が狂わないようにする（利用曜日変更アプリのUTCズレバグの反省）。
 *   GAS側も Asia/Tokyo 基準なので、これで両者が揃う。genba.html の jstTodayStr() と同方式。
 *
 * ■ 検知経路は3つ
 *   1. visibilitychange … タブ切替・スリープからの復帰（いちばん多い経路）
 *   2. pageshow        … bfcache からの復帰（戻るボタン等。visibilitychange が飛ばない端末対策）
 *   3. 60秒タイマー     … 前面に出したまま0時をまたぐケース
 *
 * ■ やらないこと（意図的な制約）
 *   - 通信しない。60秒タイマーはローカルで日付を計算するだけで、GASも version.txt も叩かない
 *     （板GASの同時実行数対策＝genba.html の可視性制御に逆行させないため）。
 *   - location.reload / location.replace をしない。入力途中の内容が消えるため、
 *     日付またぎ時は各アプリの「データ再取得」だけで済ませる。
 *   - 再取得の失敗は各アプリの既存エラー表示に任せる。ここでUIは作らない。
 *
 * ■ 拡張ポイント（ywOnTick）— 将来の版チェックの相乗り先
 *   版ゲート（<head>最先頭の version.txt fetch）は「読み込み時に1回きり」なので、
 *   開きっぱなしの端末は版を上げても新版に切り替わらない、という別の穴がある。
 *   それを塞ぐときは、ここの60秒タイマーに ywOnTick で相乗りさせるのが正しい置き場所。
 *   ★ただし版チェック本体はこのファイルには実装しない（2026-08-07 時点の決定）。
 *     直すときも自動リロードではなく「新しい版があります」の案内バナー方式にすること。
 *     scripts/test-day-gate.js がこのファイルに fetch / version.txt が入らないことを固定している。
 */
(function (global) {
  'use strict';

  // 二重読み込みガード（<script> の重複記載でタイマーやコールバックを増やさない）
  if (global.ywDayGate) return;

  var TICK_MS = 60000;

  // ---- 今日（JST固定）。純粋関数なのでテストから直接叩ける ----
  function jstYMD(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    function g(type) {
      for (var i = 0; i < parts.length; i++) { if (parts[i].type === type) return parts[i].value; }
      return '';
    }
    return g('year') + '-' + g('month') + '-' + g('day');
  }

  // 時計。テストからのみ差し替える（本番は常に実時刻）
  var _clock = function () { return jstYMD(new Date()); };

  function ywToday() { return _clock(); }

  // 起動時の「今日」を保持する。日付またぎの判定基準はこの値ひとつ（単一の正）。
  var held = ywToday();

  var dayCbs = [];
  var tickCbs = [];

  function ywOnDayChange(cb) {
    if (typeof cb === 'function') dayCbs.push(cb);
  }
  // 60秒タイマーの拡張ポイント。日付が変わっていなくても毎回呼ばれる（前面時のみ）。
  function ywOnTick(cb) {
    if (typeof cb === 'function') tickCbs.push(cb);
  }

  function runAll(list, args, label) {
    for (var i = 0; i < list.length; i++) {
      // 1つが例外を投げても残りは実行する。画面全体を巻き込んで止めない。
      try { list[i].apply(null, args); }
      catch (e) { if (global.console && console.error) console.error('[day-gate] ' + label + ' error', e); }
    }
  }

  // 日付を数え直し、変わっていたら1回だけ通知する。
  // ★保持値の更新はコールバックより先。コールバックが失敗しても再発火し続けないため。
  function check(reason) {
    var now = ywToday();
    if (now === held) return false;
    var prev = held;
    held = now;
    runAll(dayCbs, [now, prev, reason || ''], 'onDayChange');
    return true;
  }

  // ---- 検知経路1: 可視化復帰 ----
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'hidden') return;   // 隠れたときは何もしない（戻ってきた時にやる）
      check('visibility');
    });
  }

  // ---- 検知経路2: bfcache 復帰 ----
  if (global.addEventListener) {
    global.addEventListener('pageshow', function () { check('pageshow'); });
  }

  // ---- 検知経路3: 60秒タイマー（前面のまま0時をまたぐケース）----
  function onTick() {
    if (global.document && global.document.hidden) return;   // 非表示中は完全に何もしない
    check('timer');
    runAll(tickCbs, [held, 'timer'], 'onTick');              // ← 版チェックはここに相乗りさせる（本体は未実装）
  }
  global.setInterval(onTick, TICK_MS);

  // ---- 公開 ----
  global.ywToday = ywToday;
  global.ywOnDayChange = ywOnDayChange;
  global.ywOnTick = ywOnTick;
  global.ywDayGate = {
    TICK_MS: TICK_MS,
    jstYMD: jstYMD,
    today: ywToday,
    heldToday: function () { return held; },
    check: check,
    // 以下2つはテスト専用。本番コードから呼ばないこと。
    __setClock: function (fn) { _clock = (typeof fn === 'function') ? fn : function () { return jstYMD(new Date()); }; },
    __resetHeld: function () { held = ywToday(); }
  };
})(typeof window !== 'undefined' ? window : this);
