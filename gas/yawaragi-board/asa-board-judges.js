// gas/yawaragi-board/asa-board-judges.js
// 朝ボード(asa-board) が使う判定関数のGAS実行可能・逐語移植。
// 正本(canonical)は shared.js の isHyoukaMonth / oral-plan.html の oralCycleAt。
// ここに書かれた2関数はそれらとbyte単位で一致していなければならない
// （scripts/test-asa-board-judges.js の DG1/DG2 でdrift検知）。
// GASランタイムはV8 (appsscript.json runtimeVersion:"V8") のため const/アロー関数はそのまま動作する。

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

function oralCycleAt(planStart, planEnd, year, month) {
    const m = String(planStart || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return { role: 'none', nodeYear: 0, nodeMonth: 0 };
    const P = parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) - 1);
    const T = year * 12 + (month - 1);
    if (T < P) return { role: 'none', nodeYear: 0, nodeMonth: 0 };
    if (planEnd) {
        const e = String(planEnd).match(/^(\d{4})-(\d{2})$/);
        if (e) {
            const E = parseInt(e[1], 10) * 12 + (parseInt(e[2], 10) - 1);
            if (T > E) return { role: 'none', nodeYear: 0, nodeMonth: 0 };
        }
    }
    const r = (T - P) % 3;
    let role, nodeTotal;
    if (r === 0) { role = 'moni1'; nodeTotal = T + 2; }
    else if (r === 1) { role = 'moni2'; nodeTotal = T + 1; }
    else { role = 'setsume'; nodeTotal = T; }
    return { role: role, nodeYear: Math.floor(nodeTotal / 12), nodeMonth: (nodeTotal % 12) + 1 };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isHyoukaMonth: isHyoukaMonth, oralCycleAt: oralCycleAt };
}
