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

// 出席予定データのlocalStorageキー（出席アプリ/リマインド等で共有・日付ごと最大7日キャッシュ）
// ※ board.html本体側に同名constが残っている間は、出席アプリ切り出し時に二重宣言へ注意（週刊チェックリスト項目3）。
const ATT_CACHE_KEY = 'yawaragi_att_cache';

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

/* ===== §H router（タブ初期化レジストリ・2026-06-06 phase3c-1） =====
   各タブが自分の初期化関数を登録し、activateTab は runTabInit(name) を呼ぶだけにする。
   ※ 3c-1 では導入のみ（activateTabの置換・登録は 3c-2/3c-3）。既存挙動に影響なし。 */
const _tabInitRegistry = {};
function registerTabInit(name, fn) {
    (_tabInitRegistry[name] = _tabInitRegistry[name] || []).push(fn);
}
function runTabInit(name) {
    (_tabInitRegistry[name] || []).forEach(fn => {
        try { fn(); } catch (e) { console.error('tabInit error:', name, e); }
    });
}

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

// ===== Phase0 検証付き保存（2026-06-15 欠席編集の保存取りこぼし対策） =====
// 純関数: action=absences のサーバー行に、送った編集値が反映されたか判定。
//   serverRow: {unit, reason, reporter, contactDate, ...}（getUpcomingAbsences由来）
//   expected : {reason, unit, contact, contactDate}（attEditAbsenceが送る値）
//   ・contact は サーバー側 reporter(F列=連絡者) と突合。
//   ・cmNotified(H列)は検証しない（編集は連絡状況を触らない仕様のため）。
//   ・前後空白は無視(trim)。null/undefined/'' は等価(空)。
//   ・expected に無い項目は判定対象外（部分編集の許容）。
function _absenceValueMatches_(serverRow, expected) {
    if (!serverRow || !expected) return false;
    var norm = function (v) { return String(v == null ? '' : v).trim(); };
    var map = { reason: 'reason', unit: 'unit', contact: 'reporter', contactDate: 'contactDate' };
    for (var key in map) {
        if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
        if (typeof expected[key] === 'undefined') continue;  // 送っていない項目は対象外
        if (norm(expected[key]) !== norm(serverRow[map[key]])) return false;
    }
    return true;
}

// 純関数: action=absences レスポンスから欠席配列を取り出す。
//   現行は data.absences.absences にネスト（getUpcomingAbsences返却形 {absences,longTerm,resumedToday}）。
//   将来 data.absences が配列に変わっても拾えるよう両対応。取れなければ空配列。
function _pickAbsenceList_(data) {
    if (!data || !data.absences) return [];
    if (Array.isArray(data.absences.absences)) return data.absences.absences;
    if (Array.isArray(data.absences)) return data.absences;
    return [];
}

// JSONP値検証: 編集した欠席行が、送った値どおりにサーバー(生シート)へ反映されたか確認。
//   ・action=absences を &month=（dateの月）付きで叩く＝過去日も取得できる。
//   ・no-cors / CORS / localStorage / GASキャッシュを全てバイパス（サーバー都度シート直読み）。
//   ・absFindAbsenceRecord は local 優先なので検証には使わない（本物のシート値を見る）。
function verifyAbsenceValueInGAS(name, date, expected) {
    return new Promise(resolve => {
        var month = String(date || '').slice(0, 7);  // 'YYYY-MM'
        const cbName = '_verifyAbsVal_' + Date.now();
        const script = document.createElement('script');
        script.src = YAWARAGIBOARD_API_URL + '?action=absences&month=' + month +
                     '&callback=' + cbName + '&t=' + Date.now();
        const timeout = setTimeout(() => {
            delete window[cbName];
            if (script.parentNode) script.remove();
            resolve(false);
        }, 8000);
        window[cbName] = function (data) {
            clearTimeout(timeout);
            delete window[cbName];
            if (script.parentNode) script.remove();
            if (!data || !data.success) { resolve(false); return; }
            const row = _pickAbsenceList_(data).find(a => a.name === name && a.date === date);
            resolve(_absenceValueMatches_(row, expected));
        };
        script.onerror = () => {
            clearTimeout(timeout);
            delete window[cbName];
            resolve(false);
        };
        document.body.appendChild(script);
    });
}

// 欠席編集の検証付きPOST（POST後にJSONP値検証。送った値に一致するまで最大3回再送）。
//   data: update_absence のペイロード（name/date/originalUnit/newUnit/reason/contact/contactDate）。
//   既存 gasPostAbsenceWithVerify（登録系・存在チェック）とは別物。編集は値一致まで見る。
async function gasPostEditWithVerify(data, label) {
    const maxRetries = 3;
    const expected = {
        reason: data.reason,
        unit: data.newUnit,
        contact: data.contact,
        contactDate: data.contactDate
    };
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
        // 3秒待ってから、送った値どおりに保存されたか検証
        await new Promise(r => setTimeout(r, 3000));
        const verified = await verifyAbsenceValueInGAS(data.name, data.date, expected);
        if (verified) {
            showToast('✅ ' + (label || '保存') + ' 完了（保存確認済み）', 3000);
            notifyAbsenceUpdate(data.date || '');
            return true;
        }
        console.warn('編集の値検証失敗 (' + i + '/' + maxRetries + ')');
    }
    showToast('❌ 保存できませんでした。もう一度試してください', 5000);
    return false;
}

/* ===== §D-2 出席データのヘッドレス取得（2026-06-07 board分割パイロット P1-3） =====
   attLoad（出席予定タブ本体）から「AttStore投入」だけを切り出した最小版。
   画面描画・UserStore補完・ローカル欠席マージ等の副作用は一切持たない。
   ・dateStr 省略時は今日（'YYYY-MM-DD'）。
   ・キャッシュ(ATT_CACHE_KEY)があれば即 AttStore に反映 → その後GASで上書き更新。
   ・onDone(ok) は AttStore 反映後に呼ぶ（ok=データが取れたか）。
   ・将来のP1出席アプリの attLoad はこの関数を再利用できる
     （= attLoadDataOnly(d, () => attRender(AttStore.lastData())) ）。 */

// 今日の日付を 'YYYY-MM-DD' で返す（attFormatDate(new Date()) と同形式）
function attTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

// 出席データを取得して AttStore.setLastData() だけを満たす（描画なし）
function attLoadDataOnly(dateStr, onDone) {
    dateStr = dateStr || attTodayStr();
    let cacheHit = false;

    // ① キャッシュ即反映（描画はしない・AttStoreだけ満たす）
    try {
        const cache = JSON.parse(localStorage.getItem(ATT_CACHE_KEY) || '{}');
        if (cache[dateStr]) {
            AttStore.setLastData({ am: cache[dateStr].am.slice(), pm: cache[dateStr].pm.slice() });
            cacheHit = true;
            if (typeof onDone === 'function') onDone(true);   // 即描画できるよう先に通知
        }
    } catch {}

    // ② GASで最新取得（裏更新）
    const cbName = 'attDataOnlyCb_' + Date.now();
    window[cbName] = function (data) {
        delete window[cbName];
        const s = document.getElementById('att-dataonly-script');
        if (s) s.remove();
        if (data && data.success && data.attendance) {
            AttStore.setLastData({ am: data.attendance.am.slice(), pm: data.attendance.pm.slice() });
            try {   // キャッシュ更新（最大7日・attLoadと同形式で互換）
                const cache = JSON.parse(localStorage.getItem(ATT_CACHE_KEY) || '{}');
                cache[dateStr] = data.attendance;
                const keys = Object.keys(cache).sort();
                while (keys.length > 7) delete cache[keys.shift()];
                localStorage.setItem(ATT_CACHE_KEY, JSON.stringify(cache));
            } catch {}
            if (typeof onDone === 'function') onDone(true);
        } else if (!cacheHit && typeof onDone === 'function') {
            onDone(false);   // 取得失敗かつキャッシュも無し
        }
    };
    const script = document.createElement('script');
    script.id = 'att-dataonly-script';
    script.src = YAWARAGIBOARD_API_URL + '?action=attendance&date=' + dateStr +
                 '&callback=' + cbName + '&t=' + Date.now();
    script.onerror = function () {
        delete window[cbName];
        if (!cacheHit && typeof onDone === 'function') onDone(false);
    };
    document.body.appendChild(script);
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

/* ===== §I cycle-judge（加算サイクル当月判定・2026-06-25 横断ビュー④用に集約） =====
   個訓(①)・口腔(②)の当月判定の唯一の置き場。④がこれを読む。
   ①②本体はまだ自前定義を持つ（次フェーズで本関数へ切替）。本関数は純関数・DOM非依存。 */

// 個訓 計画月: planStart起点。既定3ヶ月は diff%3===0、変則(planMonths 1-12)は開始月のみ。
// ①個別機能訓練計画書チェック.html の同名関数を移植（無回帰のため完全同一ロジック）。
function isPlanMonth(planStart, planMonths, year, month) {
    if (!planStart) return false;
    const m = String(planStart).match(/^(\d{4})-(\d{2})$/);
    if (!m) return false;
    const py = parseInt(m[1], 10);
    const pm = parseInt(m[2], 10);
    const diff = (year - py) * 12 + (month - pm);
    const pmNum = parseInt(planMonths, 10);
    const L = (pmNum >= 1 && pmNum <= 12) ? pmNum : 3;
    if (L === 3) return diff >= 0 && diff % 3 === 0;
    return diff === 0;
}

// 個訓 評価月: 計画スタート月の翌々月（=次計画前月）。開始前月(diff===-1)も評価月扱い。
// ①の同名関数を移植。
function isHyoukaMonth(planStart, planMonths, year, month) {
    if (!planStart) return false;
    const m = String(planStart).match(/^(\d{4})-(\d{2})$/);
    if (!m) return false;
    const py = parseInt(m[1], 10);
    const pm = parseInt(m[2], 10);
    const diff = (year - py) * 12 + (month - pm);
    const pmNum = parseInt(planMonths, 10);
    const L = (pmNum >= 1 && pmNum <= 12) ? pmNum : 3;
    if (L === 3) {
        if (diff >= 2 && diff % 3 === 2) return true;
        if (diff === -1) return true;
        return false;
    }
    if (diff === (L - 1)) return true;
    if (diff === -1) return true;
    return false;
}

// 口腔 評価月: startedAt起点3ヶ月毎。②oral.html の同名関数を移植。
function isOralEvalMonth(startedAt, year, month) {
    const m = String(startedAt || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return false;
    const sTotal = parseInt(m[1], 10) * 12 + parseInt(m[2], 10);
    const tTotal = year * 12 + month;
    if (tTotal < sTotal) return false;
    return (tTotal - sTotal) % 3 === 0;
}

// 通所介護計画 最終評価月(=サイン要月): finalEvalMonth(override)優先、無ければ planStart+11ヶ月。
// ③monitoring.html の getFinalEvalMonth を移植。算出不能時は '' を返す。
function monitoringFinalEvalMonth(planStart, finalEvalMonth) {
    if (finalEvalMonth) return finalEvalMonth;
    const m = String(planStart || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return '';
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = new Date(y, mo - 1 + 11, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// 当月提出セルの色: 非該当→''／送付済→'blue'／作成済未送付→'green'／該当未作成→'red'。
// ①②③の当月セル色分けで共通利用（状態→色の一本化）。
function submitCellColor(isApplicable, hasCreated, hasSent) {
    if (!isApplicable) return '';
    if (hasSent) return 'blue';
    if (hasCreated) return 'green';
    return 'red';
}

// 利用開始(planStart)より前の月か: diff<0。利用開始月より前のセルは計画/評価/PDF/色を
// 一切描画しないための表示ガード（状態判定の isPlanMonth/isHyoukaMonth は変えない）。
// planStart不明('')は false＝従来表示（安全側）。①③の描画ガードで使用。純関数・DOM非依存。
function isBeforePlanStart(planStart, year, month) {
    const m = String(planStart || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return false;
    const diff = (year - parseInt(m[1], 10)) * 12 + (month - parseInt(m[2], 10));
    return diff < 0;
}
