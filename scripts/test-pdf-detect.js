// 署名済み計画書PDFの検知 純関数テスト
// 実行: node scripts/test-pdf-detect.js
//
// 設計（社長決定 2026-08-06）:
//   保存先  yawaragi-apps/計画書送付/YYYY-MM/
//   正式名  2026-07_通所介護計画書_小倉京子.pdf
//           区切りは `_` ／ 半角コロン禁止（Windowsで使えない）／ 月は YYYY-MM ／ フルネーム必須
//   ★機械側はゆるく作る: 全角半角・スペース・敬称・スキャナの連番を吸収し、
//     フルネームさえ含まれていれば拾う。書類名や月が欠けていてもフォルダから補える。
//     ＝「きちんと付けるほど確実、多少崩れても落ちない」
//
//   strong … 氏名＋書類名の両方が読めた（どの書類か確定）
//   weak   … 氏名は読めたが書類名が読めない（PDFは在るが、どの書類かは確定できない）
//
// 実測の裏取り（2026-08-06・稼働110名）:
//   フルネームが他人のフルネームに含まれるケース 0件 → フルネーム包含での照合は安全
//   苗字2文字が重複するグループ 15 → 苗字だけの照合は不可

const path = require('path');
const core = require(path.join(__dirname, '..', 'gas', 'yawaragi-board', 'session-board-core.js'));

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('  [FAIL] ' + label); } }
function eq(a, b, label) { ok(a === b, label + ' :: exp=' + JSON.stringify(b) + ' act=' + JSON.stringify(a)); }

// ===== A. 正式なファイル名（きちんと付けた場合＝strong） =====
var files = ['2026-07_通所介護計画書_架空花子.pdf'];
var r = core.sbFindSignedPdf_(files, '架空花子', [], 'tsusho_keikaku');
eq(r.found, true, 'A1: 正式名で見つかる');
eq(r.match, 'strong', 'A2: 氏名＋書類名が読めたので strong');
eq(r.fileName, '2026-07_通所介護計画書_架空花子.pdf', 'A3: 当たったファイル名を返す');
eq(r.matchedBy, 'name', 'A4: 氏名で当たった');

// ===== B. 崩れても落ちない（吸収するもの） =====
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_架空 花子.pdf'], '架空花子', [], 'tsusho_keikaku').match, 'strong',
   'B1: 氏名に半角スペースが入っても拾う');
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_架空　花子.pdf'], '架空花子', [], 'tsusho_keikaku').match, 'strong',
   'B2: 全角スペースも拾う');
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_架空花子様.pdf'], '架空花子', [], 'tsusho_keikaku').match, 'strong',
   'B3: 敬称「様」が付いても拾う');
eq(core.sbFindSignedPdf_(['架空花子さん_通所介護計画書.pdf'], '架空花子', [], 'tsusho_keikaku').match, 'strong',
   'B4: 「さん」付き・順番が逆でも拾う');
eq(core.sbFindSignedPdf_(['IMG_0012_2026-07_通所介護計画書_架空花子.pdf'], '架空花子', [], 'tsusho_keikaku').match, 'strong',
   'B5: スキャナの連番が頭に付いても拾う');
eq(core.sbFindSignedPdf_(['2026-07_通所計画書_架空花子.pdf'], '架空花子', [], 'tsusho_keikaku').match, 'strong',
   'B6: 書類名が略称「通所計画書」でも拾う');
eq(core.sbFindSignedPdf_(['2026-07_個別機能訓練計画書_架空花子.pdf'], '架空花子', [], 'kokun_set').match, 'strong',
   'B7: 個訓の正式名');
eq(core.sbFindSignedPdf_(['2026-07_個訓_架空花子.pdf'], '架空花子', [], 'kokun_set').match, 'strong',
   'B8: 個訓の略称「個訓」でも拾う');

// ===== C. 書類名が読めない＝weak（氏名だけ当たった） =====
var w = core.sbFindSignedPdf_(['IMG_0012_架空花子.pdf'], '架空花子', [], 'tsusho_keikaku');
eq(w.found, true, 'C1: 書類名が無くてもPDFの存在は分かる');
eq(w.match, 'weak', 'C2: どの書類かは確定できないので weak');
var w2 = core.sbFindSignedPdf_(['2026-07_個別機能訓練計画書_架空花子.pdf'], '架空花子', [], 'tsusho_keikaku');
eq(w2.match, 'weak', 'C3: 別書類の名前が入っている＝その書類としては確定しない（weak扱い）');

// ===== D. 別人に当てない（誤検知の防止） =====
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_架空太郎.pdf'], '架空花子', [], 'tsusho_keikaku').found, false,
   'D1: 同姓の別人には当たらない');
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_架空.pdf'], '架空花子', [], 'tsusho_keikaku').found, false,
   'D2: 苗字だけのファイル名では当たらない（フルネーム必須）');
eq(core.sbFindSignedPdf_([], '架空花子', [], 'tsusho_keikaku').found, false, 'D3: ファイルが無ければ found=false');
eq(core.sbFindSignedPdf_(null, '架空花子', [], 'tsusho_keikaku').found, false, 'D4: null でも落ちない');
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_架空花子.pdf'], '', [], 'tsusho_keikaku').found, false,
   'D5: 氏名が空なら当てない（全員に当たる事故の防止）');

// ===== E. 旧姓・別表記（台帳の別名キー） =====
var al = core.sbFindSignedPdf_(['2026-07_通所介護計画書_旧姓花子.pdf'], '架空花子', ['旧姓花子'], 'tsusho_keikaku');
eq(al.found, true, 'E1: 旧姓のファイル名でも当たる');
eq(al.matchedBy, 'alias', 'E2: 別表記で当たったことが分かる');
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_旧姓花子.pdf'], '架空花子', [], 'tsusho_keikaku').found, false,
   'E3: 別表記が未登録なら当たらない（＝登録が要ることが分かる）');
eq(core.sbFindSignedPdf_(['2026-07_通所介護計画書_別表記子.pdf'], '架空花子', ['旧姓花子', '別表記子'], 'tsusho_keikaku').found, true,
   'E4: 別表記は複数持てる');

// ===== F. sbParseAliases_（台帳セル1つ → 別名の配列） =====
eq(core.sbParseAliases_('旧姓花子').length, 1, 'F1: 1件');
eq(core.sbParseAliases_('旧姓花子、別表記子').length, 2, 'F2: 読点区切り');
eq(core.sbParseAliases_('旧姓花子,別表記子').length, 2, 'F3: 半角カンマ区切り');
eq(core.sbParseAliases_('旧姓花子 / 別表記子').length, 2, 'F4: スラッシュ区切り');
eq(core.sbParseAliases_('').length, 0, 'F5: 空なら0件');
eq(core.sbParseAliases_(null).length, 0, 'F6: null でも落ちない');

// ===== G. sbBuildPdfFoundMap_（フォルダ1ヶ月分 × 対象者 → 一括判定） =====
// GAS側は「ファイル名一覧を取る」だけ。突合はここ（core）に集約する。
var targets = [
  { key: '架空花子', name: '架空花子', aliases: [], docType: 'tsusho_keikaku' },
  { key: '架空太郎', name: '架空太郎', aliases: [], docType: 'kokun_set' },
  { key: '未提出子', name: '未提出子', aliases: [], docType: 'tsusho_keikaku' }
];
var folderFiles = [
  '2026-07_通所介護計画書_架空花子.pdf',
  '2026-07_個別機能訓練計画書_架空太郎.pdf',
  '関係ない資料.pdf'
];
var map = core.sbBuildPdfFoundMap_(folderFiles, targets);
eq(map['架空花子|tsusho_keikaku'].match, 'strong', 'G1: 花子の通所計画書は strong');
eq(map['架空太郎|kokun_set'].match, 'strong', 'G2: 太郎の個訓は strong');
eq(!!map['未提出子|tsusho_keikaku'], false, 'G3: 見つからない人はキーごと入らない');
eq(Object.keys(map).length, 2, 'G4: 当たったぶんだけ');
eq(core.sbBuildPdfFoundMap_(null, targets) && Object.keys(core.sbBuildPdfFoundMap_(null, targets)).length, 0,
   'G5: ファイル一覧が取れなくても落ちず0件');

// ===== H. 「常に紙」（認知症等で家族サインの方）=====
// 電子という選択肢が最初から無い人に🟢🟡を出すと現場が迷う。常に🔴（紙）にする。
eq(core.sbSignState_('2026-09', true, '', '2026-08-06'), 'ok', 'H1: 既定は従来どおり（第5引数なし＝1バイトも変わらない）');
eq(core.sbSignState_('2026-09', true, '', '2026-08-06', true), 'paper', 'H2: 常に紙なら適用月前でも🔴');
eq(core.sbSignState_('2026-08', true, '2026-08-06', '2026-08-06', true), 'paper', 'H3: 最終チャンスの日でも🔴');
eq(core.sbSignState_('2026-09', false, '', '2026-08-06', true), 'none', 'H4: 計画書未作成が優先（⚪のまま）');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
