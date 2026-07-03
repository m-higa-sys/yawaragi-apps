/* applauncher-render.js — portal.html / admin.html 共通のランチャー描画(1か所メンテ)
   アプリ台帳(getAppRegistry)のJSON配列を、カテゴリ順→カテゴリ内表示順で描画する。
   XSS防止のためDOM生成(innerHTML不使用)。台帳は誰でも書ける前提で href は https のみ許可。 */
(function (global) {
  // カテゴリ表示順(共通)
  var CAT_ORDER = ['メインボード', '毎日の業務', '利用者の記録', '相談員業務', '事務・手続き', '設備・備品', 'その他'];
  // カテゴリ→CSSクラス／見出し(portal.htmlの現行見た目に合わせる)
  var CAT_META = {
    'メインボード':   { cls: 'cat-main',   title: '⭐ メインボード' },
    '毎日の業務':     { cls: 'cat-daily',  title: '🚐 毎日の業務' },
    '利用者の記録':   { cls: 'cat-user',   title: '📊 利用者の記録' },
    '相談員業務':     { cls: 'cat-soudan', title: '🧑‍💼 相談員業務' },
    '事務・手続き':   { cls: 'cat-monthly',title: '📋 事務・手続き' },
    '設備・備品':     { cls: 'cat-equip',  title: '🛠 設備・備品' },
    'その他':         { cls: 'cat-rule',   title: '📚 その他' }
  };

  function safeHref(u) { return (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : ''; }
  function ordNum(v) { var n = parseInt(v, 10); return isNaN(n) ? 999 : n; }

  // ?v=<クリック時刻> を付けたURLを返す（キャッシュ回避）。既存の v= は除去して付け直す。#fragment 対応。
  function bustHref(u) {
    var hash = '', i = u.indexOf('#');
    if (i >= 0) { hash = u.slice(i); u = u.slice(0, i); }
    var q = '', j = u.indexOf('?');
    if (j >= 0) { q = u.slice(j + 1); u = u.slice(0, j); }
    var parts = q ? q.split('&').filter(function (p) { return p.slice(0, 2) !== 'v=' && p !== 'v'; }) : [];
    parts.push('v=' + Date.now());
    return u + '?' + parts.join('&') + hash;
  }

  // リンクを「押した瞬間」に ?v=Date.now() へ書き換える。
  // ページを開きっぱなしでも、クリックのたびに新しい値になるので常に最新版が取れる。
  function attachCacheBust(btn, href) {
    function upd() { btn.setAttribute('href', bustHref(href)); }
    btn.addEventListener('click', upd);       // タップ・左クリック・Enter
    btn.addEventListener('auxclick', upd);    // 中クリック（新しいタブ）
    btn.addEventListener('contextmenu', upd); // 右クリック→新しいタブで開く
  }

  // apps: getAppRegistry の配列 / rootEl: 描画先 / opts.includeInternal: admin用(internalもバッジ表示)
  // 戻り値: 表示したアプリ件数
  function render(apps, rootEl, opts) {
    opts = opts || {};
    var includeInternal = !!opts.includeInternal;
    // フィルタ(retired除外・portalはstaffのみ)＋URL重複排除
    var seen = {}, list = [];
    // 注: scope=staff の応答には「公開区分」フィールドが無い(サーバ側でstaff限定済)。
    //     scope=all(admin)は staff/internal/retired を含む→retiredのみ除外し staff+internal を表示。
    (apps || []).forEach(function (a) {
      if (a['公開区分'] === 'retired') return;
      var u = safeHref(a['スタッフ用URL']); if (!u) return;
      var k = u.toLowerCase(); if (seen[k]) return;
      seen[k] = true; list.push(a);
    });
    // カテゴリでまとめる
    var groups = {};
    list.forEach(function (a) { var c = a['カテゴリ'] || 'その他'; (groups[c] = groups[c] || []).push(a); });
    var cats = Object.keys(groups).sort(function (x, y) {
      var ix = CAT_ORDER.indexOf(x), iy = CAT_ORDER.indexOf(y);
      if (ix < 0) ix = 999; if (iy < 0) iy = 999;
      return ix - iy || x.localeCompare(y, 'ja');
    });
    rootEl.textContent = '';
    var total = 0;
    cats.forEach(function (c) {
      var meta = CAT_META[c];
      var sec = document.createElement('section');
      sec.className = 'category ' + (meta ? meta.cls : 'cat-extra');
      var h = document.createElement('h2'); h.className = 'category-title';
      h.textContent = meta ? meta.title : ('📁 ' + c);
      sec.appendChild(h);
      var wrap = document.createElement('div'); wrap.className = 'apps';
      groups[c].sort(function (a, b) {
        return ordNum(a['表示順']) - ordNum(b['表示順']) || (a['アプリ名'] || '').localeCompare(b['アプリ名'] || '', 'ja');
      });
      groups[c].forEach(function (a) {
        var href = safeHref(a['スタッフ用URL']); if (!href) return;
        var isMain = (c === 'メインボード');
        var btn = document.createElement('a');
        btn.className = 'app-btn' + (isMain ? ' app-main' : '');
        btn.setAttribute('href', href);
        attachCacheBust(btn, href); // クリック時に ?v=Date.now() を付与（キャッシュ回避）
        var ic = document.createElement('span'); ic.className = 'icon'; ic.textContent = a['icon'] || '📄';
        var nm = document.createElement('span');
        nm.textContent = (a['アプリ名'] || '(名称未設定)') + (isMain ? '（現場のメイン画面）' : '');
        btn.appendChild(ic); btn.appendChild(nm);
        if (a['説明']) btn.setAttribute('title', a['説明']);
        if (includeInternal && a['公開区分'] === 'internal') {
          var bd = document.createElement('span'); bd.className = 'badge-internal'; bd.textContent = '内部'; btn.appendChild(bd);
        }
        wrap.appendChild(btn); total++;
      });
      sec.appendChild(wrap); rootEl.appendChild(sec);
    });
    return total;
  }

  global.LauncherRender = { CAT_ORDER: CAT_ORDER, CAT_META: CAT_META, safeHref: safeHref, render: render, bustHref: bustHref, attachCacheBust: attachCacheBust };
})(window);
