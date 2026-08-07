// 職員マスタの「要確認」を集計して出す。
//
// 判定ルールの正は gas/kinmu-master-api/コード.gs の collectYokakunin_ ひとつだけ。
// このスクリプトはそれを読み込んで実行するだけで、判定を自前で書き直さない。
//
// 入力: scripts/build-kinmu-master-sheet.py が出したCSV
//       （既定パスは環境変数 KINMU_MASTER_CSV で上書き可）
// 使い方: node scripts/report-kinmu-master-yokakunin.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CSV = process.env.KINMU_MASTER_CSV ||
  '/private/tmp/claude-501/-Users-gaku-work/6ba0c702-12e5-49c5-99db-9e2be247d1b5/scratchpad/職員マスタ.csv';
const SRC = path.join(__dirname, '..', 'gas', 'kinmu-master-api', 'コード.gs');

// --- 最小CSVパーサ（引用符つきフィールド対応）---
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

// --- GAS のロジックを読み込む（実シートと同じ判定を使う）---
function loadGas(values, settings) {
  const sheet = (v) => ({
    getDataRange: () => ({ getValues: () => v }),
    getLastRow: () => v.length,
    getLastColumn: () => v[0].length
  });
  const sheets = { '職員マスタ': sheet(values), '設定': sheet(settings) };
  const ctx = {
    console, Date, Object, JSON, String, Number, Array, isNaN,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => sheets[n] || null,
        getUrl: () => '', getId: () => '',
        getSheets: () => Object.keys(sheets).map((n) => ({ getName: () => n }))
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => 'x', setProperty: () => {} })
    },
    ContentService: {
      MimeType: { JSON: 'json', JAVASCRIPT: 'js' },
      createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } })
    },
    Utilities: {
      getUuid: () => 'x',
      formatDate: (d) => {
        const p = (n) => ('0' + n).slice(-2);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      }
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
  return ctx;
}

const values = parseCsv(fs.readFileSync(CSV, 'utf8'));
// 設定シートは GAS の既定値をそのまま使う（CSVには入らないため）
const boot = loadGas(values, [['設定キー', '値', '単位・形式', '状態', '備考']]);
const settings = [boot.SETTINGS_HEADERS].concat(boot.SETTINGS_ROWS);
const ctx = loadGas(values, settings);

const res = JSON.parse(ctx.doGet({ parameter: { token: 'x' } })._t);
if (!res.ok) { console.error('doGet が失敗: ' + res.error); process.exit(1); }

const staff = res.staff;
const perItem = {};
staff.forEach((s) => s.要確認.forEach((k) => {
  (perItem[k] = perItem[k] || []).push(s.氏名);
}));
const total = staff.reduce((n, s) => n + s.要確認.length, 0);

console.log('職員マスタ 要確認レポート');
console.log('CSV: ' + CSV);
console.log('');
console.log('人数: ' + res.counts.total + '（在籍 ' + res.counts.active + ' / 退職 ' + res.counts.retired + '）');
console.log('要確認: 合計 ' + total + ' 項目');
console.log('');

// しきい値は API が返す値をそのまま使う（設定キー名を2箇所で持たないため）
console.log('■ 勤務形態区分（導出結果）  常勤基準 = ' + res.常勤基準_週時間 + ' 時間/週');
const KUBUN_LABEL = { A: '常勤・専従', B: '常勤・兼務', C: '非常勤・専従', D: '非常勤・兼務' };
staff.forEach((s) => {
  const k = s.勤務形態区分;
  console.log('  ' + (s.退職 ? '[退職]' : '      ') + s.氏名.padEnd(6, '　') +
    ' 週' + String(s.週所定時間 === null ? '—' : s.週所定時間).padStart(6) + 'h  職種' + s.職種.length + '  → ' +
    (k ? k + '（' + KUBUN_LABEL[k] + '）' : '要確認（週所定時間が未登録）'));
});
const tally = {};
staff.forEach((s) => { const k = s.勤務形態区分 || '導出不可'; tally[k] = (tally[k] || 0) + 1; });
console.log('  内訳: ' + Object.keys(tally).sort().map((k) => k + '=' + tally[k]).join(' / '));
console.log('');

console.log('■ 項目別');
Object.keys(perItem)
  .sort((a, b) => perItem[b].length - perItem[a].length || a.localeCompare(b))
  .forEach((k) => {
    console.log('  ' + k.padEnd(14, '　') + ' ' + String(perItem[k].length).padStart(2) + '名  ' + perItem[k].join('・'));
  });

console.log('');
console.log('■ 人別');
staff.forEach((s) => {
  const tag = s.退職 ? '[退職]' : '      ';
  console.log('  ' + tag + s.氏名.padEnd(6, '　') + '(' + s.要確認.length + ') ' +
    (s.要確認.length ? s.要確認.join('／') : '—'));
});

console.log('');
console.log('■ 社長ヒアリング用リスト（空欄を埋めてもらう）');
console.log('');
console.log('[1] 入職日 — ' + (perItem['入職日'] || []).length + '名');
(perItem['入職日'] || []).forEach((n) => console.log('    ' + n.padEnd(7, '　') + ' 入職日: ____-__-__'));
console.log('');
console.log('[2] 退職日 — ' + (perItem['退職日'] || []).length + '名');
(perItem['退職日'] || []).forEach((n) => console.log('    ' + n.padEnd(7, '　') + ' 退職日: ____-__-__'));
console.log('');
console.log('[3] 資格取得日 — ' + (perItem['資格取得日'] || []).length + '名');
staff.filter((s) => s.要確認.includes('資格取得日')).forEach((s) => {
  s.保有資格.filter((q) => !q.acquiredOn).forEach((q) => {
    console.log('    ' + s.氏名.padEnd(7, '　') + ' ' + q.name.padEnd(8, '　') + ' 取得日: ____-__-__');
  });
});
console.log('');
console.log('[4] カナ — ' + (perItem['カナ'] || []).length + '名');
(perItem['カナ'] || []).forEach((n) => console.log('    ' + n.padEnd(7, '　') + ' カナ: __________'));
console.log('');
console.log('[5] 保有資格そのもの — ' + (perItem['保有資格'] || []).length + '名');
(perItem['保有資格'] || []).forEach((n) => console.log('    ' + n.padEnd(7, '　') + ' 資格: __________（無資格なら「無し」）'));

console.log('');
console.log('■ 設定シートで未確定のもの');
Object.keys(res.settingsMeta).forEach((k) => {
  const m = res.settingsMeta[k];
  if (m.状態 === '確定') return;
  console.log('  [' + m.状態 + '] ' + k + ' = ' + m.値 + (m.単位 ? ' (' + m.単位 + ')' : ''));
});
