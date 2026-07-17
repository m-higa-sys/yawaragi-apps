// 実CSV(SJIS)→匿名化UTF-8 を出力する。対応表(実名↔仮名/実番号↔連番)は一切書き出さない（メモリ完結）。
// 保持: サービス提供年月・全金額列・支払方法・入金状況・行構造（メタ/ヘッダ/小計行）。
// 差替: 利用者名→"利用者NNN"、被保険者番号→"9"+連番、証記載保険者名→"見本市"、証記載保険者番号→"999999"。
// 出力先: scratch の UTF-8 一時ファイル（この後 .ps1 が SJIS へ変換）。
const fs = require('fs');
const path = require('path');

const SRC_DIR = process.env.SEIKYU_SRC_DIR || 'C:/Users/mh/Downloads';
const OUT_DIR = process.argv[2] || path.join(__dirname, 'fixtures', 'seikyu', '_utf8_tmp');

const JOBS = [
  ['サービス提供年月2026年03月の請求情報_202604121040.csv', 'fixture-2026-03-kakuteimae.csv'],
  ['サービス提供年月2026年04月の請求情報_202607180624.csv', 'fixture-2026-04.csv'],
  ['サービス提供年月2026年05月の請求情報_202607180624.csv', 'fixture-2026-05.csv'],
  ['サービス提供年月2026年06月の請求情報_202607180616.csv', 'fixture-2026-06-hikiotoshimae.csv'],
];

function parseLine(l) {
  const o = []; let c = '', q = false;
  for (let i = 0; i < l.length; i++) { const ch = l[i];
    if (q) { if (ch === '"') { if (l[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; } }
  o.push(c); return o;
}
function csvField(v) { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function idxOf(header, label) { const i = header.indexOf(label); if (i < 0) throw new Error('列なし: ' + label); return i; }

// 全ファイル横断で実被保険者番号→連番を安定採番（メモリのみ・保存しない）
const hkenMap = new Map();
function fakeHken(real) {
  const key = String(real || '').trim();
  if (!key) return '';
  if (!hkenMap.has(key)) hkenMap.set(key, '9' + String(hkenMap.size + 1).padStart(9, '0'));
  return hkenMap.get(key);
}
// 実被保険者番号→仮名（連番と一致させ横断追跡を保つ）
function fakeName(real) {
  const key = String(real || '').trim();
  const seq = hkenMap.has(key) ? (Array.from(hkenMap.keys()).indexOf(key) + 1) : 0;
  return '利用者' + String(seq).padStart(3, '0');
}

// 実番号は sort 済み順で採番して決定的にする（＝差替時に diff が安定）
function prescan(files) {
  const all = new Set();
  files.forEach(([src]) => {
    const txt = new TextDecoder('shift-jis').decode(fs.readFileSync(path.join(SRC_DIR, src)));
    const lines = txt.split(/\r\n|[\r\n]/).filter(x => x.length);
    const header = parseLine(lines[1]); const hi = idxOf(header, '被保険者番号'); const ni = idxOf(header, '利用者名');
    for (let r = 2; r < lines.length; r++) { const a = parseLine(lines[r]);
      const nm = String(a[ni] || '').trim(); if (['総額', '保険外のみ', ''].includes(nm)) continue;
      const h = String(a[hi] || '').trim(); if (h) all.add(h); }
  });
  Array.from(all).sort().forEach(h => fakeHken(h)); // sort順で採番確定
}

fs.mkdirSync(OUT_DIR, { recursive: true });
prescan(JOBS);

for (const [src, outName] of JOBS) {
  const txt = new TextDecoder('shift-jis').decode(fs.readFileSync(path.join(SRC_DIR, src)));
  const lines = txt.split(/\r\n|[\r\n]/).filter(x => x.length);
  const header = parseLine(lines[1]);
  const C = {
    name: idxOf(header, '利用者名'), hken: idxOf(header, '被保険者番号'),
    hknName: idxOf(header, '証記載保険者名'), hknNo: idxOf(header, '証記載保険者番号'),
  };
  const out = [lines[0], lines[1]]; // メタ行・ヘッダ行はそのまま（個人情報なし）
  for (let r = 2; r < lines.length; r++) {
    const a = parseLine(lines[r]);
    const nm = String(a[C.name] || '').trim();
    if (!['総額', '保険外のみ', ''].includes(nm)) {
      const realHken = a[C.hken];
      a[C.name] = fakeName(realHken);
      a[C.hken] = fakeHken(realHken);
    }
    // 証記載保険者名/番号は全行スクラブ（小計行に残る実市町村名も差替。金額・入金状況列は不変）。
    if (a[C.hknName] !== undefined && String(a[C.hknName]).trim() !== '') a[C.hknName] = '見本市';
    if (a[C.hknNo] !== undefined && String(a[C.hknNo]).trim() !== '') a[C.hknNo] = '999999';
    out.push(a.map(csvField).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, outName), out.join('\r\n') + '\r\n', 'utf8');
  console.log('生成(UTF-8):', outName, '行', out.length);
}
console.log('※ 対応表は保存していません（メモリ完結）。次に .ps1 で SJIS 変換してください。');
