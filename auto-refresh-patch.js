// yawaragi共通パッチ：自動更新時のスクロール飛び防止
// setInterval（5秒以上のもの）に対して、コールバック実行前後で
// スクロール位置を保存・復元する。1秒以下のアニメ用タイマーは対象外。
(function() {
  if (window.__autoRefreshPatched) return;
  window.__autoRefreshPatched = true;

  var origSetInterval = window.setInterval;
  window.setInterval = function(fn, delay) {
    if (typeof fn !== 'function' || !delay || delay < 5000) {
      return origSetInterval.apply(this, arguments);
    }
    var wrapped = function() {
      var y = window.scrollY;
      var ret;
      try { ret = fn.apply(this, arguments); } catch (e) { console.error(e); }
      var restore = function() {
        if (Math.abs(window.scrollY - y) > 2) {
          window.scrollTo({ top: y, behavior: 'instant' });
        }
      };
      if (ret && typeof ret.then === 'function') {
        ret.finally ? ret.finally(function() { setTimeout(restore, 0); })
                    : ret.then(function() { setTimeout(restore, 0); }, function() { setTimeout(restore, 0); });
      } else {
        setTimeout(restore, 0);
      }
      return ret;
    };
    return origSetInterval.call(window, wrapped, delay);
  };
})();
