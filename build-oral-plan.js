// build-oral-plan.js
// 口腔②アプリ oral-plan.html を生成する。
// CSS は個別機能訓練計画書チェック.html から <style> ブロックを verbatim 抽出（転記事故ゼロ）。
// body+script は _oral-plan-body.html（口腔用に新規作成）を使う。
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

const kokun = fs.readFileSync(path.join(DIR, '個別機能訓練計画書チェック.html'), 'utf8');
const body = fs.readFileSync(path.join(DIR, '_oral-plan-body.html'), 'utf8');

// kokun の <style>...</style> を抽出
const m = kokun.match(/<style>[\s\S]*?<\/style>/);
if (!m) throw new Error('kokun CSS block not found');
const css = m[0];

const head =
  '<!DOCTYPE html>\n' +
  '<html lang="ja">\n' +
  '<head>\n' +
  '<meta charset="UTF-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n' +
  '<meta http-equiv="Pragma" content="no-cache">\n' +
  '<meta http-equiv="Expires" content="0">\n' +
  '<title>🦷 口腔②モニ・結果報告書・計画書 | yawaragi</title>\n' +
  css + '\n' +
  '</head>\n';

const out = head + body;
fs.writeFileSync(path.join(DIR, 'oral-plan.html'), out, 'utf8');

// 簡易アサーション（配線・流用/作り変えの静的確認）
const errs = [];
const mustPresent = [
  'getOralPlansYear', 'updateOralPlan', 'isOralSendMonth', 'submitCellColor',
  'yawaragi_oralplan_v1_',
  'moni1_date', 'moni2_date', 'houkoku_date', 'plan_date', 'sent_to_cm',  // sent_to_cm はデータ列として mapRecord に残す（UIは撤去）
  'ensureUsageGate', 'monthly_usage',
  'onDateCheck', 'checkChip', 'id="dateDialog"',
  '【対象者】', '【非対象】', 'getMonthFocus', 'renderFocus', 'applyViewVisibility',
  'setView', 'yawaragi_oralplan_view', 'yawaragi_oralplan_lastby', 'fillByOptions',
  'id="focusView"', 'view: \'focus\'',
  // 第3弾（看護師向け仕上げ）
  'NURSE_NAMES', '髙山', '春山', '石井', 'nurseOptions',
  'careBadge', 'matchesSchedule', 'setDayFilter', 'setAmpmFilter', 'setNameFilter',
  'id="nameSearchInput"', 'id="dayFilters"', 'id="ampmFilters"',
  'fetchLedgerSchedule', 'applyScheduleToUsers', 'LEDGER_URL',
  'debug_user_cm', 'fetchUserCm', 'id="mu-user-cm"',
  // 第4弾（計画期間の器）
  'addMonths', 'onPlanStartInput', 'onPlanEndInput',
  'id="planExtras"', 'id="planStartInput"', 'id="planEndInput"',
  // 9合目（個人サイクル化）
  'oralCycleAt', 'oralCycleRole', 'fiscalMonths', 'renderMonthCell',
  'planStart', 'planEnd', 'updateOralConfig', 'saveOralCycleConfig',
  'BY_FIELD_OF', 'moni1_by', 'moni2_by', 'houkoku_by', 'plan_by',
  '未設定・初回投入待ち'
];
const mustAbsent = [
  'getKeikakushoYear', 'updateKeikakusho', 'updatePlanStart',   // 個訓action持ち込み禁止
  'isPlanMonth(', 'isHyoukaMonth(',                              // 個訓planStart相対ロジック持ち込み禁止
  'keikaku_date', 'tasseido_date', 'hyouka_pdf_date',           // 個訓フィールド持ち込み禁止
  'upsertSoufuStatus', 'getSoufuLedger',                        // 提出送付台帳へ書かない（3箇所目回避）
  'yawaragi_keikakusho',                                         // 個訓LSキー持ち込み禁止
  'onMoniTap', 'onSetsumeTap', 'openOperatorDialog', 'id="operatorDialog"',  // 旧ハンドラ/開く時操作者バーの残骸禁止
  // 送付撤去（②は作成まで・送付管理は別アプリ）
  'onSentTap', 'toggleSent', 'openSentDialog', 'id="sentDialog"',
  'judgeUnsubmittedLocal', 'openUnsubmittedView', 'unsentLineHTML',
  'ORAL_SOUFU_CUTOFF', 'unsubmittedDialog', 'id="unsubmittedBadge"'
];
for (const s of mustPresent) if (!out.includes(s)) errs.push('MISSING: ' + s);
for (const s of mustAbsent) if (out.includes(s)) errs.push('SHOULD BE ABSENT: ' + s);
if (errs.length) { console.error('ASSERTION FAILURES:\n' + errs.join('\n')); process.exit(1); }

console.log('OK wrote oral-plan.html');
console.log('bytes: ' + out.length + ' / lines: ' + out.split('\n').length);
console.log('css bytes(verbatim from kokun): ' + css.length);
