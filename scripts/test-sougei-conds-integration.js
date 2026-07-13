// 送迎条件 board GASハンドラ結合テスト（SpreadsheetAppモック・段階0）
// 対象: コード.js の scReadStore_/scWriteStore_/sougeiCondsGet_/Upsert_/Seed_ を
//       fakeなスプレッドシートで実行し「保存→リロード残存」「seed冪等」「非破壊upsert」を実証。
// 実行: node scripts/test-sougei-conds-integration.js
const fs = require('fs'), path = require('path');
const coreSrc = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'sougei-conds-core.js'), 'utf8');
const codeSrc = fs.readFileSync(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'コード.js'), 'utf8');

// コード.js から送迎条件セクションの関数群だけを抽出（開始マーカー〜終端マーカー）
const seg = codeSrc.split('===== 送迎条件（')[1].split('===== 送迎条件セクション ここまで')[0];
const handlerSrc = 'function scEnsureCondsSheet_' + seg.split('function scEnsureCondsSheet_')[1];

// ── fake スプレッドシート ──
function makeSheet() {
  let data = []; // 2次元配列
  return {
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = data[r - 1 + i] || [];
          const cells = [];
          for (let j = 0; j < nc; j++) cells.push(row[c - 1 + j] !== undefined ? row[c - 1 + j] : '');
          out.push(cells);
        }
        return out;
      },
      setValues: (vals) => {
        for (let i = 0; i < vals.length; i++) {
          const ri = r - 1 + i;
          if (!data[ri]) data[ri] = [];
          for (let j = 0; j < vals[i].length; j++) data[ri][c - 1 + j] = vals[i][j];
        }
      }
    }),
    clearContents: () => { data = []; },
    appendRow: (row) => { data.push(row.slice()); },
    _dump: () => data
  };
}
function makeSS() {
  const sheets = {};
  return {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet(); return sheets[n]; },
    _sheets: sheets
  };
}

// ── サンドボックス実行（core + handlers を注入・SpreadsheetApp/nowIsoモック） ──
const factory = new Function('nowIso', 'module',
  coreSrc + '\n' + handlerSrc +
  '\n; return { scReadStore_, scWriteStore_, sougeiCondsGet_, sougeiCondsUpsert_, sougeiCondsSeed_, SC_CONDS_SHEET };');
const H = factory(() => '2026-07-13T09:00:00Z', { exports: {} });

let pass = 0, fail = 0;
function eq(a, e, m){ const A=JSON.stringify(a),E=JSON.stringify(e); if(A===E){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m+'\n    exp '+E+'\n    act '+A);} }
function ok(c, m){ if(c){pass++;console.log('  PASS '+m);}else{fail++;console.log('  FAIL '+m);} }

console.log('[初回Get] シート未作成→自動作成・空conds');
const ss = makeSS();
eq(H.sougeiCondsGet_(ss), {success:true, conds:{}}, '空シート→conds空');
ok(ss._sheets[H.SC_CONDS_SHEET], 'sougei_conds シートが自動作成された');

console.log('\n[Upsert→Get] 1人保存→読み戻し残存（=保存→リロード残存の核）');
H.sougeiCondsUpsert_(ss, {name:'山田 太郎', cond:{transport:'walk', no3:true, confirmed:true}, updatedBy:'比嘉'});
eq(H.sougeiCondsGet_(ss).conds['山田 太郎'],
   {transport:'walk', no3:true, step:false, frontPref:false, memo:'', confirmed:true}, '山田=徒歩/no3/確認済みで残存');

console.log('\n[2人目Upsert] 既存を壊さず追加（非破壊）');
H.sougeiCondsUpsert_(ss, {name:'田中 四郎', cond:{transport:'family', frontPref:true}, updatedBy:'比嘉'});
const g2 = H.sougeiCondsGet_(ss).conds;
ok(Object.keys(g2).length===2, '2名になる');
ok(g2['山田 太郎'].no3===true, '山田のno3は保持');
ok(g2['田中 四郎'].frontPref===true && g2['田中 四郎'].transport==='family', '田中=家族送迎/前席');

console.log('\n[Seed冪等] プリフィルは既存を上書きしない・新規のみ追加');
const seedRes = H.sougeiCondsSeed_(ss, {transportMap:{
  '山田 太郎':{transport:'normal'},   // 既存→触らない（walk/no3/確認済みのまま）
  '新井 花子':{transport:'walk'}       // 新規→追加（未確認）
}});
eq(seedRes, {success:true, added:1, total:3}, 'added=1(新井のみ)/total=3');
const g3 = H.sougeiCondsGet_(ss).conds;
eq(g3['山田 太郎'], {transport:'walk', no3:true, step:false, frontPref:false, memo:'', confirmed:true}, '★山田は上書きされず確認結果を保持');
eq(g3['新井 花子'], {transport:'walk', no3:false, step:false, frontPref:false, memo:'', confirmed:false}, '新井=プリフィル(未確認=要確認)');

console.log('\n[複数Upsert] conds{}まとめ保存も動く');
H.sougeiCondsUpsert_(ss, {conds:{
  '山田 太郎':{transport:'normal', no3:false, confirmed:true},  // 修正
  '恩田 三郎':{transport:'normal', step:true, confirmed:true}   // 新規
}, updatedBy:'比嘉'});
const g4 = H.sougeiCondsGet_(ss).conds;
ok(g4['山田 太郎'].transport==='normal' && g4['山田 太郎'].no3===false, '山田が修正された(normal/no3解除)');
ok(g4['恩田 三郎'].step===true, '恩田が追加された');
ok(Object.keys(g4).length===4, '計4名');

console.log('\n[エラー] name/conds無し→success:false');
eq(H.sougeiCondsUpsert_(ss, {updatedBy:'x'}), {success:false, error:'name or conds required'}, 'name/conds欠落は拒否');

console.log('\n' + (fail===0?'[OK] ':'[NG] ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail===0?0:1);
