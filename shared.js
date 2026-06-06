/* ============================================================
   shared.js — yawaragiボード系アプリ共通基盤（Phase 1）
   作成: 2026-06-06
   読み込み: yawaragi-board.html の <head> 先頭（本体scriptより前）で読む。
            （他アプリへの横展開は別フェーズ。まず yawaragi-board 単体で完結）

   収録内容（Phase 1 = 純粋関数 ＋ UI共通のみ）:
     §B utils : kataToHira / hiraToKata
     §C ui    : openModal / closeModal / showToast

   ※ API URL定数(YAWARAGIBOARD_API_URL)・DAY_NAMES等は、読み込み順/重複定義
      リスク回避のため現時点では html 内に残置（Phase 2以降で移動を検討）。
   ※ 名前検索(absSearchName系)は欠席タブのDOM/absStateに密結合のため shared 化しない
      （設計書 2026-06-06-yawaragiボードshared.js切り出し設計.md §2-6 参照）。
   ============================================================ */

/* ===== §A 定数 ===== */

// yawaragiボードGAS本体の唯一の真実。URL変更時はここ1箇所だけ直す。
// 旧名 ABS_BOARD_API_URL / WB_BOARD_API_URL / INTAKE_API_URL / HAICHI_SYNC_URL は
// html本体側で「= YAWARAGIBOARD_API_URL」の後方互換エイリアスとして定義している。
const YAWARAGIBOARD_API_URL = 'https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec';

// 曜日名（日曜始まり = JavaScript Date.getDay() の 0=日 に対応。並びを変えると全曜日表示がずれる）
const DAY_NAMES = ['日','月','火','水','木','金','土'];

/* ===== §F UserStore（利用者マスタの単一の真実・2026-06-06 phase3a-1） =====
   absUserCache / absUserLoaded をクロージャで隠蔽し、外部から直接書けなくする。
   ※ loadFromAPI は html本体側で後から定義される absLoadUsersFromAPI に委譲するが、
      即時参照（loadFromAPI: absLoadUsersFromAPI）にすると shared.js 読込時点では
      未定義で ReferenceError → 全タブ停止する。実行時に解決される遅延メソッドにする。
   ※ 3a-1 では導入のみ（get/isLoaded の呼び出し差し替えは 3a-2 以降）。既存挙動に影響なし。 */
const UserStore = (function () {
    let _cache = [];
    let _loaded = false;
    return {
        get() { return _cache; },
        add(user) { _cache.push(user); }, // 3a-5-2: 動的追加（出席/欠席の補完用）
        isLoaded() { return _loaded; },
        _set(users) { _cache = Array.isArray(users) ? users : []; _loaded = true; },
        _setLoaded(flag) { _loaded = flag; },
        loadFromAPI() {
            if (typeof absLoadUsersFromAPI === 'function') {
                return absLoadUsersFromAPI.apply(null, arguments);
            }
            return Promise.resolve(_cache);
        }
    };
})();

/* ===== §G AttStore（出席・長期休み系の共有state・2026-06-06 phase3b-1） =====
   absLongTermMap / attLastData / attResumedTodayNames をクロージャで隠蔽し集約。
   ※ 3b-1 では導入のみ（置換は 3b-2 以降）。既存挙動に影響なし。 */
const AttStore = (function () {
    let _longTerm = {};
    let _lastData = { am: [], pm: [] };
    let _resumedToday = [];
    return {
        longTerm()         { return _longTerm; },
        setLongTerm(m)     { _longTerm = m || {}; },
        lastData()         { return _lastData; },
        setLastData(d)     { _lastData = d || { am: [], pm: [] }; },
        resumedToday()     { return _resumedToday; },
        setResumedToday(a) { _resumedToday = a || []; },
    };
})();

/* ===== §B utils（純粋関数・DOM非依存） ===== */

// カタカナ→ひらがな変換
function kataToHira(str) {
    return str.replace(/[ァ-ヶ]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

// ひらがな→カタカナ変換
function hiraToKata(str) {
    return str.replace(/[ぁ-ゖ]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
}

/* ===== §C ui（モーダル・トースト） =====
   前提DOM契約: モーダルは .show クラスで開閉／トーストは #toast 要素を使用。
   ※ .modal-overlay の外側クリックで閉じるイベント登録は DOM依存の即時実行のため
      html 本体側（DOM構築後の位置）に残置している。 */

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function showToast(msg, duration) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration || 2000);
}

/* ===== §D net（GAS通信基盤・2026-06-06 phase2移動） =====
   gasPost: 全4タブ30箇所から呼ばれる汎用POST（リトライ3回・no-cors）。
   ※ no-cors のため GAS の {success:false} は取得不可。検証はJSONP往復(verifyAbsenceInGAS)で行う。
   ※ URL参照は ABS_BOARD_API_URL から YAWARAGIBOARD_API_URL に統一（同値・shared.js内で自己完結）。 */

// リトライ付きGAS POST送信（3回まで再試行。失敗時はスタッフに警告表示）
async function gasPost(data, label) {
    const maxRetries = 3;
    for (let i = 1; i <= maxRetries; i++) {
        try {
            await fetch(YAWARAGIBOARD_API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            // 欠席系の更新を他アプリに通知（出勤＆送迎表のリアルタイム反映用）
            if (data && _isAbsenceAction(data.action)) {
                notifyAbsenceUpdate(data.date || data.dateFrom || data.startDate || '');
            }
            return true; // ネットワーク送信成功
        } catch (err) {
            console.error('GAS送信エラー (' + i + '/' + maxRetries + '): ' + (label || ''), err);
            if (i < maxRetries) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
    showToast('⚠️ 送信失敗！ネットワークを確認してください', 5000);
    return false;
}

// 欠席登録の検証付きPOST（POST後にJSONPで実際に記録されたか確認。未記録なら再試行）
async function gasPostAbsenceWithVerify(data, label) {
    const maxRetries = 3;
    for (let i = 1; i <= maxRetries; i++) {
        try {
            await fetch(YAWARAGIBOARD_API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (err) {
            console.error('GAS送信エラー (' + i + '/' + maxRetries + ')', err);
            if (i < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
            showToast('❌ 送信に失敗しました。ネットワークを確認してください', 5000);
            return false;
        }
        // 3秒待ってからGASに記録されたか検証
        await new Promise(r => setTimeout(r, 3000));
        const verified = await verifyAbsenceInGAS(data.name, data.dates ? data.dates[0] : data.startDate);
        if (verified) {
            showToast('✅ ' + (label || '送信') + ' 完了（通知も送信済み）', 3000);
            if (data && _isAbsenceAction(data.action)) {
                notifyAbsenceUpdate(data.date || (data.dates ? data.dates[0] : '') || data.startDate || '');
            }
            return true;
        }
        console.warn('検証失敗 (' + i + '/' + maxRetries + ')');
    }
    showToast('❌ 送信できませんでした。もう一度登録してください', 5000);
    return false;
}

// JSONP検証: GASスプレッドシートに欠席記録が存在するか確認
function verifyAbsenceInGAS(name, date) {
    return new Promise(resolve => {
        const cbName = '_verifyAbs_' + Date.now();
        const script = document.createElement('script');
        script.src = YAWARAGIBOARD_API_URL + '?action=absences&callback=' + cbName + '&t=' + Date.now();
        const timeout = setTimeout(() => {
            delete window[cbName];
            if (script.parentNode) script.remove();
            resolve(false);
        }, 8000);
        window[cbName] = function(data) {
            clearTimeout(timeout);
            delete window[cbName];
            if (script.parentNode) script.remove();
            if (!data || !data.success || !data.absences) { resolve(false); return; }
            const found = data.absences.some(a => a.name === name && a.date === date);
            resolve(found);
        };
        script.onerror = () => {
            clearTimeout(timeout);
            delete window[cbName];
            resolve(false);
        };
        document.body.appendChild(script);
    });
}

/* ===== §E broadcast（クロスアプリ通知・2026-06-06 phase2移動） =====
   同一ブラウザ内の他アプリ（出勤＆送迎表等）へ欠席更新を通知。
   チャンネル名 'yawaragi-absence' は受信側と一致させる契約（変更不可）。
   ※ gasPost(§D) から呼ばれる。BroadcastChannel はブラウザ内通知でGAS外部通信ではない。 */

let _absenceBcChannel = null;
function notifyAbsenceUpdate(dateStr) {
    try {
        if (!_absenceBcChannel) {
            _absenceBcChannel = new BroadcastChannel('yawaragi-absence');
        }
        _absenceBcChannel.postMessage({
            type: 'updated',
            date: dateStr || '',
            timestamp: Date.now()
        });
    } catch (e) {
        // 古いブラウザは無視
    }
}
// 欠席系のactionかどうか判定
function _isAbsenceAction(action) {
    return action === 'absence' || action === 'long_term_absence' || action === 'cancel_absence';
}
