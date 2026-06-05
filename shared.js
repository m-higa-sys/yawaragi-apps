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
