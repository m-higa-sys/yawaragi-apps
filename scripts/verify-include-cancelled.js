// includeCancelled 追加の本番検証（2026-08-03）
//
//   使い方:
//     push前:  node scripts/verify-include-cancelled.js --baseline <dir>
//     push後:  node scripts/verify-include-cancelled.js --verify   <dir>
//
//   ★バイト一致では判定しない。
//     母集団は利用者台帳の生データで、新規契約が入るだけで応答は変わる
//     （2026-08-03 の実測: ベースライン採取の数分後に新規利用者1名が増え、
//       口腔 plans 106→107件・モニ users 60→61件になった）。
//     時刻差による正常な増減を「退行」と誤判定しないため、次の3点で見る:
//       ① キー構成が baseline と完全一致（キーの追加・削除・改名が無い）
//       ② 両方に居る利用者の値が完全一致
//       ③ 増減した利用者は「生データ変動」として一覧表示するだけ（FAILにしない）
//     これが「既定応答は1バイトも変えていない」の実効的な証明になる。
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const API = 'https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec';

// ym/year は「中止者が実在する期間」に合わせて必要なら書き換える。
const CASES = [
  { file: 'base_oral_2026-09.json', q: 'action=getOralPlans&ym=2026-09', label: '口腔(getOralPlans)', lists: ['plans', 'unsent'] },
  { file: 'base_moni_2026.json', q: 'action=getMonitoringYear&year=2026', label: '通所モニ(getMonitoringYear)', lists: ['users', 'records'] },
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return get(res.headers.location).then(resolve, reject);
      }
      // ★setEncoding 必須。付けずに文字列連結すると、マルチバイト文字がチャンク境界で
      //   分断されて壊れ（例: 総合福祉 → 総合??祉）、毎回違う位置が化けて偽の差分になる。
      res.setEncoding('utf8');
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => (res.statusCode === 200 ? resolve(b) : reject(new Error('HTTP ' + res.statusCode))));
    }).on('error', reject);
  });
}

const keysOf = (arr) => [...new Set(arr.flatMap((o) => Object.keys(o)))].sort();
const idOf = (o) => [o.userId, o.name, o.year, o.month].filter((x) => x !== undefined).join('|');
const canon = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => ((a[k] = o[k]), a), {}));

const mode = process.argv[2], dir = process.argv[3];
if (!['--baseline', '--verify'].includes(mode) || !dir) {
  console.error('usage: node scripts/verify-include-cancelled.js --baseline|--verify <dir>');
  process.exit(2);
}
fs.mkdirSync(dir, { recursive: true });

(async () => {
  let fail = 0;
  for (const c of CASES) {
    const p = path.join(dir, c.file);
    const raw = await get(API + '?' + c.q);

    if (mode === '--baseline') {
      fs.writeFileSync(p, raw);
      console.log('保存 ' + c.label + '  ' + Buffer.byteLength(raw) + ' bytes → ' + p);
      continue;
    }

    console.log('\n--- ' + c.label + ' ---');
    if (!fs.existsSync(p)) { console.log('SKIP … baseline が無い'); continue; }
    const base = JSON.parse(fs.readFileSync(p, 'utf8'));
    const now = JSON.parse(raw);

    // ① トップレベルのキー構成
    const tb = Object.keys(base).sort().join(','), tn = Object.keys(now).sort().join(',');
    if (tb === tn) console.log('PASS トップレベルのキー構成が一致: ' + tn);
    else { fail++; console.log('FAIL トップレベルのキー構成が変化  baseline=[' + tb + '] now=[' + tn + ']'); }

    for (const listName of c.lists) {
      const A = base[listName] || [], B = now[listName] || [];
      const ka = keysOf(A).join(','), kb = keysOf(B).join(',');
      if (ka === kb) console.log('PASS ' + listName + ' の要素キーが一致: [' + kb + ']');
      else { fail++; console.log('FAIL ' + listName + ' の要素キーが変化  baseline=[' + ka + '] now=[' + kb + ']'); }

      // ② 両方に居る要素の値一致
      const ma = new Map(A.map((o) => [idOf(o), o])), mb = new Map(B.map((o) => [idOf(o), o]));
      const both = [...ma.keys()].filter((k) => mb.has(k));
      const changed = both.filter((k) => canon(ma.get(k)) !== canon(mb.get(k)));
      if (changed.length === 0) console.log('PASS ' + listName + ' 両方に居る ' + both.length + '件の値が完全一致');
      else {
        fail++;
        console.log('FAIL ' + listName + ' 値が変化した要素 ' + changed.length + '件');
        changed.slice(0, 5).forEach((k) => {
          console.log('     ' + k + '\n       baseline: ' + canon(ma.get(k)) + '\n       now     : ' + canon(mb.get(k)));
        });
      }

      // ③ 生データ変動（FAILにしない）
      const added = [...mb.keys()].filter((k) => !ma.has(k));
      const gone = [...ma.keys()].filter((k) => !mb.has(k));
      if (added.length || gone.length) {
        console.log('     参考(生データ変動): +' + added.length + ' / -' + gone.length
          + (added.length ? '  増: ' + added.slice(0, 5).join('、') : '')
          + (gone.length ? '  減: ' + gone.slice(0, 5).join('、') : ''));
      }
    }

    // --- includeCancelled=1 の確認 ---
    const optIn = JSON.parse(await get(API + '?' + c.q + '&includeCancelled=1'));
    const rows = c.lists.flatMap((k) => optIn[k] || []).filter((r) => r.userId || r.name);
    const target = c.lists.filter((k) => k !== 'records').flatMap((k) => optIn[k] || []);
    const withKey = target.filter((r) => 'cancelled' in r);
    const cancelled = target.filter((r) => r.cancelled === true);
    const names = [...new Set(cancelled.map((r) => r.userId || r.name))];

    if (target.length && withKey.length === target.length) {
      console.log('PASS =1 で対象 ' + target.length + '件すべてに cancelled が付く');
    } else {
      fail++;
      console.log('FAIL =1 なのに cancelled の無い要素がある ('
        + (target.length - withKey.length) + '/' + target.length + ')'
        + '  ※push前ならこれは想定どおり（本番にまだ改修が入っていない）');
    }
    console.log('     中止者として現れた人(' + names.length + '名): ' + (names.join('、') || '（0名）'));
    if (names.length === 0) {
      console.log('     ※0名なら対象期間に中止者が居ないだけの可能性。中止履歴シートの人の在籍期間に ym/year を寄せて再実行する');
    }
  }
  if (mode === '--verify') {
    console.log(fail ? '\n==== FAIL ' + fail + ' ====' : '\n==== ALL PASS ====');
    process.exit(fail ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });
