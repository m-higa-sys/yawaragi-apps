// ===== yawaragiボード GAS =====
// 利用者台帳スプレッドシートと連携し、出欠管理・伝達事項・ケアマネ通知を行う
//
// ★ 初回セットアップ:
//   1. 利用者台帳スプレッドシートの「拡張機能」→「Apps Script」を開く
//   2. 新しいスクリプトファイルを作成してこのコードを貼り付け
//   3. setupSheets() を1回実行（新しいシートが3つ作成される）
//   4. 「デプロイ」→「新しいデプロイ」→ ウェブアプリ
//      - 実行ユーザー: 自分
//      - アクセス: 全員
//   5. デプロイURLをyawaragiボード.htmlの設定に入力
//
// ★ 注意: 既存のGAS（利用者台帳v2等）とは別のデプロイになります
//   既存のデプロイURLは変わりません

// ===== 設定 =====
var SS_ID = '1blasasDuYsCLRP8fXGqcQfKGQWTMZGjYuJDVRKwNNw0';
var OWNER_EMAIL = 'm-higa@keepfitlife.com';
// 通知用Gmailアドレス（2026/4/21追加）: 自分→自分メールだとApple Watchに通知が届かないため、別アカウントに送る
var NOTIFY_EMAIL = 'yawaragi.notify@gmail.com';
// 出勤送迎表GAS（READONLY_GAS_URL本物・dailyOps取得用・2026-05-26追加）
var SOUGEI_GAS_URL = 'https://script.google.com/macros/s/AKfycbyh_h7qB93S17_9mI52uTcCfUfBjeX9K4Xaq6LIX3d8Bae4w0lqKY-Gsqnw173atAvm7Q/exec';
// 欠席連絡・利用率の運用開始日（利用率分析.html 側と同期）
var OPERATION_START_DATE = '2026-04-06';
var OPERATION_START_YM   = '2026-04';

// 利用者イベント項目テンプレート（2026/4/28追加）
// ownerTag: 'boss'(社長専用) / 'consultant'(相談員専用) / 'anyone'(誰でも可)
var EVENT_TEMPLATE_CONTRACT_AFTER = [
  // A. 相談員作業
  { seq: 1,  label: '契約書（新規・区分変更）',                           ownerTag: 'consultant', isUrgent: false },
  { seq: 2,  label: '個人情報使用同意書',                                 ownerTag: 'consultant', isUrgent: false },
  { seq: 3,  label: '緊急連絡先',                                         ownerTag: 'consultant', isUrgent: false },
  { seq: 4,  label: 'サービス担当者会議の要点・作成',                     ownerTag: 'consultant', isUrgent: false },
  { seq: 5,  label: '自宅地図（詳細記入）',                               ownerTag: 'consultant', isUrgent: false },
  { seq: 6,  label: 'アセスメント(リハプラン)',                           ownerTag: 'consultant', isUrgent: true  },
  { seq: 7,  label: '基本情報入力(カイポケ)',                             ownerTag: 'consultant', isUrgent: true  },
  { seq: 8,  label: '通所基本情報入力(リハプラン)',                       ownerTag: 'consultant', isUrgent: true  },
  { seq: 9,  label: '個別機能基本情報入力(リハプラン)',                   ownerTag: 'consultant', isUrgent: true  },
  { seq: 10, label: '通所介護計画書作成(リハプラン)',                     ownerTag: 'consultant', isUrgent: true  },
  { seq: 11, label: '個別機能訓練計画書作成',                             ownerTag: 'boss',       isUrgent: true  },
  { seq: 12, label: '生活機能チェック・自宅写真含む(要介護のみ)',         ownerTag: 'consultant', isUrgent: false },
  { seq: 13, label: '興味関心チェック(要介護のみ)',                       ownerTag: 'consultant', isUrgent: false },
  { seq: 14, label: '口座振替用紙記入',                                   ownerTag: 'consultant', isUrgent: false },
  { seq: 15, label: '通所・介護・訓練計画書・一覧表記入',                 ownerTag: 'consultant', isUrgent: false },
  { seq: 16, label: '担会・契約日時記入表',                               ownerTag: 'consultant', isUrgent: false },
  { seq: 17, label: '利用者台帳入力',                                     ownerTag: 'consultant', isUrgent: false },
  // B. ケアマネからもらう書類
  { seq: 18, label: '利用者基本情報(フェイスシート)受領',                 ownerTag: 'consultant', isUrgent: false },
  { seq: 19, label: 'ケアプラン受領',                                     ownerTag: 'consultant', isUrgent: false },
  { seq: 20, label: '介護保険証コピー受領',                               ownerTag: 'consultant', isUrgent: false },
  { seq: 21, label: '介護保険負担割合証受領',                             ownerTag: 'consultant', isUrgent: false },
  { seq: 22, label: '提供票受領',                                         ownerTag: 'consultant', isUrgent: false },
  { seq: 23, label: '薬情報(お薬手帳)受領',                               ownerTag: 'consultant', isUrgent: false },
  // C. 他作業
  { seq: 24, label: '送迎表記入',                                         ownerTag: 'anyone',     isUrgent: false },
  { seq: 25, label: '利用開始日ホワイトボード記入',                       ownerTag: 'anyone',     isUrgent: false },
  { seq: 26, label: '利用開始日伝える(日/AM・PM)',                        ownerTag: 'consultant', isUrgent: false },
  { seq: 27, label: '送迎時間伝える',                                     ownerTag: 'consultant', isUrgent: false },
  { seq: 28, label: '持ち物・注意事項',                                   ownerTag: 'consultant', isUrgent: false },
  { seq: 29, label: '本人からの欠席連絡⇒家族確認 要・不要(認知)',        ownerTag: 'consultant', isUrgent: false },
  { seq: 30, label: '名札(首)・ハンガー札・テーブル *ラミ',               ownerTag: 'anyone',     isUrgent: false },
  { seq: 31, label: '名札(靴・荷物置)',                                   ownerTag: 'anyone',     isUrgent: false },
  { seq: 32, label: '名前マグネット',                                     ownerTag: 'anyone',     isUrgent: false },
  { seq: 33, label: '個人ファイル(青・グレー)ラベル貼り',                 ownerTag: 'anyone',     isUrgent: false },
  { seq: 34, label: 'GoogleMapに住所入力',                                ownerTag: 'anyone',     isUrgent: false },
  { seq: 35, label: 'インスタ顔出し 可・不可・後ろ姿のみ可',              ownerTag: 'consultant', isUrgent: false }
];

// ケアマネ変更時テンプレート（2026/5/2追加・15項目）
var EVENT_TEMPLATE_CAREMANAGER_CHANGE = [
  // A. 新ケアマネから受領
  { seq: 1,  label: '新ケアマネ事業所名・担当者名の登録（連絡先は『ケアマネ連絡先一覧』で後から）', ownerTag: 'consultant', isUrgent: false },
  { seq: 2,  label: '最新フェイスシート受領・確認',                              ownerTag: 'consultant', isUrgent: false },
  { seq: 3,  label: '新ケアプラン受領',                                          ownerTag: 'consultant', isUrgent: false },
  { seq: 4,  label: '提供票（変更月以降）受領',                                  ownerTag: 'consultant', isUrgent: false },
  // B. システム更新
  { seq: 5,  label: 'リハブクラウド：担当ケアマネ情報の更新',                     ownerTag: 'consultant', isUrgent: false },
  { seq: 6,  label: 'カイポケ：担当ケアマネ情報の更新',                           ownerTag: 'consultant', isUrgent: false },
  { seq: 7,  label: '利用者台帳：担当ケアマネ欄の更新',                           ownerTag: 'consultant', isUrgent: false },
  // C. 送付先変更
  { seq: 8,  label: '提供票送付先の変更(メール/FAX/持参の区分)',                  ownerTag: 'consultant', isUrgent: false },
  { seq: 9,  label: 'ケアマネ実績送付スキルの宛先データ更新',                     ownerTag: 'consultant', isUrgent: false },
  // D. 旧ケアマネへの締め
  { seq: 10, label: '旧ケアマネへの最終月実績送付確認',                           ownerTag: 'consultant', isUrgent: false },
  { seq: 11, label: '旧ケアマネへの引き継ぎ完了確認',                             ownerTag: 'consultant', isUrgent: false },
  // E. 社内周知
  { seq: 12, label: 'スタッフへの新ケアマネ周知(ケアズアプリ)',                   ownerTag: 'anyone',     isUrgent: false },
  { seq: 13, label: '雇用契約書・各種台帳のケアマネ欄修正',                       ownerTag: 'anyone',     isUrgent: false },
  // F. 保険・期間整合性
  { seq: 14, label: '介護保険証・負担割合証の確認(更新タイミングと重なる場合)',   ownerTag: 'consultant', isUrgent: false },
  { seq: 15, label: 'ケアプラン期間と利用契約の整合性確認',                       ownerTag: 'consultant', isUrgent: false }
];

// 利用曜日変更時テンプレート（2026/5/10追加・8項目 → 2026-06-17に1項目へ集約）
//   背景: リハブクラウド(1番)を更新すれば、出勤＆送迎表・yawaragiボード・利用者台帳などが
//         同じデータを拾って自動反映されるため、旧2〜8番の手作業は実態として不要（社長判断）。
//         旧8番の請求反映確認は毎月の請求フロー(国保連伝送→電算)で必ず通るため二重チェックを廃止。
//         1番完了＝全項目完了で代表へ通知メール（旧8番の引き継ぎを軽い形で継続）。
var EVENT_TEMPLATE_USAGE_DAYS_CHANGE = [
  { seq: 1, label: 'リハブクラウドの提供票更新（曜日・回数）',           ownerTag: 'boss',       isUrgent: true  }
];

function getEventTemplate(eventType) {
  if (eventType === 'contract_after') return EVENT_TEMPLATE_CONTRACT_AFTER;
  if (eventType === 'caremanager_change') return EVENT_TEMPLATE_CAREMANAGER_CHANGE;
  if (eventType === 'usage_days_change') return EVENT_TEMPLATE_USAGE_DAYS_CHANGE;
  // 担会後は Phase 2 で追加
  return [];
}

var FACILITY_NAME = 'リハビリデイサービス yawaragi';
var FACILITY_TEL = '0493-81-5125';
var DRAFT_MODE = false;
// ↑ true: ケアマネへのメールをGmailの「下書き」に保存（テスト時のみ）
//   false: 確認ポップアップOK後に自動送信（本番運用・2026-05-10〜）
var ABSENCE_AUTO_EMAIL = true;
// ↑ 欠席ケアマネメール送信のマスター許可スイッチ。
//   2026-06-16 社長指示で即送信を全面停止するため false にした（Phase0 キルスイッチ）。
//   休み連絡メールリニューアル後は「プレビューで送信を押した時だけ送る」方式になり、
//   registerAbsence は data.doSendEmail===true かつ本フラグ true のときのみ送信する。
//   🔴 Phase4 デプロイ時にプレビュー送信を解禁する場合は true に切り替えること（false の間は一切送らない）。

// ===== 見学体験新規シート（2026/4/19追加）=====
var INTAKE_HEADERS = [
  'id','種別','問い合わせ日','予定日','初回対応スタッフ','ケアマネ氏名',
  'ふりがな','氏名','性別','生年月日','年齢','介護度',
  '住所区分','住所詳細','TEL','送迎有無','直接連絡可否',
  '利用希望曜日','yawarigi希望曜日','最終決定曜日',
  'お試し送迎順','利用時送迎順',
  '主訴','他デイ見学','yawaragi何番目','ペースメーカー',
  '利用有無','利用なし理由','利用なし理由詳細','利用日前日連絡フラグ',
  'ケアマネ連絡済','ケアマネ連絡日時','送迎時間連絡済','送迎時間連絡日時',
  '週間予定表仮予約済','全記入済',
  '社長確認済','社長確認日時','社長確認依頼日時',
  'ステータス','作成日時','更新日時','登録者',
  'TEL続柄','ケアマネ事業所',
  // 前日連絡（強化）
  '前日連絡日時','前日連絡担当','前日連絡相手','前日連絡メモ',
  // 初回送迎準備
  '表札有無','訪問注意事項',
  // 契約準備フロー
  '利用意思確認済','ケアマネ利用希望伝達済','重要事項説明日','契約書渡し日','契約書受領日','本格利用開始日','初回本格利用前日連絡済',
  // 利用者台帳同期
  '利用者台帳反映済','利用者台帳反映日時',
  // ケアマネ連絡フロー（C案）
  'ケアマネ報告日時','ケアマネ報告内容','ケアマネ利用可否連絡日','ケアマネ利用可否回答','契約順位',
  // ⚠️ INTAKE_HEADERS は「見学体験新規」シートの物理列順と完全一致させること（createIntake/updateIntake/getIntakeList が
  //    INTAKE_COL による位置ベースで読み書きするため、順序がズレると別列を破壊する）。2026-05-31 に実シートと突合し再整列。
  // 送迎準備（追加）
  'Googleマップ登録済み',
  // 初回お迎え時間
  '初回お迎え時間','初回お迎え時間報告済',
  // ケアマネ報告済・決定理由（選ばれた理由・経営分析用）
  'ケアマネ報告済','決定理由','決定理由詳細',
  // 見学・体験前連絡フロー（実シートに存在・従来 INTAKE_HEADERS から欠落していた7列）
  '見学日','予定日AMPM','体験お迎え時間',
  '体験前連絡予定日','体験前連絡メモ','体験前連絡相手','体験前連絡済',
  // 体験者として出勤＆送迎表に追加（2026-05-14追加）
  '送迎表追加済','送迎表追加日時',
  // 2026-05-31: 受付強化＋カンバン化の新規列
  '連絡元区分','エリア','利用意向',
  'フェーズ','初回利用日リスト','ドロップ理由','ドロップ記録日時',
  '見学完了','体験打診結果','体験完了',
  '重要事項説明済','契約書取り交わし済',
  '名札_通常済','名札_荷物済','名札_ハンガー済','名札_ドリンク済','名札_靴済',
  'リハブクラウド登録済','ケアズ登録済','SNS顔出し可否確認済',
  '写真撮影済','同意書類取得済','朝礼周知済',
  // 2026-05-31 Phase C 追加分（シート末尾に append 済のため INTAKE_HEADERS でも末尾）
  'ケアマネTEL','契約日'
];
var INTAKE_COL = {};
INTAKE_HEADERS.forEach(function(h, i){ INTAKE_COL[h] = i + 1; });

// ===== 初回セットアップ（1回だけ実行）=====
function setupSheets() {
  var ss = SpreadsheetApp.openById(SS_ID);

  // 出欠変更シート
  if (!ss.getSheetByName('出欠変更')) {
    var s = ss.insertSheet('出欠変更');
    s.getRange(1, 1, 1, 8).setValues([[
      '日付', '利用者名', '単位', '種別', '理由', '連絡者', '登録日時', 'ケアマネ通知'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 8).setBackground('#4a90d9').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 110);
    s.setColumnWidth(2, 100);
    s.setColumnWidth(5, 150);
    s.setColumnWidth(7, 160);
    s.setColumnWidth(8, 120);
  }

  // 伝達事項シート
  if (!ss.getSheetByName('伝達事項')) {
    var s = ss.insertSheet('伝達事項');
    s.getRange(1, 1, 1, 5).setValues([[
      '対象日', '内容', '登録者', '登録日時', 'ステータス'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 5).setBackground('#27ae60').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(2, 300);
    s.setColumnWidth(4, 160);
    s.setColumnWidth(5, 100);
  }

  // ケアマネ連絡先シート（送付方法・FAX番号を追加: 2026/4/11）
  if (!ss.getSheetByName('ケアマネ連絡先')) {
    var s = ss.insertSheet('ケアマネ連絡先');
    s.getRange(1, 1, 1, 5).setValues([[
      'ケアマネ事業所', 'ケアマネ名', 'メールアドレス', 'FAX番号', '送付方法'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 5).setBackground('#8e44ad').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 200);
    s.setColumnWidth(2, 120);
    s.setColumnWidth(3, 250);
    s.setColumnWidth(4, 140);
    s.setColumnWidth(5, 100);
  }

  // 送付用居宅一覧シート（2026/5/3追加・ケアマネ連絡先の後継）
  // 6月加算Iロ達成のためにケアプランデータ連携対応を管理
  if (!ss.getSheetByName('送付用居宅一覧')) {
    var s = ss.insertSheet('送付用居宅一覧');
    s.getRange(1, 1, 1, 7).setValues([[
      '事業所名', 'ケアマネ名', '送付方法', 'メール', 'FAX', 'データ連携対応', '非表示'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 7).setBackground('#16a085').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 200);  // 事業所名
    s.setColumnWidth(2, 120);  // ケアマネ名
    s.setColumnWidth(3, 140);  // 送付方法
    s.setColumnWidth(4, 250);  // メール
    s.setColumnWidth(5, 140);  // FAX
    s.setColumnWidth(6, 110);  // データ連携対応
    s.setColumnWidth(7, 80);   // 非表示

    // C列（送付方法）プルダウン
    var methodRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['メール', 'FAX', '持参', 'ケアプランデータ連携'], true)
      .setAllowInvalid(true)
      .build();
    s.getRange(2, 3, 1000, 1).setDataValidation(methodRule);

    // F列（データ連携対応）プルダウン
    var linkRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['〇', '×'], true)
      .setAllowInvalid(true)
      .build();
    s.getRange(2, 6, 1000, 1).setDataValidation(linkRule);

    // 既存「ケアマネ連絡先」のデータを移行コピー（あれば）
    var oldSheet = ss.getSheetByName('ケアマネ連絡先');
    if (oldSheet && oldSheet.getLastRow() >= 2) {
      var oldData = oldSheet.getRange(2, 1, oldSheet.getLastRow() - 1, Math.max(oldSheet.getLastColumn(), 5)).getValues();
      var newRows = [];
      for (var i = 0; i < oldData.length; i++) {
        var office = String(oldData[i][0] || '').trim();
        var name = String(oldData[i][1] || '').trim();
        var email = String(oldData[i][2] || '').trim();
        var fax = String(oldData[i][3] || '').trim();
        var method = String(oldData[i][4] || '').trim();
        var hidden = oldData[i].length >= 6 ? String(oldData[i][5] || '').trim() : '';
        if (!office && !name) continue;
        // 新シート列順: 事業所名, ケアマネ名, 送付方法, メール, FAX, データ連携対応, 非表示
        newRows.push([office, name, method, email, fax, '', hidden]);
      }
      if (newRows.length > 0) {
        s.getRange(2, 1, newRows.length, 7).setValues(newRows);
      }
    }
  }

  // 中止履歴シート（2026/4/10追加、2026/5/20更新=15列。O列「リハブ:利用中止操作」は後ろに追加）
  if (!ss.getSheetByName('中止履歴')) {
    var s = ss.insertSheet('中止履歴');
    s.getRange(1, 1, 1, 15).setValues([[
      '最終利用日', '中止日', '連絡日', '利用者名', '理由', '補足', '受付者',
      '登録日時', '変更前ステータス',
      'リハブ:通所計画書', 'リハブ:個別機能訓練', 'リハブ:口腔機能向上',
      'リハブ:科学的介護推進', 'リハブ:ADL維持等',
      'リハブ:利用中止操作'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 15).setBackground('#c0392b').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 110);  // 最終利用日
    s.setColumnWidth(2, 110);  // 中止日
    s.setColumnWidth(3, 110);  // 連絡日
    s.setColumnWidth(4, 100);  // 利用者名
    s.setColumnWidth(5, 130);  // 理由
    s.setColumnWidth(6, 200);  // 補足
    s.setColumnWidth(7, 90);   // 受付者
    s.setColumnWidth(8, 140);  // 登録日時
    s.setColumnWidth(9, 110);  // 変更前ステータス
    s.setColumnWidth(10, 130); // リハブ:通所計画書
    s.setColumnWidth(11, 130); // リハブ:個別機能訓練
    s.setColumnWidth(12, 130); // リハブ:口腔機能向上
    s.setColumnWidth(13, 130); // リハブ:科学的介護推進
    s.setColumnWidth(14, 130); // リハブ:ADL維持等
    s.setColumnWidth(15, 130); // リハブ:利用中止操作
  }

  // タスクボードシート（2026/4/11追加・2026/4/25 期限・完了者列追加）
  if (!ss.getSheetByName('タスクボード')) {
    var s = ss.insertSheet('タスクボード');
    s.getRange(1, 1, 1, 12).setValues([[
      'ID', '日付', 'スタッフ', 'タスク名', '優先度', '目安(分)',
      '登録者', '登録日時', 'ステータス', '完了日時', '期限', '完了者'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 12).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 140);   // ID
    s.setColumnWidth(2, 110);   // 日付
    s.setColumnWidth(3, 100);   // スタッフ
    s.setColumnWidth(4, 250);   // タスク名
    s.setColumnWidth(5, 80);    // 優先度
    s.setColumnWidth(6, 80);    // 目安(分)
    s.setColumnWidth(7, 100);   // 登録者
    s.setColumnWidth(8, 160);   // 登録日時
    s.setColumnWidth(9, 80);    // ステータス
    s.setColumnWidth(10, 160);  // 完了日時
    s.setColumnWidth(11, 110);  // 期限
    s.setColumnWidth(12, 100);  // 完了者
  }

  // 送信記録シート（2026/4/11追加）
  if (!ss.getSheetByName('送信記録')) {
    var s = ss.insertSheet('送信記録');
    s.getRange(1, 1, 1, 8).setValues([[
      '送信年月', '居宅事業所名', 'ケアマネ名', 'メールアドレス',
      '添付ファイル数', '送信方法', '送信日時', 'ステータス'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 8).setBackground('#1a5276').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 100);
    s.setColumnWidth(2, 180);
    s.setColumnWidth(3, 100);
    s.setColumnWidth(4, 220);
    s.setColumnWidth(5, 100);
    s.setColumnWidth(6, 80);
    s.setColumnWidth(7, 160);
    s.setColumnWidth(8, 80);
  }

  // 見学体験新規シート（2026/4/19追加）
  if (!ss.getSheetByName('見学体験新規')) {
    var s = ss.insertSheet('見学体験新規');
    s.getRange(1, 1, 1, INTAKE_HEADERS.length).setValues([INTAKE_HEADERS]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, INTAKE_HEADERS.length)
      .setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(INTAKE_COL['id'], 220);
    s.setColumnWidth(INTAKE_COL['氏名'], 120);
    s.setColumnWidth(INTAKE_COL['TEL'], 140);
    s.setColumnWidth(INTAKE_COL['主訴'], 280);
    s.setColumnWidth(INTAKE_COL['ステータス'], 140);
  }

  // 利用者イベントシート（2026/4/28追加 - 契約後/担会後/ケアマネ変更チェックリスト）
  if (!ss.getSheetByName('利用者イベント')) {
    var s = ss.insertSheet('利用者イベント');
    s.getRange(1, 1, 1, 10).setValues([[
      'id', 'eventType', 'userName', 'eventDate', 'metadata',
      'status', 'createdAt', 'createdBy', 'completedAt', 'stalledNotified'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 10).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 180);   // id
    s.setColumnWidth(2, 120);   // eventType
    s.setColumnWidth(3, 120);   // userName
    s.setColumnWidth(4, 110);   // eventDate
    s.setColumnWidth(5, 300);   // metadata (JSON)
    s.setColumnWidth(6, 100);   // status
    s.setColumnWidth(7, 160);   // createdAt
    s.setColumnWidth(8, 100);   // createdBy
    s.setColumnWidth(9, 160);   // completedAt
    s.setColumnWidth(10, 100);  // stalledNotified
  }

  // 利用者イベント項目シート（2026/4/28追加）
  if (!ss.getSheetByName('利用者イベント項目')) {
    var s = ss.insertSheet('利用者イベント項目');
    s.getRange(1, 1, 1, 11).setValues([[
      'id', 'eventId', 'seq', 'label', 'ownerTag', 'isUrgent',
      'status', 'doneAt', 'doneBy', 'memo', 'linkedTaskBoardId'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 11).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    s.setColumnWidth(1, 200);   // id
    s.setColumnWidth(2, 180);   // eventId
    s.setColumnWidth(3, 50);    // seq
    s.setColumnWidth(4, 300);   // label
    s.setColumnWidth(5, 100);   // ownerTag
    s.setColumnWidth(6, 70);    // isUrgent
    s.setColumnWidth(7, 80);    // status
    s.setColumnWidth(8, 160);   // doneAt
    s.setColumnWidth(9, 100);   // doneBy
    s.setColumnWidth(10, 240);  // memo
    s.setColumnWidth(11, 180);  // linkedTaskBoardId
  }

  Logger.log('セットアップ完了！出欠変更・伝達事項・ケアマネ連絡先・中止履歴・タスクボード・送信記録・見学体験新規の7シートを作成しました。');
}

// ===== 体験/見学予定が入った時に社長へメール通知 =====
function notifyOwnerOfNewSchedule(record, isNew) {
  try {
    if (!record || !record.予定日) return;
    var name = String(record.氏名 || record.ふりがな || '名前未入力').trim();
    var kindLabel = record.種別 === 'visit' ? '見学' : '体験';
    var subject = '【yawaragi】' + (isNew ? '新しい' : '日程変更：') + kindLabel + '予定: ' + name + '（' + record.予定日 + '）';
    var lines = [];
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push((isNew ? '新しい' : '日程が変更された') + kindLabel + '予定が入りました。');
    lines.push('出勤＆送迎表で送迎時間を組んでください。');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('■ 利用者情報');
    lines.push('  氏名     : ' + name);
    if (record.ふりがな && record.氏名) lines.push('  ふりがな : ' + record.ふりがな);
    lines.push('  種別     : ' + kindLabel);
    lines.push('  予定日   : ' + record.予定日);
    lines.push('  TEL      : ' + (record.TEL || '未入力') + (record.TEL続柄 ? '（' + record.TEL続柄 + '）' : ''));
    lines.push('  住所     : ' + (record.住所詳細 ? '埼玉県東松山市' + record.住所詳細 : '未入力'));
    lines.push('  介護度   : ' + (record.介護度 || '未入力'));
    lines.push('  送迎     : ' + (record.送迎有無 === true ? '有' : record.送迎有無 === false ? '無' : '未確認'));
    lines.push('');
    lines.push('■ ケアマネ');
    lines.push('  事業所   : ' + (record.ケアマネ事業所 || '未入力'));
    lines.push('  担当     : ' + (record.ケアマネ氏名 || '未入力'));
    lines.push('');
    if (record.ペースメーカー) {
      lines.push('■ 安全確認');
      lines.push('  ペースメーカー: ' + record.ペースメーカー + (record.ペースメーカー === '不明' ? ' ⚠️要確認（干渉波禁忌）' : ''));
      lines.push('');
    }
    if (record.主訴) {
      lines.push('■ 主訴');
      lines.push('  ' + record.主訴);
      lines.push('');
    }
    if (record.訪問注意事項) {
      lines.push('■ 訪問時の注意');
      lines.push('  ' + record.訪問注意事項);
      lines.push('');
    }
    lines.push('■ 対応リンク');
    lines.push('  yawaragiボード: ' + ScriptApp.getService().getUrl());
    lines.push('  出勤＆送迎表  : https://script.google.com/d/1eBQ1rrq53ifpGimxlwrTD9VgZLtpVzvh8V8jDIDbh1PNyW-qJGvVkshO/edit');
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('このメールは yawaragiボードから自動送信されています。');
    GmailApp.sendEmail(OWNER_EMAIL, subject, lines.join('\n'), { charset: 'UTF-8' });
  } catch (e) {
    Logger.log('社長通知メール送信失敗: ' + e.message);
  }
}

// ===== intake → 利用者台帳 同期（契約完了時に呼ぶ）=====
function syncIntakeToUserList(ss, data) {
  if (!data || !data.id) return { success: false, error: 'id必須' };
  // intakeレコード取得
  var iSheet = ss.getSheetByName('見学体験新規');
  if (!iSheet) return { success: false, error: '見学体験新規シートなし' };
  var iLastRow = iSheet.getLastRow();
  if (iLastRow < 2) return { success: false, error: 'intakeデータなし' };
  var iValues = iSheet.getRange(2, 1, iLastRow - 1, INTAKE_HEADERS.length).getValues();
  var iRowIdx = -1, iRecord = null;
  for (var i = 0; i < iValues.length; i++) {
    if (iValues[i][INTAKE_COL.id - 1] === data.id) {
      iRowIdx = i + 2;
      iRecord = {};
      INTAKE_HEADERS.forEach(function(h, idx) { iRecord[h] = iValues[i][idx]; });
      break;
    }
  }
  if (!iRecord) return { success: false, error: '該当intakeなし' };

  // 名前必須（漢字 or ふりがな）
  var name = String(iRecord.氏名 || iRecord.ふりがな || '').trim();
  if (!name) return { success: false, error: '氏名/ふりがな未入力' };

  // 利用者台帳へ
  var uSheet = ss.getSheetByName('利用者台帳');
  if (!uSheet) return { success: false, error: '利用者台帳シートなし' };
  var uHead = uSheet.getRange(1, 1, 1, uSheet.getLastColumn()).getValues()[0].map(function(v){ return String(v).trim(); });
  var col = function(names) {
    for (var i = 0; i < names.length; i++) {
      var idx = uHead.indexOf(names[i]);
      if (idx >= 0) return idx + 1;
    }
    return -1;
  };
  var nameCol = col(['名前','氏名','利用者名']);
  if (nameCol < 0) return { success: false, error: '利用者台帳に名前列なし' };

  // 既存レコード検索＋名前列の最終非空行を同時に算出
  // getLastRow() は他列の残骸まで拾うので append 位置の基準には使わない（行隙間バグ防止）
  var uLastRow = uSheet.getLastRow();
  var existingRow = -1;
  var lastNameRow = 1;
  if (uLastRow >= 2) {
    var nameCells = uSheet.getRange(2, nameCol, uLastRow - 1, 1).getValues();
    for (var j = 0; j < nameCells.length; j++) {
      var cellName = String(nameCells[j][0] || '').trim();
      if (cellName !== '') lastNameRow = j + 2;
      if (cellName === name && existingRow < 0) existingRow = j + 2;
    }
  }

  // 書き込み準備：列名→値のマップ
  var writeMap = {};
  writeMap[String(uHead[nameCol - 1])] = name;
  var setIfCol = function(colNames, value) {
    if (value == null || value === '') return;
    var c = col(colNames);
    if (c > 0) writeMap[uHead[c - 1]] = value;
  };
  setIfCol(['ふりがな','カナ','フリガナ','氏名（カナ）'], iRecord.ふりがな);
  setIfCol(['介護度','要介護'], iRecord.介護度);
  setIfCol(['ケアマネ担当'], iRecord.ケアマネ氏名);
  setIfCol(['ケアマネ事業所名','ケアマネ事業所','居宅'], iRecord.ケアマネ事業所);
  setIfCol(['電話','TEL','電話番号'], iRecord.TEL);
  setIfCol(['住所'], iRecord.住所詳細);
  setIfCol(['性別'], iRecord.性別 === 'male' ? '男' : iRecord.性別 === 'female' ? '女' : '');
  setIfCol(['生年月日'], iRecord.生年月日);
  setIfCol(['利用開始日','利用開始'], iRecord.本格利用開始日);
  setIfCol(['ステータス','利用状況'], '利用中');
  // 最終決定曜日「第1:月AM, 第2:水AM」→ 利用曜日「月水」＋ 午前/午後「午前」を抽出
  var _parsedDays = _parseFinalDayWishes(iRecord.最終決定曜日);
  setIfCol(['利用曜日'], _parsedDays.days);
  setIfCol(['午前/午後','午前午後','種別'], _parsedDays.ampm);

  var added = false;
  var rowNum;
  if (existingRow > 0) {
    rowNum = existingRow;
  } else {
    rowNum = lastNameRow + 1;
    added = true;
  }
  // 一括書き込み
  Object.keys(writeMap).forEach(function(headerName) {
    var c = uHead.indexOf(headerName) + 1;
    if (c > 0) uSheet.getRange(rowNum, c).setValue(writeMap[headerName]);
  });

  // intake側に反映済みフラグを立てる
  var now = nowIso();
  iSheet.getRange(iRowIdx, INTAKE_COL['利用者台帳反映済']).setValue(true);
  iSheet.getRange(iRowIdx, INTAKE_COL['利用者台帳反映日時']).setValue(now);
  iSheet.getRange(iRowIdx, INTAKE_COL['更新日時']).setValue(now);

  // 2026-05-31 Phase C: 本格利用開始日＋利用曜日から初回利用日リストを算出して保存
  try {
    var _firstDates = computeFirstUsageDates_(iRecord['本格利用開始日'], _parsedDays.days, _parsedDays.ampm);
    if (INTAKE_COL['初回利用日リスト']) {
      iSheet.getRange(iRowIdx, INTAKE_COL['初回利用日リスト']).setValue(JSON.stringify(_firstDates));
    }
  } catch (e) {}

  return {
    success: true,
    name: name,
    action: added ? 'added' : 'updated',
    rowNum: rowNum,
    fieldsWritten: Object.keys(writeMap)
  };
}

// ===== 体験者として利用者台帳に仮登録（2026-05-14追加）=====
// 見学・体験レコードから利用者台帳に「体験中」ステータスで行追加。
// 出勤＆送迎表・出席予定タブに自動表示される。
function addIntakeAsTrial(ss, data) {
  if (!data || !data.id) return { success: false, error: 'id必須' };

  var iSheet = ss.getSheetByName('見学体験新規');
  if (!iSheet) return { success: false, error: '見学体験新規シートなし' };

  // 不足列の自動補完（送迎表追加済・送迎表追加日時）
  _ensureTrialTrackingColumns(iSheet);

  var iLastRow = iSheet.getLastRow();
  if (iLastRow < 2) return { success: false, error: 'intakeデータなし' };
  var iHeadRow = iSheet.getRange(1, 1, 1, iSheet.getLastColumn()).getValues()[0];
  var iHead = iHeadRow.map(function(v){ return String(v).trim(); });
  var iIdCol = iHead.indexOf('id');
  if (iIdCol < 0) return { success: false, error: 'intakeシートにid列なし' };

  var iValues = iSheet.getRange(2, 1, iLastRow - 1, iSheet.getLastColumn()).getValues();
  var iRowIdx = -1, iRecord = null;
  for (var i = 0; i < iValues.length; i++) {
    if (String(iValues[i][iIdCol]).trim() === String(data.id).trim()) {
      iRowIdx = i + 2;
      iRecord = {};
      iHead.forEach(function(h, idx) { iRecord[h] = iValues[i][idx]; });
      break;
    }
  }
  if (!iRecord) return { success: false, error: '該当intakeなし: ' + data.id };

  var name = String(iRecord['氏名'] || iRecord['ふりがな'] || '').trim();
  if (!name) return { success: false, error: '氏名/ふりがな未入力' };

  // 第1希望から曜日・午前午後抽出
  var dayInfo = _parseFirstDayWish(iRecord['yawarigi希望曜日']);

  // 体験日・お迎え時間
  var planDate = '';
  if (iRecord['予定日']) {
    var pd = iRecord['予定日'];
    if (pd instanceof Date) {
      planDate = Utilities.formatDate(pd, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else {
      planDate = String(pd).trim();
    }
  }
  var pickupTime = String(iRecord['体験お迎え時間'] || '').trim();

  // 利用者台帳取得
  var uSheet = ss.getSheetByName('利用者台帳');
  if (!uSheet) return { success: false, error: '利用者台帳シートなし' };
  var uHead = uSheet.getRange(1, 1, 1, uSheet.getLastColumn()).getValues()[0].map(function(v){ return String(v).trim(); });
  var findUCol = function(names) {
    for (var k = 0; k < names.length; k++) {
      var idx = uHead.indexOf(names[k]);
      if (idx >= 0) return idx + 1;
    }
    return -1;
  };
  var nameCol = findUCol(['名前','氏名','利用者名']);
  if (nameCol < 0) return { success: false, error: '利用者台帳に名前列なし' };

  // 既存行検索（同名）→idempotent動作
  var uLastRow = uSheet.getLastRow();
  var existingRow = -1;
  if (uLastRow >= 2) {
    var nameCells = uSheet.getRange(2, nameCol, uLastRow - 1, 1).getValues();
    for (var j = 0; j < nameCells.length; j++) {
      if (String(nameCells[j][0] || '').trim() === name) { existingRow = j + 2; break; }
    }
  }

  // メモ
  var memo = '体験日: ' + (planDate || '未定');
  if (pickupTime) memo += ' / お迎え: ' + pickupTime;
  memo += ' / yawaragiボードから体験者として追加 (intake_id: ' + data.id + ')';

  // 書き込みマップ
  var writeMap = {};
  writeMap[uHead[nameCol - 1]] = name;
  var setIfCol = function(colNames, value) {
    if (value == null || value === '') return;
    var c = findUCol(colNames);
    if (c > 0) writeMap[uHead[c - 1]] = value;
  };
  setIfCol(['ふりがな','カナ','フリガナ','氏名（カナ）'], iRecord['ふりがな']);
  setIfCol(['介護度','要介護'], iRecord['介護度']);
  setIfCol(['ケアマネ担当者名','ケアマネ担当','ケアマネ氏名','担当ケアマネ'], iRecord['ケアマネ氏名']);
  setIfCol(['ケアマネ事業所名','ケアマネ事業所','居宅'], iRecord['ケアマネ事業所']);
  setIfCol(['電話','TEL','電話番号'], iRecord['TEL']);
  setIfCol(['住所'], iRecord['住所詳細']);
  setIfCol(['性別'], iRecord['性別'] === 'male' ? '男' : iRecord['性別'] === 'female' ? '女' : '');
  setIfCol(['生年月日'], iRecord['生年月日']);
  if (dayInfo.days) setIfCol(['利用曜日'], dayInfo.days);
  if (dayInfo.ampm) setIfCol(['午前/午後','午前午後'], dayInfo.ampm);
  setIfCol(['ステータス','利用状況'], '体験中');
  setIfCol(['備考','メモ'], memo);

  var rowNum;
  var actionType;
  if (existingRow > 0) {
    rowNum = existingRow;
    actionType = 'updated';
  } else {
    rowNum = uLastRow + 1;
    actionType = 'added';
  }
  Object.keys(writeMap).forEach(function(headerName) {
    var c = uHead.indexOf(headerName) + 1;
    if (c > 0) uSheet.getRange(rowNum, c).setValue(writeMap[headerName]);
  });

  // INTAKE側フラグ
  var now = nowIso();
  var trialFlagCol = iHead.indexOf('送迎表追加済') + 1;
  var trialDateCol = iHead.indexOf('送迎表追加日時') + 1;
  if (trialFlagCol > 0) iSheet.getRange(iRowIdx, trialFlagCol).setValue(true);
  if (trialDateCol > 0) iSheet.getRange(iRowIdx, trialDateCol).setValue(now);
  var updCol = iHead.indexOf('更新日時') + 1;
  if (updCol > 0) iSheet.getRange(iRowIdx, updCol).setValue(now);

  // 通知メール（失敗してもメイン処理成功扱い）
  try {
    var subject = '[yawaragi] 体験者を出勤＆送迎表に追加: ' + name;
    var body = name + ' さんを利用者台帳に「体験中」ステータスで追加しました。\n\n'
      + '体験日: ' + (planDate || '未定') + '\n'
      + 'お迎え時間: ' + (pickupTime || '未入力') + '\n'
      + '利用曜日: ' + (dayInfo.days || '未入力') + '\n'
      + '午前/午後: ' + (dayInfo.ampm || '未入力') + '\n\n'
      + '出勤＆送迎表・出席予定タブに自動表示されます。\n'
      + '不成立時は利用者台帳でステータスを「中止」に変更してください。';
    GmailApp.sendEmail('yawaragi.notify@gmail.com', subject, body, {charset: 'UTF-8'});
  } catch (e) {
    // メール失敗は無視
  }

  return {
    success: true,
    name: name,
    action: actionType,
    rowNum: rowNum,
    days: dayInfo.days,
    ampm: dayInfo.ampm,
    planDate: planDate,
    pickupTime: pickupTime,
    message: name + ' さんを利用者台帳に「体験中」で追加しました（' + actionType + '）'
  };
}

// yawarigi希望曜日の第1希望をパース → 利用者台帳の {利用曜日, 午前/午後} 用文字列に
function _parseFirstDayWish(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { days: '', ampm: '' };
  if (/いつでもOK/.test(raw)) return { days: '月火水木金', ampm: '午前午後' };
  if (/^後日ご連絡/.test(raw)) return { days: '', ampm: '' };

  var firstPart = raw.split(',')[0].trim();
  var m = firstPart.match(/^第1:([月火水木金土日\/]+)(AM|PM)?$/);
  if (!m) return { days: '', ampm: '' };

  var days = m[1].replace(/\//g, '');  // 「月/水」→「月水」
  var ampm = '';
  if (m[2] === 'AM') ampm = '午前';
  else if (m[2] === 'PM') ampm = '午後';
  else ampm = '午前午後';
  return { days: days, ampm: ampm };
}

// 最終決定曜日「第1:月AM, 第2:水AM」全ランクを統合 → 利用者台帳の {利用曜日, 午前/午後}
// _parseFirstDayWish が第1希望のみなのに対し、こちらは全ランクをマージする。
function _parseFinalDayWishes(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { days: '', ampm: '' };
  if (/いつでもOK/.test(raw)) return { days: '月火水木金', ampm: '午前午後' };
  if (/^後日ご連絡/.test(raw)) return { days: '', ampm: '' };
  var daySet = {};
  var hasAm = false, hasPm = false;
  raw.split(/[,、]/).forEach(function(part) {
    var m = part.match(/[月火水木金土]/g);
    if (m) m.forEach(function(d){ daySet[d] = true; });
    if (/AM|午前/i.test(part)) hasAm = true;
    if (/PM|午後/i.test(part)) hasPm = true;
  });
  var days = ['月','火','水','木','金','土'].filter(function(d){ return daySet[d]; }).join('');
  var ampm = (hasAm && hasPm) ? '午前午後' : hasAm ? '午前' : hasPm ? '午後' : '';
  return { days: days, ampm: ampm };
}

// 見学体験新規シートに「送迎表追加済」「送迎表追加日時」列を自動補完
function _ensureTrialTrackingColumns(sheet) {
  var lastCol = sheet.getLastColumn();
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  ['送迎表追加済','送迎表追加日時'].forEach(function(h) {
    if (existing.indexOf(h) === -1) {
      var newCol = sheet.getLastColumn() + 1;
      sheet.insertColumnAfter(sheet.getLastColumn());
      sheet.getRange(1, newCol).setValue(h);
      sheet.getRange(1, newCol).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
  });
}

// ===== 不足している列を自動追加（2026/4/23 TEL続柄・ケアマネ事業所追加対応）=====
// このスクリプトを1回だけ実行すると、見学体験新規シートに不足列を自動追加します
function addMissingIntakeColumns() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) {
    Logger.log('見学体験新規シートが見つかりません');
    return;
  }
  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var added = [];
  INTAKE_HEADERS.forEach(function(h) {
    if (existing.indexOf(h) === -1) {
      var newCol = sheet.getLastColumn() + 1;
      sheet.insertColumnAfter(sheet.getLastColumn());
      sheet.getRange(1, newCol).setValue(h);
      sheet.getRange(1, newCol).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
      added.push(h);
    }
  });
  var msg = added.length === 0
    ? '✅ 全ての列がすでに存在しています。追加は不要でした。'
    : '✅ 列を追加しました：' + added.join('、');
  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

// ===== Web API: GET（JSONP対応）=====
function doGet(e) {
  try {
  // 2026-07-04 非本番オリジンのログ取得（第1段階・テレメトリのみ）。
  //   URL/UA/時刻だけを origin_log シートに追記。個人情報・利用者データは一切扱わない。
  //   暴走防止: 上限1000行 + origin単位の重複排除（クライアントのセッションdedupと二重）。
  //   失敗しても静かに ok を返す（Imageビーコンなので中身は使われない・現場を妨げない）。
  if (e && e.parameter && e.parameter.action === 'log_origin') {
    try { logNonProdOrigin_(e.parameter); } catch (logErr) { /* テレメトリ失敗は無視 */ }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }
  // 振り分け: ?mode=summary は 利用者台帳の集計エンドポイント（コード.gs の handleSummary）へ
  if (e && e.parameter && e.parameter.mode === 'summary') {
    return handleSummary(e);
  }

  // アプリ台帳（2026-06-08 P1 / 2026-06-10 P1.1）
  if (e && e.parameter && e.parameter.action === 'appregistry_init') {
    return jsonResp(appregistryInit_());
  }
  if (e && e.parameter && e.parameter.action === 'appregistry_setup') {
    return jsonResp(appregistrySetup_());
  }
  if (e && e.parameter && e.parameter.action === 'getAppRegistry') {
    return jsonResp(getAppRegistry_(e));
  }
  if (e && e.parameter && e.parameter.action === 'appregistry_drop_legacy') {
    return jsonResp(appregistryDropLegacy_());
  }

  // メンテナンス用: setupSheets を実行（2026/5/3追加・送付用居宅一覧シート作成用）
  if (e && e.parameter && e.parameter.action === 'maintenance_setup_sheets') {
    try {
      setupSheets();
      var ss2 = SpreadsheetApp.openById(SS_ID);
      var newSh = ss2.getSheetByName('送付用居宅一覧');
      var msg = '送付用居宅一覧シート: ' + (newSh ? '存在 (' + newSh.getLastRow() + '行)' : '未作成');
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'setupSheets実行完了', detail: msg })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // メンテナンス用: 利用者台帳に「送付方法上書き」列を末尾追加（冪等・既存データ非破壊・2026-06-17）
  // 値: 空=事業所マップに従う / 'PDF' / '印刷'。判定は _getCaremaneSendMethodMap_ が上書き優先で参照。
  if (e && e.parameter && e.parameter.action === 'ensure_soufu_override_column') {
    try {
      var soSS = SpreadsheetApp.openById(SS_ID);
      var soSheet = soSS.getSheetByName('利用者台帳');
      if (!soSheet) throw new Error('利用者台帳シートが見つかりません');
      var soHead = soSheet.getRange(1, 1, 1, soSheet.getLastColumn()).getValues()[0]
                    .map(function (v) { return String(v).trim(); });
      var soIdx = soHead.indexOf('送付方法上書き');
      if (soIdx >= 0) {
        return jsonResp({ success: true, created: false, message: '既に存在（列 ' + (soIdx + 1) + '）' });
      }
      var soCol = soSheet.getLastColumn() + 1;
      soSheet.getRange(1, soCol).setValue('送付方法上書き');
      // 入力規則（空/PDF/印刷）を2行目以降に付与
      var soRows = Math.max(soSheet.getLastRow() - 1, 1);
      var soRule = SpreadsheetApp.newDataValidation().requireValueInList(['', 'PDF', '印刷'], true).setAllowInvalid(true).build();
      soSheet.getRange(2, soCol, soRows, 1).setDataValidation(soRule);
      return jsonResp({ success: true, created: true, message: '送付方法上書き列を作成（列 ' + soCol + '）' });
    } catch (soErr) {
      return jsonResp({ success: false, error: soErr.message });
    }
  }

  // メンテナンス用: 要支援者の「計画書開始」列をクリア（2026/5/3追加・並行チャット事故で再追加）
  // dryRun=1 で件数のみ確認、なしで実行
  // 経緯: 運動器機能向上加算廃止後の遺産データを除去・複数アプリでの誤バッジ発火を防ぐ
  if (e && e.parameter && e.parameter.action === 'maintenance_clear_shien_planstart') {
    var dryRun = e.parameter.dryRun === '1';
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('利用者台帳');
      if (!sheet) throw new Error('利用者台帳シートが見つかりません');
      var data = sheet.getDataRange().getValues();
      var h = data[0].map(function(v){ return String(v).trim(); });
      var careCol = findCol(h, ['要介護度', '介護度']);
      var planStartCol = findCol(h, ['計画書開始']);
      if (careCol < 0) throw new Error('要介護度列が見つかりません');
      if (planStartCol < 0) throw new Error('計画書開始列が見つかりません');

      var totalShien = 0;
      var hasPlanStart = 0;
      var cleared = 0;
      for (var i = 1; i < data.length; i++) {
        var care = String(data[i][careCol] || '').trim();
        var planStart = String(data[i][planStartCol] || '').trim();
        if (care.indexOf('要支援') < 0) continue;
        totalShien++;
        if (planStart) {
          hasPlanStart++;
          if (!dryRun) {
            sheet.getRange(i + 1, planStartCol + 1).clearContent();
            cleared++;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        dryRun: dryRun,
        summary: { total_shien: totalShien, has_plan_start: hasPlanStart, cleared: cleared }
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // メンテナンス用エンドポイント（クロコがclasp経由で実行する用）
  if (e && e.parameter && e.parameter.action === 'maintenance_add_columns') {
    var result = (function() {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('見学体験新規');
      if (!sheet) return { success: false, error: '見学体験新規シートが見つかりません' };
      var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var added = [];
      INTAKE_HEADERS.forEach(function(h) {
        if (existing.indexOf(h) === -1) {
          var newCol = sheet.getLastColumn() + 1;
          sheet.insertColumnAfter(sheet.getLastColumn());
          sheet.getRange(1, newCol).setValue(h);
          sheet.getRange(1, newCol).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
          added.push(h);
        }
      });
      return { success: true, added: added, message: added.length === 0 ? '全列既存・追加不要' : '列を追加しました：' + added.join('、') };
    })();
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // メンテナンス用: 2026-07-04 指示書②: 利用者台帳 N/W 列ヘッダ改名（現値検証付き・冪等）
  // N「ケアマネメールアドレス」→「ケアマネ個人メアド」／ W(空欄)→「欠席連絡メアド」。dryRun=1でプレビュー。
  if (e && e.parameter && e.parameter.action === 'maintenance_rename_cm_headers') {
    var dryRunRen = e.parameter.dryRun === '1';
    var resultRen = (function() {
      var ssRen = SpreadsheetApp.openById(SS_ID);
      var shRen = ssRen.getSheetByName('利用者台帳');
      if (!shRen) return { success: false, error: '利用者台帳シートが見つかりません' };
      var hRen = shRen.getRange(1, 1, 1, shRen.getLastColumn()).getValues()[0].map(function(v){ return String(v).trim(); });
      var repRen = { success: true, dryRun: dryRunRen, actions: [] };
      // N列: 旧名→新名（冪等: 既に新名ならskip・旧新どちらも不在なら中断）
      var nIdxRen = hRen.indexOf('ケアマネメールアドレス');
      if (nIdxRen >= 0) {
        repRen.actions.push({ col: nIdxRen + 1, from: 'ケアマネメールアドレス', to: 'ケアマネ個人メアド' });
        if (!dryRunRen) shRen.getRange(1, nIdxRen + 1).setValue('ケアマネ個人メアド');
      } else if (hRen.indexOf('ケアマネ個人メアド') >= 0) {
        repRen.actions.push({ col: hRen.indexOf('ケアマネ個人メアド') + 1, skip: 'N列は既に新名' });
      } else {
        return { success: false, error: 'N列想定ヘッダが旧名/新名とも見つかりません', headers: hRen };
      }
      // W列(23列目): 空欄→新名（空欄でも新名でもない値なら中断=誤爆防止）
      var wValRen = hRen.length >= 23 ? hRen[22] : '';
      if (wValRen === '') {
        repRen.actions.push({ col: 23, from: '(空欄)', to: '欠席連絡メアド' });
        if (!dryRunRen) shRen.getRange(1, 23).setValue('欠席連絡メアド');
      } else if (wValRen === '欠席連絡メアド') {
        repRen.actions.push({ col: 23, skip: 'W列は既に新名' });
      } else {
        return { success: false, error: 'W列(23列目)が空欄でも新名でもありません: "' + wValRen + '"' };
      }
      return repRen;
    })();
    return ContentService.createTextOutput(JSON.stringify(resultRen)).setMimeType(ContentService.MimeType.JSON);
  }

  // メンテナンス用: 2026-07-04 指示書②ステップ3: 台帳テスト行（クロコテスト）の追加/削除
  // 改名後N列（ケアマネ個人メアド・新名のみで解決）読取→欠席メール実測用。検証後は必ずdeleteで消す。
  if (e && e.parameter && e.parameter.action === 'maintenance_upsert_test_user_row') {
    var resultTU = (function() {
      var ssTU = SpreadsheetApp.openById(SS_ID);
      var shTU = ssTU.getSheetByName('利用者台帳');
      if (!shTU) return { success: false, error: '利用者台帳シートが見つかりません' };
      var hTU = shTU.getRange(1, 1, 1, shTU.getLastColumn()).getValues()[0].map(function(v){ return String(v).trim(); });
      // ★新名のみで解決（旧名フォールバックを意図的に外し、N列改名の実証を兼ねる）
      var colsTU = {
        '名前': 'クロコテスト', 'カナ': 'クロコテスト',
        'ケアマネ担当者名': 'クロコテスト担当', 'ケアマネ事業所名': 'クロコテスト事業所',
        'ケアマネ個人メアド': 'm-higa@keepfitlife.com',
        '利用ステータス': 'テスト', 'ケアマネ連絡手段': 'メール'
      };
      var nameIdxTU = hTU.indexOf('名前');
      if (nameIdxTU < 0) return { success: false, error: '名前列が見つかりません' };
      var missTU = Object.keys(colsTU).filter(function(k){ return hTU.indexOf(k) < 0; });
      if (missTU.length) return { success: false, error: '列が見つかりません: ' + missTU.join('、'), headers: hTU };
      var lastTU = shTU.getLastRow();
      var namesTU = shTU.getRange(2, nameIdxTU + 1, Math.max(lastTU - 1, 1), 1).getValues();
      var rowTU = -1;
      for (var iTU = 0; iTU < namesTU.length; iTU++) {
        if (String(namesTU[iTU][0]).trim() === 'クロコテスト') { rowTU = iTU + 2; break; }
      }
      if (rowTU < 0) rowTU = lastTU + 1;
      Object.keys(colsTU).forEach(function(k) {
        shTU.getRange(rowTU, hTU.indexOf(k) + 1).setValue(colsTU[k]);
      });
      return { success: true, row: rowTU, upserted: colsTU };
    })();
    return ContentService.createTextOutput(JSON.stringify(resultTU)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'maintenance_delete_test_user_row') {
    var resultTD = (function() {
      var ssTD = SpreadsheetApp.openById(SS_ID);
      var shTD = ssTD.getSheetByName('利用者台帳');
      if (!shTD) return { success: false, error: '利用者台帳シートが見つかりません' };
      var hTD = shTD.getRange(1, 1, 1, shTD.getLastColumn()).getValues()[0].map(function(v){ return String(v).trim(); });
      var nameIdxTD = hTD.indexOf('名前');
      if (nameIdxTD < 0) return { success: false, error: '名前列が見つかりません' };
      var lastTD = shTD.getLastRow();
      var namesTD = shTD.getRange(2, nameIdxTD + 1, Math.max(lastTD - 1, 1), 1).getValues();
      var deletedTD = 0;
      for (var iTD = namesTD.length - 1; iTD >= 0; iTD--) { // 下から消す（行ズレ防止）
        if (String(namesTD[iTD][0]).trim() === 'クロコテスト') {
          shTD.deleteRow(iTD + 2);
          deletedTD++;
        }
      }
      return { success: true, deleted: deletedTD };
    })();
    return ContentService.createTextOutput(JSON.stringify(resultTD)).setMimeType(ContentService.MimeType.JSON);
  }

  // メンテナンス用: 地域包括のメアド誤記を修正（2026-05-21 バウンス事故対応）
  // 送付用居宅一覧の houkatsu@ 誤ドメインを houkatsu@smile-shakyo.jp に統一する。dryRun=1でプレビュー。
  if (e && e.parameter && e.parameter.action === 'maintenance_fix_houkatsu') {
    var dryRunH = e.parameter.dryRun === '1';
    try {
      var ssH = SpreadsheetApp.openById(SS_ID);
      var shH = getCmContactsSheet(ssH);
      if (!shH) throw new Error('送付用居宅一覧シートが見つかりません');
      var colsH = _readCmCols(shH);
      if (colsH.email < 0) throw new Error('メール列が見つかりません');
      var dataH = shH.getDataRange().getValues();
      var CORRECT_H = 'houkatsu@smile-shakyo.jp';
      var BAD_H = ['houkatsu@smile-syakyo.jp', 'houkatsu@smie-shakyo.jp'];
      var fixedH = [];
      var allHoukatsu = [];
      for (var iH = 1; iH < dataH.length; iH++) {
        var emailH = String(dataH[iH][colsH.email] || '').trim();
        if (emailH.toLowerCase().indexOf('houkatsu@') === 0) {
          allHoukatsu.push({ row: iH + 1, office: String(dataH[iH][colsH.office] || ''), name: colsH.name >= 0 ? String(dataH[iH][colsH.name] || '') : '', email: emailH });
        }
        if (BAD_H.indexOf(emailH.toLowerCase()) >= 0 && emailH !== CORRECT_H) {
          if (!dryRunH) shH.getRange(iH + 1, colsH.email + 1).setValue(CORRECT_H);
          fixedH.push({ row: iH + 1, office: String(dataH[iH][colsH.office] || ''), name: colsH.name >= 0 ? String(dataH[iH][colsH.name] || '') : '', before: emailH, after: CORRECT_H });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, dryRun: dryRunH, fixedCount: fixedH.length, fixed: fixedH, allHoukatsuRows: allHoukatsu })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // バウンス検知を手動実行（2026-05-21）
  if (e && e.parameter && e.parameter.action === 'scan_bounces') {
    try {
      var repB = scanCmMailBounces();
      return ContentService.createTextOutput(JSON.stringify({ success: true, report: repB })).setMimeType(ContentService.MimeType.JSON);
    } catch (errB) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: errB.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // バウンス検知の定期トリガー設置（2026-05-21・1回だけ実行すればOK）
  if (e && e.parameter && e.parameter.action === 'maintenance_install_bounce_trigger') {
    try {
      var instB = installBounceTrigger();
      return ContentService.createTextOutput(JSON.stringify({ success: true, result: instB })).setMimeType(ContentService.MimeType.JSON);
    } catch (errT) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: errT.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 予約反映機能: 利用者台帳に予約列5本を追加（2026-05-29）
  if (e && e.parameter && e.parameter.action === 'maintenance_add_yoyaku_columns') {
    try {
      var ss_y = SpreadsheetApp.openById(SS_ID);
      var sh_y = ss_y.getSheetByName('利用者台帳');
      if (!sh_y) throw new Error('利用者台帳シートがありません');

      var hdr = sh_y.getRange(1, 1, 1, sh_y.getLastColumn()).getValues()[0]
                    .map(function(h) { return String(h).trim(); });

      var needCols = [
        '予約介護度', '介護度適用月',
        '予約ケアマネ事業所', '予約ケアマネ担当者', 'ケアマネ適用月'
      ];
      var added = [];
      needCols.forEach(function(name) {
        if (hdr.indexOf(name) < 0) {
          var lastCol = sh_y.getLastColumn();
          sh_y.getRange(1, lastCol + 1).setValue(name);
          added.push(name);
          hdr.push(name);
        }
      });

      return ContentService.createTextOutput(JSON.stringify({
        ok: true, added: added, message: added.length + '列追加しました'
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false, error: err.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 予約反映機能: 予約反映ログシート新規作成（2026-05-29）
  if (e && e.parameter && e.parameter.action === 'maintenance_create_yoyaku_log_sheet') {
    try {
      var ss_l = SpreadsheetApp.openById(SS_ID);
      var sh_l = ss_l.getSheetByName('予約反映ログ');
      if (sh_l) {
        return ContentService.createTextOutput(JSON.stringify({
          ok: true, message: '予約反映ログシートは既に存在します'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      sh_l = ss_l.insertSheet('予約反映ログ');
      sh_l.getRange(1, 1, 1, 7).setValues([[
        '反映日時', '利用者名', '種別', '旧値', '新値', '適用月', 'モード'
      ]]);
      sh_l.getRange(1, 1, 1, 7).setFontWeight('bold');
      sh_l.setFrozenRows(1);
      return ContentService.createTextOutput(JSON.stringify({
        ok: true, message: '予約反映ログシートを作成しました'
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false, error: err.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 区変管理エンドポイント
  // 実績送付スキャン結果の取得（2026/5/30追加・信号機ダッシュボード）
  if (e && e.parameter && e.parameter.action === 'scan_jisseki_get') {
    return respond(getScanJissekiCoverage_(e.parameter.ym), e.parameter.callback);
  }
  // 送付済トグル（GET＋JSONP版・CORS回避で応答を読めるように）
  if (e && e.parameter && e.parameter.action === 'scan_jisseki_mark_sent') {
    var _sentVal = (e.parameter.sent === 'true' || e.parameter.sent === '1');
    return respond(markScanSent_(e.parameter.ym, e.parameter.name, _sentVal), e.parameter.callback);
  }
  // 朝報告 集約エンドポイント（8項目を1JSONで返す・2026-06-03）
  if (e && e.parameter && e.parameter.action === 'morningDigest') {
    return morningDigest(e);
  }
  if (e && e.parameter && e.parameter.action === 'teireiList') {
    return respond(teireiListAction_(SpreadsheetApp.openById(SS_ID), _shiftDateParam_(e)), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'completeTeirei') {
    return respond(completeTeireiAction_(SpreadsheetApp.openById(SS_ID), e.parameter.id, e.parameter.month, e.parameter.note), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'uncompleteTeirei') {
    return respond(uncompleteTeireiAction_(SpreadsheetApp.openById(SS_ID), e.parameter.id, e.parameter.month), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'setupTeireiSheets') {
    return respond(setupTeireiSheets_(SpreadsheetApp.openById(SS_ID)), e.parameter.callback);
  }
  // 朝報告 残タスク：一覧取得（未完了だけ・読み取り専用・2026-06-14）
  if (e && e.parameter && e.parameter.action === 'pendingTasksList') {
    return respond({ ok: true, tasks: getPendingTasks_(SpreadsheetApp.openById(SS_ID)) }, e.parameter.callback);
  }
  // 朝報告 残タスク：初期セットアップ（シート作成＋2件シード・冪等・2026-06-14）
  if (e && e.parameter && e.parameter.action === 'setupPendingTasks') {
    return respond(setupPendingTasks_(SpreadsheetApp.openById(SS_ID)), e.parameter.callback);
  }
  // 朝報告 残タスク：完了（クロコが叩く・冪等・id無効は明示・書込後に読み直し検証・2026-06-14）
  if (e && e.parameter && e.parameter.action === 'completePendingTask') {
    return respond(completePendingTaskAction_(SpreadsheetApp.openById(SS_ID), e.parameter.id), e.parameter.callback);
  }
  // シフト 公開リマインド（毎朝・終わるまで方式・月次自動再出現・2026-06-22）
  if (e && e.parameter && e.parameter.action === 'setupShiftState') {
    return respond(setupShiftState_(SpreadsheetApp.openById(SS_ID)), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'completeShift') {
    return respond(completeShiftAction_(SpreadsheetApp.openById(SS_ID), _shiftDateParam_(e)), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'shiftStatus') {
    return respond(shiftStatusAction_(SpreadsheetApp.openById(SS_ID), _shiftDateParam_(e)), e.parameter.callback);
  }
  if (e && e.parameter && e.parameter.action === 'resetShiftState') {
    return respond(resetShiftStateAction_(SpreadsheetApp.openById(SS_ID)), e.parameter.callback);
  }
  // 伝達ボード：一覧（未完了のみ＝dbFilterActive_・期限切れも残す・JSONP・2026-06-18/06-21）
  if (e && e.parameter && e.parameter.action === 'dengonBoard') {
    return respond({ ok: true, items: getDengonBoard(SpreadsheetApp.openById(SS_ID), e.parameter.today) }, e.parameter.callback);
  }
  // 伝達ボード：初期セットアップ＋旧pendingTasks移行（from=社長/to=社長・冪等・2026-06-18）
  if (e && e.parameter && e.parameter.action === 'setupDengonBoard') {
    return respond(setupDengonBoard(SpreadsheetApp.openById(SS_ID)), e.parameter.callback);
  }
  // 伝達ボード：完了（検証付き＝書込後に読み直し・スタッフ宛てはnotify@・JSONP・2026-06-18）
  if (e && e.parameter && e.parameter.action === 'completeDengonMessage') {
    return respond(completeDengonMessage(SpreadsheetApp.openById(SS_ID), e.parameter.id, e.parameter.doneBy), e.parameter.callback);
  }
  // 伝達ボード：完了履歴（done=true を doneAt降順・JSONP・2026-06-21）
  if (e && e.parameter && e.parameter.action === 'dengonHistory') {
    return respond({ ok: true, items: getDengonHistory(SpreadsheetApp.openById(SS_ID)) }, e.parameter.callback);
  }
  // 伝達ボード：未完了に戻す（done=false・doneAt/doneByクリア・検証付き・JSONP・2026-06-21）
  if (e && e.parameter && e.parameter.action === 'reopenDengonMessage') {
    return respond(reopenDengonMessage(SpreadsheetApp.openById(SS_ID), e.parameter.id), e.parameter.callback);
  }
  // 伝達ボード：掃除用 削除（db_ で始まるテスト/誤投稿idのみ・実データは保護・2026-06-18）
  if (e && e.parameter && e.parameter.action === 'deleteDengonMessage') {
    return respond(deleteDengonMessage(SpreadsheetApp.openById(SS_ID), e.parameter.id), e.parameter.callback);
  }
  // 伝達ボード：掃除用 一括削除（db_ で始まる行を全削除・完了済み物理行も一掃・2026-06-18）
  if (e && e.parameter && e.parameter.action === 'clearDengonTestRows') {
    return respond(clearDengonTestRows(SpreadsheetApp.openById(SS_ID)), e.parameter.callback);
  }
  // 月次⑦（新規・終了・キャンセル）自動集計（2026-06-14）
  if (e && e.parameter && e.parameter.action === 'monthlyShichi') {
    return jsonResp(getMonthlyShichi(SpreadsheetApp.openById(SS_ID), e.parameter.ym));
  }
  if (e && e.parameter && e.parameter.action === 'moveDriveFile') {
    return handleMoveDriveFile(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunList') {
    return handleKubunHenkouList(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunSet') {
    return handleKubunHenkouSet(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunUpdate') {
    return handleKubunHenkouUpdate(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunClear') {
    return handleKubunHenkouClear(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunDelayList') {
    return handleKubunDelayList(e);
  }
  if (e && e.parameter && e.parameter.action === 'updateKubunDelayInsurance') {
    return handleUpdateKubunDelayInsurance(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunHistoryList') {
    return handleKubunHistoryList(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunHistoryUpdate') {
    return handleKubunHistoryUpdate(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunHistoryEditRecord') {
    return handleKubunHistoryEdit(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunHistoryDeleteRecord') {
    return handleKubunHistoryDelete(e);
  }
  // 2026-05-29 予約反映機能
  if (e && e.parameter && e.parameter.action === 'listScheduled') {
    return handleListScheduled(e);
  }
  if (e && e.parameter && e.parameter.action === 'kubunCancelScheduled') {
    return handleKubunCancelScheduled(e);
  }
  if (e && e.parameter && e.parameter.action === 'cmCancelScheduled') {
    return handleCmCancelScheduled(e);
  }
  if (e && e.parameter && e.parameter.action === 'applyScheduledNow') {
    return handleApplyScheduledNow(e);
  }
  if (e && e.parameter && e.parameter.action === 'maintenance_run_apply_scheduled') {
    try {
      var res_a = applyScheduledKubunAndCaremanager();
      return ContentService.createTextOutput(JSON.stringify({
        ok: true, applied: res_a.applied, count: res_a.applied.length
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false, error: err.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (e && e.parameter && e.parameter.action === 'maintenance_install_kubun_apply_trigger') {
    try {
      var triggers = ScriptApp.getProjectTriggers();
      triggers.forEach(function(t) {
        if (t.getHandlerFunction() === 'applyScheduledKubunAndCaremanager') {
          ScriptApp.deleteTrigger(t);
        }
      });
      ScriptApp.newTrigger('applyScheduledKubunAndCaremanager')
        .timeBased().atHour(3).everyDays(1).create();
      return ContentService.createTextOutput(JSON.stringify({
        ok: true, message: 'applyScheduledKubunAndCaremanager 毎日3:00トリガー設置完了'
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false, error: err.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (e && e.parameter && e.parameter.action === 'updateUserUsageDays') {
    return handleUpdateUserUsageDays(e);
  }
  if (e && e.parameter && e.parameter.action === 'applyScheduledUsageDays') {
    return handleApplyScheduledUsageDays(e);
  }
  // JSONP対応の利用者イベント登録（add_user_event のGETラッパー）
  if (e && e.parameter && e.parameter.action === 'addUserEventGet') {
    try {
      var ss_ = SpreadsheetApp.openById(SS_ID);
      var meta_ = {};
      if (e.parameter.metadata) {
        try { meta_ = JSON.parse(e.parameter.metadata); } catch(_) { meta_ = {}; }
      }
      var res_ = addUserEvent(ss_, {
        eventType: e.parameter.eventType,
        userName: e.parameter.userName,
        eventDate: e.parameter.eventDate,
        metadata: meta_,
        createdBy: e.parameter.createdBy || '代表'
      });
      return respond(res_, e.parameter.callback);
    } catch (errEv) {
      return respond({ success: false, error: errEv.message }, e.parameter.callback);
    }
  }
  if (e && e.parameter && e.parameter.action === 'updateContact') {
    return handleUpdateContact(e);
  }

  // メンテナンス用: tasks_master の end_date列(G)を文字列書式に変更（締切自由記述対応・2026-05-26）
  if (e && e.parameter && e.parameter.action === 'maintenance_tasks_end_date_text') {
    try {
      var shM = SpreadsheetApp.openById(SS_ID).getSheetByName('tasks_master');
      if (!shM) throw new Error('tasks_masterシートがありません');
      shM.getRange('G:G').setNumberFormat('@');
      return ContentService.createTextOutput(JSON.stringify({ok:true, message:'G列(end_date)を文字列書式に変更しました'})).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, error: err.message})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ===== 業務担当アプリ カテゴリAPI（2026-05-26追加）=====
  if (e && e.parameter && e.parameter.action === 'list_categories') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, categories: listCategories_() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'add_category') {
    return ContentService.createTextOutput(JSON.stringify(addCategory_({
      name:        e.parameter.name,
      color:       e.parameter.color,
      operator_id: e.parameter.operator_id
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'update_category') {
    return ContentService.createTextOutput(JSON.stringify(updateCategory_({
      category_id: e.parameter.category_id,
      name:        e.parameter.name,
      sort_order:  e.parameter.sort_order,
      color:       e.parameter.color,
      operator_id: e.parameter.operator_id
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'archive_category') {
    return ContentService.createTextOutput(JSON.stringify(archiveCategory_({
      category_id: e.parameter.category_id,
      operator_id: e.parameter.operator_id
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'list_tasks') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, tasks: listTasks_(e.parameter.include) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'add_task') {
    return ContentService.createTextOutput(JSON.stringify(addTask_({
      category_id:   e.parameter.category_id,
      task_name:     e.parameter.task_name,
      kind:          e.parameter.kind || '定期',
      primary_id:    e.parameter.primary_id,
      secondary_id:  e.parameter.secondary_id,
      end_date:      e.parameter.end_date,
      memo:          e.parameter.memo,
      operator_id:   e.parameter.operator_id,
      is_proposal:   e.parameter.is_proposal === 'true'
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'update_task') {
    return ContentService.createTextOutput(JSON.stringify(updateTask_({
      task_id:      e.parameter.task_id,
      category_id:  e.parameter.category_id,
      task_name:    e.parameter.task_name,
      kind:         e.parameter.kind,
      primary_id:   e.parameter.primary_id,
      secondary_id: e.parameter.secondary_id,
      end_date:     e.parameter.end_date,
      memo:         e.parameter.memo,
      sort_order:   e.parameter.sort_order,
      operator_id:  e.parameter.operator_id,
      note:         e.parameter.note
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'approve_task') {
    return ContentService.createTextOutput(JSON.stringify(approveTask_({
      task_id:      e.parameter.task_id,
      category_id:  e.parameter.category_id,
      task_name:    e.parameter.task_name,
      kind:         e.parameter.kind,
      primary_id:   e.parameter.primary_id,
      secondary_id: e.parameter.secondary_id,
      end_date:     e.parameter.end_date,
      memo:         e.parameter.memo,
      operator_id:  e.parameter.operator_id
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'reject_task') {
    return ContentService.createTextOutput(JSON.stringify(rejectTask_({
      task_id:     e.parameter.task_id,
      reason:      e.parameter.reason,
      operator_id: e.parameter.operator_id
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'archive_task') {
    return ContentService.createTextOutput(JSON.stringify(archiveTask_({
      task_id:     e.parameter.task_id,
      operator_id: e.parameter.operator_id,
      note:        e.parameter.note
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'list_task_history') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, history: listTaskHistory_(e.parameter.task_id) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'add_comment') {
    return ContentService.createTextOutput(JSON.stringify(addComment_({
      task_id:     e.parameter.task_id,
      body:        e.parameter.body,
      operator_id: e.parameter.operator_id
    }))).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'list_comments') {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, comments: listComments_(e.parameter.task_id) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter && e.parameter.action === 'tasks_setup') {
    // クロコが一回きりリモート初期化するための内部API。
    // setupTasksSheets と _seedInitialCategories_ は両方とも重複実行ガード付き。
    try {
      setupTasksSheets();
      _seedInitialCategories_();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'シート4つ作成＋初期12カテゴリ＋未分類 投入完了' }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  var callback = e && e.parameter ? e.parameter.callback : null;
  var action = e && e.parameter ? e.parameter.action || 'all' : 'all';
  var dateStr = e && e.parameter ? e.parameter.date : null;

  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var today = dateStr || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var dow = getDayOfWeek(today);

    var result = { success: true, date: today, dayOfWeek: dow };

    if (action === 'all' || action === 'attendance') {
      result.attendance = getAttendance(ss, today, dow);
    }
    if (action === 'all' || action === 'absences') {
      var monthStr = e && e.parameter ? e.parameter.month : null;
      result.absences = getUpcomingAbsences(ss, today, monthStr);
    }
    if (action === 'all' || action === 'messages') {
      result.messages = getMessages(ss, today);
    }
    if (action === 'all' || action === 'contacts') {
      result.cmContacts = getCmContacts(ss);
    }
    if (action === 'all') {
      result.patterns = getUserPatterns(ss);
    }
    if (action === 'terminations') {
      var period = e && e.parameter ? e.parameter.period : 'all';
      result.terminations = getTerminations(ss, period);
    }
    if (action === 'board_tasks') {
      var taskDate = dateStr || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      result.boardTasks = getBoardTasks(ss, taskDate);
    }
    if (action === 'folder_status') {
      var ym = e && e.parameter ? e.parameter.yearMonth : null;
      if (!ym) ym = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
      result = getJissekiFolderStatus(ym);
    }
    if (action === 'send_history') {
      var ym = e && e.parameter ? e.parameter.yearMonth : null;
      result.sendHistory = getSendHistory(ss, ym);
    }
    if (action === 'monthly_usage') {
      // 出席予定タブで名前タップ時の月次利用状況モーダル用（2026-05-25追加）
      var muName = e && e.parameter ? e.parameter.name : '';
      var muYm   = e && e.parameter ? e.parameter.yearMonth : '';
      return respond(getMonthlyUsage(ss, muName, muYm), callback);
    }
    if (action === 'intake_list') {
      var includeCancelled = e && e.parameter && e.parameter.includeCancelled === '1';
      var statusFilter = e && e.parameter ? e.parameter.status : null;
      var pendingApproval = e && e.parameter && e.parameter.pendingApproval === '1';
      result.intakes = getIntakeList(ss, {
        includeCancelled: includeCancelled,
        status: statusFilter,
        pendingApproval: pendingApproval
      });
      return respond(result, callback);
    }
    if (action === 'intake_followup_pending') {
      return respond(getIntakeFollowupPending(ss), callback);
    }
    if (action === 'intake_get_funnel') {
      return respond(getIntakeFunnel(ss, e.parameter), callback);
    }
    if (action === 'admin_dump_intake_headers') {
      var _ds = ss.getSheetByName('見学体験新規');
      var _dh = _ds.getRange(1,1,1,_ds.getLastColumn()).getValues()[0].map(function(v){return String(v).trim();});
      return respond({ success:true, sheetCols:_dh.length, headersLen:INTAKE_HEADERS.length,
        sheet:_dh, code:INTAKE_HEADERS,
        mismatch:_dh.map(function(h,i){return h===INTAKE_HEADERS[i]?null:(i+': sheet['+h+'] != code['+(INTAKE_HEADERS[i]||'')+']');}).filter(function(x){return x;})
      }, callback);
    }
    if (action === 'admin_dump_oral_config') {
      var _ocs = ss.getSheetByName('口腔機能向上設定');
      if (!_ocs) return respond({ success: false, error: 'no config sheet' }, callback);
      var _ocv = _ocs.getDataRange().getValues();
      var _och = (_ocv[0] || []).map(function (v) { return String(v).trim(); });
      var _ocq = String(e && e.parameter ? (e.parameter.q || '') : '').trim();
      var _ocMatched = [];
      for (var _oci = 1; _oci < _ocv.length; _oci++) {
        if (!_ocq || String(_ocv[_oci][0] || '').indexOf(_ocq) >= 0) {
          _ocMatched.push({ row: _oci + 1, raw: _ocv[_oci], col5_idx4: _ocv[_oci][4], col6_idx5: _ocv[_oci][5] });
          if (_ocMatched.length >= 5) break;
        }
      }
      return respond({ success: true, lastCol: _ocs.getLastColumn(), lastRow: _ocs.getLastRow(), header: _och, headerLen: _och.length, totalRows: _ocv.length, matched: _ocMatched }, callback);
    }
    if (action === 'getTrials') {
      var trialDate = dateStr || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      result.trials = getTrialsForDate(ss, trialDate);
      return respond(result, callback);
    }
    if (action === 'findUserByName') {
      // 利用者台帳と見学体験新規シートを横断検索（クロコ調査用・2026-05-26）
      var fn = String(e && e.parameter ? e.parameter.q : '').trim();
      var found = { 利用者台帳: [], 見学体験新規: [] };
      if (fn) {
        var us = ss.getSheetByName('利用者台帳');
        if (us) {
          var ud = us.getDataRange().getValues();
          var uh = ud[0].map(function(v){ return String(v).trim(); });
          var unc = findCol(uh, ['名前', '氏名', '利用者名']);
          var udc = findCol(uh, ['利用曜日']);
          var uac = findCol(uh, ['午前/午後', '午前午後']);
          var usc = findColP(uh, 'ステータス');
          if (usc < 0) usc = findColP(uh, '利用状況');
          var startCol = findCol(uh, ['利用開始日', '利用開始']);
          for (var i = 1; i < ud.length; i++) {
            var nm = String(ud[i][unc] || '').trim();
            if (nm.indexOf(fn) >= 0) {
              var startVal = startCol >= 0 ? ud[i][startCol] : '';
              if (startVal instanceof Date) startVal = Utilities.formatDate(startVal, 'Asia/Tokyo', 'yyyy-MM-dd');
              found.利用者台帳.push({
                row: i + 1, 名前: nm,
                利用曜日: udc >= 0 ? String(ud[i][udc] || '') : '',
                午前午後: uac >= 0 ? String(ud[i][uac] || '') : '',
                ステータス: usc >= 0 ? String(ud[i][usc] || '') : '',
                利用開始日: String(startVal || '')
              });
            }
          }
        }
        var ts = ss.getSheetByName('見学体験新規');
        if (ts) {
          var tlist = getIntakeList(ss, { includeCancelled: true });
          tlist.forEach(function(r){
            if (String(r.氏名 || '').indexOf(fn) >= 0) {
              found.見学体験新規.push({
                id: r.id, 氏名: r.氏名, 種別: r.種別, 予定日: r.予定日,
                ステータス: r.ステータス, 初回お迎え時間: r.初回お迎え時間,
                本格利用開始日: r.本格利用開始日 || '',
                最終決定曜日: r.最終決定曜日 || ''
              });
            }
          });
        }
      }
      return respond({ ok: true, query: fn, found: found }, callback);
    }
    if (action === 'haichi') {
      var haichiSheet = ss.getSheetByName('配置データ');
      if (haichiSheet) {
        var val = haichiSheet.getRange('A1').getValue();
        try {
          result.haichi = val ? JSON.parse(val) : {};
        } catch (e) {
          result.haichi = {};
          Logger.log('haichi parse error: ' + e);
        }
      } else {
        result.haichi = {};
      }
      return respond(result, callback);
    }
    if (action === 'long_leave_list') {
      result.longLeaves = getLongLeaveList(ss);
      return respond(result, callback);
    }
    if (action === 'user_list') {
      result.user_list = getUserList(ss);
      return respond(result, callback);
    }
    if (action === 'user_headers') {
      // デバッグ用：利用者台帳のヘッダー行のみ返す（個人情報なし）
      var sh = ss.getSheetByName('利用者台帳');
      result.user_headers = sh ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(v){return String(v).trim();}) : [];
      return respond(result, callback);
    }
    if (action === 'user_events') {
      result.user_events = listUserEvents(ss);
      return respond(result, callback);
    }
    // 2026-07-04 クロ依頼: N/W棚卸し用ダンプ（読み取り専用・getValuesのみ・setValueは一切無し）
    if (action === 'debug_nw_audit_dump') {
      var shNW = ss.getSheetByName('利用者台帳');
      if (!shNW) { return respond({ success: false, error: '利用者台帳シートが見つかりません' }, callback); }
      var hNW = shNW.getRange(1, 1, 1, shNW.getLastColumn()).getValues()[0].map(function (v) { return String(v).trim(); });
      var idxNW = {
        name: hNW.indexOf('名前'), cmStaff: hNW.indexOf('ケアマネ担当者名'),
        cmOffice: hNW.indexOf('ケアマネ事業所名'), n: hNW.indexOf('ケアマネ個人メアド'),
        w: hNW.indexOf('欠席連絡メアド'), method: hNW.indexOf('ケアマネ連絡手段')
      };
      var missNW = Object.keys(idxNW).filter(function (k) { return idxNW[k] < 0; });
      if (missNW.length) { return respond({ success: false, error: '列が見つかりません: ' + missNW.join('、'), headers: hNW }, callback); }
      // 2026-07-04 追加: 仕分け判断材料（Y列ケアマネ電話/要介護度/利用ステータス）。無ければ空でエラーにしない。
      var cmPhoneIdxNW = hNW.indexOf('ケアマネ電話番号');
      if (cmPhoneIdxNW < 0) cmPhoneIdxNW = hNW.indexOf('ケアマネTEL');
      var careIdxNW = hNW.indexOf('要介護度');
      if (careIdxNW < 0) careIdxNW = hNW.indexOf('介護度');
      var statusIdxNW = hNW.indexOf('利用ステータス');
      if (statusIdxNW < 0) statusIdxNW = hNW.indexOf('ステータス');
      var dataNW = shNW.getDataRange().getValues();
      var rowsNW = [];
      for (var iNW = 1; iNW < dataNW.length; iNW++) {
        var rNW = dataNW[iNW];
        var nameNW = String(rNW[idxNW.name] || '').trim();
        if (!nameNW) continue;
        rowsNW.push({
          name: nameNW,
          cmStaff: String(rNW[idxNW.cmStaff] || '').trim(),
          cmOffice: String(rNW[idxNW.cmOffice] || '').trim(),
          n: String(rNW[idxNW.n] || '').trim(),
          w: String(rNW[idxNW.w] || '').trim(),
          method: String(rNW[idxNW.method] || '').trim(),
          cmPhone: cmPhoneIdxNW >= 0 ? String(rNW[cmPhoneIdxNW] || '').trim() : '',
          care: careIdxNW >= 0 ? String(rNW[careIdxNW] || '').trim() : '',
          status: statusIdxNW >= 0 ? String(rNW[statusIdxNW] || '').trim() : ''
        });
      }
      return respond({ success: true, rows: rowsNW }, callback);
    }
    if (action === 'apply_due_usage_days') {
      // 利用曜日変更の適用日到来分を台帳反映。dryRun=1 で書き込まず対象だけ返す。asOf=YYYY-MM-DD で基準日上書き。
      var udSh = ss.getSheetByName('利用者台帳');
      var udDt = udSh.getDataRange().getValues();
      var udH = udDt[0].map(function(v) { return String(v).trim(); });
      var udNc = findCol(udH, ['名前', '氏名', '利用者名']);
      var udDc = findCol(udH, ['利用曜日']);
      var udAc = findCol(udH, ['午前/午後', '午前午後']);
      var udDry = (e.parameter.dryRun === '1' || e.parameter.dryRun === 'true');
      result.apply_result = applyDueUsageDaysChanges_(ss, udSh, udDt, udNc, udDc, udAc, e.parameter.asOf || null, udDry);
      return respond(result, callback);
    }
    if (action === 'apply_due_caremanager') {
      // ケアマネ変更予約の確認/反映。dryRun=1 で書き込まず対象だけ返す。date=YYYY-MM-DD で基準日上書き。
      var cmDry = (e.parameter.dryRun === '1' || e.parameter.dryRun === 'true');
      result.apply_result = applyDueCaremanagerChanges_(ss, e.parameter.date || null, cmDry);
      return respond(result, callback);
    }
    if (action === 'staff_list') {
      result.staff = getStaffListFromShiftSheet();
      return respond(result, callback);
    }
    // 2026-05-23: 利用者台帳ベースのケアマネ情報取得テスト
    if (action === 'debug_user_cm') {
      var dbgName = e && e.parameter ? String(e.parameter.name || '') : '';
      return respond({ success: true, info: getUserCmContact(ss, dbgName) }, callback);
    }
    // 2026-05-25: 利用者台帳のケアマネ連絡手段マスター整備系API
    if (action === 'add_cm_method_columns') {
      var dryRun = !(e && e.parameter && e.parameter.run === '1');
      return respond({ success: true, result: addCmMethodColumns(ss, dryRun) }, callback);
    }
    if (action === 'cm_method_audit') {
      return respond({ success: true, audit: getCmMethodAudit(ss) }, callback);
    }
    if (action === 'update_cm_method') {
      var ucmData = {
        userName: (e && e.parameter && e.parameter.userName) || '',
        method:   (e && e.parameter && e.parameter.method != null) ? String(e.parameter.method) : null,
        email:    (e && e.parameter && e.parameter.email  != null) ? String(e.parameter.email)  : null,
        phone:    (e && e.parameter && e.parameter.phone  != null) ? String(e.parameter.phone)  : null
      };
      return respond({ success: true, result: updateCmMethod(ss, ucmData) }, callback);
    }
    // 2026-05-23: ケアマネ連絡履歴取得（HTML詳細ポップアップ用）
    if (action === 'cm_log') {
      var logName = e && e.parameter ? String(e.parameter.name || '') : '';
      var logDate = e && e.parameter ? String(e.parameter.date || '') : '';
      return respond({ success: true, log: getCmLog(ss, logName, logDate) }, callback);
    }
    // メール対応カウンター（2026/5/3追加）
    if (action === 'mailTaskCounts') {
      return handleMailTaskCounts(e);
    }
    if (action === 'listMailDomains') {
      return handleListMailDomains(e);
    }
    if (action === 'getAbsences') {
      var absDate = (e && e.parameter && e.parameter.date) ||
                    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      var absList = getAbsencesForDate(ss, absDate);
      return ContentService
        .createTextOutput(JSON.stringify({ date: absDate, absences: absList }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // 2026-05-13: テスト用ケアマネ欠席メール送信（仮想データで送信確認）
    if (action === 'test_cm_mail') {
      var testTo = (e && e.parameter && e.parameter.to) || 'm-higa@keepfitlife.com';
      var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      try {
        sendAbsenceEmail(
          '仮想 太郎',
          [today],
          '午前',
          'テスト送信のため（実際の欠席ではありません）',
          'これはケアマネ欠席連絡メールのテスト送信です。本番フローと同じテンプレ・差出人で送信しています。',
          testTo,
          '比嘉 学',
          'テストケアプランセンター',
          'クロコ'
        );
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, sentTo: testTo, draftMode: DRAFT_MODE }))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: String(err && err.message || err) }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    // 2026-05-10: ケアマネ欠席連絡 即時方式 Phase 1
    if (action === 'getCmContact') {
      var office = (e && e.parameter && e.parameter.office) || '';
      var cmName = (e && e.parameter && e.parameter.name) || '';
      var contact = getCmContact(ss, office, cmName);
      var result = { success: true };
      Object.keys(contact).forEach(function(k) { result[k] = contact[k]; });
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // 2026-05-21: 送付用居宅一覧シートの掃除（一度きりのメンテ用）
    //   ?action=cleanup_cm_contacts        … ドライラン（削除せず対象を返す）
    //   ?action=cleanup_cm_contacts&run=1  … 実行
    if (action === 'cleanup_cm_contacts') {
      var dry = !(e && e.parameter && e.parameter.run === '1');
      return ContentService
        .createTextOutput(JSON.stringify(cleanupCmContactsSheet(ss, dry)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // 2026-05-24: ケアマネ連絡履歴シートから operator='テスト' のテストデータ行を削除
    //   ?action=cleanup_test_log        … ドライラン
    //   ?action=cleanup_test_log&run=1  … 実行
    if (action === 'cleanup_test_log') {
      var dryT = !(e && e.parameter && e.parameter.run === '1');
      return ContentService
        .createTextOutput(JSON.stringify(cleanupTestLogEntries(ss, dryT)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // 欠席登録の事前重複チェック（2026-05-08二重申請防止・JSONP対応）
    // POSTのno-cors制約でレスポンスが読めないため、フロントは登録前にこれで重複検知する
    if (action === 'check_duplicate_absence') {
      var sheet = ss.getSheetByName('出欠変更');
      if (!sheet) return respond({ success: false, error: '出欠変更シートがありません' }, callback);

      var p = (e && e.parameter) || {};
      var checkName = String(p.name || '').trim();
      var checkType = String(p.type || 'absence').trim();
      if (!checkName) return respond({ success: false, error: 'nameが必要です' }, callback);

      if (checkType === 'longterm') {
        var startDate = String(p.startDate || '').trim();
        if (!startDate) return respond({ success: false, error: 'startDateが必要です' }, callback);
        var existingLT = findDuplicateLongTermAbsence(sheet, checkName, startDate);
        return respond({
          success: true,
          duplicate: !!existingLT,
          existing: existingLT
        }, callback);
      }

      var datesParam = String(p.dates || '').trim();
      if (!datesParam) return respond({ success: false, error: 'datesが必要です' }, callback);
      var checkDates = datesParam.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      var checkUnit = String(p.unit || '午前').trim();

      var existingAbs = findDuplicateAbsences(sheet, checkName, checkDates, checkUnit);
      return respond({
        success: true,
        duplicate: existingAbs.length > 0,
        existingDates: existingAbs
      }, callback);
    }

    // 通所介護計画モニタリング 年次取得（2026/5/9追加）
    if (action === 'getMonitoringYear') {
      var monYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      if (!monYear || monYear < 2020 || monYear > 2100) {
        return respond({ ok: false, error: 'invalid year' }, callback);
      }
      var monSheet = ensureMonitoringSheet_();
      var monUsers = getMonitoringTargetUsers_();
      var monValues = monSheet.getDataRange().getValues();
      var monRecords = [];
      for (var mi = 1; mi < monValues.length; mi++) {
        var mrow = monValues[mi];
        var ry = parseInt(mrow[2], 10);
        if (ry !== monYear) continue;
        monRecords.push({
          userId: String(mrow[0] || ''),
          name: String(mrow[1] || ''),
          year: ry,
          month: parseInt(mrow[3], 10) || 0,
          recordDate: mrow[4] ? (mrow[4] instanceof Date
            ? Utilities.formatDate(mrow[4], 'Asia/Tokyo', 'yyyy-MM-dd')
            : String(mrow[4])) : '',
          pdfDate: mrow[5] ? (mrow[5] instanceof Date
            ? Utilities.formatDate(mrow[5], 'Asia/Tokyo', 'yyyy-MM-dd')
            : String(mrow[5])) : '',
          updatedAt: mrow[6] ? (mrow[6] instanceof Date
            ? Utilities.formatDate(mrow[6], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
            : String(mrow[6])) : '',
          pdfSendDate: mrow[7] ? (mrow[7] instanceof Date
            ? Utilities.formatDate(mrow[7], 'Asia/Tokyo', 'yyyy-MM-dd')
            : String(mrow[7])) : '',
          printSendDate: mrow[8] ? (mrow[8] instanceof Date
            ? Utilities.formatDate(mrow[8], 'Asia/Tokyo', 'yyyy-MM-dd')
            : String(mrow[8])) : '',
          operator: mrow[9] ? String(mrow[9]) : ''
        });
      }
      return respond({
        ok: true,
        year: monYear,
        users: monUsers,
        records: monRecords
      }, callback);
    }

    // 通所介護計画書 期限切れチェック（2026/5/30追加）
    if (action === 'getMonitoringPlanExpiring') {
      var monthParam = String((e && e.parameter && e.parameter.month) || '').trim();
      if (monthParam && !/^\d{4}-\d{2}$/.test(monthParam)) {
        return respond({ ok: false, error: 'month must be YYYY-MM' }, callback);
      }
      try {
        var r = _getMonitoringPlanExpiring_(monthParam || null);
        return respond({ ok: true, month: r.month, users: r.users }, callback);
      } catch (err) {
        return respond({ ok: false, error: String(err) }, callback);
      }
    }

    // 期限切れ件数だけ取得（朝の報告用軽量版）
    if (action === 'getMonitoringExpiringCount') {
      var monthParam2 = String((e && e.parameter && e.parameter.month) || '').trim();
      if (monthParam2 && !/^\d{4}-\d{2}$/.test(monthParam2)) {
        return respond({ ok: false, error: 'month must be YYYY-MM' }, callback);
      }
      try {
        var r2 = _getMonitoringPlanExpiring_(monthParam2 || null);
        return respond({ ok: true, month: r2.month, count: r2.users.length }, callback);
      } catch (err2) {
        return respond({ ok: false, error: String(err2) }, callback);
      }
    }

    // 通所介護計画モニタリング 更新（2026/5/9追加）
    if (action === 'updateMonitoring') {
      var muUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var muYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var muMonth = parseInt((e && e.parameter && e.parameter.month) || '', 10);
      var muField = String((e && e.parameter && e.parameter.field) || '').trim();
      var muValue = String((e && e.parameter && e.parameter.value) || '');
      var muOperator = String((e && e.parameter && e.parameter.operator) || '').trim();
      var ALLOWED_FIELDS = ['recordDate', 'pdfDate', 'pdfSendDate', 'printSendDate'];
      if (!muUserId || !muYear || muYear < 2020 || muYear > 2100
          || !muMonth || muMonth < 1 || muMonth > 12
          || ALLOWED_FIELDS.indexOf(muField) < 0) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }

      var muLock = LockService.getScriptLock();
      try {
        muLock.waitLock(10000);
      } catch (muLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var muSheet = ensureMonitoringSheet_();
        var muValues = muSheet.getDataRange().getValues();
        var muRowIdx = -1;
        for (var muI = 1; muI < muValues.length; muI++) {
          if (String(muValues[muI][0] || '').trim() === muUserId
              && parseInt(muValues[muI][2], 10) === muYear
              && parseInt(muValues[muI][3], 10) === muMonth) {
            muRowIdx = muI + 1;
            break;
          }
        }
        var muNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var COL_MAP = {
          recordDate: 5,
          pdfDate: 6,
          pdfSendDate: 8,
          printSendDate: 9
        };
        var muCol = COL_MAP[muField];

        if (muRowIdx < 0) {
          var muName = muUserId;
          var muTargets = getMonitoringTargetUsers_();
          for (var muT = 0; muT < muTargets.length; muT++) {
            if (muTargets[muT].userId === muUserId) {
              muName = muTargets[muT].name;
              break;
            }
          }
          // 10列分の初期行: [userId, name, year, month, recordDate, pdfDate, updatedAt, pdfSendDate, printSendDate, operator]
          var muNewRow = [muUserId, muName, muYear, muMonth, '', '', muNow, '', '', muOperator];
          muNewRow[muCol - 1] = muValue;
          muSheet.appendRow(muNewRow);
        } else {
          muSheet.getRange(muRowIdx, muCol).setValue(muValue);
          muSheet.getRange(muRowIdx, 7).setValue(muNow); // updatedAt
          if (muOperator) muSheet.getRange(muRowIdx, 10).setValue(muOperator);
        }
        return respond({ ok: true, updatedAt: muNow }, callback);
      } finally {
        muLock.releaseLock();
      }
    }

    // 通所介護モニタリング 計画期間設定 更新（2026/5/29追加）
    if (action === 'updateMonitoringConfig') {
      var mcfgUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var mcfgPlanStart = String((e && e.parameter && e.parameter.planStart) || '').trim();
      var mcfgFinalEval = String((e && e.parameter && e.parameter.finalEvalMonth) || '').trim();
      var mcfgOperator = String((e && e.parameter && e.parameter.operator) || '').trim();
      if (!mcfgUserId) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }
      var YM_RE = /^\d{4}-\d{2}$/;
      if (mcfgPlanStart && !YM_RE.test(mcfgPlanStart)) {
        return respond({ ok: false, error: 'invalid planStart' }, callback);
      }
      if (mcfgFinalEval && !YM_RE.test(mcfgFinalEval)) {
        return respond({ ok: false, error: 'invalid finalEvalMonth' }, callback);
      }
      var mcfgLock = LockService.getScriptLock();
      try { mcfgLock.waitLock(10000); }
      catch (e2) { return respond({ ok: false, error: 'lock timeout' }, callback); }
      try {
        var mcfgSheet = ensureMonitoringConfigSheet_();
        var mcfgValues = mcfgSheet.getDataRange().getValues();
        var mcfgRowIdx = -1;
        for (var mcfgI = 1; mcfgI < mcfgValues.length; mcfgI++) {
          if (String(mcfgValues[mcfgI][0] || '').trim() === mcfgUserId) {
            mcfgRowIdx = mcfgI + 1;
            break;
          }
        }
        var mcfgNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        if (mcfgRowIdx < 0) {
          mcfgSheet.appendRow([mcfgUserId, mcfgPlanStart, mcfgFinalEval, mcfgNow]);
        } else {
          mcfgSheet.getRange(mcfgRowIdx, 2).setValue(mcfgPlanStart);
          mcfgSheet.getRange(mcfgRowIdx, 3).setValue(mcfgFinalEval);
          mcfgSheet.getRange(mcfgRowIdx, 4).setValue(mcfgNow);
        }
        return respond({ ok: true, updatedAt: mcfgNow }, callback);
      } finally {
        mcfgLock.releaseLock();
      }
    }

    // 通所介護計画モニタリング 未完了人数集計（2026/5/9追加・朝の報告連携用）
    if (action === 'getMonitoringUnfinishedCount') {
      var mcYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var mcMonth = parseInt((e && e.parameter && e.parameter.month) || '', 10);
      if (!mcYear || !mcMonth || mcMonth < 1 || mcMonth > 12 || mcYear < 2020 || mcYear > 2100) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }
      var mcUsers = getMonitoringTargetUsers_();
      var mcSheet = ensureMonitoringSheet_();
      var mcValues = mcSheet.getDataRange().getValues();
      var mcDoneSet = {};
      for (var mcI = 1; mcI < mcValues.length; mcI++) {
        if (parseInt(mcValues[mcI][2], 10) !== mcYear) continue;
        if (parseInt(mcValues[mcI][3], 10) !== mcMonth) continue;
        // 新仕様: pdfSendDate または printSendDate のどちらかが入っていれば完了
        var mcPdfSend = String(mcValues[mcI][7] || '').trim();
        var mcPrintSend = String(mcValues[mcI][8] || '').trim();
        if (mcPdfSend || mcPrintSend) {
          mcDoneSet[String(mcValues[mcI][0] || '').trim()] = true;
        }
      }
      var mcUnfinished = 0;
      for (var mcK = 0; mcK < mcUsers.length; mcK++) {
        if (!mcDoneSet[mcUsers[mcK].userId]) mcUnfinished++;
      }
      return respond({
        ok: true,
        year: mcYear,
        month: mcMonth,
        totalUsers: mcUsers.length,
        unfinishedCount: mcUnfinished
      }, callback);
    }

    // ============================================================
    // 個別機能訓練計画書 年次取得（2026/5/25追加）
    // ============================================================
    if (action === 'getKeikakushoYear') {
      var kkYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      if (!kkYear || kkYear < 2020 || kkYear > 2100) {
        return respond({ ok: false, error: 'invalid year' }, callback);
      }
      var kkIncludeCancelled = !!(e && e.parameter && (e.parameter.includeCancelled === '1' || e.parameter.includeCancelled === 'true'));
      var kkSheet = ensureKeikakushoSheet_();
      var kkUsers = getKeikakushoTargetUsers_(kkIncludeCancelled);
      // 送付方法（PDF/印刷）を各 user に相乗り（口腔と同方式・2026-06-17）。評価出力ボタンの出し分け用。
      var kkSendMap = _getCaremaneSendMethodMap_(SpreadsheetApp.openById(SS_ID));
      kkUsers.forEach(function (ku) {
        var sm = kkSendMap[ku.name] || { method: 'PDF', unregistered: true };
        ku.sendMethod = sm.method;            // 'PDF' or '印刷'
        ku.sendMethodOverride = !!sm.override;
        ku.sendMethodUnregistered = !!sm.unregistered;
      });
      var kkValues = kkSheet.getDataRange().getValues();
      var kkRecords = [];
      for (var kkI = 1; kkI < kkValues.length; kkI++) {
        var krow = kkValues[kkI];
        var ry = parseInt(krow[2], 10);
        if (ry !== kkYear) continue;
        function fmtDate_(v) {
          if (!v) return '';
          if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
          return String(v);
        }
        kkRecords.push({
          userId: String(krow[0] || ''),
          name: String(krow[1] || ''),
          year: ry,
          month: parseInt(krow[3], 10) || 0,
          kyoumi_date: fmtDate_(krow[4]),
          seikatsu_date: fmtDate_(krow[5]),
          keikaku_date: fmtDate_(krow[6]),
          blocked_reason: String(krow[8] || ''),   // 9列目
          hyouka_pdf_date: fmtDate_(krow[9]),      // 10列目
          hyouka_print_date: fmtDate_(krow[10]),   // 11列目
          keikaku_sent_date: fmtDate_(krow[11]),   // 12列目
          sokutei_date: fmtDate_(krow[12]),        // 13列目（測定日）
          sokutei_by: String(krow[13] || ''),      // 14列目（測定者）
          output_by: String(krow[14] || ''),       // 15列目（出力者）
          tasseido_date: fmtDate_(krow[15])        // 16列目（達成度評価日）
        });
      }
      return respond({ ok: true, year: kkYear, users: kkUsers, records: kkRecords }, callback);
    }

    // 個別機能訓練計画書 更新（INSERT/UPDATE/全空deleteRow）
    // field: kyoumi_date / seikatsu_date / keikaku_date / blocked_reason / hyouka_pdf_date / hyouka_print_date / keikaku_sent_date
    //        / sokutei_date / sokutei_by / output_by / tasseido_date（2026-06-15 個訓Phase1）
    if (action === 'updateKeikakusho') {
      var kuUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var kuYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var kuMonth = parseInt((e && e.parameter && e.parameter.month) || '', 10);
      var kuField = String((e && e.parameter && e.parameter.field) || '').trim();
      var kuValue = String((e && e.parameter && e.parameter.value) || '');
      var kuOperator = String((e && e.parameter && e.parameter.operator) || '').trim();
      var kuFieldAllowed = {
        kyoumi_date: 5, seikatsu_date: 6, keikaku_date: 7, blocked_reason: 9,
        hyouka_pdf_date: 10, hyouka_print_date: 11, keikaku_sent_date: 12,
        sokutei_date: 13, sokutei_by: 14, output_by: 15, tasseido_date: 16
      };
      if (!kuUserId || !kuYear || kuYear < 2020 || kuYear > 2100
          || !kuMonth || kuMonth < 1 || kuMonth > 12
          || !kuFieldAllowed.hasOwnProperty(kuField)) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }
      var kuLock = LockService.getScriptLock();
      try { kuLock.waitLock(10000); } catch (kuLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      var kuTaskBoardResult = null;  // タスクボード登録結果
      try {
        var kuSheet = ensureKeikakushoSheet_();
        var kuValues = kuSheet.getDataRange().getValues();
        var kuRowIdx = -1;
        for (var kuI = 1; kuI < kuValues.length; kuI++) {
          if (String(kuValues[kuI][0] || '').trim() === kuUserId
              && parseInt(kuValues[kuI][2], 10) === kuYear
              && parseInt(kuValues[kuI][3], 10) === kuMonth) {
            kuRowIdx = kuI + 1;
            break;
          }
        }
        var kuCol = kuFieldAllowed[kuField];
        var kuNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        // 既存行があれば old_value を取得（ログ用）
        var kuOldValue = '';
        if (kuRowIdx > 0) {
          kuOldValue = String(kuSheet.getRange(kuRowIdx, kuCol).getValue() || '');
        }
        if (kuRowIdx < 0) {
          if (!kuValue) return respond({ ok: true }, callback);
          // 利用者台帳から正式名取得（無ければuserIdをそのまま使用＝退所者などのフォールバック）
          var kuName = kuUserId;
          var kuCategory = '';
          var kuTargets = getKeikakushoTargetUsers_();
          for (var kuT = 0; kuT < kuTargets.length; kuT++) {
            if (kuTargets[kuT].userId === kuUserId) {
              kuName = kuTargets[kuT].name;
              kuCategory = kuTargets[kuT].category;
              break;
            }
          }
          var kuNewRow = [kuUserId, kuName, kuYear, kuMonth, '', '', '', kuNow, '', '', '', '', '', '', '', ''];
          kuNewRow[kuCol - 1] = kuValue;
          kuSheet.appendRow(kuNewRow);
          // blocked_reason 付与（INSERT時）→ 保険未登録のみタスクボード登録
          if (kuField === 'blocked_reason' && kuValue === '保険未登録') {
            kuTaskBoardResult = addBlockedKeikakushoTask_(kuUserId, kuName, kuCategory, kuYear, kuMonth, kuValue);
          }
        } else {
          kuSheet.getRange(kuRowIdx, kuCol).setValue(kuValue);
          kuSheet.getRange(kuRowIdx, 8).setValue(kuNow);
          // 全コンテンツ列が空なら行削除（kyoumi/seikatsu/keikaku/blocked_reason/hyouka_pdf/hyouka_print/keikaku_sent
          //   ＋ 2026-06-15追加 sokutei_date/sokutei_by/output_by/tasseido_date）。新列の単独データ消失を防ぐため16列幅で判定。
          var kuRowAfter = kuSheet.getRange(kuRowIdx, 1, 1, 16).getValues()[0];
          if (!String(kuRowAfter[4] || '').trim()
              && !String(kuRowAfter[5] || '').trim()
              && !String(kuRowAfter[6] || '').trim()
              && !String(kuRowAfter[8] || '').trim()
              && !String(kuRowAfter[9] || '').trim()
              && !String(kuRowAfter[10] || '').trim()
              && !String(kuRowAfter[11] || '').trim()
              && !String(kuRowAfter[12] || '').trim()
              && !String(kuRowAfter[13] || '').trim()
              && !String(kuRowAfter[14] || '').trim()
              && !String(kuRowAfter[15] || '').trim()) {
            kuSheet.deleteRow(kuRowIdx);
          } else if (kuField === 'blocked_reason' && kuValue === '保険未登録') {
            // blocked_reason 付与（UPDATE時）→ 保険未登録のみタスクボード登録
            var kuName2 = String(kuRowAfter[1] || '') || kuUserId;
            var kuCategory2 = '';
            var kuTargets2 = getKeikakushoTargetUsers_();
            for (var kuT2 = 0; kuT2 < kuTargets2.length; kuT2++) {
              if (kuTargets2[kuT2].userId === kuUserId) {
                kuCategory2 = kuTargets2[kuT2].category;
                break;
              }
            }
            kuTaskBoardResult = addBlockedKeikakushoTask_(kuUserId, kuName2, kuCategory2, kuYear, kuMonth, kuValue);
          }
        }
        // ログ書き込み（actionは field 別に決定）
        var kuLogAction = '';
        if (kuField === 'blocked_reason') {
          kuLogAction = kuValue ? 'set_block' : 'clear_block';
        } else {
          kuLogAction = kuValue ? 'set_date' : 'clear_date';
        }
        var kuLogName = '';
        if (kuRowIdx > 0) {
          kuLogName = String(kuSheet.getRange(kuRowIdx, 2).getValue() || '') || kuUserId;
        } else {
          kuLogName = kuUserId;
        }
        logKeikakushoOp_(kuOperator, kuUserId, kuLogName, kuYear, kuMonth, kuLogAction, kuField, kuOldValue, kuValue);
        var kuResp = { ok: true, updatedAt: kuNow };
        if (kuTaskBoardResult) kuResp.taskBoard = kuTaskBoardResult;
        return respond(kuResp, callback);
      } finally {
        kuLock.releaseLock();
      }
    }

    // 個別機能訓練計画書 保留中件数（朝の報告連携用）
    // ?action=getBlockedKeikakushoCount&year=&month=
    if (action === 'getBlockedKeikakushoCount') {
      var bcYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var bcMonth = parseInt((e && e.parameter && e.parameter.month) || '', 10);
      if (!bcYear || !bcMonth || bcYear < 2020 || bcYear > 2100 || bcMonth < 1 || bcMonth > 12) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }
      var bcData = _getBlockedKeikakushoData_(bcYear, bcMonth);
      return respond({
        ok: true, year: bcYear, month: bcMonth,
        blockedCount: bcData.blockedCount,
        blocked: bcData.blocked
      }, callback);
    }

    // 個別機能訓練計画書 計画書開始月の更新
    if (action === 'updatePlanStart') {
      var psUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var psValue = String((e && e.parameter && e.parameter.value) || '');
      var psOperator = String((e && e.parameter && e.parameter.operator) || '').trim();
      if (!psUserId) return respond({ ok: false, error: 'userId required' }, callback);
      if (psValue && !/^\d{4}-\d{2}$/.test(psValue)) {
        return respond({ ok: false, error: 'value must be YYYY-MM' }, callback);
      }
      // planMonths（計画の長さ・C案）: 指定時のみ検証して書込。未指定(空)は計画月数セルを触らない＝
      //   オフライン再送のplanStart単独送信などでの誤クリア防止。
      var psMonthsRaw = (e && e.parameter && e.parameter.planMonths != null) ? String(e.parameter.planMonths).trim() : '';
      var psMonths = 0;  // 0 = 未指定
      if (psMonthsRaw !== '') {
        psMonths = parseInt(psMonthsRaw, 10);
        if (!(psMonths >= 1 && psMonths <= 12)) {
          return respond({ ok: false, error: 'planMonths must be integer 1-12' }, callback);
        }
      }
      var psLock = LockService.getScriptLock();
      try { psLock.waitLock(10000); } catch (psLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var psSs = SpreadsheetApp.openById(SS_ID);
        var psSheet = psSs.getSheetByName('利用者台帳');
        if (!psSheet) return respond({ ok: false, error: '利用者台帳なし' }, callback);
        var psValues = psSheet.getDataRange().getValues();
        if (psValues.length < 2) return respond({ ok: false, error: 'empty users sheet' }, callback);
        var psHeader = psValues[0].map(function (h) { return String(h || '').trim(); });
        var psNameCol = findCol(psHeader, ['名前', '氏名', '利用者名']);
        var psPlanCol = findCol(psHeader, ['計画書開始']);
        if (psNameCol < 0) return respond({ ok: false, error: '名前列なし' }, callback);
        if (psPlanCol < 0) return respond({ ok: false, error: '計画書開始列なし' }, callback);
        // 計画月数列を解決。planMonths指定があり列が無ければ末尾に新設（additive・既存列非破壊）。
        var psMonthsCol = findCol(psHeader, ['計画月数']);
        if (psMonths > 0 && psMonthsCol < 0) {
          psMonthsCol = psSheet.getLastColumn();  // 0-based新列index = 現在の最終列数（新列はその右）
          psSheet.getRange(1, psMonthsCol + 1).setValue('計画月数');
        }
        var psRowIdx = -1;
        for (var psI = 1; psI < psValues.length; psI++) {
          if (String(psValues[psI][psNameCol] || '').trim() === psUserId) {
            psRowIdx = psI + 1;
            break;
          }
        }
        if (psRowIdx < 0) return respond({ ok: false, error: 'user not found: ' + psUserId }, callback);
        var psCell = psSheet.getRange(psRowIdx, psPlanCol + 1);
        var psOldRaw = psCell.getValue();
        var psOld = '';
        if (psOldRaw instanceof Date) psOld = Utilities.formatDate(psOldRaw, 'Asia/Tokyo', 'yyyy-MM');
        else psOld = String(psOldRaw || '');
        if (psValue) {
          psCell.setValue(psValue);
        } else {
          psCell.clearContent();
        }
        // 計画月数を書込（指定時のみ・未指定は据え置き）
        if (psMonths > 0 && psMonthsCol >= 0) {
          psSheet.getRange(psRowIdx, psMonthsCol + 1).setValue(psMonths);
        }
        logKeikakushoOp_(psOperator, psUserId, psUserId, '', '',
          psValue ? 'set_planstart' : 'clear_planstart', 'planStart', psOld,
          psMonths > 0 ? (psValue + ' (計画月数:' + psMonths + ')') : psValue);
        return respond({ ok: true }, callback);
      } finally {
        psLock.releaseLock();
      }
    }

    // ============================================================
    // 通所介護計画書 シート初期化（テスト用・冪等）
    // Phase 1-B（2026-05-27追加）
    // ============================================================
    if (action === 'initTsushoSheets') {
      ensureTsushoPlansSheets_();
      return respond({ ok: true, message: 'tsusho plans sheets ready' }, callback);
    }

    // ============================================================
    // 口腔機能向上記録 シート初期化（テスト用・冪等）
    // Phase 1-D（2026-05-27追加）
    // ============================================================
    if (action === 'initOralSheets') {
      ensureOralPlansSheets_();
      return respond({ ok: true, message: 'oral plans sheets ready' }, callback);
    }

    // 口腔(II) テストデータ一括削除（curl文字化け行や明示テストレコードを掃除）
    // Phase 1-D（2026-05-27追加）
    if (action === 'deleteOralTestData') {
      var doSheets = ensureOralPlansSheets_();
      var doSheet = doSheets.recordSheet;
      var doValues = doSheet.getDataRange().getValues();
      var doDeleted = [];
      for (var doI = doValues.length - 1; doI >= 1; doI--) {
        var doUid = String(doValues[doI][0] || '');
        var doCreatedBy = String(doValues[doI][7] || '');
        var firstCode = doUid.length > 0 ? doUid.charCodeAt(0) : 0;
        var doIsTest = doUid.indexOf('テスト') >= 0
          || doUid.toLowerCase().indexOf('test') >= 0
          || doUid.indexOf('�') >= 0
          || (firstCode > 0 && firstCode <= 0x7F)
          || doCreatedBy === 'クロコ'
          || doCreatedBy === 'test';
        if (doIsTest) {
          doSheet.deleteRow(doI + 1);
          doDeleted.push({ raw: doUid, by: doCreatedBy });
        }
      }
      var doConfigSheet = doSheets.configSheet;
      var doConfigValues = doConfigSheet.getDataRange().getValues();
      var doConfigDeleted = 0;
      for (var dcI = doConfigValues.length - 1; dcI >= 1; dcI--) {
        var dcUid = String(doConfigValues[dcI][0] || '');
        var dcFirstCode = dcUid.length > 0 ? dcUid.charCodeAt(0) : 0;
        if (dcUid.indexOf('テスト') >= 0 || dcUid.toLowerCase().indexOf('test') >= 0
            || dcUid.indexOf('�') >= 0 || (dcFirstCode > 0 && dcFirstCode <= 0x7F)) {
          doConfigSheet.deleteRow(dcI + 1);
          doConfigDeleted++;
        }
      }
      return respond({ ok: true, deletedRecords: doDeleted.length, deletedConfigs: doConfigDeleted, items: doDeleted }, callback);
    }

    // テストデータ一括削除（curl文字化け行や明示テストレコードを掃除する補助API）
    if (action === 'deleteTsushoTestData') {
      var dtSheets = ensureTsushoPlansSheets_();
      var dtSheet = dtSheets.recordSheet;
      var dtValues = dtSheet.getDataRange().getValues();
      var dtDeleted = [];
      for (var dtI = dtValues.length - 1; dtI >= 1; dtI--) {
        var dtUid = String(dtValues[dtI][0] || '');
        var dtYear = parseInt(dtValues[dtI][1], 10);
        var dtMonth = parseInt(dtValues[dtI][2], 10);
        var dtCreatedBy = String(dtValues[dtI][7] || '');
        // 削除対象判定: 「テスト」「test」を含む or 文字化け検出（先頭が ASCII or U+FFFD） or クロコ印テスト
        var firstCode = dtUid.length > 0 ? dtUid.charCodeAt(0) : 0;
        var dtIsTest = dtUid.indexOf('テスト') >= 0
          || dtUid.toLowerCase().indexOf('test') >= 0
          || dtUid.indexOf('�') >= 0
          || (firstCode > 0 && firstCode <= 0x7F)
          || dtCreatedBy === 'クロコ'
          || dtCreatedBy === 'test';
        if (dtIsTest) {
          dtSheet.deleteRow(dtI + 1);
          dtDeleted.push({ raw: dtUid, year: dtYear, month: dtMonth, by: dtCreatedBy });
        }
      }
      return respond({ ok: true, deleted: dtDeleted.length, items: dtDeleted }, callback);
    }

    // ============================================================
    // 口腔機能向上 年次取得
    // Phase 1-D（2026-05-27追加）
    // ============================================================
    if (action === 'scanOralFolderYear') {
      var sofYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      if (!sofYear || sofYear < 2020 || sofYear > 2100) {
        return respond({ ok: false, error: 'invalid year' }, callback);
      }
      return respond(scanOralSendFolder_(sofYear), callback);
    }

    if (action === 'getOralPlansYear') {
      var opYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      if (!opYear || opYear < 2020 || opYear > 2100) {
        return respond({ ok: false, error: 'invalid year' }, callback);
      }
      var opSheets = ensureOralPlansSheets_();
      var opSS = SpreadsheetApp.openById(SS_ID);
      // 全件（中止者含む）を取得し、非中止＝users / 過去6ヶ月の中止者＝cancelledUsers に振り分ける。
      // users[] は従来と完全に同一（非中止のみ）＝既存の対象/非対象集計に一切影響を与えない。
      // 中止者は別配列 cancelledUsers[] に中止日(cancelDate)付きで相乗り。（2026-06-12・口腔の利用中止者トグル用）
      var opAllUsers = getOralTargetUsers_(true);
      // 送付方法（持参=印刷／その他=PDF）を各 user に相乗りさせる（2026-06-05・最終評価出力確認）
      var opSendMap = _getCaremaneSendMethodMap_(opSS);
      // 中止履歴シートの中止日マップ（name -> 'yyyy-MM-dd'）。
      var opCancelDateMap = _getActiveCancelDateMap(opSS);
      var opUsers = [];
      var opCancelledUsers = [];
      opAllUsers.forEach(function (u) {
        var sm = opSendMap[u.name] || { method: 'PDF' };
        u.sendMethod = sm.method; // '印刷' or 'PDF'
        if (!u.cancelled) { opUsers.push(u); return; }
        // 中止者は中止履歴に中止日があれば全期間相乗り（cancelDate付き）。
        // 期間（6ヶ月/1年/全期間）の絞り込みはフロント側で行う＝再fetch・再デプロイ無しで期間を切替えられる。（2026-06-12）
        var cd = opCancelDateMap[u.name] || '';
        if (cd) { u.cancelDate = cd; opCancelledUsers.push(u); }
      });
      var opValues = opSheets.recordSheet.getDataRange().getValues();
      var opRecords = [];
      function opFmtDate_(v) {
        if (!v) return '';
        if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
        return String(v);
      }
      for (var opI = 1; opI < opValues.length; opI++) {
        var orow = opValues[opI];
        var oy = parseInt(orow[1], 10);
        if (oy !== opYear) continue;
        opRecords.push({
          userId: String(orow[0] || ''),
          year: oy,
          month: parseInt(orow[2], 10) || 0,
          plan_date: opFmtDate_(orow[3]),
          sent_to_cm: !!orow[4],
          sent_date: opFmtDate_(orow[5]),
          memo: String(orow[6] || ''),
          createdBy: String(orow[7] || ''),
          updatedAt: String(orow[8] || ''),
          eval_result: String(orow[9] || ''),
          sent_by: String(orow[10] || ''),
          moni1_date: opFmtDate_(orow[11]),
          moni2_date: opFmtDate_(orow[12]),
          houkoku_date: opFmtDate_(orow[13]),
          houkoku_by: String(orow[14] || ''),
          plan_by: String(orow[15] || ''),
          moni1_by: String(orow[16] || ''),
          moni2_by: String(orow[17] || '')
        });
      }
      return respond({ ok: true, year: opYear, users: opUsers, records: opRecords, cancelledUsers: opCancelledUsers }, callback);
    }

    // ============================================================
    // 通所介護計画書 年次取得
    // ============================================================
    if (action === 'getTsushoPlansYear') {
      var tpYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      if (!tpYear || tpYear < 2020 || tpYear > 2100) {
        return respond({ ok: false, error: 'invalid year' }, callback);
      }
      var tpIncludeCancelled = !!(e && e.parameter && (e.parameter.includeCancelled === '1' || e.parameter.includeCancelled === 'true'));
      var tpSheets = ensureTsushoPlansSheets_();
      var tpUsers = getTsushoTargetUsers_(tpIncludeCancelled);
      var tpValues = tpSheets.recordSheet.getDataRange().getValues();
      var tpRecords = [];
      function tpFmtDate_(v) {
        if (!v) return '';
        if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
        return String(v);
      }
      for (var tpI = 1; tpI < tpValues.length; tpI++) {
        var trow = tpValues[tpI];
        var ry = parseInt(trow[1], 10);
        if (ry !== tpYear) continue;
        tpRecords.push({
          userId: String(trow[0] || ''),
          year: ry,
          month: parseInt(trow[2], 10) || 0,
          plan_date: tpFmtDate_(trow[3]),
          sent_to_cm: !!trow[4],
          sent_date: tpFmtDate_(trow[5]),
          memo: String(trow[6] || ''),
          createdBy: String(trow[7] || ''),
          updatedAt: String(trow[8] || '')
        });
      }
      return respond({ ok: true, year: tpYear, users: tpUsers, records: tpRecords }, callback);
    }

    // ============================================================
    // 通所介護計画書 年次取得 V2（事業対象者を含む）
    // 2026-07-02 Phase 0（ケアマネ提出物統合管理）: getTsushoPlansYear は不変更。
    // users に getTsushoTargetUsersV2_（isJigyoフラグ付き）を使う以外は同一応答形。
    // ============================================================
    if (action === 'getTsushoPlansYearV2') {
      var tv2Year = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      if (!tv2Year || tv2Year < 2020 || tv2Year > 2100) {
        return respond({ ok: false, error: 'invalid year' }, callback);
      }
      var tv2IncludeCancelled = !!(e && e.parameter && (e.parameter.includeCancelled === '1' || e.parameter.includeCancelled === 'true'));
      var tv2Sheets = ensureTsushoPlansSheets_();
      var tv2Users = getTsushoTargetUsersV2_(tv2IncludeCancelled);
      var tv2Values = tv2Sheets.recordSheet.getDataRange().getValues();
      var tv2Records = [];
      function tv2FmtDate_(v) {
        if (!v) return '';
        if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
        return String(v);
      }
      for (var tv2I = 1; tv2I < tv2Values.length; tv2I++) {
        var tv2Row = tv2Values[tv2I];
        var tv2Ry = parseInt(tv2Row[1], 10);
        if (tv2Ry !== tv2Year) continue;
        tv2Records.push({
          userId: String(tv2Row[0] || ''),
          year: tv2Ry,
          month: parseInt(tv2Row[2], 10) || 0,
          plan_date: tv2FmtDate_(tv2Row[3]),
          sent_to_cm: !!tv2Row[4],
          sent_date: tv2FmtDate_(tv2Row[5]),
          memo: String(tv2Row[6] || ''),
          createdBy: String(tv2Row[7] || ''),
          updatedAt: String(tv2Row[8] || '')
        });
      }
      return respond({ ok: true, year: tv2Year, users: tv2Users, records: tv2Records }, callback);
    }

    // ============================================================
    // 提出送付台帳 シート初期化（管理action・冪等）
    // 2026-07-02 Phase 1（ケアマネ提出物統合管理）: シートが無ければ作成、
    // あれば現状を返すだけ（データには一切触らない）。
    // ============================================================
    if (action === 'setupSoufuLedger') {
      var slSheet = ensureSoufuLedgerSheet_();
      var slHeader = slSheet.getRange(1, 1, 1, 14).getValues()[0].map(function (v) { return String(v); });
      return respond({
        ok: true,
        sheetName: slSheet.getName(),
        header: slHeader,
        dataRows: Math.max(0, slSheet.getLastRow() - 1)
      }, callback);
    }

    // ============================================================
    // スタッフマスタ 初期投入（Phase 2・管理action・冪等）
    // 初期8名＋社長Gaku。既存 name はスキップ（再投入しない）。dryRun=1 でプレビュー。
    // ============================================================
    if (action === 'setupStaffMaster') {
      var smDry = !!(e && e.parameter && e.parameter.dryRun === '1');
      var smSeed = [
        { name: '勝又', role: 'staff' }, { name: '星野', role: 'staff' }, { name: '下浦', role: 'staff' },
        { name: '髙山', role: 'staff' }, { name: '春山', role: 'staff' }, { name: '石井', role: 'staff' },
        { name: '工藤', role: 'staff' }, { name: '大久保', role: 'staff' }, { name: '代表', role: 'owner' }
      ];
      var smSheet = ensureStaffMasterSheet_();
      var smValues = smSheet.getDataRange().getValues();
      var smExisting = {};
      for (var smI = 1; smI < smValues.length; smI++) {
        var smN = String(smValues[smI][0] || '').trim();
        if (smN) smExisting[smN] = true;
      }
      var smToAdd = [];
      for (var smS = 0; smS < smSeed.length; smS++) {
        if (!smExisting[smSeed[smS].name]) smToAdd.push(smSeed[smS]);
      }
      if (smDry) {
        return respond({ ok: true, dryRun: true, existing: Object.keys(smExisting), toAdd: smToAdd.map(function (s) { return s.name; }) }, callback);
      }
      if (smToAdd.length > 0) {
        var smBase = smValues.length; // 既存行数（ヘッダ含む）
        var smRows = smToAdd.map(function (s, i) {
          return [s.name, s.role, s.role === 'owner' ? 'FALSE' : 'TRUE', String(smBase + i)];
        });
        var smRange = smSheet.getRange(smSheet.getLastRow() + 1, 1, smRows.length, 4);
        smRange.setNumberFormat('@');
        smRange.setValues(smRows);
        SpreadsheetApp.flush();
      }
      return respond({ ok: true, added: smToAdd.map(function (s) { return s.name; }) }, callback);
    }

    // ============================================================
    // スタッフマスタ 取得（Phase 2・操作者リスト）
    // teishutsu_target=TRUE または role=owner を order 昇順で返す。
    // ============================================================
    if (action === 'getStaffMaster') {
      var gsSheet = ensureStaffMasterSheet_();
      var gsValues = gsSheet.getDataRange().getValues();
      var gsList = [];
      for (var gsI = 1; gsI < gsValues.length; gsI++) {
        var gsRow = gsValues[gsI];
        var gsName = String(gsRow[0] || '').trim();
        if (!gsName) continue;
        var gsRole = String(gsRow[1] || 'staff').trim();
        var gsTarget = String(gsRow[2] || '').trim().toUpperCase() === 'TRUE';
        if (!gsTarget && gsRole !== 'owner') continue;
        gsList.push({ name: gsName, role: gsRole, order: parseInt(gsRow[3], 10) || 999 });
      }
      gsList.sort(function (a, b) { return a.order - b.order; });
      return respond({ ok: true, staff: gsList }, callback);
    }

    // ============================================================
    // 提出送付台帳 読み取り（Phase 1）
    // 応答 = 「ym時点で画面に出すべき行」:
    //   繰越分（対象月 <= ym ∧ status ≠ 送付済）＋ 当月分全行（対象月 = ym・送付済含む）
    // 「未作成」は行を持たない設計のためここには出ない（フロントの変換層が算出）。
    // ============================================================
    if (action === 'getSoufuLedger') {
      var glYm = String((e && e.parameter && e.parameter.ym) || '').trim();
      if (!/^\d{4}-\d{2}$/.test(glYm)) {
        return respond({ ok: false, error: 'invalid ym (YYYY-MM)' }, callback);
      }
      var glSheet = ensureSoufuLedgerSheet_();
      var glValues = glSheet.getDataRange().getValues();
      var glRows = [];
      for (var glI = 1; glI < glValues.length; glI++) {
        var glRow = soufuLedgerRowToObj_(glValues[glI]);
        if (!glRow.userId) continue;
        var glCarry = glRow.taishoTsuki <= glYm && glRow.status !== '送付済';
        var glCurrent = glRow.taishoTsuki === glYm;
        if (glCarry || glCurrent) glRows.push(glRow);
      }
      return respond({ ok: true, ym: glYm, rows: glRows }, callback);
    }

    // ============================================================
    // 提出送付台帳 冪等upsert（Phase 1）
    // キー = (userId, docType, taishoTsuki)。LockService 直列化。
    // status: '揃った'（サイン完了・即送付可能） / '送付済' / 'clear'（トグル解除＝行削除）
    // 冪等性: 同一statusの再送信では時刻・操作者・updatedAtを一切書き換えない（結果不変）。
    // '揃った' 遷移: sorotta_at/sorotta_by 記録＋sofu_at/soufusha クリア（送付済からの差戻し対応）
    // '送付済' 遷移: sofu_at/soufusha 記録（sorotta_at/sorotta_by は保全＝属人化集計を守る）
    // 任意フィールド tekiyoTsuki/soufuHouhou/kurikoshiRiyu/signKigen はパラメータに来た時のみ更新。
    // ============================================================
    if (action === 'upsertSoufuStatus') {
      var usP = (e && e.parameter) || {};
      var usUserId = String(usP.userId || '').trim();
      var usDocType = String(usP.docType || '').trim();
      var usTaishoTsuki = String(usP.taishoTsuki || '').trim();
      var usStatus = String(usP.status || '').trim();
      var usBy = String(usP.updatedBy || '').trim();
      if (!usUserId || SOUFU_DOC_TYPES.indexOf(usDocType) < 0
          || !/^\d{4}-\d{2}$/.test(usTaishoTsuki)
          || (SOUFU_STATUSES.indexOf(usStatus) < 0 && usStatus !== 'clear')
          || !usBy) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }
      var usLock = LockService.getScriptLock();
      try { usLock.waitLock(10000); } catch (usLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var usSheet = ensureSoufuLedgerSheet_();
        var usValues = usSheet.getDataRange().getValues();
        var usRowIdx = -1;
        var usCur = null;
        for (var usI = 1; usI < usValues.length; usI++) {
          var usObj = soufuLedgerRowToObj_(usValues[usI]);
          if (usObj.userId === usUserId && usObj.docType === usDocType && usObj.taishoTsuki === usTaishoTsuki) {
            usRowIdx = usI + 1;
            usCur = usObj;
            break;
          }
        }
        var usNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

        // clear: 行削除（無ければ何もしない・冪等）
        if (usStatus === 'clear') {
          if (usRowIdx > 0) usSheet.deleteRow(usRowIdx);
          SpreadsheetApp.flush();
          return respond({ ok: true, cleared: usRowIdx > 0 }, callback);
        }

        var usNext = usCur ? JSON.parse(JSON.stringify(usCur)) : {
          userId: usUserId, docType: usDocType, taishoTsuki: usTaishoTsuki,
          tekiyoTsuki: '', status: '', sorotta_at: '', sorotta_by: '', sofu_at: '',
          soufusha: '', soufuHouhou: '', kurikoshiRiyu: '', signKigen: '',
          updatedBy: '', updatedAt: ''
        };

        // 状態遷移（同一statusなら時刻・操作者は不変）
        if (usNext.status !== usStatus) {
          if (usStatus === '揃った') {
            usNext.status = '揃った';
            usNext.sorotta_at = usNow;
            usNext.sorotta_by = usBy;
            usNext.sofu_at = '';
            usNext.soufusha = '';
          } else {
            usNext.status = '送付済';
            usNext.sofu_at = usNow;
            usNext.soufusha = usBy;
          }
        }
        // 任意フィールド（渡された時のみ更新・状態遷移と独立）
        if (usP.tekiyoTsuki !== undefined) usNext.tekiyoTsuki = String(usP.tekiyoTsuki || '').trim();
        if (usP.soufuHouhou !== undefined) usNext.soufuHouhou = String(usP.soufuHouhou || '').trim();
        if (usP.kurikoshiRiyu !== undefined) usNext.kurikoshiRiyu = String(usP.kurikoshiRiyu || '').trim();
        if (usP.signKigen !== undefined) usNext.signKigen = String(usP.signKigen || '').trim();

        // 実変更が無ければ書き込まない（updatedAt も不変＝二重送信で結果不変）
        var usChanged = !usCur
          || ['tekiyoTsuki', 'status', 'sorotta_at', 'sorotta_by', 'sofu_at', 'soufusha', 'soufuHouhou', 'kurikoshiRiyu', 'signKigen']
            .some(function (k) { return usCur[k] !== usNext[k]; });
        if (usChanged) {
          usNext.updatedBy = usBy;
          usNext.updatedAt = usNow;
          var usRowArr = [
            usNext.userId, usNext.docType, usNext.taishoTsuki, usNext.tekiyoTsuki, usNext.status,
            usNext.sorotta_at, usNext.sorotta_by, usNext.sofu_at, usNext.soufusha, usNext.soufuHouhou,
            usNext.kurikoshiRiyu, usNext.signKigen, usNext.updatedBy, usNext.updatedAt
          ];
          // appendRow はセルのテキスト書式を無視して値をDate解釈する（先頭ゼロ落ち・TZ再解釈の温床）ため、
          // 新規・更新とも「書式確定 → setValues」の同一パスで書く。LastRow+1 はロック内なので競合安全。
          var usWriteRow = usRowIdx > 0 ? usRowIdx : usSheet.getLastRow() + 1;
          var usWriteRange = usSheet.getRange(usWriteRow, 1, 1, 14);
          usWriteRange.setNumberFormat('@');
          usWriteRange.setValues([usRowArr]);
          SpreadsheetApp.flush();
        }
        return respond({ ok: true, created: !usCur && usChanged, changed: usChanged, row: usNext }, callback);
      } finally {
        usLock.releaseLock();
      }
    }

    // ============================================================
    // 提出送付台帳 バックフィル（モニ限定・Phase 1段階③・2026-07-03承認方針）
    // モニタリングチェックの pdfSendDate/printSendDate 付き記録 →
    // 台帳 (userId, tsusho_moni, YYYY-MM) status=送付済・sofu_at=実際の送付日。
    // sorotta_at/sorotta_by/soufusha は空（当時の記録が無いものは偽装しない）。
    // dryRun=1 でプレビュー（利用者マスタ不在/利用終了者の内訳付き）。冪等=台帳既存キーはスキップ。
    // ============================================================
    if (action === 'backfillSoufuLedgerMoni') {
      var bfDryRun = !!(e && e.parameter && e.parameter.dryRun === '1');
      var bfYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var bfBy = String((e && e.parameter && e.parameter.updatedBy) || '').trim();
      if (!bfYear || bfYear < 2020 || bfYear > 2100 || !bfBy) {
        return respond({ ok: false, error: 'invalid params (year, updatedBy required)' }, callback);
      }
      var bfLock = LockService.getScriptLock();
      try { bfLock.waitLock(30000); } catch (bfLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var bfMonSheet = ensureMonitoringSheet_();
        var bfMonValues = bfMonSheet.getDataRange().getValues();
        var bfLedSheet = ensureSoufuLedgerSheet_();
        var bfLedValues = bfLedSheet.getDataRange().getValues();
        var bfExisting = {};
        for (var bfL = 1; bfL < bfLedValues.length; bfL++) {
          var bfLObj = soufuLedgerRowToObj_(bfLedValues[bfL]);
          bfExisting[bfLObj.userId + '|' + bfLObj.docType + '|' + bfLObj.taishoTsuki] = true;
        }
        // 利用者マスタ（利用終了含む全員・V2=事業対象者込み）→ 不在/終了の分類用
        var bfAllUsers = getTsushoTargetUsersV2_(true);
        var bfUserMap = {};
        for (var bfU = 0; bfU < bfAllUsers.length; bfU++) {
          bfUserMap[bfAllUsers[bfU].userId] = bfAllUsers[bfU];
        }
        function bfFmtD(v) {
          if (!v) return '';
          if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
          return String(v);
        }
        var bfCandidates = [];
        for (var bfI = 1; bfI < bfMonValues.length; bfI++) {
          var bfRow = bfMonValues[bfI];
          var bfUserId = String(bfRow[0] || '').trim();
          if (!bfUserId) continue;
          if (parseInt(bfRow[2], 10) !== bfYear) continue;
          var bfMonth = parseInt(bfRow[3], 10) || 0;
          if (bfMonth < 1 || bfMonth > 12) continue;
          var bfSendDate = bfFmtD(bfRow[7]) || bfFmtD(bfRow[8]);
          if (!bfSendDate) continue;
          bfCandidates.push({
            userId: bfUserId,
            taishoTsuki: bfYear + '-' + ('0' + bfMonth).slice(-2),
            sofuDate: bfSendDate
          });
        }
        var bfToInsert = [], bfSkipped = [], bfNotActive = [];
        var bfSeen = {};
        for (var bfC = 0; bfC < bfCandidates.length; bfC++) {
          var bfCand = bfCandidates[bfC];
          var bfKey = bfCand.userId + '|tsusho_moni|' + bfCand.taishoTsuki;
          if (bfSeen[bfKey]) continue;  // ソース内重複は最初の1件のみ
          bfSeen[bfKey] = true;
          var bfInfo = bfUserMap[bfCand.userId];
          var bfWhy = !bfInfo ? '台帳に行なし' : (bfInfo.cancelled ? '利用終了' : '');
          if (bfWhy && !bfNotActive.some(function (x) { return x.userId === bfCand.userId; })) {
            bfNotActive.push({ userId: bfCand.userId, reason: bfWhy });
          }
          if (bfExisting[bfKey]) { bfSkipped.push(bfKey); continue; }
          bfToInsert.push(bfCand);
        }
        var bfByMonth = {};
        for (var bfM = 0; bfM < bfToInsert.length; bfM++) {
          bfByMonth[bfToInsert[bfM].taishoTsuki] = (bfByMonth[bfToInsert[bfM].taishoTsuki] || 0) + 1;
        }
        var bfSummary = {
          ok: true,
          dryRun: bfDryRun,
          year: bfYear,
          candidates: bfCandidates.length,
          toInsert: bfToInsert.length,
          skippedExisting: bfSkipped.length,
          byMonth: bfByMonth,
          notActiveUsers: bfNotActive
        };
        if (bfDryRun) return respond(bfSummary, callback);
        // 本投入: 書式確定 → setValues 一括（upsertSoufuStatus と同じ書き込みパス）
        if (bfToInsert.length > 0) {
          var bfNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
          var bfRows = bfToInsert.map(function (c) {
            return [c.userId, 'tsusho_moni', c.taishoTsuki, '', '送付済',
                    '', '', c.sofuDate, '', '', '', '', bfBy, bfNow];
          });
          var bfStart = bfLedSheet.getLastRow() + 1;
          var bfRange = bfLedSheet.getRange(bfStart, 1, bfRows.length, 14);
          bfRange.setNumberFormat('@');
          bfRange.setValues(bfRows);
          SpreadsheetApp.flush();
        }
        bfSummary.inserted = bfToInsert.length;
        return respond(bfSummary, callback);
      } finally {
        bfLock.releaseLock();
      }
    }

    // ============================================================
    // 要支援測定記録 読み取り（sokutei Phase B・設計書§5-6準拠）
    // 応答 = 全件 {name,care,sokutei_date,sokutei_by,source,note}
    // ============================================================
    if (action === 'getShienSokutei') {
      var gsskSheet = ensureShienSokuteiSheet_();
      var gsskValues = gsskSheet.getDataRange().getValues();
      var gsskRecords = [];
      for (var gsskI = 1; gsskI < gsskValues.length; gsskI++) {
        var gsskRow = shienSokuteiRowToObj_(gsskValues[gsskI]);
        if (!gsskRow.name) continue;
        gsskRecords.push(gsskRow);
      }
      return respond({ ok: true, records: gsskRecords }, callback);
    }

    // ============================================================
    // 要支援測定記録 追加（sokutei Phase B・アプリからのワンタップ記録）
    // 常に追記のみ（更新はしない）。行追加＋flush＋読み戻し検証（verified:true のみ成功）。
    // ============================================================
    if (action === 'addShienSokutei') {
      var asName = String((e && e.parameter && e.parameter.name) || '').trim();
      var asDate = String((e && e.parameter && e.parameter.date) || '').trim();
      var asBy = String((e && e.parameter && e.parameter.by) || '').trim();
      var asNote = String((e && e.parameter && e.parameter.note) || '').trim();
      if (!asName || !/^\d{4}-\d{2}-\d{2}$/.test(asDate)) {
        return respond({ ok: false, error: 'invalid params (name, date=YYYY-MM-DD required)' }, callback);
      }
      var asLock = LockService.getScriptLock();
      try { asLock.waitLock(10000); } catch (asLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var asAllUsers = getTsushoTargetUsersV2_(true);
        var asCare = '';
        for (var asU = 0; asU < asAllUsers.length; asU++) {
          if (asAllUsers[asU].name === asName) { asCare = asAllUsers[asU].category; break; }
        }
        var asSheet = ensureShienSokuteiSheet_();
        var asNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var asRow = [asName, asCare, asDate, asBy, 'app', asNote, asNow];
        var asWriteRow = asSheet.getLastRow() + 1;
        var asRange = asSheet.getRange(asWriteRow, 1, 1, 7);
        asRange.setNumberFormat('@');
        asRange.setValues([asRow]);
        SpreadsheetApp.flush();
        var asCheck = asSheet.getRange(asWriteRow, 1, 1, 7).getValues()[0];
        var asVerified = String(asCheck[0]) === asName && String(asCheck[2]) === asDate;
        return respond({
          ok: true, verified: asVerified,
          row: { name: asName, care: asCare, sokutei_date: asDate, sokutei_by: asBy, source: 'app', note: asNote }
        }, callback);
      } finally {
        asLock.releaseLock();
      }
    }

    // ============================================================
    // 要支援測定記録 取消（sokutei Phase B・誤タップ訂正用）
    // (name, sokutei_date, sokutei_by) 完全一致する最初の1行のみ削除。source不問（誤投入の是正に使う）。
    // ============================================================
    if (action === 'deleteShienSokutei') {
      var dsName = String((e && e.parameter && e.parameter.name) || '').trim();
      var dsDate = String((e && e.parameter && e.parameter.date) || '').trim();
      var dsBy = String((e && e.parameter && e.parameter.by) || '').trim();
      if (!dsName || !dsDate) {
        return respond({ ok: false, error: 'invalid params (name, date required)' }, callback);
      }
      var dsLock = LockService.getScriptLock();
      try { dsLock.waitLock(10000); } catch (dsLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var dsSheet = ensureShienSokuteiSheet_();
        var dsValues = dsSheet.getDataRange().getValues();
        var dsRowIdx = -1;
        for (var dsI = 1; dsI < dsValues.length; dsI++) {
          var dsObj = shienSokuteiRowToObj_(dsValues[dsI]);
          if (dsObj.name === dsName && dsObj.sokutei_date === dsDate && dsObj.sokutei_by === dsBy) {
            dsRowIdx = dsI + 1;
            break;
          }
        }
        if (dsRowIdx > 0) dsSheet.deleteRow(dsRowIdx);
        SpreadsheetApp.flush();
        return respond({ ok: true, deleted: dsRowIdx > 0 }, callback);
      } finally {
        dsLock.releaseLock();
      }
    }

    // ============================================================
    // 要支援測定記録 紙台帳初期投入（sokutei Phase B・管理action・一回限りの投入）
    // 2026-07-03 社長照合承認済み（60名・現役要支援59名との機械突合=完全一致）。
    // anchorYm（紙台帳の測定予定月アンカー）→ sokutei_date 変換規約（社長承認2026-07-03）:
    //   アンカー月の4ヶ月前・月初1日。以後はアプリの「前回測定日+4ヶ月」ロジックが
    //   紙のスケジュール通りに次回期限を再現する。
    // dryRun=1 でプレビュー（介護度未特定=台帳と表記不一致の疑いはcareNotFoundで検出・未投入）。
    // 冪等: シート内に既存 name があれば再投入しない。
    // ============================================================
    if (action === 'seedShienSokuteiPaper') {
      var sspDry = !!(e && e.parameter && e.parameter.dryRun === '1');
      var sspAllUsers = getTsushoTargetUsersV2_(true);
      var sspCareMap = {};
      for (var sspU = 0; sspU < sspAllUsers.length; sspU++) {
        sspCareMap[sspAllUsers[sspU].name] = sspAllUsers[sspU].category;
      }
      var sspSheet = ensureShienSokuteiSheet_();
      var sspValues = sspSheet.getDataRange().getValues();
      var sspExisting = {};
      for (var sspI = 1; sspI < sspValues.length; sspI++) {
        var sspN = String(sspValues[sspI][0] || '').trim();
        if (sspN) sspExisting[sspN] = true;
      }
      var sspToInsert = [], sspSkipped = [], sspCareNotFound = [];
      for (var sspS = 0; sspS < SHIEN_SOKUTEI_PAPER_SEED.length; sspS++) {
        var sspItem = SHIEN_SOKUTEI_PAPER_SEED[sspS];
        if (sspExisting[sspItem.name]) { sspSkipped.push(sspItem.name); continue; }
        var sspCare = sspCareMap[sspItem.name];
        if (!sspCare) { sspCareNotFound.push(sspItem.name); continue; }
        var sspYm = sspItem.anchorYm.split('-');
        var sspAnchorY = parseInt(sspYm[0], 10), sspAnchorM = parseInt(sspYm[1], 10);
        var sspPrevM = sspAnchorM - 4, sspPrevY = sspAnchorY;
        if (sspPrevM <= 0) { sspPrevM += 12; sspPrevY -= 1; }
        var sspDate = sspPrevY + '-' + ('0' + sspPrevM).slice(-2) + '-01';
        sspToInsert.push({ name: sspItem.name, care: sspCare, sokutei_date: sspDate, anchorYm: sspItem.anchorYm });
      }
      if (sspDry) {
        return respond({
          ok: true, dryRun: true, total: SHIEN_SOKUTEI_PAPER_SEED.length,
          toInsert: sspToInsert.length, skippedExisting: sspSkipped, careNotFound: sspCareNotFound,
          preview: sspToInsert.slice(0, 5)
        }, callback);
      }
      if (sspCareNotFound.length > 0) {
        return respond({ ok: false, error: 'careNotFound has entries — fix names before real insert', careNotFound: sspCareNotFound }, callback);
      }
      var sspLock = LockService.getScriptLock();
      try { sspLock.waitLock(30000); } catch (sspLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        if (sspToInsert.length > 0) {
          var sspNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
          var sspRows = sspToInsert.map(function (r) {
            return [r.name, r.care, r.sokutei_date, '', 'paper', '', sspNow];
          });
          var sspStart = sspSheet.getLastRow() + 1;
          var sspRange = sspSheet.getRange(sspStart, 1, sspRows.length, 7);
          sspRange.setNumberFormat('@');
          sspRange.setValues(sspRows);
          SpreadsheetApp.flush();
        }
        return respond({ ok: true, inserted: sspToInsert.length, skippedExisting: sspSkipped }, callback);
      } finally {
        sspLock.releaseLock();
      }
    }

    // ============================================================
    // 口腔機能向上 レコード更新
    // field: plan_date / sent_to_cm / memo
    // Phase 1-D（2026-05-27追加）
    // ============================================================
    if (action === 'updateOralPlan') {
      var uoUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var uoYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var uoMonth = parseInt((e && e.parameter && e.parameter.month) || '', 10);
      var uoField = String((e && e.parameter && e.parameter.field) || '').trim();
      var uoValue = String((e && e.parameter && e.parameter.value) || '');
      var uoOperator = String((e && e.parameter && e.parameter.operator) || '').trim();
      var uoFieldAllowed = { plan_date: 4, sent_to_cm: 5, sent_date: 6, memo: 7, eval_result: 10, sent_by: 11, moni1_date: 12, moni2_date: 13, houkoku_date: 14, houkoku_by: 15, plan_by: 16, moni1_by: 17, moni2_by: 18 };  // 1-indexed column
      if (!uoUserId || !uoYear || uoYear < 2020 || uoYear > 2100
          || !uoMonth || uoMonth < 1 || uoMonth > 12
          || !uoFieldAllowed.hasOwnProperty(uoField)) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }
      var uoLock = LockService.getScriptLock();
      try { uoLock.waitLock(10000); } catch (uoLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var uoSheets = ensureOralPlansSheets_();
        var uoSheet = uoSheets.recordSheet;
        var uoValues = uoSheet.getDataRange().getValues();
        var uoRowIdx = -1;
        for (var uoI = 1; uoI < uoValues.length; uoI++) {
          if (String(uoValues[uoI][0] || '').trim() === uoUserId
              && parseInt(uoValues[uoI][1], 10) === uoYear
              && parseInt(uoValues[uoI][2], 10) === uoMonth) {
            uoRowIdx = uoI + 1;
            break;
          }
        }
        var uoCol = uoFieldAllowed[uoField];
        var uoNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var uoToday = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
        if (uoRowIdx < 0) {
          if (!uoValue && uoField !== 'sent_to_cm') return respond({ ok: true }, callback);
          var uoNewRow = [uoUserId, uoYear, uoMonth, '', false, '', '', uoOperator || '', uoNow, '', '', '', '', '', '', '', '', ''];
          if (uoField === 'sent_to_cm') {
            var uoBoolNew = (uoValue === 'true' || uoValue === '1');
            uoNewRow[4] = uoBoolNew;
            if (uoBoolNew) uoNewRow[5] = uoToday;
          } else {
            uoNewRow[uoCol - 1] = uoValue;
          }
          uoSheet.appendRow(uoNewRow);
        } else {
          if (uoField === 'sent_to_cm') {
            var uoBool = (uoValue === 'true' || uoValue === '1');
            uoSheet.getRange(uoRowIdx, 5).setValue(uoBool);
            if (uoBool) {
              uoSheet.getRange(uoRowIdx, 6).setValue(uoToday);
            } else {
              uoSheet.getRange(uoRowIdx, 6).setValue('');
            }
          } else {
            uoSheet.getRange(uoRowIdx, uoCol).setValue(uoValue);
          }
          uoSheet.getRange(uoRowIdx, 9).setValue(uoNow);
        }
        return respond({ ok: true }, callback);
      } finally {
        uoLock.releaseLock();
      }
    }

    // ============================================================
    // 通所介護計画書 レコード更新
    // field: plan_date / sent_to_cm / memo
    // ============================================================
    if (action === 'updateTsushoPlan') {
      var utUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var utYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var utMonth = parseInt((e && e.parameter && e.parameter.month) || '', 10);
      var utField = String((e && e.parameter && e.parameter.field) || '').trim();
      var utValue = String((e && e.parameter && e.parameter.value) || '');
      var utOperator = String((e && e.parameter && e.parameter.operator) || '').trim();
      var utFieldAllowed = { plan_date: 4, sent_to_cm: 5, memo: 7 };  // 1-indexed column
      if (!utUserId || !utYear || utYear < 2020 || utYear > 2100
          || !utMonth || utMonth < 1 || utMonth > 12
          || !utFieldAllowed.hasOwnProperty(utField)) {
        return respond({ ok: false, error: 'invalid params' }, callback);
      }
      var utLock = LockService.getScriptLock();
      try { utLock.waitLock(10000); } catch (utLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var utSheets = ensureTsushoPlansSheets_();
        var utSheet = utSheets.recordSheet;
        var utValues = utSheet.getDataRange().getValues();
        var utRowIdx = -1;
        for (var utI = 1; utI < utValues.length; utI++) {
          if (String(utValues[utI][0] || '').trim() === utUserId
              && parseInt(utValues[utI][1], 10) === utYear
              && parseInt(utValues[utI][2], 10) === utMonth) {
            utRowIdx = utI + 1;
            break;
          }
        }
        var utCol = utFieldAllowed[utField];
        var utNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var utToday = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
        if (utRowIdx < 0) {
          // 新規行: plan_date/memo/sent_to_cm の最初の入力で行作成
          if (!utValue && utField !== 'sent_to_cm') return respond({ ok: true }, callback);
          var utNewRow = [utUserId, utYear, utMonth, '', false, '', '', utOperator || '', utNow];
          if (utField === 'sent_to_cm') {
            var utBoolNew = (utValue === 'true' || utValue === '1');
            utNewRow[4] = utBoolNew;
            if (utBoolNew) utNewRow[5] = utToday;
          } else {
            utNewRow[utCol - 1] = utValue;
          }
          utSheet.appendRow(utNewRow);
        } else {
          if (utField === 'sent_to_cm') {
            var utBool = (utValue === 'true' || utValue === '1');
            utSheet.getRange(utRowIdx, 5).setValue(utBool);
            if (utBool) {
              utSheet.getRange(utRowIdx, 6).setValue(utToday);
            } else {
              utSheet.getRange(utRowIdx, 6).setValue('');
            }
          } else {
            utSheet.getRange(utRowIdx, utCol).setValue(utValue);
          }
          utSheet.getRange(utRowIdx, 9).setValue(utNow);
        }
        return respond({ ok: true }, callback);
      } finally {
        utLock.releaseLock();
      }
    }

    // ============================================================
    // 口腔機能向上 設定更新（is_target / started_at）
    // Phase 1-D（2026-05-27追加）
    // ============================================================
    if (action === 'updateOralConfig') {
      var ocUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var ocIsTargetRaw = (e && e.parameter && e.parameter.isTarget !== undefined) ? String(e.parameter.isTarget) : null;
      var ocStartedAt = String((e && e.parameter && e.parameter.startedAt) || '').trim();
      var ocEvalAnchor = (e && e.parameter && e.parameter.evalAnchor !== undefined) ? String(e.parameter.evalAnchor).trim() : null;
      // 口腔②個人サイクル: plan_start（計画作成/節目アンカー YYYY-MM）・plan_end（イレギュラー終了 YYYY-MM）。空文字はクリア許可。
      var ocPlanStart = (e && e.parameter && e.parameter.planStart !== undefined) ? String(e.parameter.planStart).trim() : null;
      var ocPlanEnd = (e && e.parameter && e.parameter.planEnd !== undefined) ? String(e.parameter.planEnd).trim() : null;
      if (!ocUserId) {
        return respond({ ok: false, error: 'invalid params (userId required)' }, callback);
      }
      if (ocIsTargetRaw === null && !ocStartedAt && ocEvalAnchor === null && ocPlanStart === null && ocPlanEnd === null) {
        return respond({ ok: false, error: 'invalid params (isTarget/startedAt/evalAnchor/planStart/planEnd required)' }, callback);
      }
      if (ocStartedAt && !/^\d{4}-\d{2}-\d{2}$/.test(ocStartedAt)) {
        return respond({ ok: false, error: 'invalid startedAt (YYYY-MM-DD)' }, callback);
      }
      if (ocEvalAnchor !== null && ocEvalAnchor !== '' && !/^\d{4}-\d{2}$/.test(ocEvalAnchor)) {
        return respond({ ok: false, error: 'invalid evalAnchor (YYYY-MM)' }, callback);
      }
      if (ocPlanStart !== null && ocPlanStart !== '' && !/^\d{4}-\d{2}$/.test(ocPlanStart)) {
        return respond({ ok: false, error: 'invalid planStart (YYYY-MM)' }, callback);
      }
      if (ocPlanEnd !== null && ocPlanEnd !== '' && !/^\d{4}-\d{2}$/.test(ocPlanEnd)) {
        return respond({ ok: false, error: 'invalid planEnd (YYYY-MM)' }, callback);
      }
      var ocLock = LockService.getScriptLock();
      try { ocLock.waitLock(10000); } catch (ocLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var ocSheets = ensureOralPlansSheets_();
        var ocSheet = ocSheets.configSheet;
        var ocValues = ocSheet.getDataRange().getValues();
        var ocRowIdx = -1;
        var ocUserIdNorm = _normalizeUserName(ocUserId);
        for (var ocI = 1; ocI < ocValues.length; ocI++) {
          if (_normalizeUserName(String(ocValues[ocI][0] || '')) === ocUserIdNorm) {
            ocRowIdx = ocI + 1;
            break;
          }
        }
        var ocNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        if (ocRowIdx < 0) {
          var ocNewIsTarget = ocIsTargetRaw === null ? false : (ocIsTargetRaw === 'true' || ocIsTargetRaw === '1');
          var ocNewStartedAt = ocStartedAt || '2026-06-01';
          var ocNewAnchor = (ocEvalAnchor === null) ? '' : ocEvalAnchor;
          ocSheet.appendRow([ocUserId, ocNewIsTarget, ocNewStartedAt, ocNow, ocNewAnchor,
            (ocPlanStart === null) ? '' : ocPlanStart,
            (ocPlanEnd === null) ? '' : ocPlanEnd]);
        } else {
          if (ocIsTargetRaw !== null) {
            var ocBool = (ocIsTargetRaw === 'true' || ocIsTargetRaw === '1');
            ocSheet.getRange(ocRowIdx, 2).setValue(ocBool);
          }
          if (ocStartedAt) {
            ocSheet.getRange(ocRowIdx, 3).setValue(ocStartedAt);
          }
          if (ocEvalAnchor !== null) {
            ocSheet.getRange(ocRowIdx, 5).setValue(ocEvalAnchor);
          }
          if (ocPlanStart !== null) {
            ocSheet.getRange(ocRowIdx, 6).setValue(ocPlanStart);
          }
          if (ocPlanEnd !== null) {
            ocSheet.getRange(ocRowIdx, 7).setValue(ocPlanEnd);
          }
          ocSheet.getRange(ocRowIdx, 4).setValue(ocNow);
        }
        return respond({ ok: true }, callback);
      } finally {
        ocLock.releaseLock();
      }
    }

    // ============================================================
    // 口腔②「今月の締め担当」（月 YYYY-MM × 看護師1人）additive・2026-07-06追加
    // morningDigest/朝報・請求まわりには一切触れない。専用シート「口腔締め担当」に月×担当を持つ。
    // ============================================================
    if (action === 'getOralCloseAssignees') {
      var gcaSheet = ensureOralCloseSheet_();
      var gcaValues = gcaSheet.getDataRange().getValues();
      var gcaMap = {};
      for (var gcaI = 1; gcaI < gcaValues.length; gcaI++) {
        var gcaYm = String(gcaValues[gcaI][0] || '').trim();
        var gcaName = String(gcaValues[gcaI][1] || '').trim();
        if (/^\d{4}-\d{2}$/.test(gcaYm) && gcaName) gcaMap[gcaYm] = gcaName;
      }
      return respond({ ok: true, map: gcaMap }, callback);
    }

    if (action === 'setOralCloseAssignee') {
      var scaMonth = String((e && e.parameter && e.parameter.month) || '').trim();
      var scaAssignee = String((e && e.parameter && e.parameter.assignee) || '').trim();
      var scaBy = String((e && e.parameter && e.parameter.updatedBy) || '').trim();
      if (!/^\d{4}-\d{2}$/.test(scaMonth)) {
        return respond({ ok: false, error: 'invalid month (YYYY-MM)' }, callback);
      }
      if (!scaAssignee) {
        return respond({ ok: false, error: 'assignee required' }, callback);
      }
      var scaLock = LockService.getScriptLock();
      try { scaLock.waitLock(10000); } catch (scaLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var scaSheet = ensureOralCloseSheet_();
        var scaValues = scaSheet.getDataRange().getValues();
        var scaRowIdx = -1;
        for (var scaI = 1; scaI < scaValues.length; scaI++) {
          if (String(scaValues[scaI][0] || '').trim() === scaMonth) { scaRowIdx = scaI + 1; break; }
        }
        var scaNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var scaRow = [scaMonth, scaAssignee, scaNow, scaBy];
        var scaTarget = (scaRowIdx < 0) ? (scaSheet.getLastRow() + 1) : scaRowIdx;
        scaSheet.getRange(scaTarget, 1, 1, 4).setNumberFormat('@');  // YYYY-MM の日付誤変換を防止
        scaSheet.getRange(scaTarget, 1, 1, 4).setValues([scaRow]);
        return respond({ ok: true, month: scaMonth, assignee: scaAssignee }, callback);
      } finally {
        scaLock.releaseLock();
      }
    }

    // ============================================================
    // 通所介護計画書 サイクル設定更新
    // ============================================================
    if (action === 'updateTsushoConfig') {
      var ucUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var ucCycle = parseInt((e && e.parameter && e.parameter.cycleMonths) || '', 10);
      if (!ucUserId || [3, 6, 12].indexOf(ucCycle) < 0) {
        return respond({ ok: false, error: 'invalid params (cycle must be 3/6/12)' }, callback);
      }
      var ucLock = LockService.getScriptLock();
      try { ucLock.waitLock(10000); } catch (ucLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var ucSheets = ensureTsushoPlansSheets_();
        var ucSheet = ucSheets.configSheet;
        var ucValues = ucSheet.getDataRange().getValues();
        var ucRowIdx = -1;
        for (var ucI = 1; ucI < ucValues.length; ucI++) {
          if (String(ucValues[ucI][0] || '').trim() === ucUserId) {
            ucRowIdx = ucI + 1;
            break;
          }
        }
        var ucNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        if (ucRowIdx < 0) {
          ucSheet.appendRow([ucUserId, ucCycle, ucNow]);
        } else {
          ucSheet.getRange(ucRowIdx, 2).setValue(ucCycle);
          ucSheet.getRange(ucRowIdx, 3).setValue(ucNow);
        }
        return respond({ ok: true }, callback);
      } finally {
        ucLock.releaseLock();
      }
    }

    // ============================================================
    // 通所介護計画書 満了日（次回計画書作成期限）設定（追加・2026-06-27 案2）
    // 「通所介護計画書設定」シートに due_date 列(4列目)を冪等増設し userId ごとに upsert。
    // 既存列(cycleMonths=2列/updatedAt=3列)は触らない。満了日はフロント表示用(暫定計算の実値置換)。
    // ============================================================
    if (action === 'setTsushoDueDate') {
      var sdUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var sdDue = String((e && e.parameter && e.parameter.due_date) || '').trim();
      var sdOperator = String((e && e.parameter && e.parameter.operator) || '').trim();
      if (!sdUserId || (sdDue !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(sdDue))) {
        return respond({ ok: false, error: 'invalid params (due_date must be YYYY-MM-DD or empty)' }, callback);
      }
      var sdLock = LockService.getScriptLock();
      try { sdLock.waitLock(10000); } catch (sdLockErr) {
        return respond({ ok: false, error: 'lock timeout' }, callback);
      }
      try {
        var sdSheets = ensureTsushoPlansSheets_();
        var sdSheet = sdSheets.configSheet;
        // due_date 列(4列目)を冪等に増設（既存 ensureTsushoPlansSheets_ は変更しない）
        var sdHdr = sdSheet.getRange(1, 1, 1, Math.max(sdSheet.getLastColumn(), 3)).getValues()[0];
        if (sdHdr.indexOf('due_date') === -1) {
          sdSheet.getRange(1, 4).setValue('due_date');
          sdSheet.getRange(1, 4).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
        }
        var sdValues = sdSheet.getDataRange().getValues();
        var sdRowIdx = -1;
        for (var sdI = 1; sdI < sdValues.length; sdI++) {
          if (String(sdValues[sdI][0] || '').trim() === sdUserId) { sdRowIdx = sdI + 1; break; }
        }
        var sdNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        if (sdRowIdx < 0) {
          // 新規行: cycleMonths(2列)は空のまま=フロントは||12。既存設定を勝手に作らない。
          sdSheet.appendRow([sdUserId, '', sdNow, sdDue]);
        } else {
          // 既存行: 4列目(due_date)だけ更新。2列(cycle)/3列(updatedAt)は触らない。
          sdSheet.getRange(sdRowIdx, 4).setValue(sdDue);
        }
        return respond({ ok: true, userId: sdUserId, due_date: sdDue, operator: sdOperator }, callback);
      } finally {
        sdLock.releaseLock();
      }
    }

    // ============================================================
    // 通所介護計画書 満了日マップ取得（追加・2026-06-27 案2 / フロント表示用）
    // getTsushoPlansYear は変更せず、満了日だけ別 read action で返す。
    // ============================================================
    if (action === 'getTsushoDueDates') {
      var gdSheets = ensureTsushoPlansSheets_();
      var gdSheet = gdSheets.configSheet;
      var gdValues = gdSheet.getDataRange().getValues();
      var gdHdr = (gdValues[0] || []).map(function (v) { return String(v).trim(); });
      var gdCol = gdHdr.indexOf('due_date'); // 0-indexed; -1=未増設
      var gdMap = {};
      if (gdCol >= 0) {
        for (var gdI = 1; gdI < gdValues.length; gdI++) {
          var gdUid = String(gdValues[gdI][0] || '').trim();
          if (!gdUid) continue;
          var gdRaw = gdValues[gdI][gdCol];
          var gdStr = (gdRaw instanceof Date)
            ? Utilities.formatDate(gdRaw, 'Asia/Tokyo', 'yyyy-MM-dd')
            : String(gdRaw || '').trim();
          if (gdStr) gdMap[gdUid] = gdStr;
        }
      }
      return respond({ ok: true, dueDates: gdMap }, callback);
    }

    // ============================================================
    // 口腔機能向上 月次取得（Phase 1-D ケアマネ送付チェックリスト連動用）
    // Phase 1-D（2026-05-27追加）
    // ============================================================
    if (action === 'getOralPlans') {
      var goYm = String((e && e.parameter && e.parameter.ym) || '').trim();
      if (!/^\d{4}-\d{2}$/.test(goYm)) {
        return respond({ ok: false, error: 'invalid ym (YYYY-MM)' }, callback);
      }
      var goParts = goYm.split('-');
      var goYear = parseInt(goParts[0], 10);
      var goMonth = parseInt(goParts[1], 10);
      var goSheets = ensureOralPlansSheets_();
      var goUsers = getOralTargetUsers_();
      var goTargets = goUsers.filter(function (u) { return u.isTarget; });
      var goUserMap = {};
      for (var goUi = 0; goUi < goTargets.length; goUi++) {
        goUserMap[goTargets[goUi].userId] = goTargets[goUi];
      }
      var goValues = goSheets.recordSheet.getDataRange().getValues();
      var goRecMap = {};
      for (var goRi = 1; goRi < goValues.length; goRi++) {
        var grow = goValues[goRi];
        var key = String(grow[0] || '').trim() + '|' + parseInt(grow[1], 10) + '|' + parseInt(grow[2], 10);
        goRecMap[key] = {
          sentToCm: !!grow[4],
          planDate: (function (v) {
            if (!v) return '';
            if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
            return String(v);
          })(grow[3])
        };
      }
      var goPlans = [];
      var goUnsent = [];
      // 当月が送付月 → 算定対象者全員を plans に
      if (isOralSendMonth_(goYear, goMonth, null)) {
        goTargets.forEach(function (u) {
          if (!isOralSendMonth_(goYear, goMonth, u.startedAt)) return;
          var k = u.userId + '|' + goYear + '|' + goMonth;
          var rec = goRecMap[k] || { sentToCm: false, planDate: '' };
          goPlans.push({
            userId: u.userId,
            userName: u.name,
            sentToCm: rec.sentToCm,
            planDate: rec.planDate,
            cmOffice: u.cmOffice
          });
        });
      }
      // 未送付リスト（過去の送付月で未送付の算定対象者）
      var goToday = new Date();
      var goTodayY = goToday.getFullYear();
      var goTodayM = goToday.getMonth() + 1;
      var goCurTotal = goTodayY * 12 + goTodayM;
      goTargets.forEach(function (u) {
        var sm = (u.startedAt || '2026-06-01').match(/^(\d{4})-(\d{2})/);
        if (!sm) return;
        var sYear = parseInt(sm[1], 10);
        var sMonth = parseInt(sm[2], 10);
        var sTotal = sYear * 12 + sMonth;
        for (var t = sTotal; t <= goCurTotal; t++) {
          var ty = Math.floor((t - 1) / 12);
          var tm = ((t - 1) % 12) + 1;
          if ([3, 6, 9, 12].indexOf(tm) < 0) continue;
          var k2 = u.userId + '|' + ty + '|' + tm;
          var rec2 = goRecMap[k2];
          if (rec2 && rec2.sentToCm) continue;
          if (ty === goYear && tm === goMonth) continue;
          goUnsent.push({
            userId: u.userId,
            userName: u.name,
            year: ty,
            month: tm,
            daysSinceTarget: Math.floor((goCurTotal - t) * 30.4),
            cmOffice: u.cmOffice
          });
        }
      });
      return respond({ ok: true, ym: goYm, plans: goPlans, unsent: goUnsent }, callback);
    }

    // ============================================================
    // 通所介護計画書 月次取得（Phase 1-D ケアマネ送付チェックリスト連動用）
    // ============================================================
    if (action === 'getTsushoPlans') {
      var gpYm = String((e && e.parameter && e.parameter.ym) || '').trim();
      if (!/^\d{4}-\d{2}$/.test(gpYm)) {
        return respond({ ok: false, error: 'invalid ym (YYYY-MM)' }, callback);
      }
      var gpParts = gpYm.split('-');
      var gpYear = parseInt(gpParts[0], 10);
      var gpMonth = parseInt(gpParts[1], 10);
      var gpSheets = ensureTsushoPlansSheets_();
      var gpUsers = getTsushoTargetUsers_();
      var gpUserMap = {};
      for (var gpUi = 0; gpUi < gpUsers.length; gpUi++) {
        gpUserMap[gpUsers[gpUi].userId] = gpUsers[gpUi];
      }
      var gpValues = gpSheets.recordSheet.getDataRange().getValues();
      var gpPlans = [];
      var gpUnsent = [];
      function gpFmtDate_(v) {
        if (!v) return '';
        if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
        return String(v);
      }
      var gpToday = new Date();
      for (var gpI = 1; gpI < gpValues.length; gpI++) {
        var grow = gpValues[gpI];
        var gpUserId = String(grow[0] || '').trim();
        var gpUserInfo = gpUserMap[gpUserId] || { name: gpUserId, cmOffice: '' };
        var gpRowYear = parseInt(grow[1], 10);
        var gpRowMonth = parseInt(grow[2], 10);
        var gpPlanDate = gpFmtDate_(grow[3]);
        var gpSent = !!grow[4];
        if (!gpPlanDate) continue;
        // 該当月作成リスト
        if (gpRowYear === gpYear && gpRowMonth === gpMonth) {
          gpPlans.push({
            userId: gpUserId,
            userName: gpUserInfo.name,
            planDate: gpPlanDate,
            sentToCm: gpSent,
            cmOffice: gpUserInfo.cmOffice
          });
        }
        // 未送付リスト（全期間）
        if (!gpSent) {
          var gpPlanD = new Date(gpPlanDate);
          var gpDays = Math.floor((gpToday - gpPlanD) / (1000 * 60 * 60 * 24));
          gpUnsent.push({
            userId: gpUserId,
            userName: gpUserInfo.name,
            planDate: gpPlanDate,
            daysSinceCreated: gpDays,
            cmOffice: gpUserInfo.cmOffice
          });
        }
      }
      return respond({ ok: true, ym: gpYm, plans: gpPlans, unsent: gpUnsent }, callback);
    }

    // 個別機能訓練計画書 旧JSONからの一括移行（dryRun対応・冪等性ガード付き）
    if (action === 'migrateFromOldChecks') {
      var miDryRun = (e && e.parameter && e.parameter.dryRun === 'true');
      try {
        var miOldUrl = 'https://script.google.com/macros/s/AKfycbyJtAHueOf4_F4EcVpXO1-6mksEcmJChCKxT7J28XNQNp9S8ZMFOMDyq4v4ML1C1qxP/exec';
        var miRes = UrlFetchApp.fetch(miOldUrl + '?action=getMonthly&t=' + Date.now(), { muteHttpExceptions: true });
        var miCode = miRes.getResponseCode();
        if (miCode !== 200) {
          return respond({ ok: false, error: 'old sync fetch failed: ' + miCode }, callback);
        }
        var miText = String(miRes.getContentText() || '').trim();
        // JSONP形式（callback(...)）で返ってくる可能性があるので剥がす
        var miCbMatch = miText.match(/^[a-zA-Z0-9_$]+\(([\s\S]*)\);?\s*$/);
        if (miCbMatch) miText = miCbMatch[1];
        var miOldData;
        try {
          miOldData = JSON.parse(miText);
        } catch (miParseErr) {
          return respond({
            ok: false,
            error: 'old data JSON parse failed: ' + miParseErr,
            sample: miText.substring(0, 200)
          }, callback);
        }
        var miChecks = (miOldData && miOldData.checks) || {};

        // 利用者マップ（NFKC＋記号/様除去で名前マッチング）
        var miUsers = getKeikakushoTargetUsers_();
        var miNameToUser = {};
        function miNormName(s) {
          return String(s || '')
            .normalize('NFKC')
            .replace(/[\s　・,.\-_'"様さん]/g, '')
            .trim();
        }
        miUsers.forEach(function (u) {
          var k = miNormName(u.name);
          if (k) miNameToUser[k] = u;
        });

        var miFieldMap = { keikaku: 'keikaku_date', kyomi: 'kyoumi_date' };
        var miOldKeysToDelete = [];
        var miBuckets = {}; // key: userId_year_month → row data

        for (var miKey in miChecks) {
          if (!miChecks.hasOwnProperty(miKey)) continue;
          if (!miChecks[miKey]) continue; // チェックOFFはスキップ
          // 旧キー形式: YYYY-MM_<section>_<am|pm>_<nameKey>_<field>
          // section は measure/birth/oral/visit/bday 等、ここでは measure のみ対象
          var miM = miKey.match(/^(\d{4})-(\d{2})_measure_(am|pm)_(.+?)_(input|cm|honin|keikaku|kyomi|hyouka)$/);
          if (!miM) continue;
          var miYear = parseInt(miM[1], 10);
          var miMonth = parseInt(miM[2], 10);
          var miNameKey = miM[4];
          var miFieldShort = miM[5];

          if (miFieldShort === 'hyouka') {
            // 評価項目は新アプリでは破棄（集計だけ）
            miOldKeysToDelete.push(miKey);
            continue;
          }
          if (!miFieldMap.hasOwnProperty(miFieldShort)) continue; // input/cm/honin は体力測定一覧側に残す

          var miNewField = miFieldMap[miFieldShort];
          var miUser = miNameToUser[miNormName(miNameKey)];
          if (!miUser) continue; // 対象利用者でなければスキップ（要支援・退所者など）

          var miBk = miUser.userId + '_' + miYear + '_' + miMonth;
          if (!miBuckets[miBk]) {
            miBuckets[miBk] = {
              userId: miUser.userId, name: miUser.name,
              year: miYear, month: miMonth,
              kyoumi_date: '', seikatsu_date: '', keikaku_date: ''
            };
          }
          // 仮日付: その月の15日（月中で目立たない位置・社長が後で実日付を上書きする想定）
          var miStamp = miYear + '-' + String(miMonth).padStart(2, '0') + '-15';
          miBuckets[miBk][miNewField] = miStamp;
          miOldKeysToDelete.push(miKey);
        }

        var miNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
        var miInsertRows = [];
        Object.keys(miBuckets).forEach(function (k) {
          var b = miBuckets[k];
          miInsertRows.push([
            b.userId, b.name, b.year, b.month,
            b.kyoumi_date, b.seikatsu_date, b.keikaku_date, miNow
          ]);
        });

        if (miDryRun) {
          return respond({
            ok: true, dryRun: true,
            inserts: miInsertRows.length,
            oldKeysToDelete: miOldKeysToDelete.length,
            sample: miInsertRows.slice(0, 5)
          }, callback);
        }

        // 冪等性ガード: 既存データありなら force=true 必須（2回実行で重複INSERTを防止）
        var miSheet = ensureKeikakushoSheet_();
        var miForce = (e && e.parameter && e.parameter.force === 'true');
        if (miSheet.getLastRow() > 1 && !miForce) {
          return respond({
            ok: false,
            error: '既存データあり。再実行は force=true を付けてください',
            existingRows: miSheet.getLastRow() - 1,
            wouldInsert: miInsertRows.length
          }, callback);
        }
        if (miInsertRows.length > 0) {
          miSheet.getRange(miSheet.getLastRow() + 1, 1, miInsertRows.length, 8).setValues(miInsertRows);
        }
        return respond({
          ok: true,
          inserted: miInsertRows.length,
          oldKeysToDelete: miOldKeysToDelete.length
        }, callback);
      } catch (miErr) {
        return respond({ ok: false, error: String(miErr) }, callback);
      }
    }

    if (action === 'usage_stats') {
      var fromYM = e && e.parameter ? e.parameter.from : null;
      var toYM = e && e.parameter ? e.parameter.to : null;
      if (!fromYM || !toYM) {
        result.error = 'from/to パラメータが必須 (YYYY-MM)';
      } else {
        var stats = getUsageStats(ss, fromYM, toYM);
        result.usageStats = stats;
      }
      return respond(result, callback);
    }

    if (action === 'usage_alerts') {
      var uaFrom = e && e.parameter ? e.parameter.from : null;
      var uaTo = e && e.parameter ? e.parameter.to : null;
      if (!uaFrom || !uaTo) {
        result.error = 'from/to パラメータが必須 (YYYY-MM)';
      } else {
        result.usageAlerts = getUsageAlerts(ss, uaFrom, uaTo, today);
      }
      return respond(result, callback);
    }

    if (action === 'debug_absence_rows') {
      var nameFilter = e && e.parameter ? String(e.parameter.name || '') : '';
      var sheet = ss.getSheetByName('出欠変更');
      result.rows = [];
      if (sheet && sheet.getLastRow() >= 2) {
        var d = sheet.getDataRange().getValues();
        for (var i = 1; i < d.length; i++) {
          var name = String(d[i][1] || '').trim();
          if (nameFilter && name.indexOf(nameFilter) < 0) continue;
          result.rows.push({
            row: i + 1,
            date: d[i][0] ? Utilities.formatDate(d[i][0] instanceof Date ? d[i][0] : new Date(d[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd') : '',
            rawDate: String(d[i][0]),
            name: name,
            unit: String(d[i][2] || ''),
            type: String(d[i][3] || ''),
            reason: String(d[i][4] || ''),
            reporter: String(d[i][5] || ''),
            registeredAt: d[i][6] ? String(d[i][6]) : '',
            longTermEnd: d[i][7] ? Utilities.formatDate(d[i][7] instanceof Date ? d[i][7] : new Date(d[i][7]), 'Asia/Tokyo', 'yyyy-MM-dd') : '',
            contactDate: d[i][8] ? String(d[i][8]) : ''
          });
        }
      }
      return respond(result, callback);
    }

    return respond(result, callback);
  } catch (err) {
    return respond({ error: err.message, success: false }, callback);
  }
  } catch (err) {
    return respond({ ok: false, error: err.message || String(err) });
  }
}

// ===== スタッフ一覧をシフト希望スプレッドシートから取得（2026/5/3追加）=====
// 入退社時はシフト希望SSの「スタッフ」シートを更新するだけで全アプリに反映される
var SHIFT_SS_ID = '1sj4B5-g96_lg3uuLmml9edWiC5YlPsrJeUmVfDd810A';
function getStaffListFromShiftSheet() {
  try {
    var shiftSs = SpreadsheetApp.openById(SHIFT_SS_ID);
    var sheet = shiftSs.getSheetByName('スタッフ');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    var staff = [];
    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][0] || '').trim();
      if (name) staff.push(name);
    }
    return staff;
  } catch (err) {
    return [];
  }
}

// ===== 配置データ save_haichi：キー単位マージ保存（2026-06-21）=====
// シート「配置データ」A1単一セルのJSONを read-modify-write でマージする。
//  - 受信キーは既存に上書き/追加（他端末の別キーを壊さない＝取りこぼし防止）
//  - positions 全空の「クリアマーカー」キーは削除（board の枠クリアと整合）
//  - staff は受信があれば全置換
//  - 並行書き込みは ScriptLock で直列化（read→write の競合を防ぐ）
function saveHaichiMerged(ss, data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'lock_timeout' };
  }
  try {
    var hSheet = ss.getSheetByName('配置データ');
    if (!hSheet) hSheet = ss.insertSheet('配置データ');
    var curRaw = hSheet.getRange('A1').getValue();
    var cur;
    try { cur = curRaw ? JSON.parse(curRaw) : {}; } catch (e) { cur = {}; }
    if (!cur || typeof cur !== 'object') cur = {};
    if (!cur.assignments || typeof cur.assignments !== 'object') cur.assignments = {};

    var inc = data.haichi || {};
    var incA = (inc.assignments && typeof inc.assignments === 'object') ? inc.assignments : {};
    var merged = 0, deleted = 0;
    Object.keys(incA).forEach(function (k) {
      if (isHaichiClearMarker_(incA[k])) {
        if (cur.assignments.hasOwnProperty(k)) { delete cur.assignments[k]; deleted++; }
      } else {
        cur.assignments[k] = incA[k];
        merged++;
      }
    });
    if (inc.staff && inc.staff.length > 0) cur.staff = inc.staff;

    hSheet.getRange('A1').setValue(JSON.stringify(cur));
    return { success: true, merged: merged, deleted: deleted, total: Object.keys(cur.assignments).length };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// positions の全キーが「空配列」なら配置クリア（=削除マーカー）とみなす。
// 枠数(1..5/1..6等)に依存しない汎用判定。positions 欠落・空オブジェクト・不正値は
// 安全側で false（削除しない）。
function isHaichiClearMarker_(a) {
  if (!a || !a.positions || typeof a.positions !== 'object') return false;
  var p = a.positions;
  var keys = Object.keys(p);
  if (keys.length === 0) return false; // 空オブジェクトは不正扱い＝削除しない
  for (var i = 0; i < keys.length; i++) {
    var arr = p[keys[i]];
    if (arr && arr.length > 0) return false;
  }
  return true;
}

// ===== Web API: POST =====
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SS_ID);

    switch (data.action) {
      case 'appregistry_bulk_upsert':
        return jsonResp(appregistryBulkUpsert_(data));
      case 'absence':
        return jsonResp(registerAbsence(ss, data));
      case 'update_absence':
        return jsonResp(updateAbsence(ss, data));
      case 'cancel_absence':
        return jsonResp(cancelAbsence(ss, data));
      case 'long_term_absence':
        return jsonResp(registerLongTermAbsence(ss, data));
      case 'resume':
        return jsonResp(registerResume(ss, data));
      case 'message':
        return jsonResp(addMessage(ss, data));
      case 'update_message_status':
        return jsonResp(updateMessageStatus(ss, data));
      case 'terminate':
        return jsonResp(registerTermination(ss, data));
      case 'cancel_terminate':
        return jsonResp(cancelTermination(ss, data));
      case 'update_terminate_task':
        return jsonResp(updateTerminateTask(ss, data));
      case 'update_terminate_info':
        return jsonResp(updateTerminationInfo(ss, data));
      case 'add_board_task':
        return jsonResp(addBoardTask(ss, data));
      case 'complete_board_task':
        return jsonResp(completeBoardTask(ss, data));
      case 'delete_board_task':
        return jsonResp(deleteBoardTask(ss, data));
      case 'update_board_task_staff':
        return jsonResp(updateBoardTaskStaff(ss, data));
      case 'add_dengon_message':
        return jsonResp(addDengonMessage(ss, data));
      case 'create_drafts':
        return jsonResp(createJissekiDrafts(data.yearMonth));
      // 2026-05-10: ケアマネ欠席連絡 即時方式 Phase 1
      case 'updateCmContact':
        return jsonResp(updateCmContact(ss, data));
      // 2026-05-13: 既存欠席のケアマネ連絡状況を手動更新（電話連絡済マーク用）
      case 'updateAbsenceCmNotified':
        return jsonResp(updateAbsenceCmNotified(ss, data));
      // 2026-07-08 Phase2: 過去日連絡「記録のみ」（updateAbsenceCmNotified を呼ぶだけ＋連絡ログ・メール送信なし）
      case 'recordPastContact':
        return jsonResp(recordPastContact(ss, data));
      // 2026-07-04 指示書③: 本日の欠席連絡ボックス まとめて送信
      case 'send_box_cm_mails':
        return jsonResp(sendBoxCmMails(ss, data));
      case 'save_haichi':
        return jsonResp(saveHaichiMerged(ss, data));
      case 'intake_create':
        return jsonResp(createIntake(ss, data));
      case 'intake_update':
        return jsonResp(updateIntake(ss, data));
      case 'intake_delete':
        return jsonResp(deleteIntake(ss, data));
      case 'intake_request_approval':
        return jsonResp(requestOwnerApproval(ss, data));
      case 'intake_sync_to_userlist':
        return jsonResp(syncIntakeToUserList(ss, data));
      // 2026-05-14: 体験者として利用者台帳に仮登録（出勤＆送迎表に表示）
      case 'intake_add_as_trial':
        return jsonResp(addIntakeAsTrial(ss, data));
      case 'add_contact_log':
        return jsonResp(addContactLog(ss, data));
      case 'update_expected_return':
        return jsonResp(updateExpectedReturn(ss, data));
      case 'add_long_leave_taskboard':
        return jsonResp(addLongLeaveTaskboard(ss, data));
      case 'dedupe_long_term_absence':
        return jsonResp(dedupeLongTermAbsence(ss));
      case 'run_daily_long_leave_reminder':
        return jsonResp(dailyLongLeaveReminder());
      case 'add_user_event':
        return jsonResp(addUserEvent(ss, data));
      case 'complete_event_item':
        return jsonResp(completeEventItem(ss, data));
      case 'update_user_caremanager':
        return jsonResp(updateUserCaremanager(ss, data));
      case 'addContact':
        return jsonResp(addContact(ss, data));
      case 'hideContact':
        return jsonResp(hideContact(ss, data));
      case 'hideOffice':
        return jsonResp(hideOffice(ss, data));
      case 'update_event_item':
        return jsonResp(updateEventItem(ss, data));
      case 'delete_user_event':
        return jsonResp(deleteUserEvent(ss, data));
      case 'edit_event_completion':
        return jsonResp(editEventCompletion(ss, data));
      case 'reopen_event_item':
        return jsonResp(reopenEventItem(ss, data));
      // メール対応カウンター（2026/5/3追加）
      case 'updateMailTaskCounts':
        return jsonResp(handleUpdateMailTaskCounts(data));
      case 'manageMailDomain':
        return jsonResp(handleManageMailDomain(data));
      // 旧シート deprecate（2026/5/3追加）
      case 'deprecateOldCmContacts':
        return jsonResp(deprecateOldCmContactsSheet(ss));
      // 紹介管理（2026/5/3追加）
      case 'ensure_shokai_sheets':
        return jsonResp(ensureShokaiSheets_(ss));
      // 実績送付スキャン結果（2026/5/30追加・信号機ダッシュボード）
      case 'scan_jisseki_set':
        return jsonResp(setScanJissekiCoverage_(data.payload));
      case 'scan_jisseki_mark_sent':
        return jsonResp(markScanSent_(data.ym, data.name, data.sent));
      case 'admin_ensure_intake_columns':
        return jsonResp(ensureIntakeColumns_20260531(ss));
      case 'admin_migrate_intake_phase':
        return jsonResp(migrateIntakeStatusToPhase_20260531(ss, data || {}));
      case 'intake_advance_phase':
        return jsonResp(advanceIntakePhase(ss, data));
      case 'intake_drop':
        return jsonResp(dropIntake(ss, data));
      case 'admin_setup_auto_archive':
        return jsonResp(setupAutoArchiveTrigger_20260531());
      // 月次書類そろえ チェック結果の受け取り（2026-06-10追加・ローカルチェッカーからPOST）
      case 'monthlyDocsReport':
        return jsonResp(saveMonthlyDocsReport_(ss, data));
      // 2026-07-02: ④業務報告メール（スタッフの業務報告を社長へ即時送信）
      case 'send_work_report':
        return jsonResp(sendWorkReport_(data));
      default:
        return jsonResp({ error: '不明なアクション', success: false });
    }
  } catch (err) {
    return jsonResp({ error: err.message, success: false });
  }
}

// ===== 出席予定を取得（通所パターン＋出欠変更）=====
function getAttendance(ss, dateStr, dow) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { am: [], pm: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { am: [], pm: [] };

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var daysCol = findCol(h, ['利用曜日']);
  var ampmCol = findCol(h, ['午前/午後', '午前午後']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var careCol = findColP(h, '介護度');
  if (careCol < 0) careCol = findColP(h, '要介護');
  var kanaCol = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var cmNameCol = findColContains(h, 'ケアマネ', '担当');
  var cmOfficeCol = findColContains(h, 'ケアマネ', '事業所');
  if (cmOfficeCol < 0) cmOfficeCol = findColP(h, '居宅');
  var startCol = findCol(h, ['利用開始日', '利用開始']);

  if (nameCol < 0) return { error: '名前列が見つかりません', am: [], pm: [] };

  // この日の欠席マップ
  var absMap = getAbsenceMap(ss, dateStr);
  // 中止者→中止日マップ（過去日は表示・中止日後は非表示）
  var cancelMap = _getActiveCancelDateMap(ss);
  // 利用者台帳の利用開始日が空欄のとき用フォールバック: 見学体験新規の本格利用開始日マップ
  var intakeStartMap = _buildIntakeStartDateMap(ss);

  var am = [], pm = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;

    // 利用開始日チェック: 表示対象日が利用開始日より前なら除外（契約前・体験予約だけの人を除外）
    // 1) 利用者台帳の利用開始日列を見る
    // 2) 空欄なら見学体験新規の本格利用開始日にフォールバック
    var startStr = '';
    if (startCol >= 0) {
      var startRaw = data[i][startCol];
      if (startRaw instanceof Date) {
        startStr = Utilities.formatDate(startRaw, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        var sStr = String(startRaw || '').trim();
        var sm = sStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if (sm) startStr = sm[1] + '-' + String(sm[2]).padStart(2,'0') + '-' + String(sm[3]).padStart(2,'0');
      }
    }
    if (!startStr && intakeStartMap[name]) startStr = intakeStartMap[name];
    if (startStr && dateStr < startStr) continue;

    // ステータスチェック
    // 「中止」: 中止日以前（過去）は表示、中止日より後は除外
    // 「終了」「卒業」: 中止履歴に該当があれば中止と同様、無ければ従来通り全除外
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) {
        var cd = cancelMap[name];
        if (!cd) continue;             // 中止履歴が無い→従来通り除外
        if (dateStr > cd) continue;    // 中止日より後→除外
        // 中止日以前→表示する（過去記録として残す）
      }
    }

    var days = daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '';
    var ampmVal = ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : '';
    var kana = kanaCol >= 0 ? String(data[i][kanaCol] || '').trim() : '';
    var care = careCol >= 0 ? String(data[i][careCol] || '').trim() : '';
    var cmName = cmNameCol >= 0 ? String(data[i][cmNameCol] || '').trim() : '';
    var cmOffice = cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '';

    // この曜日に来るか判定
    if (!days || days.indexOf(dow) < 0) continue;

    // 午前/午後判定（曜日を渡して複合パターン対応）
    var parsed = parseAmPm(ampmVal, dow);

    // 欠席チェック
    var absAm = absMap[name + '_午前'] || absMap[name + '_終日'];
    var absPm = absMap[name + '_午後'] || absMap[name + '_終日'];

    if (parsed.am) {
      am.push({
        name: name, kana: kana, care: care, cmName: cmName, cmOffice: cmOffice,
        status: absAm ? '欠席' : '出席',
        reason: absAm ? absAm.reason : ''
      });
    }
    if (parsed.pm) {
      pm.push({
        name: name, kana: kana, care: care, cmName: cmName, cmOffice: cmOffice,
        status: absPm ? '欠席' : '出席',
        reason: absPm ? absPm.reason : ''
      });
    }
  }

  return { am: am, pm: pm };
}

// 午前/午後の判定（dow: 当日の曜日「月」「火」等。複合パターン対応）
function parseAmPm(val, dow) {
  val = val.replace(/\s/g, '');
  if (!val) return { am: true, pm: true };

  // 複合パターン判定:「月午前、木午後」「月午前,木午後」のようにカンマ区切り＋曜日が含まれる
  if (val.indexOf('、') >= 0 || val.indexOf(',') >= 0) {
    var parts = val.split(/[、,]/);
    var hasDay = parts.some(function(p) { return /[月火水木金土日]/.test(p.trim()); });
    if (hasDay && dow) {
      var am = false, pm = false;
      parts.forEach(function(p) {
        p = p.trim();
        if (p.indexOf(dow) >= 0) {
          if (p.indexOf('午後') >= 0) pm = true;
          else if (p.indexOf('午前') >= 0) am = true;
          else { am = true; pm = true; }
        }
      });
      if (am || pm) return { am: am, pm: pm };
      // この曜日に該当するパートが無い場合はデフォルト
      return { am: true, pm: true };
    }
  }

  if (val === '両方' || val === '午前午後') return { am: true, pm: true };
  if (val.indexOf('午前') >= 0 && val.indexOf('午後') >= 0) return { am: true, pm: true };
  if ((val.indexOf('1') >= 0 && val.indexOf('2') >= 0) && val.length <= 4) return { am: true, pm: true };
  if (val.indexOf('午前') >= 0 || val === '1') return { am: true, pm: false };
  if (val.indexOf('午後') >= 0 || val === '2') return { am: false, pm: true };
  return { am: true, pm: true }; // デフォルト: 両方
}

// 全利用者の通所パターンを取得（期間指定の欠席登録用）
// includeCancelled=true で中止者も含める（過去月の月次利用状況モーダル用）
function getUserPatterns(ss, includeCancelled) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return {};

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var kanaCol2 = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var daysCol = findCol(h, ['利用曜日']);
  var ampmCol = findCol(h, ['午前/午後', '午前午後']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var careCol2 = findColP(h, '介護度');
  if (careCol2 < 0) careCol2 = findColP(h, '要介護');

  var patterns = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;
    var isCancelled = false;
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) {
        if (!includeCancelled) continue;
        isCancelled = true;
      }
    }
    var kana = kanaCol2 >= 0 ? String(data[i][kanaCol2] || '').trim() : '';
    var care = careCol2 >= 0 ? String(data[i][careCol2] || '').trim() : '';
    var days = daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '';
    var ampm = ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : '';
    // 複合パターン（「月午前、木午後」等）はそのまま保持
    patterns[name] = { days: days, unit: ampm || '午前午後', kana: kana, care: care, cancelled: isCancelled };
  }
  return patterns;
}

// 利用者一覧（ケアマネ変更フォーム用・氏名/カナ/現ケアマネ）（2026/5/2追加）
function getUserList(ss) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var kanaCol = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var cmOfficeCol = findCol(h, ['ケアマネ事業所名', 'ケアマネ事業所', '事業所名', '居宅']);
  var cmStaffCol = findCol(h, ['ケアマネ担当者名', 'ケアマネ担当', 'ケアマネ担当者', 'ケアマネ氏名', 'ケアマネ', '担当ケアマネ']);
  var daysCol = findCol(h, ['利用曜日']);
  var ampmCol = findCol(h, ['午前/午後', '午前午後']);
  // 2026-06-19 休み連絡メールリニューアル: ケアマネメアドをプレビュー/分岐用に同梱（送信先はGASが台帳N列を再取得）
  var cmEmailCol = findCol(h, ['ケアマネ個人メアド', 'ケアマネメールアドレス', 'ケアマネメアド', 'メールアドレス']);

  var list = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    list.push({
      userName: name,
      userNameKana: kanaCol >= 0 ? String(data[i][kanaCol] || '').trim() : '',
      currentCmOffice: cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '',
      currentCmStaff: cmStaffCol >= 0 ? String(data[i][cmStaffCol] || '').trim() : '',
      days: daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '',
      ampm: ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : '',
      cmEmail: cmEmailCol >= 0 ? String(data[i][cmEmailCol] || '').trim() : '',
      row: i + 1  // updateUserCaremanager で使う
    });
  }
  return list;
}

// 利用者台帳のケアマネ列を更新（2026/5/2追加・2026-05-29 applyMonth対応）
function updateUserCaremanager(ss, data) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { success: false, error: '利用者台帳シートがありません' };

  var userName = String(data.userName || '').trim();
  var newOffice = String(data.cmOffice || '').trim();
  var newStaff = String(data.cmStaff || '').trim();
  if (!userName) return { success: false, error: 'userName が必須' };
  if (!newOffice) return { success: false, error: 'cmOffice が必須' };
  if (!newStaff) return { success: false, error: 'cmStaff が必須' };

  // 2026-05-29 予約反映機能: applyMonth ('immediate'/空 or 'YYYY-MM')
  var applyMonth = String(data.applyMonth || '').trim();
  var isReserve = false;
  if (applyMonth && applyMonth !== 'immediate') {
    if (!/^\d{4}-\d{2}$/.test(applyMonth)) {
      return { success: false, error: 'applyMonth は YYYY-MM 形式で指定してください' };
    }
    var today_ym = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
    if (applyMonth > today_ym) {
      isReserve = true;
    }
    // 過去月や当月指定は即時扱い
  }

  var allData = sheet.getDataRange().getValues();
  var h = allData[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var cmOfficeCol = findCol(h, ['ケアマネ事業所名', 'ケアマネ事業所', '事業所名', '居宅']);
  var cmStaffCol = findCol(h, ['ケアマネ担当者名', 'ケアマネ担当', 'ケアマネ担当者', 'ケアマネ氏名', 'ケアマネ', '担当ケアマネ']);
  if (cmOfficeCol < 0 || cmStaffCol < 0) {
    return { success: false, error: '利用者台帳にケアマネ列が見つかりません' };
  }
  // 2026-05-29 予約列
  var resOfficeCol = findCol(h, ['予約ケアマネ事業所']);
  var resStaffCol = findCol(h, ['予約ケアマネ担当者']);
  var resCmMonthCol = findCol(h, ['ケアマネ適用月']);
  if (isReserve && (resOfficeCol < 0 || resStaffCol < 0 || resCmMonthCol < 0)) {
    return { success: false, error: '予約ケアマネ列が利用者台帳に見つかりません（maintenance_add_yoyaku_columns を実行してください）' };
  }

  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][nameCol]).trim() === userName) {
      var beforeOffice = String(allData[i][cmOfficeCol] || '').trim();
      var beforeStaff = String(allData[i][cmStaffCol] || '').trim();
      if (isReserve) {
        sheet.getRange(i + 1, resOfficeCol + 1).setValue(newOffice);
        sheet.getRange(i + 1, resStaffCol + 1).setValue(newStaff);
        sheet.getRange(i + 1, resCmMonthCol + 1).setValue(applyMonth);
        // 本体「ケアマネ事業所名」「ケアマネ担当者」は触らない
      } else {
        sheet.getRange(i + 1, cmOfficeCol + 1).setValue(newOffice);
        sheet.getRange(i + 1, cmStaffCol + 1).setValue(newStaff);
      }
      return {
        success: true,
        message: isReserve
          ? '予約しました（' + applyMonth + ' から適用）'
          : '利用者台帳を更新しました: ' + userName,
        mode: isReserve ? 'reserve' : 'immediate',
        applyMonth: isReserve ? applyMonth : '',
        before: { cmOffice: beforeOffice, cmStaff: beforeStaff },
        after: { cmOffice: newOffice, cmStaff: newStaff }
      };
    }
  }
  return { success: false, error: '利用者が見つかりません: ' + userName };
}

// 2026-05-25: 利用者台帳にケアマネ連絡手段マスター列を追加
// 不足列のみ末尾に追加（既存列順は崩さない・dryRun対応）
function addCmMethodColumns(ss, dryRun) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { success: false, error: '利用者台帳シートがありません' };
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v).trim(); });
  var wanted = ['ケアマネ連絡手段', 'ケアマネ電話番号', '連絡時注意事項'];
  var missing = [];
  wanted.forEach(function (name) {
    if (headers.indexOf(name) < 0) missing.push(name);
  });
  if (missing.length === 0) {
    return { success: true, added: [], message: '追加列なし（既に全て存在）' };
  }
  if (dryRun) {
    return { success: true, dryRun: true, wouldAdd: missing, message: '?run=1 で実行' };
  }
  for (var i = 0; i < missing.length; i++) {
    var newColIdx = sheet.getLastColumn() + 1;
    sheet.insertColumnAfter(sheet.getLastColumn());
    sheet.getRange(1, newColIdx).setValue(missing[i]);
  }
  return { success: true, added: missing, message: '列追加完了' };
}

// 2026-05-25: 全アクティブ利用者のケアマネ連絡手段マスター状況を返す
// 個人情報は最小限（メアド・電話番号そのものは返さず○×だけ）
function getCmMethodAudit(ss) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var kanaCol = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var cmOfficeCol = findCol(h, ['ケアマネ事業所名', 'ケアマネ事業所']);
  var cmStaffCol = findCol(h, ['ケアマネ担当者名', 'ケアマネ担当', '担当ケアマネ']);
  var cmEmailCol = findCol(h, ['ケアマネ個人メアド', 'ケアマネメールアドレス', 'ケアマネメアド', 'メールアドレス']);
  var cmMethodCol = findCol(h, ['ケアマネ連絡手段', '連絡手段']);
  var cmPhoneCol = findCol(h, ['ケアマネ電話番号', 'ケアマネTEL']);
  var careCol = findColP(h, '要介護度');
  if (careCol < 0) careCol = findColP(h, '介護度');
  if (careCol < 0) careCol = findColP(h, '要介護');
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    var method = cmMethodCol >= 0 ? String(data[i][cmMethodCol] || '').trim() : '';
    var hasEmail = cmEmailCol >= 0 && String(data[i][cmEmailCol] || '').trim() !== '';
    var hasPhone = cmPhoneCol >= 0 && String(data[i][cmPhoneCol] || '').trim() !== '';
    // 2026-07-04 指示書③修正③: 区分（要支援/要介護）をカード表示用に付与。取れなければ空。
    var careRaw = careCol >= 0 ? String(data[i][careCol] || '').trim() : '';
    var careGroup = careRaw.indexOf('要支援') >= 0 ? '要支援'
      : (careRaw.indexOf('要介護') >= 0 ? '要介護' : '');
    list.push({
      userName: name,
      kana: kanaCol >= 0 ? String(data[i][kanaCol] || '').trim() : '',
      cmOffice: cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '',
      cmStaff: cmStaffCol >= 0 ? String(data[i][cmStaffCol] || '').trim() : '',
      method: method,
      hasEmail: hasEmail,
      hasPhone: hasPhone,
      care: careGroup,
      careRaw: careRaw,
      row: i + 1
    });
  }
  return list;
}

// 2026-05-25: 1人分のケアマネ連絡手段・メアド・電話番号を更新
// data: { userName, method, email, phone }
// null/undefined は変更しない（空文字''で空欄化）
function updateCmMethod(ss, data) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { success: false, error: '利用者台帳シートがありません' };
  var userName = String(data.userName || '').trim();
  if (!userName) return { success: false, error: 'userName が必須' };

  var allData = sheet.getDataRange().getValues();
  var h = allData[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var cmEmailCol = findCol(h, ['ケアマネ個人メアド', 'ケアマネメールアドレス', 'ケアマネメアド', 'メールアドレス']);
  var cmMethodCol = findCol(h, ['ケアマネ連絡手段', '連絡手段']);
  var cmPhoneCol = findCol(h, ['ケアマネ電話番号', 'ケアマネTEL']);
  if (cmMethodCol < 0) {
    return { success: false, error: '利用者台帳に「ケアマネ連絡手段」列がありません。先に add_cm_method_columns を実行してください' };
  }

  var normTarget = _normalizeNameForMatch_(userName);
  for (var i = 1; i < allData.length; i++) {
    if (_normalizeNameForMatch_(allData[i][nameCol]) !== normTarget) continue;
    var before = {
      method: String(allData[i][cmMethodCol] || '').trim(),
      email: cmEmailCol >= 0 ? String(allData[i][cmEmailCol] || '').trim() : '',
      phone: cmPhoneCol >= 0 ? String(allData[i][cmPhoneCol] || '').trim() : ''
    };
    if (data.method != null) sheet.getRange(i + 1, cmMethodCol + 1).setValue(String(data.method).trim());
    if (data.email != null && cmEmailCol >= 0) sheet.getRange(i + 1, cmEmailCol + 1).setValue(String(data.email).trim());
    if (data.phone != null && cmPhoneCol >= 0) sheet.getRange(i + 1, cmPhoneCol + 1).setValue(String(data.phone).trim());
    return {
      success: true,
      userName: userName,
      before: before,
      after: {
        method: data.method != null ? String(data.method).trim() : before.method,
        email: data.email != null ? String(data.email).trim() : before.email,
        phone: data.phone != null ? String(data.phone).trim() : before.phone
      }
    };
  }
  return { success: false, error: '利用者が見つかりません: ' + userName };
}

// ===== 指定日の欠席一覧を取得（出勤＆送迎表からの取得用）=====
function getAbsencesForDate(ss, dateStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    if (!name) continue;
    var unit = String(data[i][2] || '').trim() || '終日';
    var type = String(data[i][3] || '').trim();
    var reason = String(data[i][4] || '').trim();

    if (type === '欠席' && d === dateStr) {
      list.push({ name: name, type: 'absent', unit: unit, reason: reason });
    }
    if (type === '長期休み') {
      var endDate = data[i][7] ? fmtDate(data[i][7]) : '';
      if (d <= dateStr && (!endDate || endDate > dateStr)) {
        list.push({ name: name, type: 'longabsent', unit: '終日', reason: '長期休み（' + reason + '）' });
      }
    }
  }
  return list;
}

// 指定日の欠席マップ（通常欠席＋長期休み中）
function getAbsenceMap(ss, dateStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return {};

  var data = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    var unit = String(data[i][2] || '').trim();
    var type = String(data[i][3] || '').trim();
    var reason = String(data[i][4] || '').trim();

    // 通常欠席
    if (type === '欠席' && d === dateStr) {
      if (unit === '終日' || !unit) {
        map[name + '_終日'] = { reason: reason };
      } else {
        map[name + '_' + unit] = { reason: reason };
      }
    }

    // 長期休み（開始日 <= 対象日、かつ終了日が空 or 終了日 > 対象日）
    if (type === '長期休み') {
      var endDate = data[i][7] ? fmtDate(data[i][7]) : '';
      if (d <= dateStr && (!endDate || endDate > dateStr)) {
        map[name + '_終日'] = { reason: '長期休み（' + reason + '）' };
      }
    }
  }
  return map;
}

// 欠席予定を取得
// monthStr (yyyy-MM) を指定すればその月の全欠席、未指定なら今日以降30日分
// 長期休み中の人は常に含む
function getUpcomingAbsences(ss, todayStr, monthStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var startStr, endStr;
  if (monthStr) {
    // 月指定：その月の1日〜月末
    var mParts = monthStr.split('-');
    var y = parseInt(mParts[0]);
    var m = parseInt(mParts[1]);
    startStr = Utilities.formatDate(new Date(y, m - 1, 1), 'Asia/Tokyo', 'yyyy-MM-dd');
    endStr = Utilities.formatDate(new Date(y, m, 0), 'Asia/Tokyo', 'yyyy-MM-dd');
  } else {
    // 未指定：今日〜30日後
    startStr = todayStr;
    var parts = todayStr.split('-');
    var endDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 30);
    endStr = Utilities.formatDate(endDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  var data = sheet.getDataRange().getValues();
  // 中止済み利用者の中止日より後の欠席は非表示（2026-05-20追加）
  var cancelMap = _getActiveCancelDateMap(ss);
  // 2026-05-23: ケアマネ連絡履歴を辞書化（N+1回避）
  var cmLogIndex = _buildCmLogIndex_(ss);
  var list = [];
  var resumedTodayList = [];  // 再開日が今日の長期休み利用者（「利用再開」バッジ用・2026-06-01）
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var type = String(data[i][3] || '').trim();
    var rowName = String(data[i][1] || '').trim();

    // 中止日より後の欠席はスキップ（利用中止後の幽霊レコード対策）
    var rowCancelDate = cancelMap[rowName];
    if (rowCancelDate && d > rowCancelDate) continue;

    // 再開日（8列目）が今日の長期休み利用者を収集（「利用再開」バッジ用・2026-06-01）
    if (type === '長期休み' && data[i][7] && fmtDate(data[i][7]) === todayStr && rowName) {
      if (!resumedTodayList.some(function (x) { return x.name === rowName; })) {
        resumedTodayList.push({ name: rowName, resumeDate: todayStr });
      }
    }

    // 通常欠席
    if (type === '欠席' && d >= startStr && d <= endStr) {
      // 受付日: I列(data[i][8])を優先、無ければG列の登録日時(data[i][6])から日付部分を取得
      var contactDate = '';
      if (data[i][8]) {
        contactDate = fmtDate(data[i][8]);
      } else if (data[i][6]) {
        // G列はDate型 or 'yyyy-MM-dd HH:mm'形式の文字列
        if (data[i][6] instanceof Date) {
          contactDate = Utilities.formatDate(data[i][6], 'Asia/Tokyo', 'yyyy-MM-dd');
        } else {
          contactDate = String(data[i][6]).substring(0, 10);
        }
      }
      var lookupKey = _normalizeNameForMatch_(rowName) + '|' + d;
      var lastLog = cmLogIndex[lookupKey] || { operator: '', method: '' };
      list.push({
        date: d,
        name: String(data[i][1] || '').trim(),
        unit: String(data[i][2] || '').trim(),
        reason: String(data[i][4] || '').trim(),
        reporter: String(data[i][5] || '').trim(),
        contactDate: contactDate,
        cmNotified: String(data[i][7] || '').trim(),
        // 2026-05-23: カード表示の「✓ 📞 連絡済（下浦）」用
        lastOperator: lastLog.operator,
        lastMethod: lastLog.method,
        isLongTerm: false
      });
    }
  }

  // 長期休み中の利用者は getLongLeaveList で取得し、HTML側が期待する形式にマッピング
  var richLongLeaves = getLongLeaveList(ss);
  var longTermList = richLongLeaves.map(function (lt) {
    return {
      date: lt.startDate,
      name: lt.name,
      unit: '終日',
      reason: '長期休み（' + lt.reason + '）',
      reporter: lt.reporter,
      isLongTerm: true,
      resumeDate: (lt.expectedReturn && lt.expectedReturn !== '未定') ? lt.expectedReturn : '',
      // 連絡管理用拡張フィールド
      contactLog: lt.contactLog,
      lastContact: lt.lastContact,
      elapsedDays: lt.elapsedDays,
      daysUntilReturn: lt.daysUntilReturn,
      daysSinceLastContact: lt.daysSinceLastContact,
      nextContactDue: lt.nextContactDue,
      lastResultType: lt.lastResultType,
      daysUntilNextContact: lt.daysUntilNextContact,
      contactOverdue: lt.contactOverdue,
      contactWarning: lt.contactWarning,
      expectedReturn: lt.expectedReturn,
      // 2026-05-23: ケアマネ連絡履歴
      cmNotified: lt.cmNotified,
      lastOperator: lt.lastOperator,
      lastMethod: lt.lastMethod,
      contactNote: lt.contactNote || '',
      contactedThisMonth: !!lt.contactedThisMonth
    };
  });

  list.sort(function (a, b) { return a.date.localeCompare(b.date) || a.name.localeCompare(b.name); });
  return { absences: list, longTerm: longTermList, resumedToday: resumedTodayList };
}

// 伝達事項を取得
function getMessages(ss, dateStr) {
  var sheet = ss.getSheetByName('伝達事項');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    if (d !== dateStr) continue;

    var rawStatus = String(data[i][4] || '').trim();
    // 旧データ互換: '済' → '完了', 空 → '未対応'
    var status = '未対応';
    if (rawStatus === '済' || rawStatus === '完了') status = '完了';
    else if (rawStatus === '対応中') status = '対応中';
    else if (rawStatus) status = rawStatus;

    list.push({
      row: i + 1,
      content: String(data[i][1] || '').trim(),
      author: String(data[i][2] || '').trim(),
      timestamp: String(data[i][3] || ''),
      status: status
    });
  }
  return list;
}

// ===== 送付用居宅一覧 共通ヘルパ（2026/5/3追加） =====
// 新シート「送付用居宅一覧」優先、旧シート「ケアマネ連絡先」にフォールバック
function getCmContactsSheet(ss) {
  return ss.getSheetByName('送付用居宅一覧') || ss.getSheetByName('ケアマネ連絡先');
}

// ヘッダ名検出方式で列位置を返す（新旧シート両対応）
function _readCmCols(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v){ return String(v||'').trim(); });
  return {
    headers: headers,
    office: findCol(headers, ['事業所名', 'ケアマネ事業所', '事業所', '居宅事業所', '居宅事業所名']),
    name: findCol(headers, ['ケアマネ名', 'ケアマネ担当者名', 'ケアマネ担当', '担当者名', '担当者']),
    method: findCol(headers, ['送付方法', '送付方式']),
    email: findCol(headers, ['メール', 'メールアドレス', 'Email', 'E-mail']),
    fax: findCol(headers, ['FAX', 'FAX番号', 'fax番号']),
    dataLink: findCol(headers, ['データ連携対応', 'ケアプランデータ連携', '連携対応']),
    hidden: findCol(headers, ['非表示'])
  };
}

// 旧シート互換：「非表示」列の自動マイグレーション
function _ensureHiddenCol(sheet) {
  var cols = _readCmCols(sheet);
  if (cols.hidden < 0) {
    var lastCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, lastCol).setValue('非表示');
    sheet.setColumnWidth(lastCol, 80);
  }
}

// ケアマネ連絡先を取得（2026-04-25: fax, method 拡張 / 2026-05-03: 新シート対応・dataLink追加）
function getCmContacts(ss) {
  var sheet = getCmContactsSheet(ss);
  if (!sheet || sheet.getLastRow() < 2) return [];
  _ensureHiddenCol(sheet);

  var cols = _readCmCols(sheet);
  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var office = cols.office >= 0 ? String(row[cols.office]||'').trim() : '';
    var name = cols.name >= 0 ? String(row[cols.name]||'').trim() : '';
    if (!office && !name) continue;
    list.push({
      office: office,
      name: name,
      email: cols.email >= 0 ? String(row[cols.email]||'').trim() : '',
      fax: cols.fax >= 0 ? String(row[cols.fax]||'').trim() : '',
      method: cols.method >= 0 ? String(row[cols.method]||'').trim() : '',
      dataLink: cols.dataLink >= 0 ? String(row[cols.dataLink]||'').trim() : '',
      hidden: cols.hidden >= 0 ? String(row[cols.hidden]||'').trim().toUpperCase() === 'TRUE' : false
    });
  }
  return list;
}

// 行構築用ヘルパ：列位置を見て正しい列にデータを入れる
function _buildContactRow(cols, lastCol, fields) {
  var row = new Array(lastCol);
  for (var i = 0; i < lastCol; i++) row[i] = '';
  if (cols.office >= 0 && fields.office !== undefined) row[cols.office] = fields.office;
  if (cols.name >= 0 && fields.name !== undefined) row[cols.name] = fields.name;
  if (cols.email >= 0 && fields.email !== undefined) row[cols.email] = fields.email;
  if (cols.fax >= 0 && fields.fax !== undefined) row[cols.fax] = fields.fax;
  if (cols.method >= 0 && fields.method !== undefined) row[cols.method] = fields.method;
  if (cols.dataLink >= 0 && fields.dataLink !== undefined) row[cols.dataLink] = fields.dataLink;
  if (cols.hidden >= 0 && fields.hidden !== undefined) row[cols.hidden] = fields.hidden;
  return row;
}

// ケアマネ連絡先に新規行追加（2026/5/2追加 / 2026/5/3 ヘッダ名検出方式）
function addContact(ss, data) {
  var sheet = getCmContactsSheet(ss);
  if (!sheet) return { success: false, error: '連絡先シートがありません（setupSheets()を実行してください）' };
  _ensureHiddenCol(sheet);

  var office = String(data.office || '').trim();
  var name = String(data.staff || data.name || '').trim();
  if (!office) return { success: false, error: 'office（事業所名）が必須' };
  if (!name) return { success: false, error: 'staff（担当者名）が必須' };

  var cols = _readCmCols(sheet);
  var lastCol = sheet.getLastColumn();

  // 重複チェック（同じ事業所×担当者は追加しない・非表示も含めて）
  if (sheet.getLastRow() >= 2) {
    var allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    for (var i = 0; i < allData.length; i++) {
      var existOffice = cols.office >= 0 ? String(allData[i][cols.office]||'').trim() : '';
      var existName = cols.name >= 0 ? String(allData[i][cols.name]||'').trim() : '';
      if (existOffice === office && existName === name) {
        // 既存行が非表示なら復活させる
        var existHidden = cols.hidden >= 0 ? String(allData[i][cols.hidden] || '').trim().toUpperCase() === 'TRUE' : false;
        if (existHidden) {
          sheet.getRange(i + 2, cols.hidden + 1).setValue('');
          return { success: true, message: '非表示だった担当者を復活させました: ' + office + ' / ' + name };
        }
        return { success: false, error: '既に登録されています: ' + office + ' / ' + name };
      }
    }
  }

  sheet.appendRow(_buildContactRow(cols, lastCol, { office: office, name: name }));
  return { success: true, message: '送付用居宅一覧に追加しました: ' + office + ' / ' + name };
}

// 担当者を非表示にする（2026/5/3追加 / ヘッダ名検出方式）
function hideContact(ss, data) {
  var sheet = getCmContactsSheet(ss);
  if (!sheet) return { success: false, error: '連絡先シートがありません' };
  _ensureHiddenCol(sheet);

  var office = String(data.office || '').trim();
  var name = String(data.staff || data.name || '').trim();
  if (!office || !name) return { success: false, error: 'office と name(staff) が必須' };

  var cols = _readCmCols(sheet);
  var lastCol = sheet.getLastColumn();

  if (sheet.getLastRow() >= 2) {
    var allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    for (var i = 0; i < allData.length; i++) {
      var existOffice = cols.office >= 0 ? String(allData[i][cols.office]||'').trim() : '';
      var existName = cols.name >= 0 ? String(allData[i][cols.name]||'').trim() : '';
      if (existOffice === office && existName === name) {
        sheet.getRange(i + 2, cols.hidden + 1).setValue('TRUE');
        return { success: true, message: '担当者を非表示にしました: ' + office + ' / ' + name };
      }
    }
  }

  // 行がなければ新規追加して非表示登録（利用者台帳由来の担当者対応）
  sheet.appendRow(_buildContactRow(cols, lastCol, { office: office, name: name, hidden: 'TRUE' }));
  return { success: true, message: '担当者を非表示登録しました: ' + office + ' / ' + name };
}

// 事業所全体を非表示にする（2026/5/3追加 / ヘッダ名検出方式）
function hideOffice(ss, data) {
  var sheet = getCmContactsSheet(ss);
  if (!sheet) return { success: false, error: '連絡先シートがありません' };
  _ensureHiddenCol(sheet);

  var office = String(data.office || '').trim();
  if (!office) return { success: false, error: 'office が必須' };

  var cols = _readCmCols(sheet);
  var lastCol = sheet.getLastColumn();
  var hiddenCount = 0;

  if (sheet.getLastRow() >= 2) {
    var allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    for (var i = 0; i < allData.length; i++) {
      var existOffice = cols.office >= 0 ? String(allData[i][cols.office]||'').trim() : '';
      if (existOffice === office) {
        sheet.getRange(i + 2, cols.hidden + 1).setValue('TRUE');
        hiddenCount++;
      }
    }
  }

  if (hiddenCount === 0) {
    sheet.appendRow(_buildContactRow(cols, lastCol, { office: office, hidden: 'TRUE' }));
    hiddenCount = 1;
  }
  return { success: true, message: '事業所を非表示にしました: ' + office + '（' + hiddenCount + '件）' };
}

// ===== 欠席登録 =====
function registerAbsence(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません。setupSheets()を実行してください。', success: false };

  // 同時申請レース対策（2026-05-08二重申請防止）
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return { error: '他のスタッフが申請中です。少し待ってからもう一度お試しください', success: false };
  }

  try {
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

    // 2026-06-19 休み連絡メールリニューアル: 全入口を (date,unit) 集合に正規化して一本化。
    //   新フロント = data.slots [{date,unit}]（飛び石/今週まるごと/終日am+pm を genba が正規化済み）
    //   後方互換   = data.dates[](or data.date) + data.unit（旧フロント/旧ボード）
    var slots;
    if (data.slots && data.slots.length) {
      slots = normalizeSlots_(data.slots);
    } else {
      var legacyUnit = data.unit || '午前';
      if (legacyUnit !== '午前' && legacyUnit !== '午後') {
        return { error: 'unit は 午前 または 午後 のみ（受信値: ' + legacyUnit + '）', success: false };
      }
      var legacyDates = data.dates || [data.date];
      // 期間指定の場合、通所パターンでフィルタ（旧仕様維持）
      if (legacyDates.length > 1) {
        var userDays = getUserDaysForName(ss, data.name);
        if (userDays) {
          legacyDates = legacyDates.filter(function (d) {
            return userDays.indexOf(getDayOfWeek(d)) >= 0;
          });
        }
      }
      slots = normalizeSlots_(legacyDates.map(function (d) { return { date: d, unit: legacyUnit }; }));
    }
    // 各 slot の unit を最終バリデーション（'終日' は genba 側で am/pm 2分解済みの想定）
    for (var si = 0; si < slots.length; si++) {
      if (slots[si].unit !== '午前' && slots[si].unit !== '午後') {
        return { error: 'unit は 午前 または 午後 のみ（受信値: ' + slots[si].unit + '）', success: false };
      }
    }
    if (slots.length === 0) {
      return { error: '登録対象がありません（指定期間内に通所予定日がない可能性）', success: false };
    }

    // 下流（メール本文ラベル/ログ/社長通知）は「ユニーク日付」と「表示用unit」で扱う
    var dates = [];
    var seenDate = {};
    slots.forEach(function (s) { if (!seenDate[s.date]) { seenDate[s.date] = true; dates.push(s.date); } });
    var allUnitsMap = {};
    slots.forEach(function (s) { allUnitsMap[s.unit] = true; });
    var unit = Object.keys(allUnitsMap).length === 1 ? slots[0].unit : '午前・午後';

    // ===== 中止済み利用者の中止日より後の登録を拒否（2026-05-20追加） =====
    var cancelMapForReg = _getActiveCancelDateMap(ss);
    var regCancelDate = cancelMapForReg[data.name];
    if (regCancelDate) {
      var afterCancel = dates.filter(function (d) { return d > regCancelDate; });
      if (afterCancel.length > 0) {
        return {
          success: false,
          error: data.name + '様は ' + regCancelDate + ' に利用中止済みです。中止日より後の欠席は登録できません'
        };
      }
    }

    // ===== 5秒以内同名・同日・同unit ガード（2026-05-16追加・ネット不安定リトライ対策） =====
    // 「両方欠席」(午前+午後の連続2件) は別 unit なので弾かない
    var allDataForGuard = sheet.getDataRange().getValues();
    var FIVE_SEC = 5 * 1000;
    var nowMs = new Date().getTime();
    var slotKeyGuard = {};
    slots.forEach(function (s) { slotKeyGuard[s.date + '|' + s.unit] = true; });
    for (var gi = 1; gi < allDataForGuard.length; gi++) {
      var gName = String(allDataForGuard[gi][1] || '').trim();
      if (gName !== data.name) continue;
      var gDate = fmtDate(allDataForGuard[gi][0]);
      var gUnit = String(allDataForGuard[gi][2] || '').trim();
      if (!slotKeyGuard[gDate + '|' + gUnit]) continue;  // 同(日付,unit)のみ対象・unit違いは通す
      var gTs = allDataForGuard[gi][6];
      if (!gTs) continue;
      var gTsMs = new Date(gTs).getTime();
      if (isNaN(gTsMs)) continue;
      if (nowMs - gTsMs < FIVE_SEC) {
        return {
          success: false,
          duplicate: true,
          error: '直前に同じ申請が登録されています（5秒以内）。少し待ってから再操作してください',
          message: '直前に同じ申請が登録されています（5秒以内）'
        };
      }
    }

    // ===== 重複チェック（最終防衛・2026-05-08二重申請防止）=====（date,unit）集合をunit別に判定
    var existingDates = [];
    var unitGroups = {};
    slots.forEach(function (s) { (unitGroups[s.unit] = unitGroups[s.unit] || []).push(s.date); });
    Object.keys(unitGroups).forEach(function (u) {
      var dup = findDuplicateAbsences(sheet, data.name, unitGroups[u], u);
      if (dup && dup.length) existingDates = existingDates.concat(dup);
    });
    if (existingDates.length > 0) {
      return {
        success: false,
        duplicate: true,
        existingDates: existingDates,
        message: 'すでに申請済みの日があります'
      };
    }

    // 2026-05-23: 利用者台帳から個別のケアマネ情報を取得（送付用居宅一覧依存を撤廃）
    // HTML側から渡される data.cmEmail/cmName/cmOffice は無視し、利用者台帳を単一マスターとする
    var cmInfo = getUserCmContact(ss, data.name);
    var method = cmInfo.method || '';
    var cmNotified = '';
    var contactedAddr = '';
    var emailResult = '';
    var notifySkipped = [];

    // 2026-05-24: メール派ケアマネで「メール送らない」を選んだ時の理由
    var mailSkipReason = String(data.mailSkipReason || '').trim();
    var mailSkipReasonLabel = String(data.mailSkipReasonLabel || '').trim();
    var mailSkipReasonNote = String(data.mailSkipReasonNote || '').trim();

    if (data.contact === 'ケアマネ') {
      cmNotified = 'ケアマネ把握済';
      emailResult = 'マーク';
    } else if (data.contactMethod === 'phone') {
      cmNotified = '電話連絡済';
      contactedAddr = cmInfo.phone || '';
      emailResult = 'マーク';
    } else if (mailSkipReason) {
      // 2026-05-24: メール派ケアマネで「メール送らない」を選択 → 理由別にcmNotifiedを分岐
      // 自動メール送信はスキップ
      if (mailSkipReason === 'phone') cmNotified = '電話連絡済';
      else if (mailSkipReason === 'aware') cmNotified = 'ケアマネ把握済';
      else if (mailSkipReason === 'manual') cmNotified = '手動メール送信済';
      else cmNotified = 'メールなし';
      contactedAddr = '';
      emailResult = 'スキップ:' + (mailSkipReasonLabel || mailSkipReason) +
        (mailSkipReasonNote ? '（' + mailSkipReasonNote + '）' : '');
    } else if (method.indexOf('メール') >= 0) {
      // メール派: プレビューで「送信」が押された(data.doSendEmail===true)ときだけ送る。自動送信しない。
      //   送信先は台帳N列(cmInfo.email)が正。client が渡す cmEmail は表示/分岐用で信用しない。
      //   メアド無効（"なし"/カンマ誤り/@無し）は isValidCmEmail_ で弾き、cmNotified='要電話連絡' に倒す。
      var em = cmInfo.email || '';
      var didSend = false, sendError = null;
      // ABSENCE_AUTO_EMAIL はマスター送信許可（false の間はプレビュー送信も無効。Phase4 デプロイ時に true へ切替）
      var wantSend = (data.doSendEmail === true) && ABSENCE_AUTO_EMAIL && !data.skipEmail && isValidCmEmail_(em);
      if (wantSend) {
        try {
          // 複数日でも dates(ユニーク日付配列)を1回渡す＝1通厳守（unit違いがあっても1通）
          sendAbsenceEmail(
            data.name, dates, unit, data.reason || '', data.supplement || '',
            em, cmInfo.cmName || '', cmInfo.cmOffice || '',
            data.reporter || '',
            data.cmCustomBody || ''
          );
          didSend = true;
          contactedAddr = em;
          emailResult = DRAFT_MODE ? '下書き' : '成功';
        } catch (emailErr) {
          sendError = emailErr.message;
          contactedAddr = em;
          emailResult = '送信失敗';
        }
      } else {
        emailResult = 'マーク';
      }
      cmNotified = classifyCmNotified_(em, method, null, didSend, sendError);
      if (didSend && DRAFT_MODE) cmNotified = '下書き保存';
      // メール派なのに宛先が無効/未登録 → 通知漏れ警告（要電話連絡 / メールなし）
      if (cmNotified === '要電話連絡' || cmNotified === 'メールなし') {
        console.warn('[欠席通知] メール派だが宛先無効/未登録のため手動連絡要: ' + data.name + ' (' + em + ')');
        notifySkipped.push(data.name);
      }
    } else {
      // 電話派 / FAX派 / 連絡手段未設定（明示の phone/ケアマネ/skipReason でもない）→ メール対象外
      cmNotified = 'メールなし';
      emailResult = 'マーク';
    }

    // 履歴シートに追記（欠席登録）
    var logNote = dates.length > 1 ? ('複数日: ' + dates.join(', ')) : '';
    if (mailSkipReason) {
      logNote = (logNote ? logNote + ' / ' : '') + 'メール送らず:' + (mailSkipReasonLabel || mailSkipReason) +
        (mailSkipReasonNote ? '（' + mailSkipReasonNote + '）' : '');
    }
    // M-5: ログシートが無くても登録本体は続行
    try {
      _appendCmLog_(ss, {
        userName: data.name,
        date: dates[0],
        action: '欠席登録',
        method: _mapNotifiedToMethod_(cmNotified),
        contactedAddr: contactedAddr,
        operator: (cmNotified === '送信済' || cmNotified === '下書き保存' || cmNotified.indexOf('エラー') === 0)
          ? 'system' : (data.reporter || ''),
        result: emailResult,
        note: logNote
      });
    } catch (logErr) {
      console.warn('[CMログ] ログ追記失敗（登録は続行）: ' + logErr.message);
    }

    // 社長に通知（連絡手段情報を含めてリッチ化）
    try {
      notifyOwner(data.name, dates, unit, data.reason || '', data.reporter || '', {
        status: cmNotified,
        office: cmInfo.cmOffice || '',
        name: cmInfo.cmName || '',
        method: method,
        phone: cmInfo.phone || '',
        // 2026-05-24: 「メール送らない」理由を社長通知に含める
        skipReasonLabel: mailSkipReasonLabel,
        skipReasonNote: mailSkipReasonNote
      });
    } catch (e) {
      // 通知失敗しても登録は続行
    }

    // スプレッドシートに記録（I列 = 受付日 contactDate）
    // M-2: 失敗した日付を収集して返す（無言の登録漏れを防止）
    var failed = [];
    for (var i = 0; i < slots.length; i++) {
      try {
        sheet.appendRow([
          slots[i].date,
          data.name,
          slots[i].unit,
          '欠席',
          data.reason || '',
          data.reporter || '',
          now,
          cmNotified,
          data.contactDate || ''
        ]);
      } catch (rowErr) {
        failed.push(slots[i].date + '(' + slots[i].unit + ')');
        console.warn('[欠席登録] appendRow失敗: ' + slots[i].date + '(' + slots[i].unit + ') - ' + rowErr.message);
      }
    }

    return {
      success: failed.length === 0,
      count: slots.length - failed.length,
      failed: failed,
      message: failed.length === 0
        ? (slots.length + '件の欠席を登録しました')
        : (failed.length + '件の登録に失敗しました: ' + failed.join(', ')),
      notifySkipped: notifySkipped
    };
  } finally {
    lock.releaseLock();
  }
}

// ===== 欠席編集（2026-05-16新設・cancel→新規を廃止して直接更新化） =====
// data: { name, date, originalUnit, newUnit, reason, contact, contactDate }
// メール再送は行わない（cmNotified列は元値保持）
function updateAbsence(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません', success: false };

  if (data.newUnit !== '午前' && data.newUnit !== '午後') {
    return { error: 'newUnit は 午前 または 午後 のみ', success: false };
  }
  if (!data.name || !data.date || !data.originalUnit) {
    return { error: 'name / date / originalUnit が必須', success: false };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return { error: '他のスタッフが操作中です。少し待ってから再度お試しください', success: false };
  }

  try {
    var allData = sheet.getDataRange().getValues();
    var targetRow = -1;
    // 対象行特定（移行期間中は originalUnit='終日' のC列値もマッチさせる）
    for (var i = 1; i < allData.length; i++) {
      var rowName = String(allData[i][1] || '').trim();
      if (rowName !== data.name) continue;
      var rowDate = fmtDate(allData[i][0]);
      if (rowDate !== data.date) continue;
      var rowUnit = String(allData[i][2] || '').trim();
      if (rowUnit !== data.originalUnit) continue;
      var rowStatus = String(allData[i][3] || '').trim();
      if (rowStatus !== '欠席' && rowStatus !== '長期休み') continue;
      targetRow = i + 1; // 1-based
      break;
    }
    if (targetRow < 0) {
      return { error: '対象行が見つかりません（' + data.name + ' / ' + data.date + ' / ' + data.originalUnit + '）', success: false };
    }

    // C/E/F/I 列のみ更新（A/B/D/G/H は元値保持＝タイムスタンプとcmNotifiedは触らない）
    sheet.getRange(targetRow, 3).setValue(data.newUnit);
    if (typeof data.reason !== 'undefined') {
      sheet.getRange(targetRow, 5).setValue(data.reason || '');
    }
    if (typeof data.contact !== 'undefined') {
      sheet.getRange(targetRow, 6).setValue(data.contact || '');
    }
    if (typeof data.contactDate !== 'undefined') {
      sheet.getRange(targetRow, 9).setValue(data.contactDate || '');
    }

    return { success: true, message: '欠席記録を更新しました', updatedRow: targetRow };
  } finally {
    lock.releaseLock();
  }
}

// 通常欠席の重複検知（2026-05-08追加）
function findDuplicateAbsences(sheet, name, dates, unit) {
  var allData = sheet.getDataRange().getValues();
  var existing = [];
  var datesSet = {};
  dates.forEach(function (d) { datesSet[d] = true; });

  for (var i = 1; i < allData.length; i++) {
    var rowName = String(allData[i][1] || '').trim();
    if (rowName !== name) continue;

    var rowStatus = String(allData[i][3] || '').trim();
    if (rowStatus !== '欠席') continue;

    var rowDateStr = fmtDate(allData[i][0]);
    if (!datesSet[rowDateStr]) continue;

    var rowUnit = String(allData[i][2] || '').trim();
    if (!unitOverlaps(rowUnit, unit)) continue;

    existing.push({
      date: rowDateStr,
      unit: rowUnit,
      reporter: String(allData[i][5] || '').trim(),
      timestamp: fmtTimestamp(allData[i][6])
    });
  }
  return existing;
}

// 終日 vs 午前/午後 の重なり判定
function unitOverlaps(u1, u2) {
  if (u1 === '終日' || u2 === '終日') return true;
  return u1 === u2;
}

// 2026-05-26: 長期休み登録時のCM連絡手段 → cmNotified値マッピング
function _mapCmContactTypeToNotified_(cmContactType) {
  switch (String(cmContactType || '').trim()) {
    case 'phone': return '電話連絡済';
    case 'mail':  return '手動メール送信済';
    case 'sms':   return 'SMS送信済';
    case 'aware': return 'ケアマネ把握済';
    case 'later': return '';
    default:      return '';
  }
}

// ===== 長期休み登録 =====
function registerLongTermAbsence(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません', success: false };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return { error: '他のスタッフが申請中です。少し待ってからもう一度お試しください', success: false };
  }

  try {
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    var startDate = data.startDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

    // 中止済み利用者の中止日より後の長期休み登録を拒否（2026-05-20追加）
    var cancelMapForLong = _getActiveCancelDateMap(ss);
    var longCancelDate = cancelMapForLong[data.name];
    if (longCancelDate && startDate > longCancelDate) {
      return {
        success: false,
        error: data.name + '様は ' + longCancelDate + ' に利用中止済みです。中止日より後の長期休みは登録できません'
      };
    }

    // 2026-05-16: units 配列対応（「終日」廃止）
    var units;
    if (Array.isArray(data.units) && data.units.length > 0) {
      units = data.units;
    } else if (data.unit === '午前' || data.unit === '午後') {
      units = [data.unit];
    } else {
      // 旧データで unit='終日' or 未指定 → 利用パターンを取得して展開
      var pattern = getUserPattern(ss, data.name);
      if (pattern && pattern.hasAm && pattern.hasPm) units = ['午前', '午後'];
      else if (pattern && pattern.hasPm) units = ['午後'];
      else units = ['午前'];
    }
    for (var uIdx = 0; uIdx < units.length; uIdx++) {
      if (units[uIdx] !== '午前' && units[uIdx] !== '午後') {
        return { success: false, error: 'unit は 午前 または 午後 のみ（受信値: ' + units[uIdx] + '）' };
      }
    }

    // ===== 重複チェック（最終防衛・2026-05-08二重申請防止） =====
    var existingLongTerm = findDuplicateLongTermAbsence(sheet, data.name, startDate);
    if (existingLongTerm) {
      return {
        success: false,
        duplicate: true,
        existing: existingLongTerm,
        message: 'すでに長期休みが登録されています'
      };
    }

    // スプレッドシートに記録（units 数だけ行を追加・8列目は再開日＝空）
    // 2026-05-26: cmContactType から N列に入れる値を決定
    var cmNotifiedValue = _mapCmContactTypeToNotified_(data.cmContactType);
    var lastRow;
    for (var uIdx2 = 0; uIdx2 < units.length; uIdx2++) {
      sheet.appendRow([
        startDate,
        data.name,
        units[uIdx2],
        '長期休み',
        data.reason || '',
        data.reporter || '',
        now,
        ''
      ]);
      lastRow = sheet.getLastRow();
      if (cmNotifiedValue) {
        // N列(14) = 長期休みケアマネ連絡（2026-05-23 既存統一仕様）
        sheet.getRange(lastRow, 14).setValue(cmNotifiedValue);
      }
    }

    // 2026-05-26: ケアマネ連絡履歴シートに1行追記（「あとで」以外）
    if (cmNotifiedValue) {
      try {
        _appendCmLog_(ss, {
          userName: data.name,
          date: startDate,
          action: '長期休み登録',
          method: _mapNotifiedToMethod_(cmNotifiedValue),
          contactedAddr: '',
          operator: data.cmOperator || '不明',
          result: '',
          note: data.cmResultNote || ''
        });
      } catch (logErr) {
        Logger.log('長期休み登録: ケアマネ連絡履歴追記失敗 ' + logErr);
      }
    }

    // 社長にLINE通知
    try {
      var msg = '【長期休み開始】\n';
      msg += data.name + '様\n';
      msg += '開始日: ' + fmtDateJP(startDate) + '\n';
      msg += '理由: ' + (data.reason || '未記入') + '\n';
      msg += '連絡者: ' + (data.contact || '未記入') + '\n';
      msg += '連絡方法: ' + (data.method || '未記入') + '\n';
      msg += '受付者: ' + (data.reporter || '未記入');
      sendLine(msg);
    } catch (e) {}

    return { success: true, message: '長期休みを登録しました' };
  } finally {
    lock.releaseLock();
  }
}

// 長期休みの重複検知（2026-05-08追加・再開未済の同一開始日のみ重複扱い）
function findDuplicateLongTermAbsence(sheet, name, startDate) {
  var allData = sheet.getDataRange().getValues();
  for (var i = 1; i < allData.length; i++) {
    var rowName = String(allData[i][1] || '').trim();
    if (rowName !== name) continue;

    var rowStatus = String(allData[i][3] || '').trim();
    if (rowStatus !== '長期休み') continue;

    var rowDateStr = fmtDate(allData[i][0]);
    if (rowDateStr !== startDate) continue;

    // 8列目（再開日）が入っていれば終了済みなので重複扱いしない
    var resumeDate = allData[i][7];
    if (resumeDate) continue;

    return {
      startDate: rowDateStr,
      reporter: String(allData[i][5] || '').trim(),
      timestamp: fmtTimestamp(allData[i][6])
    };
  }
  return null;
}

// ===== 再開登録 =====
function registerResume(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: '出欠変更シートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  var found = false;
  var todayYMD = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 長期休みの行を探して、8列目に再開日を書き込む
  // 2026-05-27: 「未復帰（H列空 or H列が今日以降）」を対象にする。
  //   H列に未来の再開予定日が既に入っている行も再開登録で上書き可能にする。
  for (var i = allData.length - 1; i >= 1; i--) {
    var name = String(allData[i][1] || '').trim();
    var type = String(allData[i][3] || '').trim();
    var endCol = allData[i][7] ? fmtDate(allData[i][7]) : '';

    if (name === data.name && type === '長期休み' && (!endCol || endCol >= todayYMD)) {
      sheet.getRange(i + 1, 8).setValue(data.resumeDate);
      // I列（再開予定日）も実際の再開日で上書き（古い予定日が表示に残るのを防ぐ・2026-05-27追加）
      sheet.getRange(i + 1, 9).setValue(data.resumeDate);
      found = true;
      break;
    }
  }

  if (!found) {
    return { error: 'この利用者の長期休みが見つかりません', success: false };
  }

  // 社長にLINE通知
  try {
    var msg = '【再開連絡】\n';
    msg += data.name + '様\n';
    msg += '再開日: ' + fmtDateJP(data.resumeDate) + '\n';
    msg += '連絡者: ' + (data.contact || '未記入') + '\n';
    msg += '連絡方法: ' + (data.method || '未記入') + '\n';
    msg += '受付者: ' + (data.reporter || '未記入');
    sendLine(msg);
  } catch (e) {}

  return { success: true, message: data.name + '様の再開を登録しました（' + data.resumeDate + 'から）' };
}

// 欠席キャンセル（行を削除）
// 2026-05-12: 削除前に「欠席理由」「元連絡者」を捕捉し、取消ログシートに転記。
//             通知メールに 欠席理由・元連絡者・取消操作者を表示。
function cancelAbsence(ss, data) {
  // 取消操作者は必須（クライアント側ガードすり抜け対策・2026-05-14）
  var cancellerStr = data.canceller ? String(data.canceller).trim() : '';
  if (!cancellerStr || cancellerStr === '-') {
    Logger.log('cancel_absence reject: canceller is empty (name=' + (data.name || '') + ', date=' + (data.date || '') + ')');
    return { success: false, error: '取消操作者は必須です。スタッフ名を選んでから取消してください。' };
  }

  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: 'シートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  var deleted = 0;
  var capturedReason = '';
  var capturedReporter = '';
  var capturedUnit = '';
  var notifySkipped = [];

  // 後ろから削除（行番号ずれ防止）
  for (var i = allData.length - 1; i >= 1; i--) {
    var d = fmtDate(allData[i][0]);
    var name = String(allData[i][1] || '').trim();
    var unit = String(allData[i][2] || '').trim();

    if (d === data.date && name === data.name &&
      (data.unit === '終日' || unit === data.unit || unit === '終日')) {
      // 削除前に欠席理由・元連絡者を捕捉（最後にマッチした行の値が残る）
      capturedReason = String(allData[i][4] || '').trim();
      capturedReporter = String(allData[i][5] || '').trim();
      capturedUnit = unit || (data.unit || '終日');
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }

  if (deleted > 0) {
    // 取消ログシートに転記（監査ログ）
    try {
      _appendCancelLog_(ss, {
        date: data.date,
        name: data.name,
        unit: capturedUnit || (data.unit || '終日'),
        reason: capturedReason,
        originalReporter: capturedReporter,
        canceller: data.canceller || ''
      });
    } catch (logErr) {
      Logger.log('取消ログ記録エラー: ' + logErr.message);
    }

    // 取消通知LINE（2026/4/10追加・「やっぱり利用する」パターン）
    // 2026-05-12: 単位削除・欠席理由/元連絡者/取消操作者を追加
    try {
      var msg = '【欠席取消】\n';
      msg += data.name + '様\n';
      msg += '日付: ' + fmtDateJP(data.date) + '\n';
      msg += '欠席理由: ' + (capturedReason || '-') + '\n';
      msg += '元連絡者: ' + (capturedReporter || '-') + '\n';
      msg += '→ やっぱり利用します\n';
      msg += '取消操作者: ' + (data.canceller || '-');
      sendLine(msg);
    } catch (e) {}

    // 2026-05-23: ケアマネ連絡履歴シートに取消を追記
    try {
      _appendCmLog_(ss, {
        userName: data.name,
        date: data.date,
        action: '欠席取消',
        method: '連絡なし',
        contactedAddr: '',
        operator: data.canceller || '',
        result: '取消',
        note: '元連絡: ' + (capturedReporter || '?')
      });
    } catch (logErr) {
      Logger.log('cm_log 取消記録エラー: ' + logErr.message);
    }

    // 2026-05-23改修: ケアマネ情報を利用者台帳から取得・メール派ケアマネのみ自動送信
    // （以前は HTML側から渡される data.cmEmail に依存）
    var cancelCmInfo = getUserCmContact(ss, data.name);
    // 2026-06-20 休み連絡メールリニューアル: 取消(やっぱり利用)メールも登録側と挙動を一致させる。
    //   プレビューで「送信」が押された(data.doSendEmail===true)＋送信許可＋有効メアドのときだけ送る。自動送信しない。
    //   メアド無効（"なし"/カンマ誤り/@無し）は isValidCmEmail_ で弾き「要電話連絡」に倒す（登録側と対称）。
    var ccMethod = cancelCmInfo.method || '';
    if (cancelCmInfo.found && ccMethod.indexOf('メール') >= 0) {
      var ccEm = cancelCmInfo.email || '';
      var ccDidSend = false, ccSendError = null;
      var ccWantSend = (data.doSendEmail === true) && ABSENCE_AUTO_EMAIL && isValidCmEmail_(ccEm);
      if (ccWantSend) {
        try {
          sendCancelEmail(data.name, data.date, ccEm,
            cancelCmInfo.cmName || '', cancelCmInfo.cmOffice || '', data.canceller || '');
          ccDidSend = true;
          _appendCmLog_(ss, {
            userName: data.name, date: data.date,
            action: '欠席取消', method: '自動メール',
            contactedAddr: ccEm,
            operator: 'system', result: '成功',
            note: 'やっぱり利用メール送信'
          });
        } catch (emailErr) {
          ccSendError = emailErr.message;
          Logger.log('cancel_absence メール送信エラー: ' + emailErr.message);
          _appendCmLog_(ss, {
            userName: data.name, date: data.date,
            action: '欠席取消', method: '自動メール',
            contactedAddr: ccEm,
            operator: 'system', result: '送信失敗',
            note: emailErr.message
          });
          // 取消自体は成功として扱う
        }
      } else {
        // 送信せず：プレビュー未承認 or 無効メアド。登録側と同じ分類でログ＋必要なら警告。
        var ccStatus = classifyCmNotified_(ccEm, ccMethod, null, false, null); // 'メールなし'/'要電話連絡'/'メール未送信'
        _appendCmLog_(ss, {
          userName: data.name, date: data.date,
          action: '欠席取消', method: '自動メール',
          contactedAddr: '',
          operator: 'system', result: 'マーク（' + ccStatus + '）',
          note: '取消メール自動送信せず'
        });
        if (ccStatus === '要電話連絡' || ccStatus === 'メールなし') {
          console.warn('[欠席取消通知] メール派だが宛先無効/未登録のため手動連絡要: ' + data.name + ' (' + ccEm + ')');
          notifySkipped.push(data.name);
        }
      }
    }
  }

  return { success: true, deleted: deleted, notifySkipped: notifySkipped };
}

// 取消ログシートに1行追記（シートが無ければ作成）
function _appendCancelLog_(ss, rec) {
  var sheet = ss.getSheetByName('取消ログ');
  if (!sheet) {
    sheet = ss.insertSheet('取消ログ');
    sheet.appendRow(['取消日時', '日付', '利用者', '単位', '欠席理由', '元連絡者', '取消操作者']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    new Date(),
    rec.date,
    rec.name,
    rec.unit,
    rec.reason,
    rec.originalReporter,
    rec.canceller
  ]);
}

// 2026-05-23: ケアマネ連絡履歴シート（追記式の監査ログ・運営指導の証憑用）
// 列: A:タイムスタンプ B:利用者名 C:欠席日 D:操作種別 E:連絡手段 F:連絡先 G:操作者 H:結果 I:メモ
function _ensureCmLogSheet_(ss) {
  var sh = ss.getSheetByName('ケアマネ連絡履歴');
  if (!sh) {
    sh = ss.insertSheet('ケアマネ連絡履歴');
    sh.appendRow(['タイムスタンプ', '利用者名', '欠席日', '操作種別', '連絡手段', '連絡先', '操作者', '結果', 'メモ']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 9).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 120); sh.setColumnWidth(3, 100);
    sh.setColumnWidth(4, 100); sh.setColumnWidth(5, 110); sh.setColumnWidth(6, 180);
    sh.setColumnWidth(7, 80);  sh.setColumnWidth(8, 80);  sh.setColumnWidth(9, 220);
  }
  return sh;
}

// 2026-07-04 非本番オリジンのテレメトリ記録（第1段階・転送はしない）。
// origin_log シートに URL/UA/時刻のみ追記。個人情報・利用者データは扱わない。
// 暴走防止: (1) 上限1000行で追記停止 (2) 同一originは1回だけ記録（origin単位dedup）。
var ORIGIN_LOG_MAX_ROWS = 1000;
function logNonProdOrigin_(params) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('origin_log');
  if (!sh) {
    sh = ss.insertSheet('origin_log');
    sh.appendRow(['サーバ受信時刻', 'origin', 'href', 'userAgent', 'クライアント時刻']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 5).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 320);
    sh.setColumnWidth(4, 320); sh.setColumnWidth(5, 140);
  }
  // 暴走防止(1): 上限到達なら追記しない
  if (sh.getLastRow() >= ORIGIN_LOG_MAX_ROWS) return;
  var origin = String((params && params.origin) || '').slice(0, 300);
  if (!origin) return;
  // 暴走防止(2): 既に同一originが記録済みなら追記しない（origin列を突合）
  var last = sh.getLastRow();
  if (last >= 2) {
    var seen = sh.getRange(2, 2, last - 1, 1).getValues();
    for (var i = 0; i < seen.length; i++) {
      if (String(seen[i][0]).trim() === origin) return; // 記録済み
    }
  }
  sh.appendRow([
    new Date(),
    origin,
    String((params && params.href) || '').slice(0, 500),
    String((params && params.ua) || '').slice(0, 500),
    String((params && params.t) || '')
  ]);
}

// 2026-07-08 Phase2: 過去日連絡「記録のみ（送信ゼロ）」。当日送れなかった過去日の欠席を、別手段
// (Gmail手動/電話/その他)で連絡した記録を残す。★メールは一切送信しない（記録だけ）。
// 既存 updateAbsenceCmNotified（本体不変・呼ぶだけ）で cmNotified を更新し、既存 _appendCmLog_ で
// 担当/手段/日付を連絡ログへ追記（表示の lastOperator/lastMethod 源）。additive・既存action不変。
function recordPastContact(ss, data) {
  var r = updateAbsenceCmNotified(ss, {
    name: data.name, date: data.date,
    cmNotified: String(data.cmNotified || ''), operator: String(data.operator || '')
  });
  if (!r || !r.success) return r || { success: false, error: '更新に失敗しました' };
  _appendCmLog_(ss, {
    userName: data.name, date: data.date, action: '過去日連絡記録',
    method: String(data.method || ''), operator: String(data.operator || ''),
    result: '記録', note: String(data.note || '')
  });
  return { success: true, recorded: true };   // ★メール送信なし（記録のみ）
}

// rec: { userName, date, action, method, contactedAddr, operator, result, note }
function _appendCmLog_(ss, rec) {
  try {
    var sh = _ensureCmLogSheet_(ss);
    sh.appendRow([
      new Date(),
      rec.userName || '',
      rec.date || '',
      rec.action || '',
      rec.method || '',
      rec.contactedAddr || '',
      rec.operator || '',
      rec.result || '',
      rec.note || ''
    ]);
  } catch (e) {
    Logger.log('_appendCmLog_ error: ' + e.message);
  }
}

// cmNotified値（H列値） → 履歴シートの「連絡手段」値へのマッピング
function _mapNotifiedToMethod_(cmNotified) {
  switch (String(cmNotified || '').trim()) {
    case '送信済': return '自動メール';
    case '下書き保存': return '自動メール';
    case '手動メール送信済': return '手動メール';
    case '電話連絡済': return '電話';
    case 'SMS送信済': return 'SMS';
    case 'ケアマネ把握済': return 'ケアマネ把握済';
    case 'メールなし': return '連絡なし';
    case '要電話連絡': return '要電話連絡';   // 2026-06-19: メアド無効＝手動電話連絡が必要
    case 'メール未送信': return '連絡なし';   // 2026-06-19: 有効メアドだがプレビューで送信せず
    default:
      if (String(cmNotified || '').indexOf('エラー') === 0) return '自動メール';
      return String(cmNotified || '');
  }
}

// HTML詳細ポップアップ用：当該欠席の連絡履歴を時系列昇順で返す
function getCmLog(ss, userName, dateStr) {
  var sh = ss.getSheetByName('ケアマネ連絡履歴');
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getDataRange().getValues();
  var normName = _normalizeNameForMatch_(userName);
  var targetDate = String(dateStr || '').trim();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (_normalizeNameForMatch_(data[i][1]) !== normName) continue;
    var rowDate = data[i][2] instanceof Date
      ? Utilities.formatDate(data[i][2], 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(data[i][2] || '').trim();
    if (targetDate && rowDate !== targetDate) continue;
    out.push({
      ts: data[i][0] instanceof Date
        ? Utilities.formatDate(data[i][0], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
        : String(data[i][0] || ''),
      userName: String(data[i][1] || ''),
      date: rowDate,
      action: String(data[i][3] || ''),
      method: String(data[i][4] || ''),
      contactedAddr: String(data[i][5] || ''),
      operator: String(data[i][6] || ''),
      result: String(data[i][7] || ''),
      note: String(data[i][8] || '')
    });
  }
  return out;
}

// カード一覧用：当該欠席の最終操作者を返す（履歴シート最終ヒット行）
function _getLastCmLog_(ss, userName, dateStr) {
  var sh = ss.getSheetByName('ケアマネ連絡履歴');
  if (!sh || sh.getLastRow() < 2) return null;
  var data = sh.getDataRange().getValues();
  var normName = _normalizeNameForMatch_(userName);
  var targetDate = String(dateStr || '').trim();
  var last = null;
  for (var i = 1; i < data.length; i++) {
    if (_normalizeNameForMatch_(data[i][1]) !== normName) continue;
    var rowDate = data[i][2] instanceof Date
      ? Utilities.formatDate(data[i][2], 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(data[i][2] || '').trim();
    if (rowDate !== targetDate) continue;
    last = { operator: String(data[i][6] || ''), method: String(data[i][4] || '') };
  }
  return last;
}

// ケアマネ連絡履歴を辞書化（getUpcomingAbsences/getLongLeaveList のN+1回避用）
// returns: { 'normName|YYYY-MM-DD': {operator, method}, ... }
function _buildCmLogIndex_(ss) {
  var index = {};
  try {
    var sh = ss.getSheetByName('ケアマネ連絡履歴');
    if (!sh || sh.getLastRow() < 2) return index;
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var name = _normalizeNameForMatch_(data[i][1]);
      var date = data[i][2] instanceof Date
        ? Utilities.formatDate(data[i][2], 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(data[i][2] || '').trim();
      if (!name || !date) continue;
      index[name + '|' + date] = {
        operator: String(data[i][6] || ''),
        method: String(data[i][4] || '')
      };
    }
  } catch (e) {}
  return index;
}

// 利用者の通所曜日を取得
// 利用者の通所パターン（午前/午後利用フラグ）を返す
// 2026-05-16: 「終日」廃止に伴う長期休み単位展開用
function getUserPattern(ss, name) {
  try {
    var patterns = getUserPatterns(ss);
    var p = patterns[name];
    if (!p) return null;
    var u = String(p.unit || '');
    return {
      hasAm: u.indexOf('午前') >= 0,
      hasPm: u.indexOf('午後') >= 0
    };
  } catch (e) {
    return null;
  }
}

function getUserDaysForName(ss, userName) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var daysCol = findCol(h, ['利用曜日']);
  if (nameCol < 0 || daysCol < 0) return null;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][nameCol] || '').trim() === userName) {
      return String(data[i][daysCol] || '').trim();
    }
  }
  return null;
}

// 2026-05-23: 利用者台帳ベースでケアマネ連絡情報を取得（欠席連絡の単一マスター）
// 戻り値: { found: bool, cmName, cmOffice, email, phone, method, contactNote }
// method は 'メール'/'電話'/'SMS'/'メール+電話'/'メール+SMS'/'電話+SMS' or '' (未設定)
// contactNote は利用者個別の連絡時注意事項（フリーテキスト・例：「本人NG・ケアマネ経由のみ」）
// SMSは電話番号宛なのでSMS番号列は持たない（phoneと共用）
// FAXは欠席連絡では使わない（実績送付フロー専用）
function getUserCmContact(ss, userName) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { found: false };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { found: false };
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var cmNameCol = findCol(h, ['ケアマネ担当者名', 'ケアマネ担当', '担当ケアマネ']);
  var cmOfficeCol = findCol(h, ['ケアマネ事業所名', 'ケアマネ事業所']);
  var cmEmailCol = findCol(h, ['ケアマネ個人メアド', 'ケアマネメールアドレス', 'ケアマネメアド', 'メールアドレス']);
  var cmMethodCol = findCol(h, ['ケアマネ連絡手段', '連絡手段']);
  var cmPhoneCol = findCol(h, ['ケアマネ電話番号', 'ケアマネTEL']);
  var cmNoteCol = findCol(h, ['連絡時注意事項', '連絡注意', '連絡メモ']);
  if (nameCol < 0) return { found: false };

  var normTarget = _normalizeNameForMatch_(userName);
  for (var i = 1; i < data.length; i++) {
    if (_normalizeNameForMatch_(data[i][nameCol]) !== normTarget) continue;
    return {
      found: true,
      cmName: cmNameCol >= 0 ? String(data[i][cmNameCol] || '').trim() : '',
      cmOffice: cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '',
      email: cmEmailCol >= 0 ? String(data[i][cmEmailCol] || '').trim() : '',
      phone: cmPhoneCol >= 0 ? String(data[i][cmPhoneCol] || '').trim() : '',
      method: cmMethodCol >= 0 ? String(data[i][cmMethodCol] || '').trim() : '',
      contactNote: cmNoteCol >= 0 ? String(data[i][cmNoteCol] || '').trim() : ''
    };
  }
  return { found: false };
}

// ===== 2026-07-04 指示書③: 本日の欠席連絡ボックス まとめて送信 =====
// data: { operator: '担当者名', items: [{ name, date, unit, customBody?, toOverride? }] }
// 送信実体は sendAbsenceEmail 流用・宛先は getUserCmContact(N列)再取得＝単一マスター。
// サーバ側二重送信ガード: H列 cmNotified を送信直前に再読して済みならスキップ。
function sendBoxCmMails(ss, data) {
  var operator = String(data.operator || '').trim();
  if (!operator) return { success: false, error: '操作者(operator)が必要です' };
  var items = data.items || [];
  if (!items.length) return { success: false, error: '送信対象(items)が空です' };
  if (items.length > 40) return { success: false, error: '一度に送れるのは40件までです' };

  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { success: false, error: '出欠変更シートがありません' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (e) { return { success: false, error: '他の操作が実行中です。少し待って再試行してください' }; }

  var sent = [], skipped = [], failed = [];
  try {
    var rows = sheet.getDataRange().getValues();
    items.forEach(function (item) {
      var name = String(item.name || '').trim();
      var dateStr = String(item.date || '').trim();
      if (!name || !dateStr) { skipped.push({ name: name, reason: 'name/date欠落' }); return; }

      // 1) 該当欠席行を検索し cmNotified をサーバ側で再チェック（二重送信ガードの本体）
      var foundRow = -1, curNotified = '';
      var normName = _normalizeNameForMatch_(name);
      for (var i = 1; i < rows.length; i++) {
        if (_normalizeNameForMatch_(rows[i][1]) !== normName) continue;
        if (String(rows[i][3] || '').trim() !== '欠席') continue;
        if (fmtDate(rows[i][0]) !== dateStr) continue;
        foundRow = i + 1;
        curNotified = String(rows[i][7] || '').trim();
        break;
      }
      if (foundRow < 0) { skipped.push({ name: name, reason: '欠席行が見つかりません' }); return; }
      if (kbIsAlreadyNotified_(curNotified)) { skipped.push({ name: name, reason: '既に対応済（' + curNotified + '）' }); return; }

      // 2) 宛先は台帳N列を再取得（クライアント値は信用しない）。toOverride は明示訂正時のみ・検証必須。
      var cmInfo = getUserCmContact(ss, name);
      if (!cmInfo.found) { skipped.push({ name: name, reason: '台帳に利用者がいません' }); return; }
      if (String(cmInfo.method || '').indexOf('メール') < 0) { skipped.push({ name: name, reason: 'メール派ではありません（' + (cmInfo.method || '未設定') + '）' }); return; }
      var to = String(item.toOverride || '').trim() || String(cmInfo.email || '').trim();
      if (!isValidCmEmail_(to)) { skipped.push({ name: name, reason: '宛先メアド無効（' + to + '）' }); return; }
      if (!ABSENCE_AUTO_EMAIL) { skipped.push({ name: name, reason: '送信マスターOFF(ABSENCE_AUTO_EMAIL)' }); return; }

      // 3) 送信（既存テンプレ・既存差出人・当日1日）
      try {
        var rowUnit = String(rows[foundRow - 1][2] || '').trim() || String(item.unit || '').trim() || '終日';
        var rowReason = String(rows[foundRow - 1][4] || '').trim();
        sendAbsenceEmail(name, [dateStr], rowUnit, rowReason, '',
          to, cmInfo.cmName || '', cmInfo.cmOffice || '', operator, String(item.customBody || ''));
        // 4) H列更新 + ケアマネ連絡ログ（担当者記録）
        sheet.getRange(foundRow, 8).setValue(DRAFT_MODE ? '下書き保存' : '送信済');
        _appendCmLog_(ss, {
          userName: name, date: dateStr, action: 'ボックス一括送信',
          method: '自動メール', contactedAddr: to, operator: operator,
          result: DRAFT_MODE ? '下書き' : '成功',
          note: item.toOverride ? ('宛先上書き:' + to) : ''
        });
        sent.push({ name: name, to: to });
      } catch (mailErr) {
        _appendCmLog_(ss, {
          userName: name, date: dateStr, action: 'ボックス一括送信',
          method: '自動メール', contactedAddr: to, operator: operator,
          result: 'エラー', note: String(mailErr && mailErr.message || mailErr)
        });
        failed.push({ name: name, error: String(mailErr && mailErr.message || mailErr) });
      }
    });
  } finally {
    lock.releaseLock();
  }
  return { success: true, sent: sent, skipped: skipped, failed: failed, operator: operator };
}

// 2026-05-13: 既存欠席の cmNotified 列（H列）を手動更新
// data: { name, date, cmNotified (例: '電話連絡済'), updater (任意・操作者名) }
function updateAbsenceCmNotified(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { success: false, error: '出欠変更シートがありません' };

  var name = String(data.name || '').trim();
  var dateStr = String(data.date || '').trim();
  var newValue = String(data.cmNotified || '').trim();
  var operator = String(data.operator || '').trim();  // 2026-05-23: 操作者名（HTML側のプルダウンから）
  var nextContactDue = String(data.nextContactDue || '').trim();  // 2026-05-23: 次回連絡予定日（長期休み用）
  var resultNote = String(data.note || '').trim();  // 2026-05-23: 連絡結果メモ
  var expectedReturn = String(data.expectedReturn || '').trim();  // 2026-05-24: 再開予定日（長期休み用・'未定' or YYYY-MM-DD or 空=更新なし）
  if (!name || !dateStr) return { success: false, error: 'name と date が必要です' };

  var todayYMD = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var allData = sheet.getDataRange().getValues();
  var updated = 0;
  var normName = _normalizeNameForMatch_(name);

  for (var i = 1; i < allData.length; i++) {
    var d = fmtDate(allData[i][0]);
    var rowName = _normalizeNameForMatch_(allData[i][1]);
    var type = String(allData[i][3] || '').trim();
    var endCol = allData[i][7] ? fmtDate(allData[i][7]) : '';

    if (rowName !== normName) continue;

    // 通常欠席: 日付一致で H列(8) 更新
    if (type === '欠席' && d === dateStr) {
      sheet.getRange(i + 1, 8).setValue(newValue);
      updated++;
    }
    // 長期休み: startDate 一致 かつ 未復帰（終了日が空 or 終了日 >= 今日）で N列(14) 更新
    // 同一長期休みが午前+午後で2行に分かれている場合は両方更新される
    else if (type === '長期休み' && d === dateStr && (!endCol || endCol >= todayYMD)) {
      sheet.getRange(i + 1, 14).setValue(newValue);
      // 2026-05-23: 長期休みの場合、J列(10)=最終連絡日 / L列(12)=次回連絡予定日 / K列(11)=連絡履歴 も更新
      sheet.getRange(i + 1, 10).setValue(todayYMD);  // J列 最終連絡日
      if (nextContactDue) {
        sheet.getRange(i + 1, 12).setValue(nextContactDue);  // L列 次回連絡予定日
      }
      // 2026-05-24: I列(9)=再開予定日（expectedReturn）も同時更新
      // '未定' or YYYY-MM-DD のときだけ書き込み（空文字は更新スキップ）
      if (expectedReturn) {
        sheet.getRange(i + 1, 9).setValue(expectedReturn);  // I列 再開予定日
      }
      if (resultNote) {
        // K列 連絡履歴に1行追記（既存値の先頭に新しい行を加える）
        var existingLog = String(allData[i][10] || '').trim();
        var newLogLine = todayYMD + ' [' + (operator || '?') + '/' + _mapNotifiedToMethod_(newValue) + '] ' + resultNote;
        var combined = existingLog ? (newLogLine + '\n' + existingLog) : newLogLine;
        sheet.getRange(i + 1, 11).setValue(combined);  // K列 連絡履歴
      }
      updated++;
    }
  }

  if (updated === 0) return { success: false, error: '該当する欠席行が見つかりません', name: name, date: dateStr };

  // 2026-05-23: 履歴シートに追記
  _appendCmLog_(ss, {
    userName: name,
    date: dateStr,
    action: '手動マーク',
    method: _mapNotifiedToMethod_(newValue),
    contactedAddr: '',
    operator: operator || '不明',
    result: 'マーク',
    note: resultNote + (nextContactDue ? (' / 次回:' + nextContactDue) : '')
  });

  return { success: true, updated: updated };
}

// ===== ケアマネにメール =====
// 2026-05-10: A案テンプレに差替・差出人 r.d-yawaragi に切替
// 2026-05-13: 申請者名（reporter）を冒頭に挿入・署名にHP/メアド追加
// 2026-05-13: customBody が指定されていれば本文を丸ごと上書き（自由編集モード）
function sendAbsenceEmail(userName, dates, unit, reason, supplement, cmEmail, cmName, cmOffice, reporter, customBody) {
  var dateLabel = dates.map(function(d) {
    return _formatDateLabelForCmMail_(d);
  }).join('、');

  var subject = '【yawaragi】' + dateLabel + ' ' + userName + '様 お休み連絡';
  // 2026-07-03: わかばの丘地域包括からの要望で、この事業所宛のときだけ件名末尾に担当ケアマネ名を付与。
  //   完全一致（居宅わかばの丘・他事業所は変更なし）／担当名が空のときは付けない。
  if (cmOffice && cmOffice.trim() === 'わかばの丘地域包括支援センター'
      && cmName && cmName.trim()) {
    subject += ' ─ 担当:' + cmName.trim() + '様';
  }

  var reporterLabel = reporter ? (' ' + reporter) : '';

  var body;
  if (customBody && String(customBody).trim()) {
    body = String(customBody);
  } else {
    body = '';
    if (cmOffice) body += cmOffice + '\n';
    if (cmName) body += cmName + '様\n';
    body += '\n';
    body += 'いつもお世話になっております。\n';
    body += 'リハビリデイサービス yawaragi' + reporterLabel + 'です。\n\n';
    body += dateLabel + '、' + userName + '様より「' + (reason || '体調不良') + '」とのご連絡があり、\n';
    body += 'yawaragiをお休みされる旨伺いましたのでご報告いたします。\n';
    if (supplement) {
      body += '\n［備考： ' + supplement + '］\n';
    }
    body += '\nご確認のほどよろしくお願いいたします。\n\n';
    body += '━━━━━━━━━━━━━━━━━━\n';
    body += 'リハビリデイサービス yawaragi\n';
    body += 'https://www.keepfitlife-yawaragi.com\n';
    body += '✉ r.d-yawaragi@keepfitlife.com\n';
    body += 'TEL/FAX: 0493-81-5125\n';
    body += '━━━━━━━━━━━━━━━━━━\n';
  }

  var options = {
    from: 'r.d-yawaragi@keepfitlife.com',
    name: 'リハビリデイサービスyawaragi',
    bcc: 'r.d-yawaragi@keepfitlife.com',
    charset: 'UTF-8'
  };

  if (DRAFT_MODE) {
    GmailApp.createDraft(cmEmail, subject, body, options);
  } else {
    GmailApp.sendEmail(cmEmail, subject, body, options);
  }
}

// 2026-05-10: M月D日(曜) 形式のラベル（メール件名・本文用）
function _formatDateLabelForCmMail_(dateStr) {
  var parts = String(dateStr).split('-');
  if (parts.length < 3) return String(dateStr);
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  var w = ['日','月','火','水','木','金','土'][new Date(y, m-1, d).getDay()];
  return m + '月' + d + '日(' + w + ')';
}

// 2026-05-10: 「やっぱり利用」連絡メール（欠席取消の自動連絡）
// 2026-05-13: 申請者名（reporter）を冒頭に挿入・署名にHP/メアド追加
function sendCancelEmail(userName, dateStr, cmEmail, cmName, cmOffice, reporter) {
  var dateLabel = _formatDateLabelForCmMail_(dateStr);
  var subject = '【yawaragi】' + dateLabel + ' ' + userName + '様 ご利用に変更（休み→利用）';

  var reporterLabel = reporter ? (' ' + reporter) : '';

  var body = '';
  if (cmOffice) body += cmOffice + '\n';
  if (cmName) body += cmName + '様\n';
  body += '\n';
  body += 'いつもお世話になっております。\n';
  body += 'リハビリデイサービス yawaragi' + reporterLabel + 'です。\n\n';
  body += '先ほどお休み連絡をさせていただいた' + dateLabel + ' ' + userName + '様ですが、\n';
  body += 'やはりご利用されることになりましたのでご報告いたします。\n';
  body += '実績として計上されます。\n\n';
  body += 'ご確認のほどよろしくお願いいたします。\n\n';
  body += '━━━━━━━━━━━━━━━━━━\n';
  body += 'リハビリデイサービス yawaragi\n';
  body += 'https://www.keepfitlife-yawaragi.com\n';
  body += '✉ r.d-yawaragi@keepfitlife.com\n';
  body += 'TEL/FAX: 0493-81-5125\n';
  body += '━━━━━━━━━━━━━━━━━━\n';

  var options = {
    from: 'r.d-yawaragi@keepfitlife.com',
    name: 'リハビリデイサービスyawaragi',
    bcc: 'r.d-yawaragi@keepfitlife.com',
    charset: 'UTF-8'
  };

  if (DRAFT_MODE) {
    GmailApp.createDraft(cmEmail, subject, body, options);
  } else {
    GmailApp.sendEmail(cmEmail, subject, body, options);
  }
}

// 2026-05-10: テスト関数（自分宛）
function _test_sendAbsenceEmail_a_case() {
  sendAbsenceEmail(
    'テスト 太郎', ['2026-05-10'], '終日', '体調不良', '熱が38度ありました',
    'm-higa@keepfitlife.com', 'テスト 花子', 'テスト居宅介護支援事業所'
  );
  Logger.log('実行完了。Gmail下書きフォルダ or 受信トレイで確認');
}

function _test_sendCancelEmail_a_case() {
  sendCancelEmail(
    'テスト 太郎', '2026-05-10', 'm-higa@keepfitlife.com', 'テスト 花子', 'テスト居宅介護支援事業所'
  );
  Logger.log('実行完了');
}

// ===== 社長に通知（LINE + Gmail 両方送信）=====
var LINE_TOKEN = 'uwL+AkshOnTUGkFn+vx7QejtZK7LRYkNmMw19nlM1Iyr84d2SFiHe/vgg0MXSc3U9UmvDl7kaQPGx6Cyv+JzDmag9E0WupZQNpEVoAqFqBhCHUMXVb+CBT2bBSnMyseaHONSMh7ieuWZFrHvDu147gdB04t89/1O/w1cDnyilFU=';
var OWNER_USER_ID = 'Ue54376b8f1aa48fd139962c33b54affe';

// 2026-05-22 → 2026-05-23: 欠席通知に出すケアマネ連絡手段の1行を組み立てる
// cmInfo = { status: cmNotified値, office, name, method, phone }
// method は利用者台帳の連絡手段列から（'メール'/'電話'/'SMS'/'メール+電話'/'メール+SMS'/'電話+SMS'）
// SMSは電話番号宛なので、別途SMS番号列は持たない（電話番号と共用）
// FAX は欠席連絡では使わない（実績送付フローでのみ使用）
function _cmContactLine_(cmInfo) {
  var status = String(cmInfo.status || '');
  var method = String(cmInfo.method || '');
  var who = String(cmInfo.office || '').trim();
  if (cmInfo.name) who += (who ? ' ' : '') + String(cmInfo.name).trim() + '様';

  if (status === '送信済') {
    return 'ケアマネ連絡：📧 ' + (who || 'ケアマネ') + 'へ自動メール送信';
  }
  if (status === '下書き保存') return 'ケアマネ連絡：📝 メール下書き保存（送信は未実施）';
  if (status === 'ケアマネ把握済') return 'ケアマネ連絡：✅ ケアマネ発信のため連絡不要';
  if (status === '電話連絡済') return 'ケアマネ連絡：☎ 電話連絡済み';
  if (status === 'SMS送信済') return 'ケアマネ連絡：💬 SMS送信済み';
  if (status === '手動メール送信済') return 'ケアマネ連絡：✉ 手動メール送信済み';
  if (status.indexOf('エラー') === 0) {
    return 'ケアマネ連絡：⚠ メール送信エラー → 手動で連絡してください';
  }

  // 'メールなし' を連絡手段別に出し分け
  if (status === 'メールなし') {
    if (method === '電話' || method === '電話+SMS') {
      return 'ケアマネ連絡：📞 電話派 → ' + (cmInfo.phone || '番号未登録') + ' へ電話してください';
    }
    if (method === 'SMS') {
      return 'ケアマネ連絡：💬 SMS派 → ' + (cmInfo.phone || '番号未登録') + ' へSMSしてください';
    }
    if (method === 'メール+電話') {
      return 'ケアマネ連絡：⚠ メール派なのにメアド未登録 → ' + (cmInfo.phone || '番号未登録') + ' へ電話 + 至急メアド収集';
    }
    if (method === 'メール+SMS') {
      return 'ケアマネ連絡：⚠ メール派なのにメアド未登録 → ' + (cmInfo.phone || '番号未登録') + ' へSMS + 至急メアド収集';
    }
    if (method.indexOf('メール') >= 0) {
      return 'ケアマネ連絡：⚠ メール派なのにメアド未登録 → 至急収集してください';
    }
    return 'ケアマネ連絡：⚠ 連絡手段未設定 → 利用者台帳でケアマネ連絡手段を設定してください';
  }
  return 'ケアマネ連絡：' + status;
}

function notifyOwner(userName, dates, unit, reason, reporter, cmInfo) {
  var dateText = dates.map(function (d) {
    return fmtDateJP(d) + '（' + getDayOfWeek(d) + '）';
  }).join('、');

  var msg = '【欠席連絡】\n';
  msg += userName + '様\n';
  msg += '日付: ' + dateText + '\n';
  msg += '単位: ' + unit + '\n';
  msg += '理由: ' + (reason || '未記入') + '\n';
  msg += '連絡者: ' + (reporter || '未記入');
  // 2026-05-22: ケアマネへの連絡手段を1行追記（②方針・FAX/持参事業所の連絡漏れ防止）
  if (cmInfo && cmInfo.status) {
    msg += '\n' + _cmContactLine_(cmInfo);
  }
  // 2026-05-24: メール派ケアマネで「メール送らない」を選択した場合の理由を追記
  if (cmInfo && cmInfo.skipReasonLabel) {
    msg += '\nメール送らず：' + cmInfo.skipReasonLabel;
    if (cmInfo.skipReasonNote) msg += '（' + cmInfo.skipReasonNote + '）';
  }
  sendLine(msg);
}

// 社長への通知（LINE + Gmail両方・2026/4/10更新）
// LINE: 普段のメイン通知（Apple Watchで分かりやすい）
// Gmail: LINE上限超過時のバックアップ（実質無制限）
function sendLine(message) {
  // === LINE送信（無料枠200通超過時は無音で失敗・5/1にリセット） ===
  try {
    var url = 'https://api.line.me/v2/bot/message/push';
    var payload = {
      to: OWNER_USER_ID,
      messages: [{ type: 'text', text: message }]
    };
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {}

  // === Gmail送信（バックアップ・常に届く） ===
  // 2026-05-26: GmailApp.sendEmail が一部絵文字を文字化け（������）させるため文字表記に置換
  // LINE側は message 原文（絵文字維持）でApple Watchで見やすい
  try {
    var gmailBody = message
      .replace(/📧/g, '[メール]')
      .replace(/📞/g, '[電話]')
      .replace(/☎/g, '[電話]')
      .replace(/💬/g, '[SMS]')
      .replace(/✅/g, '[OK]')
      .replace(/📝/g, '[下書き]')
      .replace(/✉/g, '[送信済]')
      .replace(/⚠/g, '[!]');
    // メッセージから件名を組む（例: 【yawaragi欠席連絡】欠席連絡 山田様）
    var lines = gmailBody.split('\n');
    var category = lines[0] ? lines[0].replace(/【|】/g, '') : '通知';
    var name = lines[1] || '';
    var subject = '【yawaragi欠席連絡】' + category + ' ' + name;
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, gmailBody);
  } catch (e) {}
}

// 2026-07-02: ④業務報告メール（送迎後などスタッフの業務報告を社長へ即時送信）
// 受信 {date, unit, staff, report}。report が空なら送信せずエラーを返す。
// 日付ラベルは _formatDateLabelForCmMail_ を流用し M月D日(曜) 形式にする。
function sendWorkReport_(data) {
  var report = data && data.report ? String(data.report).trim() : '';
  if (!report) {
    return { error: '業務報告が空です', success: false };
  }
  var date = data.date ? String(data.date) : '';
  var unit = data.unit ? String(data.unit) : '';
  var staff = data.staff ? String(data.staff) : '';
  var dateLabel = date ? _formatDateLabelForCmMail_(date) : '';

  var subject = '【yawaragi】' + (dateLabel ? dateLabel + ' ' : '') + '④業務報告'
    + (staff ? '（' + staff + '）' : '');

  var body = '';
  if (dateLabel) body += '日付: ' + dateLabel + '\n';
  if (unit) body += '単位: ' + unit + '\n';
  if (staff) body += '報告者: ' + staff + '\n';
  body += '\n';
  body += report + '\n';

  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body, { charset: 'UTF-8' });

  return { success: true };
}

// ============================================================
// ===== 中止管理（2026/4/10追加）=====
// ============================================================

// 中止登録
function registerTermination(ss, data) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet) return { error: '中止履歴シートがありません。setupSheets()を実行してください。', success: false };
  if (!data.name) return { error: '利用者名が必要です', success: false };
  if (!data.reason) return { error: '中止理由が必要です', success: false };
  if (!data.lastUseDate) return { error: '最終利用日が必要です', success: false };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var lastUseDate = data.lastUseDate;
  var terminateDate = lastUseDate;  // 中止日＝最終利用日（リハブクラウド仕様に合わせる）
  var contactDate = data.contactDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 利用者台帳のステータス列を「中止」に書き換え（変更前ステータスを保存）
  var prevStatus = updateUserStatus(ss, data.name, '中止');
  if (prevStatus === null) {
    return { error: '利用者台帳に「' + data.name + '」が見つかりません', success: false };
  }

  // 長期休み中だったら自動終了させる（中止日を再開日として記録）
  var longTermEnded = endLongTermAbsenceForUser(ss, data.name, terminateDate);

  // 中止履歴シートに記録（15列）
  sheet.appendRow([
    lastUseDate,        // A: 最終利用日
    terminateDate,      // B: 中止日（自動計算）
    contactDate,        // C: 連絡日
    data.name,          // D: 利用者名
    data.reason,        // E: 理由
    data.supplement || '', // F: 補足
    data.reporter || '',   // G: 受付者
    now,                // H: 登録日時
    prevStatus,         // I: 変更前ステータス
    '', '', '', '', '', ''  // J-O: リハブ作業6項目（空＝未完了）
  ]);

  // 社長にLINE+Gmail通知
  try {
    var msg = '【利用中止】\n';
    msg += data.name + '様\n';
    msg += '最終利用日: ' + fmtDateJP(lastUseDate) + '\n';
    msg += '中止日: ' + fmtDateJP(terminateDate) + '\n';
    msg += '連絡日: ' + fmtDateJP(contactDate) + '\n';
    msg += '理由: ' + data.reason + '\n';
    if (data.supplement) msg += '補足: ' + data.supplement + '\n';
    msg += '受付者: ' + (data.reporter || '未記入');
    if (longTermEnded) msg += '\n※長期休みも自動終了';
    sendLine(msg);
  } catch (e) {}

  return {
    success: true,
    message: data.name + '様の利用中止を登録しました',
    prevStatus: prevStatus,
    terminateDate: terminateDate,
    longTermEnded: longTermEnded
  };
}

// 中止登録時に呼ぶ: その利用者が長期休み中なら自動終了させる
// 「出欠変更」シートで type='長期休み' かつ 終了日(8列目)が空 の最新行を探して終了日をセット
function endLongTermAbsenceForUser(ss, userName, endDateStr) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return false;
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    var name = String(data[i][1] || '').trim();
    var type = String(data[i][3] || '').trim();
    var endCol = data[i][7] ? String(data[i][7]).trim() : '';
    if (name === userName && type === '長期休み' && !endCol) {
      sheet.getRange(i + 1, 8).setValue(endDateStr);
      return true;
    }
  }
  return false;
}

// 日付文字列(yyyy-MM-dd)に1日加算
function addOneDay(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 1);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

// 中止取消（履歴行を削除＋ステータスを元に戻す）
// 検索キー: 最終利用日 + 利用者名
function cancelTermination(ss, data) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet) return { error: '中止履歴シートがありません', success: false };
  if (!data.lastUseDate || !data.name) {
    return { error: '最終利用日と利用者名が必要です', success: false };
  }

  var allData = sheet.getDataRange().getValues();
  var deleted = 0;
  var restoreStatus = '利用中';  // デフォルト復元値

  // 後ろから検索して削除（行番号ずれ防止）
  for (var i = allData.length - 1; i >= 1; i--) {
    var lastUse = fmtDate(allData[i][0]);
    var name = String(allData[i][3] || '').trim();
    if (lastUse === data.lastUseDate && name === data.name) {
      // 変更前ステータスを取得（あれば復元用に使う）
      var prev = String(allData[i][8] || '').trim();
      if (prev) restoreStatus = prev;
      sheet.deleteRow(i + 1);
      deleted++;
      break;  // 1件だけ削除
    }
  }

  if (deleted === 0) {
    return { error: '該当する中止履歴が見つかりません', success: false };
  }

  // 利用者台帳のステータスを元に戻す
  updateUserStatus(ss, data.name, restoreStatus);

  // 社長に通知
  try {
    var msg = '【中止取消】\n';
    msg += data.name + '様\n';
    msg += '最終利用日: ' + fmtDateJP(data.lastUseDate) + '\n';
    msg += 'ステータスを「' + restoreStatus + '」に戻しました';
    sendLine(msg);
  } catch (e) {}

  return { success: true, message: data.name + '様の中止を取消しました', restoreStatus: restoreStatus };
}

// リハブクラウド作業チェックリストの更新
// 検索キー: 最終利用日 + 利用者名
function updateTerminateTask(ss, data) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet) return { error: '中止履歴シートがありません', success: false };
  if (!data.lastUseDate || !data.name || !data.task) {
    return { error: '最終利用日・利用者名・タスク名が必要です', success: false };
  }

  // 既存シートが14列構造ならO列を自動拡張（2026-05-20マイグレーション）
  _ensureCancelHistoryRihabChushiCol(sheet);

  // タスク名 → 列番号マッピング（15列構造）
  var taskColMap = {
    'tsusho': 10,        // J列: リハブ:通所計画書
    'kotraining': 11,    // K列: リハブ:個別機能訓練
    'koukou': 12,        // L列: リハブ:口腔機能向上
    'kagakuteki': 13,    // M列: リハブ:科学的介護推進
    'adl': 14,           // N列: リハブ:ADL維持等
    'rihab_chushi': 15   // O列: リハブ:利用中止操作（2026-05-20追加）
  };
  var col = taskColMap[data.task];
  if (!col) return { error: '不明なタスク名: ' + data.task, success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = allData.length - 1; i >= 1; i--) {
    var lastUse = fmtDate(allData[i][0]);
    var name = String(allData[i][3] || '').trim();
    if (lastUse === data.lastUseDate && name === data.name) {
      var newValue = '';
      if (data.checked) {
        newValue = '完了 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      }
      sheet.getRange(i + 1, col).setValue(newValue);
      return { success: true, value: newValue };
    }
  }

  return { error: '該当する中止履歴が見つかりません', success: false };
}

// 中止情報の編集（最終利用日・連絡日・受付・理由・補足）
// 検索キー: oldLastUseDate + name で行を特定 → A〜G列を更新
// 最終利用日変更時は A(最終利用日) と B(中止日) を同期
function updateTerminationInfo(ss, data) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet) return { error: '中止履歴シートがありません', success: false };
  if (!data.oldLastUseDate || !data.name) {
    return { error: '旧最終利用日と利用者名が必要です', success: false };
  }
  if (!data.lastUseDate) return { error: '最終利用日が必要です', success: false };
  if (!data.reason) return { error: '中止理由が必要です', success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = allData.length - 1; i >= 1; i--) {
    var lastUse = fmtDate(allData[i][0]);
    var name = String(allData[i][3] || '').trim();
    if (lastUse === data.oldLastUseDate && name === data.name) {
      var row = i + 1;
      sheet.getRange(row, 1).setValue(data.lastUseDate);
      sheet.getRange(row, 2).setValue(data.lastUseDate);
      sheet.getRange(row, 3).setValue(data.contactDate || '');
      sheet.getRange(row, 5).setValue(data.reason);
      sheet.getRange(row, 6).setValue(data.supplement || '');
      sheet.getRange(row, 7).setValue(data.reporter || '');
      return {
        success: true,
        message: data.name + '様の中止情報を更新しました',
        lastUseDate: data.lastUseDate
      };
    }
  }

  return { error: '該当する中止履歴が見つかりません', success: false };
}

// 「見学体験新規」シートから { 氏名: 本格利用開始日(yyyy-MM-dd) } のマップを作る
// 用途: 利用者台帳の「利用開始日」列が空欄の人を、契約準備フロー側の値で補完
// 同姓同名は最新の本格利用開始日で上書き（運用上稀なケース）
function _buildIntakeStartDateMap(ss) {
  var map = {};
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return map;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;
  var values = sheet.getRange(2, 1, lastRow - 1, INTAKE_HEADERS.length).getValues();
  var nameIdx = INTAKE_HEADERS.indexOf('氏名');
  var startIdx = INTAKE_HEADERS.indexOf('本格利用開始日');
  if (nameIdx < 0 || startIdx < 0) return map;
  for (var i = 0; i < values.length; i++) {
    var nm = String(values[i][nameIdx] || '').trim();
    if (!nm) continue;
    var v = values[i][startIdx];
    var s = '';
    if (v instanceof Date) {
      s = Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else {
      var raw = String(v || '').trim();
      var m = raw.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (m) s = m[1] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[3]).padStart(2,'0');
    }
    if (s) map[nm] = s;
  }
  return map;
}

// 中止履歴一覧を取得（period: '1m' / '3m' / 'all'）
// 14列構造: 最終利用日/中止日/連絡日/利用者名/理由/補足/受付者/登録日時/変更前/リハブ5項目
// 中止履歴シートにO列「リハブ:利用中止操作」が無ければ追加（マイグレーション・2026-05-20）
function _ensureCancelHistoryRihabChushiCol(sheet) {
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol < 15) {
    sheet.getRange(1, 15).setValue('リハブ:利用中止操作');
    sheet.setColumnWidth(15, 130);
    sheet.getRange(1, 15).setBackground('#c0392b').setFontColor('#ffffff').setFontWeight('bold');
  }
}

// 中止履歴シートから「利用者名 → 最新の中止日（yyyy-MM-dd）」マップを返す
// 取消は cancelTermination で行削除されるため、残っているレコード＝有効な中止
// 用途: 中止日より後の欠席登録・表示を除外する（2026-05-20追加）
function _getActiveCancelDateMap(ss) {
  var map = {};
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet || sheet.getLastRow() < 2) return map;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][3] || '').trim();  // D列: 利用者名
    var cancelDate = fmtDate(data[i][1]);         // B列: 中止日
    if (!name || !cancelDate) continue;
    if (!map[name] || cancelDate > map[name]) {
      map[name] = cancelDate;
    }
  }
  return map;
}

// フィルタは連絡日ベース（長期休みから中止になるパターンが多いため、連絡日が業務的に意味がある）
function getTerminations(ss, period) {
  var sheet = ss.getSheetByName('中止履歴');
  if (!sheet || sheet.getLastRow() < 2) return [];

  // 既存シートが14列構造ならO列を自動拡張（2026-05-20マイグレーション）
  _ensureCancelHistoryRihabChushiCol(sheet);

  var data = sheet.getDataRange().getValues();
  var list = [];

  // フィルタ用の閾値日付（連絡日ベース）
  var thresholdStr = '';
  if (period === '1m' || period === '3m') {
    var months = period === '1m' ? 1 : 3;
    var d = new Date();
    d.setMonth(d.getMonth() - months);
    thresholdStr = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  // 利用者台帳から名前→介護度マップを作成（ADLは要支援なら不要なので判定に使う）
  var careLevelMap = buildCareLevelMap(ss);

  for (var i = 1; i < data.length; i++) {
    var lastUseDate = fmtDate(data[i][0]);
    var terminateDate = fmtDate(data[i][1]);
    var contactDate = fmtDate(data[i][2]);
    if (!lastUseDate) continue;
    if (thresholdStr && contactDate && contactDate < thresholdStr) continue;

    var userName = String(data[i][3] || '').trim();

    list.push({
      lastUseDate: lastUseDate,
      terminateDate: terminateDate,
      contactDate: contactDate,
      name: userName,
      careLevel: careLevelMap[userName] || '',
      reason: String(data[i][4] || '').trim(),
      supplement: String(data[i][5] || '').trim(),
      reporter: String(data[i][6] || '').trim(),
      timestamp: String(data[i][7] || ''),
      prevStatus: String(data[i][8] || '').trim(),
      tasks: {
        tsusho: !!String(data[i][9] || '').trim(),
        kotraining: !!String(data[i][10] || '').trim(),
        koukou: !!String(data[i][11] || '').trim(),
        kagakuteki: !!String(data[i][12] || '').trim(),
        adl: !!String(data[i][13] || '').trim(),
        rihab_chushi: !!String(data[i][14] || '').trim()  // O列（2026-05-20追加）
      }
    });
  }

  // 中止日新しい順
  list.sort(function (a, b) { return b.terminateDate.localeCompare(a.terminateDate); });
  return list;
}

// =============================================================
// 中止・未完 digest（2026-07-07）
//   getTerminations の各中止レコードで「その人に該当するリハブ作業項目」が
//   1つでも未チェックなら未完として朝のダイジェストに出す。「終わるまで方式」＝
//   全該当項目が埋まった時だけ消える（時間経過では消さない）。
//   基準日=連絡日の翌月10日（国保連請求締め）を境に、締め前=通常／締め後=期限超過へ格上げ。
//   判定はフロント leave-terminate.html の trmRenderCard.allDone と同一（利用中止操作 rihab_chushi を含む）。
//   純関数4つは scripts/test-chushi-digest.js と同一実装（二重持ち・あちらが正本）。
// =============================================================
// --- 純関数（scripts/test-chushi-digest.js と同一実装・二重持ち）---
function chushiApplicableKeys_(careLevel) {
  var isShien = String(careLevel || '').indexOf('要支援') !== -1;
  return isShien
    ? ['tsusho', 'koukou', 'rihab_chushi', 'kagakuteki']
    : ['tsusho', 'kotraining', 'koukou', 'rihab_chushi', 'kagakuteki', 'adl'];
}
var CHUSHI_LABELS = {
  tsusho: '通所計画書',
  kotraining: '個別機能訓練計画書',
  koukou: '口腔機能向上計画書',
  rihab_chushi: '利用中止操作',
  kagakuteki: '科学的介護推進体制',
  adl: 'ADL維持等加算'
};
function chushiMissing_(careLevel, tasks) {
  var keys = chushiApplicableKeys_(careLevel);
  var t = tasks || {};
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    if (!t[keys[i]]) out.push(CHUSHI_LABELS[keys[i]]);
  }
  return out;
}
function chushiBaseDate_(contactDate) {
  var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(contactDate || ''));
  if (!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  mo += 1; if (mo > 12) { mo = 1; y += 1; }
  return y + '-' + (mo < 10 ? '0' + mo : '' + mo) + '-10';
}
function chushiDecision_(records, dateStr) {
  var today = String(dateStr).slice(0, 10);
  var pending = [], overdue = [];
  (records || []).forEach(function (r) {
    var missing = chushiMissing_(r.careLevel, r.tasks);
    if (missing.length === 0) return; // 全該当項目チェック済み → 消える
    var care = String(r.careLevel || '').indexOf('要支援') !== -1 ? '要支援' : '要介護';
    var base = chushiBaseDate_(r.contactDate);
    var isOver = base !== '' && today > base;
    var mm = /^\d{4}-(\d{2})-\d{2}$/.exec(String(r.terminateDate || ''));
    var cancelMonth = mm ? parseInt(mm[1], 10) : 0;
    var item = {
      name: r.name, care: care, missing: missing,
      cancelMonth: cancelMonth, terminateDate: String(r.terminateDate || '')
    };
    if (isOver) overdue.push(item); else pending.push(item);
  });
  overdue.sort(function (a, b) {
    return a.terminateDate < b.terminateDate ? -1 : a.terminateDate > b.terminateDate ? 1 : 0;
  });
  return { pending: pending, overdue: overdue, pendingCount: pending.length, overdueCount: overdue.length };
}
// --- morningDigest 用セクション（既存 getTerminations をそのまま流用）---
function _digestChushi_(ss, dateStr) {
  return chushiDecision_(getTerminations(ss, 'all'), dateStr);
}

// 利用者台帳から「名前→介護度」のマップを作成
function buildCareLevelMap(ss) {
  var map = {};
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return map;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return map;

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var careCol = findColP(h, '介護度');
  if (careCol < 0) careCol = findColP(h, '要介護');
  if (nameCol < 0 || careCol < 0) return map;

  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    var care = String(data[i][careCol] || '').trim();
    if (name) map[name] = care;
  }
  return map;
}

// 利用者台帳のステータス列を更新（変更前の値を返す。利用者が見つからない時はnullを返す）
function updateUserStatus(ss, userName, newStatus) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  // 「利用ステータス」を優先、次に「ステータス」、次に「利用状況」
  var statusCol = findCol(h, ['利用ステータス']);
  if (statusCol < 0) statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');

  if (nameCol < 0 || statusCol < 0) return null;

  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (name === userName) {
      var prev = String(data[i][statusCol] || '').trim();
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      return prev;
    }
  }
  return null;
}

// ============================================================
// ===== 伝達事項追加 =====
function addMessage(ss, data) {
  var sheet = ss.getSheetByName('伝達事項');
  if (!sheet) return { error: '伝達事項シートがありません', success: false };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var targetDate = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  sheet.appendRow([targetDate, data.content || '', data.author || '', now, '未対応']);
  return { success: true };
}

// ===== 伝達事項ステータス更新 =====
function updateMessageStatus(ss, data) {
  var sheet = ss.getSheetByName('伝達事項');
  if (!sheet) return { error: 'シートがありません', success: false };
  if (!data.row) return { error: '行番号が必要です', success: false };

  var validStatus = ['未対応', '対応中', '完了'];
  var newStatus = data.status || '完了';
  if (validStatus.indexOf(newStatus) < 0) {
    return { error: '無効なステータスです', success: false };
  }

  sheet.getRange(data.row, 5).setValue(newStatus);
  return { success: true, status: newStatus };
}

// ===== ユーティリティ =====
function getDayOfWeek(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
}

function fmtDate(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  var s = String(val || '').trim();
  var m = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  return s;
}

function fmtDateJP(dateStr) {
  var parts = dateStr.split('-');
  return parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
}

// 受付日時セルを 'yyyy-MM-dd HH:mm' 形式に正規化（2026-05-08二重申請防止用・Dateオブジェクト対応）
function fmtTimestamp(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  return String(val).trim();
}

function findCol(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (headers[i] === candidates[j]) return i;
    }
  }
  return -1;
}

function findColP(headers, keyword) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(keyword) >= 0) return i;
  }
  return -1;
}

function findColContains(headers, kw1, kw2) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(kw1) >= 0 && headers[i].indexOf(kw2) >= 0) return i;
  }
  return -1;
}

function respond(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================
// Drive移動エンドポイント moveDriveFile
//   ?action=moveDriveFile&token=XXXX&fileId=...&addParent=...[&removeParent=...][&newName=...]
//   純ロジック正本: gas/yawaragi-board/drive-move-core.js（同等の判定をここに内包）
//   設計書: docs/superpowers/specs/2026-06-15-Drive移動エンドポイント-design.md
// =============================================================

// --- 純ロジック（drive-move-core.js と同一・GASは単一ファイルのため内包）---
function dmStr_(v) {
  if (v === undefined || v === null) return null;
  var s = String(v).trim();
  return s.length ? s : null;
}
function dmParseMoveParams_(params) {
  if (!params || typeof params !== 'object') return { ok: false, error: 'no_params' };
  var fileId = dmStr_(params.fileId);
  var addParent = dmStr_(params.addParent);
  var removeParent = dmStr_(params.removeParent);
  var newName = dmStr_(params.newName);
  if (!fileId) return { ok: false, error: 'missing_param: fileId' };
  if (!addParent) return { ok: false, error: 'missing_param: addParent' };
  return { ok: true, value: { fileId: fileId, addParent: addParent, removeParent: removeParent, newName: newName } };
}
function dmDecideMoveActions_(current, req) {
  var parents = (current && current.parents) ? current.parents.slice() : [];
  var name = current ? current.name : null;
  var needAdd = parents.indexOf(req.addParent) === -1;
  var removeTargets;
  if (req.removeParent) {
    removeTargets = parents.indexOf(req.removeParent) !== -1 ? [req.removeParent] : [];
  } else {
    removeTargets = parents.filter(function (p) { return p !== req.addParent; });
  }
  var needRemove = removeTargets.length > 0;
  var needRename = !!req.newName && req.newName !== name;
  var alreadyThere = !needAdd && !needRemove && !needRename;
  return { needAdd: needAdd, needRemove: needRemove, removeTargets: removeTargets, needRename: needRename, alreadyThere: alreadyThere };
}
function dmVerifyMoveResult_(after, req) {
  var parents = (after && after.parents) ? after.parents : [];
  var name = after ? after.name : null;
  var reasons = [];
  if (parents.indexOf(req.addParent) === -1) reasons.push('addParent not in parents: ' + req.addParent);
  if (req.removeParent && parents.indexOf(req.removeParent) !== -1) reasons.push('removeParent still present: ' + req.removeParent);
  if (req.newName && name !== req.newName) reasons.push('name mismatch: expected ' + req.newName + ' got ' + name);
  return { ok: reasons.length === 0, reasons: reasons };
}

// --- DriveApp I/O: 現在の親IDの配列を取得 ---
function dmGetParentIds_(file) {
  var ids = [];
  var it = file.getParents();
  while (it.hasNext()) ids.push(it.next().getId());
  return ids;
}

// --- エントリ ---
function handleMoveDriveFile(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};

    // 1) token照合
    var expected = PropertiesService.getScriptProperties().getProperty('DRIVE_MOVE_TOKEN');
    if (!expected) return jsonResp({ ok: false, error: 'server_not_configured: DRIVE_MOVE_TOKEN' });
    if (dmStr_(params.token) !== expected) return jsonResp({ ok: false, error: 'unauthorized' });

    // 2) パラメータ検証
    var parsed = dmParseMoveParams_(params);
    if (!parsed.ok) return jsonResp({ ok: false, error: parsed.error });
    var req = parsed.value;

    // 3) ファイル取得
    var file;
    try {
      file = DriveApp.getFileById(req.fileId);
      file.getName(); // アクセス可否をここで確定させる
    } catch (e2) {
      return jsonResp({ ok: false, error: 'no_such_file' });
    }

    // 4) 現状取得 → 操作判定
    var current = { parents: dmGetParentIds_(file), name: file.getName() };
    var plan = dmDecideMoveActions_(current, req);

    // 5) 追加 → 除去（孤児化防止のため追加を先に）→ 改名
    if (plan.needAdd) DriveApp.getFolderById(req.addParent).addFile(file);
    if (plan.needRemove) {
      plan.removeTargets.forEach(function (pid) {
        DriveApp.getFolderById(pid).removeFile(file);
      });
    }
    if (plan.needRename) file.setName(req.newName);

    // 6) 読み直して実状態を検証
    var after = { parents: dmGetParentIds_(file), name: file.getName() };
    var verdict = dmVerifyMoveResult_(after, req);

    return jsonResp({
      ok: verdict.ok,
      id: req.fileId,
      name: after.name,
      parents: after.parents,
      addedTo: plan.needAdd ? req.addParent : null,
      removedFrom: plan.needRemove ? (req.removeParent ? req.removeParent : 'others') : null,
      renamed: plan.needRename,
      alreadyThere: plan.alreadyThere,
      reasons: verdict.reasons
    });
  } catch (err) {
    return jsonResp({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

// ============================================================
// 月次⑦（新規・終了・キャンセル）自動集計（2026-06-14）
// 経営ダッシュボード⑦の手入力ゼロ化用。読み取り専用。
// 純ロジックは monthly-shichi-core.js（同フォルダ・clasp pushで共有）に分離しテスト済み。
// 返戻(returback)はアプリ外（国保連）のため集計対象外＝null固定で人が後で埋める。
// 呼び出し: doGet ?action=monthlyShichi&ym=2026-05
// ============================================================
function getMonthlyShichi(ss, ym) {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) {
    return { success: false, error: 'ym は yyyy-MM 形式で指定してください（受信値: ' + ym + '）' };
  }

  // 新規: 見学体験新規シートの「本格利用開始日」が ym の利用者
  var newNames = [];
  var intake = ss.getSheetByName('見学体験新規');
  if (intake && intake.getLastRow() >= 2) {
    newNames = _countNewUsers_(
      intake.getDataRange().getValues(),
      INTAKE_COL['本格利用開始日'] - 1, // 0始まりへ
      INTAKE_COL['氏名'] - 1,
      ym
    );
  }

  // 新規（参考）: 利用者台帳の「利用開始日」が ym の利用者。
  // intake を通さず台帳直登録した人・開所初期の移行組も拾う網羅版。
  var newByLedger = [];
  var ledger = ss.getSheetByName('利用者台帳');
  if (ledger && ledger.getLastRow() >= 2) {
    var lv = ledger.getDataRange().getValues();
    var lh = lv[0].map(function (v) { return String(v).trim(); });
    var startIdx = findCol(lh, ['利用開始日', '利用開始']);
    var nameIdx = findCol(lh, ['名前', '氏名', '利用者名']);
    if (startIdx >= 0 && nameIdx >= 0) {
      newByLedger = _countNewUsers_(lv, startIdx, nameIdx, ym);
    }
  }

  // 終了: 中止履歴シート（中止日基準を主・連絡日基準を参考に併記）
  var term = { byTerminate: [], byContact: 0 };
  var chushi = ss.getSheetByName('中止履歴');
  if (chushi && chushi.getLastRow() >= 2) {
    term = _countTerminations_(chushi.getDataRange().getValues(), ym);
  }

  // キャンセル: 出欠変更シートの 種別='欠席' で ym の延べ件数（午前/午後別）
  var canc = { count: 0, byUser: {} };
  var att = ss.getSheetByName('出欠変更');
  if (att && att.getLastRow() >= 2) {
    canc = _countCancellations_(att.getDataRange().getValues(), ym);
  }

  return {
    success: true,
    ym: ym,
    newUsers: newByLedger.length,                  // ★主: 新規人数（利用者台帳の利用開始日が当月・社長確定2026-06-14）
    newUsersList: newByLedger,
    newUsersByIntake: newNames.length,             // 参考: 見学体験新規の本格利用開始日が当月（intake経由のみ）
    newUsersByIntakeList: newNames,
    terminations: term.byTerminate.length,         // 終了人数（中止日=最終利用日が当月）
    terminationsList: term.byTerminate,
    terminationsByContactDate: term.byContact,     // 参考: 連絡日が当月の件数（既存getTerminations基準）
    cancellations: canc.count,                     // キャンセル回数（欠席の延べ件数・1人1日1単位=1件）
    cancellationsByUser: canc.byUser,              // 参考: 利用者別内訳
    returback: null                                // 返戻はアプリ外（国保連）。人が後で入力する
  };
}

// ============================================================
// 朝報告 集約エンドポイント morningDigest（2026-06-03）
// 8項目を1JSONで返す。同一GAS内は関数直呼び、別アプリ2つ(getOps/getFurikae)のみUrlFetch。
// 純関数（isBizDay_ / sougeiOpsStatus_ / foldFurikaeByMonth_ / computeLongLeaveFlags_）は
// scripts/test-morning-digest.js に同一実装を二重持ちしテスト済み。
// ============================================================
var DIGEST_OPS_URL = SOUGEI_GAS_URL + '?action=getOps';
var DIGEST_FURIKAE_URL = 'https://script.google.com/macros/s/AKfycbwT5wX9EsPnE6tQEPMIAzojDfb6YpxthVxlkX7t7B2phfFKkV5btF5dkXEtjEQDwfgr7A/exec?action=getFurikae&t=now';

function morningDigest(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var dateStr = (e && e.parameter && e.parameter.date && /^\d{4}-\d{2}-\d{2}$/.test(e.parameter.date))
    ? e.parameter.date
    : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var ss = SpreadsheetApp.openById(SS_ID);
  var sections = {}, errors = [];
  function safe(name, fn) {
    try { sections[name] = fn(); }
    catch (err) { sections[name] = null; errors.push({ section: name, error: String((err && err.message) || err) }); }
  }

  // 最優先: 体験後フォロー（既存関数が追客フラグ付きで返す→そのまま）
  safe('intakeFollowup', function () {
    var r = getIntakeFollowupPending(ss);
    return { count: r.count || 0, pending: r.pending || [] };
  });
  // 外部アプリ: 送迎日誌（巨大ペイロードをstatusに圧縮）
  safe('sougeiOps', function () {
    var d = JSON.parse(UrlFetchApp.fetch(DIGEST_OPS_URL, { muteHttpExceptions: true }).getContentText());
    return { status: sougeiOpsStatus_(d, dateStr) };
  });
  // 外部アプリ: 振替不能（月別・未解決=回収済以外）
  safe('furikae', function () {
    var d = JSON.parse(UrlFetchApp.fetch(DIGEST_FURIKAE_URL, { muteHttpExceptions: true }).getContentText());
    return foldFurikaeByMonth_(d.records || []);
  });
  // 区変中（既存ハンドラ再利用・編集なし）
  safe('kubun', function () {
    var d = JSON.parse(handleKubunHenkouList({ parameter: {} }).getContent());
    var over30 = (d.active || []).filter(function (x) { return (x.daysOver || 0) >= 30; });
    return { count: d.count || 0, over30: over30 };
  });
  // 予約反映（既存ハンドラ再利用）
  safe('scheduled', function () {
    var d = JSON.parse(handleListScheduled({ parameter: {} }).getContent());
    return { count: d.count || 0, items: d.items || [] };
  });
  // 長期休み（生データ→digest側でフラグ計算）
  safe('longLeave', function () {
    var flagged = (getLongLeaveList(ss) || []).map(function (r) {
      return { name: r.name, flags: computeLongLeaveFlags_(r, dateStr), note: r.contactNote || '' };
    }).filter(function (r) { return r.flags.length > 0; });
    return { flagged: flagged };
  });
  // 個訓計画書 保留中（今月＋来月）
  safe('keikakushoBlocked', function () {
    var y = parseInt(dateStr.slice(0, 4), 10), m = parseInt(dateStr.slice(5, 7), 10);
    var nYm = _digestNextYm_(dateStr);
    var ny = parseInt(nYm.slice(0, 4), 10), nm = parseInt(nYm.slice(5, 7), 10);
    var tm = _getBlockedKeikakushoData_(y, m);
    var nx = _getBlockedKeikakushoData_(ny, nm);
    return {
      thisMonth: { count: tm.blockedCount, blocked: tm.blocked },
      nextMonth: { count: nx.blockedCount, blocked: nx.blocked }
    };
  });
  // 通所介護計画書 来月期限切れ
  safe('monitoringExpiring', function () {
    var nYm = _digestNextYm_(dateStr);
    var r = _getMonitoringPlanExpiring_(nYm);
    return { month: r.month, count: (r.users || []).length };
  });
  // 月次書類そろえ（ローカルチェッカーがPOSTした最新結果を読むだけ・無ければnull）
  safe('monthlyDocs', function () {
    return getMonthlyDocsReport_(ss);
  });
  // 残タスク＝伝達ボードの 宛先=社長 の未完了に一本化（旧pendingTasksから移行済み・2026-06-18）
  // 旧 getPendingTasks_（朝報告残タスクシート）は読まない＝二重計上を防ぐ。
  // pendingTasks キー名は morning-digest.ps1 互換のため維持（中身は伝達ボード由来）。
  safe('pendingTasks', function () {
    return { tasks: getDengonForOwner_(ss) };
  });
  // 個訓 ケアマネ未提出（計画書＝作成済み未送付／評価＝達成度実施済み未送付・2026-06-15）
  safe('keikakushoSoufu', function () {
    return getKeikakushoUnsubmitted_();
  });
  // シフト 公開リマインド（毎朝・終わるまで方式・月次自動再出現・2026-06-22）
  safe('shift', function () {
    return _digestShift_(ss, dateStr);
  });
  // 月次定例タスク（終わるまで方式・完了記録でのみ消える・2026-07-02）
  // 設計書: docs/superpowers/specs/2026-07-02-月次定例タスク-morningDigest統合-design.md (yawaragi-apps)
  safe('teirei', function () {
    return _digestTeirei_(ss, dateStr);
  });
  // 中止・未完（終わるまで方式・全該当項目チェックで消える・締め後は期限超過へ格上げ・2026-07-07）
  // 設計書: docs/superpowers/specs/2026-06-22 系（leave-terminate.html trmRenderCard.allDone と同一判定）
  safe('chushi', function () {
    return _digestChushi_(ss, dateStr);
  });

  return respond({
    ok: errors.length === 0,
    date: dateStr,
    isBusinessDay: isBizDay_(dateStr),
    sections: sections,
    errors: errors
  }, callback);
}

// ===== 月次書類そろえ（2026-06-10追加）=====
// ローカルチェッカー(scripts/monthly-docs-check.js --post)から受けた結果を
// シート「月次書類チェック」A1 にJSONで保存（save_haichi と同じ単一セル方式）。
function saveMonthlyDocsReport_(ss, data) {
  var sheet = ss.getSheetByName('月次書類チェック');
  if (!sheet) sheet = ss.insertSheet('月次書類チェック');
  var record = {
    checkDate: data.checkDate || '',
    okCount: data.okCount || 0,
    total: data.total || 0,
    summary: data.summary || '',
    missing: data.missing || [],
    sortPlan: data.sortPlan || [],
    receivedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
  sheet.getRange('A1').setValue(JSON.stringify(record));
  return { success: true, receivedAt: record.receivedAt };
}

// morningDigest 用：保存済みの最新チェック結果を返す。無ければ null。
function getMonthlyDocsReport_(ss) {
  var sheet = ss.getSheetByName('月次書類チェック');
  if (!sheet) return null;
  var raw = sheet.getRange('A1').getValue();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// ===== 朝報告「残タスク」リマインド（2026-06-14追加）=====
// 設計書: docs/superpowers/specs/2026-06-14-朝報告残タスクリマインド-design.md
// シート「朝報告残タスク」固定列: 0=id,1=title,2=status,3=done,4=createdAt,5=doneAt,6=note
var PENDING_TASKS_SHEET = '朝報告残タスク';
var PT_COL = { ID: 0, TITLE: 1, STATUS: 2, DONE: 3, CREATED: 4, DONEAT: 5, NOTE: 6 };
var PENDING_TASKS_HEADER = ['id', 'title', 'status', 'done', 'createdAt', 'doneAt', 'note'];
// 初期シード（既存idはスキップ＝冪等）
var PENDING_TASKS_SEED = [
  {
    id: 'nyukin-dashboard',
    title: '🔴 入金管理ダッシュボード（返戻側）未実装',
    status: '未着手',
    createdAt: '2026-06-14',
    note: '設計確定済み（取りこぼし集中／PDF自動＋手入力保険／4段階ステータス／返戻・引落を朝報告で監視）'
  },
  {
    id: 'furikae-kaizen',
    title: '🔴 振替不能アプリ改修＋繰越確認',
    status: '未着手',
    createdAt: '2026-06-14',
    note: '未回収サマリー最上段／表2段階／放置アラート＋「4月の未回収者が5月画面に繰り越されるか」要確認'
  },
  {
    id: 'tanka-chosa',
    title: '🔴 東松山市の総合事業/介護予防の正確な単価を調べる（返戻金額を概算→正確化）',
    status: '未着手',
    createdAt: '2026-06-14',
    note: '入金管理ダッシュボードの返戻金額はPhase1で概算表示。単位数は一次情報として保持済みなので、正確な単価が判明したら掛け直すだけで正確化できる。出所候補＝市の総合事業の手引き／運営推進会議資料。6級地。'
  },
  {
    id: 'kobetsu-phase1-verify',
    title: '🟡 個別機能訓練計画書チェックPhase1 実装完了・社長のiPad実機確認待ち',
    status: '実機確認待ち',
    createdAt: '2026-06-15',
    note: 'GAS @252／GitHub Pages反映済。確認＝計画/評価2列表示・計画セルの測定/出力/提出入力・評価の達成度入力・測定者プルダウン8名・📮ケアマネ未提出ビュー。OKなら completePendingTask&id=kobetsu-phase1-verify で解除。'
  },
  {
    id: 'hyouka-soufu-bunki',
    title: '🟡 評価の送付方法 自動出し分け 実装（_getCaremaneSendMethodMap_ を案Bで作り直し→個訓＋口腔 共通正確版／利用者台帳に送付方法上書き列／評価出力ボタン出し分け）',
    status: '未着手',
    createdAt: '2026-06-17',
    note: '送付用居宅一覧の送付方法列を正本に、利用者台帳の(cmOffice+cmName)で結合しメール/FAX→PDF・持参/郵送→印刷を導出。混在2事業所(わかばの丘/総合福祉エリア)はcmName併用・未登録(ライフ居宅)はPDFフォールバック。利用者単位の上書き列を新設(override優先)。評価セルの出力ボタンをsendMethodで出し分け。完了は completePendingTask&id=hyouka-soufu-bunki で解除。'
  },
  {
    id: 'gas-source-git-sync',
    title: '🟡 GASソースのgit同期（本番↔リポジトリのズレ解消・次回GAS作業の着手前に必須）',
    status: '未着手',
    createdAt: '2026-06-18',
    note: '本番 yawaragi-board GAS の getAppRegistry 一本化改修が本番のみ反映＝my-projectリポジトリ未コミット。加えて正本work の コード.js に別セッションの286行WIPが同居。この2つ（本番GAS↔リポジトリのズレ／正本work分岐）をセットで解消する。厳守(#20)＝本番を clasp pull した土台で作業／push前後でSHA一致を実測／worktree隔離(C:\\tmp\\配下)。優先：中。完了は completePendingTask&id=gas-source-git-sync で解除。'
  }
];

// --- 純関数（scripts/test-pending-tasks.js と同一実装・二重持ち）---
// チェックボックス/文字列いずれの「完了」表現も真偽に正規化。
function isDone_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined || v === '') return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === '✓';
}
// getValues()（ヘッダ含む2次元配列）を受け、done=FALSE かつ id非空の行だけ返す。
function filterPendingTasks_(values) {
  var out = [];
  if (!values || values.length < 2) return out;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(row[PT_COL.ID] || '').trim();
    if (!id) continue;
    if (isDone_(row[PT_COL.DONE])) continue;
    out.push({
      id: id,
      title: String(row[PT_COL.TITLE] || ''),
      status: String(row[PT_COL.STATUS] || ''),
      note: String(row[PT_COL.NOTE] || '')
    });
  }
  return out;
}
// id 一致行の values 内インデックス（ヘッダ行0は除外）。無ければ -1。
function findTaskRowIndex_(values, id) {
  var target = String(id || '').trim();
  if (!target || !values) return -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][PT_COL.ID] || '').trim() === target) return i;
  }
  return -1;
}

// --- I/O（GAS固有）---
// 朝報告用：未完了タスクを返す。読み取り専用（シート無ければ空配列）。
function getPendingTasks_(ss) {
  var sheet = ss.getSheetByName(PENDING_TASKS_SHEET);
  if (!sheet) return [];
  return filterPendingTasks_(sheet.getDataRange().getValues());
}

// 初期セットアップ：シート作成＋ヘッダ＋D列チェックボックス＋シード（既存idスキップ・冪等）。
function setupPendingTasks_(ss) {
  var sheet = ss.getSheetByName(PENDING_TASKS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PENDING_TASKS_SHEET);
    sheet.getRange(1, 1, 1, PENDING_TASKS_HEADER.length).setValues([PENDING_TASKS_HEADER]);
    sheet.getRange(1, 1, 1, PENDING_TASKS_HEADER.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  var values = sheet.getDataRange().getValues();
  var added = [];
  PENDING_TASKS_SEED.forEach(function (t) {
    if (findTaskRowIndex_(values, t.id) !== -1) return; // 既存はスキップ＝冪等
    sheet.appendRow([t.id, t.title, t.status, false, t.createdAt, '', t.note]);
    added.push(t.id);
  });
  // D列（done）をチェックボックスに（データ行ぶん・毎回張り直しでも害なし）
  var last = sheet.getLastRow();
  if (last >= 2) {
    sheet.getRange(2, PT_COL.DONE + 1, last - 1, 1).insertCheckboxes();
  }
  return { ok: true, sheet: PENDING_TASKS_SHEET, added: added, totalRows: Math.max(0, last - 1) };
}

// 完了アクション：冪等／id無効は明示／書込後に読み直して検証。成功したフリをしない。
function completePendingTaskAction_(ss, id) {
  var taskId = String(id || '').trim();
  if (!taskId) return { ok: false, error: 'missing_id' };
  var sheet = ss.getSheetByName(PENDING_TASKS_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet', id: taskId };
  var values = sheet.getDataRange().getValues();
  var idx = findTaskRowIndex_(values, taskId); // values内インデックス
  if (idx === -1) return { ok: false, error: 'no_such_id', id: taskId };

  var rowNum = idx + 1; // 1-based 行番号
  var alreadyDone = isDone_(values[idx][PT_COL.DONE]);
  // 冪等：既にTRUEでもTRUEを書く（壊さない）。完了日は未記入なら今日を刻む。
  sheet.getRange(rowNum, PT_COL.DONE + 1).setValue(true);
  if (!String(values[idx][PT_COL.DONEAT] || '').trim()) {
    sheet.getRange(rowNum, PT_COL.DONEAT + 1)
      .setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
  }
  SpreadsheetApp.flush();
  // 検証：書いたセルを読み直し、TRUE を確認できた時だけ verified:true
  var after = sheet.getRange(rowNum, PT_COL.DONE + 1).getValue();
  if (!isDone_(after)) {
    return { ok: false, error: 'verify_failed', id: taskId, verified: false };
  }
  return { ok: true, id: taskId, completed: true, alreadyDone: alreadyDone, verified: true };
}

// =============================================================
// シフト 公開リマインド（毎朝・終わるまで方式・月次自動再出現）2026-06-22
//   日付が過ぎたら消す方式は廃止。完了するまで毎朝出し続け、社長が完了に
//   した時だけ消す。月次なので完了後は翌月15日にまた自動で出る。
//   - 表示条件: その月の day>=15 かつ 当月未完了。文言は日付バンドで変える。
//   - 完了の入口: completeShift（社長「シフト公開した」）→ doneMonth=当月。
//   - 保険: シート「シフト公開状況」B列 manualDone チェックボックス（既存残タスクと同じ作り）。
//   純関数は scripts/test-shift-digest.js と同一実装（二重持ち・TDD）。
// =============================================================
var SHIFT_STATE_SHEET = 'シフト公開状況';
var SHIFT_COL = { DONE_MONTH: 0, MANUAL_DONE: 1, UPDATED_AT: 2 };
var SHIFT_STATE_HEADER = ['doneMonth', 'manualDone', 'updatedAt'];

// --- 純関数（テストと二重持ち）---
// 日付(1-31)→バンド。15未満はシーズン外（出さない）。
function shiftBand_(day) {
  if (day >= 15 && day <= 19) return 'collecting';
  if (day >= 20 && day <= 24) return 'creating';
  if (day === 25) return 'publish';
  if (day >= 26) return 'overdue';
  return 'idle';
}
// バンド→{level,label}。label はマーク無しの本文（描画側で [!]/[!!] や 📋/⚠️ を付ける）。
function shiftLabelInfo_(band) {
  switch (band) {
    case 'collecting': return { level: 'info', label: 'シフト希望 集め中（20日〆切）。全員分そろってる？' };
    case 'creating': return { level: 'info', label: 'シフト作成中（25日公開）。全員分そろった？' };
    case 'publish': return { level: 'info', label: '本日シフト公開日。未完成なら今日仕上げる' };
    case 'overdue': return { level: 'warn', label: 'シフト未公開（公開予定25日 超過）。至急仕上げて公開' };
    default: return { level: 'none', label: '' };
  }
}
// 完了状態の判定＋月次セルフヒール指示を純粋に計算。
//   doneMonthCell: A列文字列(YYYY-MM or '')、manualDoneCell: B列(チェックボックス真偽)
//   heal: I/O層が「シフト公開状況」シートに書くべき内容（不要ならnull）
//   ※消滅条件は date ではなく「当月完了したか」。日付は文言の出し分けにのみ使う。
function shiftDecision_(dateStr, doneMonthCell, manualDoneCell) {
  var day = parseInt(String(dateStr).slice(8, 10), 10);
  var currentMonth = String(dateStr).slice(0, 7);
  var storedMonth = String(doneMonthCell || '').trim();
  var manual = isDone_(manualDoneCell);
  var doneThisMonth = false;
  var heal = null;

  if (manual) {
    if (storedMonth === '') {
      // 社長がD(manualDone)を手でONにした初回→今月に紐付け（保険側を当月にバインド）
      doneThisMonth = true;
      heal = { doneMonth: currentMonth, manualDone: true };
    } else if (storedMonth === currentMonth) {
      doneThisMonth = true; // 今月チェック済み
    } else {
      // 月跨ぎ：先月の手動チェックをリセット→翌月また自動出現
      doneThisMonth = false;
      heal = { doneMonth: '', manualDone: false };
    }
  } else {
    // 手動OFF：完了は completeShift が書いた doneMonth で判定
    doneThisMonth = (storedMonth === currentMonth);
    // 先月の doneMonth が残っていても当月扱いにはならない＝自動再出現（古い値は無害なので消さない）。
  }

  var band = shiftBand_(day);
  var info = shiftLabelInfo_(band);
  var show = (day >= 15) && (band !== 'idle') && !doneThisMonth;
  return {
    day: day,
    currentMonth: currentMonth,
    band: band,
    level: info.level,
    label: info.label,
    doneThisMonth: doneThisMonth,
    show: show,
    heal: heal
  };
}

// --- I/O（GAS固有・「シフト公開状況」シートのみ触る）---
// 状態を読む（シート未作成なら未完了扱いで返す）。読み取り専用。
function readShiftState_(ss) {
  var sheet = ss.getSheetByName(SHIFT_STATE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { doneMonth: '', manualDone: false, exists: !!sheet };
  var v = sheet.getRange(2, 1, 1, SHIFT_STATE_HEADER.length).getValues()[0];
  return {
    doneMonth: String(v[SHIFT_COL.DONE_MONTH] || '').trim(),
    manualDone: v[SHIFT_COL.MANUAL_DONE],
    exists: true
  };
}
// heal を適用（このシートのみ・冪等）。digest が止まらないよう呼び出し側で try する。
function applyShiftHeal_(ss, heal) {
  if (!heal) return;
  var sheet = ss.getSheetByName(SHIFT_STATE_SHEET);
  if (!sheet) return;
  if (heal.doneMonth !== undefined) sheet.getRange(2, SHIFT_COL.DONE_MONTH + 1).setValue(heal.doneMonth);
  if (heal.manualDone !== undefined) sheet.getRange(2, SHIFT_COL.MANUAL_DONE + 1).setValue(heal.manualDone);
  sheet.getRange(2, SHIFT_COL.UPDATED_AT + 1)
    .setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'));
  SpreadsheetApp.flush();
}
// morningDigest 用 shift セクション。月跨ぎ等の self-heal は新シートのみへ・失敗してもdigestは止めない。
function _digestShift_(ss, dateStr) {
  var st = readShiftState_(ss);
  var d = shiftDecision_(dateStr, st.doneMonth, st.manualDone);
  if (d.heal) { try { applyShiftHeal_(ss, d.heal); } catch (e) { } }
  return { show: d.show, band: d.band, level: d.level, label: d.label, day: d.day, doneThisMonth: d.doneThisMonth, month: d.currentMonth };
}

// 初期セットアップ：シート作成＋ヘッダ＋空1行＋B列チェックボックス（冪等）。
function setupShiftState_(ss) {
  var sheet = ss.getSheetByName(SHIFT_STATE_SHEET);
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet(SHIFT_STATE_SHEET);
    sheet.getRange(1, 1, 1, SHIFT_STATE_HEADER.length).setValues([SHIFT_STATE_HEADER]);
    sheet.getRange(1, 1, 1, SHIFT_STATE_HEADER.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    created = true;
  }
  if (sheet.getLastRow() < 2) sheet.getRange(2, 1, 1, SHIFT_STATE_HEADER.length).setValues([['', false, '']]);
  sheet.getRange(2, SHIFT_COL.MANUAL_DONE + 1).insertCheckboxes();
  return { ok: true, sheet: SHIFT_STATE_SHEET, created: created };
}

// 完了アクション（社長「シフト公開した」）：当月を doneMonth に刻む・冪等・書込後に読み直し検証。
function completeShiftAction_(ss, dateStr) {
  var month = String(dateStr).slice(0, 7);
  var sheet = ss.getSheetByName(SHIFT_STATE_SHEET);
  if (!sheet) { setupShiftState_(ss); sheet = ss.getSheetByName(SHIFT_STATE_SHEET); }
  var before = String(sheet.getRange(2, SHIFT_COL.DONE_MONTH + 1).getValue() || '').trim();
  var alreadyDone = (before === month);
  sheet.getRange(2, SHIFT_COL.DONE_MONTH + 1).setValue(month);
  sheet.getRange(2, SHIFT_COL.UPDATED_AT + 1)
    .setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'));
  SpreadsheetApp.flush();
  var after = String(sheet.getRange(2, SHIFT_COL.DONE_MONTH + 1).getValue() || '').trim();
  if (after !== month) return { ok: false, error: 'verify_failed', month: month, verified: false };
  return { ok: true, completed: true, month: month, alreadyDone: alreadyDone, verified: true };
}

// 状態確認アクション（テスト・デバッグ用）：read-only（healしない＝観測を汚さない）。
function shiftStatusAction_(ss, dateStr) {
  var st = readShiftState_(ss);
  var d = shiftDecision_(dateStr, st.doneMonth, st.manualDone);
  return { ok: true, date: dateStr, show: d.show, band: d.band, level: d.level, label: d.label, doneThisMonth: d.doneThisMonth, state: st };
}

// 状態リセット（テスト後の現状復帰・手動誤操作の戻し用）。
function resetShiftStateAction_(ss) {
  var sheet = ss.getSheetByName(SHIFT_STATE_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet' };
  sheet.getRange(2, SHIFT_COL.DONE_MONTH + 1).setValue('');
  sheet.getRange(2, SHIFT_COL.MANUAL_DONE + 1).setValue(false);
  sheet.getRange(2, SHIFT_COL.UPDATED_AT + 1)
    .setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'));
  SpreadsheetApp.flush();
  return { ok: true, reset: true };
}

// =============================================================
// 月次定例タスク リマインド（2026-07-02）
//   シフト公開リマインドの一般化: マスタ＋完了記録(taskId×YYYY-MM)の2シートを
//   表示時に動的判定（トリガーレス）。「終わるまで方式」＝日付経過で消えない・
//   完了記録の行が書かれた時だけ消え、翌月また自動で出る。
//   純関数3つは scripts/test-teirei-tasks.js と同一実装（二重持ち・あちらが正本）。
// =============================================================
var TEIREI_MASTER_SHEET = '定例タスクマスタ';
var TEIREI_MASTER_HEADER = ['id', 'title', 'freq', 'months', 'startDay', 'dueDay', 'source', 'dest', 'note', 'enabled'];
var TEIREI_DONE_SHEET = '定例タスク完了記録';
var TEIREI_DONE_HEADER = ['taskId', 'month', 'doneAt', 'by', 'note'];
// 初期シード（設計書§8確定版・既存idはスキップ＝冪等）
var TEIREI_SEED = [
  { id: 'kokuhoren-densou', title: '国保連請求確定→けあ蔵伝送（10日17:00・受付完了まで確認）', freq: 'monthly', months: '', startDay: 1, dueDay: 10, source: 'リハブ 国保連請求管理→けあ蔵 伝送ファイル登録', dest: 'Drive 請求業務証跡', note: '国保連最終は10日24:00（最後の砦）。11日以降リハブ変更不可' },
  { id: 'kinmu-csv', title: 'タスクマン（朝野さん）へ勤務実績CSV送付', freq: 'monthly', months: '', startDay: 1, dueDay: 10, source: 'ケアズ CSVエクスポート', dest: 'ChatWork', note: '研修時間は勤務時間へ手加算・有給残なしの休みは欠勤登録' },
  { id: 'densan-furikae', title: '電算 口座振替7ステップ（結果DL→リハブ取込→請求書→全銀出力→UP）', freq: 'monthly', months: '', startDay: 10, dueDay: 17, source: '電算 DSK口座振替サービス＋リハブ 利用者請求', dest: 'Drive 請求業務証跡', note: '正確な締切=振替日の8営業日前正午（reference_電算スケジュール2026.md・朝の報告が毎朝明示）。入金明細DL=①結果データDLに含む（2026-07-02判定）' },
  { id: 'carezou-tsuchisho', title: 'けあ蔵: 支払決定額通知書・内訳書DL', freq: 'monthly', months: '', startDay: 20, dueDay: 25, source: 'けあ蔵 国保伝送メニュー→通知文書（配信20〜23日）', dest: 'Drive 経理・月次書類\\{年}年{月}月分\\', note: 'アシタエ⑦⑧-1⑧-2の元データ' },
  { id: 'carezou-shoguu', title: 'けあ蔵: 処遇改善加算等お知らせDL→社労士（朝野さん）転送', freq: 'monthly', months: '', startDay: 20, dueDay: 25, source: 'けあ蔵（配信21〜23日頃・実績 R8年4月審査分=5/21）', dest: 'Drive 社労士提出用_YYYYMM', note: '社長回答2026-07-02: ⚠は25日までに未完なら（21日固定にしない）' },
  { id: 'ashitae-package', title: 'アシタエ12ファイル（前月サービス分）をChatWorkで送付', freq: 'monthly', months: '', startDay: 20, dueDay: 25, source: 'Drive 月別フォルダ（対応表=請求フロー_月次チェックリスト_v4.md）', dest: 'ChatWork 篠崎彰人先生ルーム', note: '領収書3区分は含めない（四半期の別タスク）' },
  { id: 'ryoshusho-3kubun', title: '領収書3区分（現金/クレカ/通帳）の原本を四半期分まとめて提出', freq: 'quarterly', months: '1,4,7,10', startDay: 1, dueDay: 25, source: '領収書原本（3ヶ月分）', dest: 'アシタエへ郵送/手渡し', note: '提出月は仮確定（2026-07-02）。違っていれば months を修正' }
];

// --- 純関数（scripts/test-teirei-tasks.js と同一実装・二重持ち）---
function teireiAppliesToMonth_(task, ym) {
  var freq = String(task.freq || 'monthly');
  if (freq === 'monthly') return true;
  var m = parseInt(String(ym).slice(5, 7), 10);
  var months = String(task.months || '').split(',')
    .map(function (s) { return parseInt(s, 10); })
    .filter(function (n) { return !isNaN(n); });
  if (!months.length) return false; // quarterly/yearly で months 未指定は出さない（設定ミスを黙って毎月出すより安全）
  return months.indexOf(m) !== -1;
}
function teireiUrgency_(startDay, dueDay, day) {
  if (day < startDay) return 'hidden';
  if (day > dueDay) return 'overdue';
  if (dueDay - day <= 3) return 'warn';
  return 'normal';
}
function teireiDecision_(tasks, doneKeys, dateStr) {
  var ym = String(dateStr).slice(0, 7);
  var day = parseInt(String(dateStr).slice(8, 10), 10);
  var out = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!teireiAppliesToMonth_(t, ym)) continue;
    var done = doneKeys.indexOf(t.id + '|' + ym) !== -1;
    var urgency = teireiUrgency_(t.startDay, t.dueDay, day);
    out.push({
      id: t.id, title: t.title, startDay: t.startDay, dueDay: t.dueDay,
      source: t.source || '', dest: t.dest || '', note: t.note || '',
      done: done, urgency: urgency,
      show: (!done && urgency !== 'hidden') // 「終わるまで方式」: 消えるのは done の時だけ。overdue でも出す。
    });
  }
  out.sort(function (a, b) { return (a.dueDay - b.dueDay) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  return out;
}

// --- I/O（GAS固有）---
// month セルは日付型に化けることがある（シートの自動解釈）→ 'yyyy-MM' 文字列へ正規化。
function teireiMonthKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
}
// マスタを読む（enabled=TRUE の行だけ）。シート無し/空は []。
function readTeireiMaster_(ss) {
  var sheet = ss.getSheetByName(TEIREI_MASTER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var id = String(r[0] || '').trim();
    if (!id) continue;
    if (!isDone_(r[9])) continue; // enabled（isDone_ はチェックボックス/文字列を真偽正規化する既存関数）
    out.push({
      id: id, title: String(r[1] || ''), freq: String(r[2] || 'monthly'), months: String(r[3] || ''),
      startDay: parseInt(r[4], 10) || 1, dueDay: parseInt(r[5], 10) || 28,
      source: String(r[6] || ''), dest: String(r[7] || ''), note: String(r[8] || '')
    });
  }
  return out;
}
// 完了記録を 'taskId|yyyy-MM' キー配列で読む。シート無しは []。
function readTeireiDoneKeys_(ss) {
  var sheet = ss.getSheetByName(TEIREI_DONE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    var month = teireiMonthKey_(values[i][1]);
    if (id && month) out.push(id + '|' + month);
  }
  return out;
}
// morningDigest 用セクション（show=true のみ・dueDay 昇順）。
function _digestTeirei_(ss, dateStr) {
  var all = teireiDecision_(readTeireiMaster_(ss), readTeireiDoneKeys_(ss), dateStr);
  var tasks = all.filter(function (t) { return t.show; });
  var overdue = 0;
  tasks.forEach(function (t) { if (t.urgency === 'overdue') overdue++; });
  return {
    month: String(dateStr).slice(0, 7),
    count: tasks.length,
    overdueCount: overdue,
    tasks: tasks.map(function (t) {
      return { id: t.id, title: t.title, dueDay: t.dueDay, urgency: t.urgency, source: t.source, dest: t.dest };
    })
  };
}
// 一覧アクション（UI用・hidden/done 含む全件）。
function teireiListAction_(ss, dateStr) {
  return {
    ok: true, date: dateStr, month: String(dateStr).slice(0, 7),
    tasks: teireiDecision_(readTeireiMaster_(ss), readTeireiDoneKeys_(ss), dateStr)
  };
}
// 初期セットアップ：2シート作成＋ヘッダ＋シード（既存idスキップ＝冪等）＋enabled列チェックボックス＋month列を文字列書式に。
function setupTeireiSheets_(ss) {
  var master = ss.getSheetByName(TEIREI_MASTER_SHEET);
  if (!master) {
    master = ss.insertSheet(TEIREI_MASTER_SHEET);
    master.getRange(1, 1, 1, TEIREI_MASTER_HEADER.length).setValues([TEIREI_MASTER_HEADER]);
    master.getRange(1, 1, 1, TEIREI_MASTER_HEADER.length).setFontWeight('bold');
    master.setFrozenRows(1);
  }
  var values = master.getDataRange().getValues();
  var existing = {};
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    if (id) existing[id] = true;
  }
  var added = [];
  TEIREI_SEED.forEach(function (t) {
    if (existing[t.id]) return;
    master.appendRow([t.id, t.title, t.freq, t.months, t.startDay, t.dueDay, t.source, t.dest, t.note, true]);
    added.push(t.id);
  });
  var last = master.getLastRow();
  if (last >= 2) master.getRange(2, 10, last - 1, 1).insertCheckboxes(); // enabled 列
  var done = ss.getSheetByName(TEIREI_DONE_SHEET);
  var doneCreated = false;
  if (!done) {
    done = ss.insertSheet(TEIREI_DONE_SHEET);
    done.getRange(1, 1, 1, TEIREI_DONE_HEADER.length).setValues([TEIREI_DONE_HEADER]);
    done.getRange(1, 1, 1, TEIREI_DONE_HEADER.length).setFontWeight('bold');
    done.setFrozenRows(1);
    doneCreated = true;
  }
  done.getRange('B:B').setNumberFormat('@'); // month を '2026-07' のまま保持（日付化防止）
  return { ok: true, master: TEIREI_MASTER_SHEET, done: TEIREI_DONE_SHEET, added: added, doneCreated: doneCreated };
}
// 完了アクション：冪等／id無効は明示／書込後に読み直して検証。成功したフリをしない。
function completeTeireiAction_(ss, id, month, note) {
  var taskId = String(id || '').trim();
  if (!taskId) return { ok: false, error: 'missing_id' };
  var ym = String(month || '').trim() || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: 'bad_month', month: ym };
  var known = readTeireiMaster_(ss).some(function (t) { return t.id === taskId; });
  if (!known) return { ok: false, error: 'no_such_id', id: taskId };
  var sheet = ss.getSheetByName(TEIREI_DONE_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet' };
  if (readTeireiDoneKeys_(ss).indexOf(taskId + '|' + ym) !== -1) {
    return { ok: true, id: taskId, month: ym, completed: true, alreadyDone: true, verified: true };
  }
  sheet.appendRow([taskId, ym, Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), 'api', String(note || '')]);
  SpreadsheetApp.flush();
  if (readTeireiDoneKeys_(ss).indexOf(taskId + '|' + ym) === -1) {
    return { ok: false, error: 'verify_failed', id: taskId, month: ym, verified: false };
  }
  return { ok: true, id: taskId, month: ym, completed: true, alreadyDone: false, verified: true };
}
// 完了取消（誤操作の戻し）：該当行を削除→読み直しで消えたことを検証。
function uncompleteTeireiAction_(ss, id, month) {
  var taskId = String(id || '').trim();
  var ym = String(month || '').trim() || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  if (!taskId) return { ok: false, error: 'missing_id' };
  var sheet = ss.getSheetByName(TEIREI_DONE_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet' };
  var values = sheet.getDataRange().getValues();
  var rowNum = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === taskId && teireiMonthKey_(values[i][1]) === ym) { rowNum = i + 1; break; }
  }
  if (rowNum === -1) return { ok: false, error: 'no_such_record', id: taskId, month: ym };
  sheet.deleteRow(rowNum);
  SpreadsheetApp.flush();
  if (readTeireiDoneKeys_(ss).indexOf(taskId + '|' + ym) !== -1) {
    return { ok: false, error: 'verify_failed', id: taskId, month: ym, verified: false };
  }
  return { ok: true, id: taskId, month: ym, uncompleted: true, verified: true };
}

// date パラメータ（省略時は Asia/Tokyo の今日）。completeShift/shiftStatus 用。
function _shiftDateParam_(e) {
  return (e && e.parameter && e.parameter.date && /^\d{4}-\d{2}-\d{2}$/.test(e.parameter.date))
    ? e.parameter.date
    : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// "YYYY-MM-DD" → 翌月の "YYYY-MM"
function _digestNextYm_(dateStr) {
  var y = parseInt(dateStr.slice(0, 4), 10), m = parseInt(dateStr.slice(5, 7), 10);
  var ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return ny + '-' + ('0' + nm).slice(-2);
}

// 個訓計画書 保留中データ（getBlockedKeikakushoCount アクションから切り出し・挙動不変）
function _getBlockedKeikakushoData_(year, month) {
  var sheet = ensureKeikakushoSheet_();
  var values = sheet.getDataRange().getValues();
  var blocked = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (parseInt(row[2], 10) !== year) continue;
    if (parseInt(row[3], 10) !== month) continue;
    var reason = String(row[8] || '').trim();
    if (!reason) continue;
    blocked.push({ userId: String(row[0] || ''), name: String(row[1] || ''), reason: reason });
  }
  return { blockedCount: blocked.length, blocked: blocked };
}

// 個訓 ケアマネ未提出（2026-06-15 個訓Phase1 / カットオフ追加）
// 純ロジック正本: scripts/lib/kobetsu-soufu-core.js judgeUnsubmitted と同一ルール
//   計画書未提出 = keikaku_date(col7)有 かつ keikaku_sent_date(col12)空
//   評価未提出   = tasseido_date(col16)有 かつ hyouka_pdf(col10)・hyouka_print(col11)両方空
//   ※カットオフ: keikaku_date/tasseido_date が KEIKAKUSHO_SOUFU_CUTOFF 以降のものだけ対象
//     （過去バックログは朝報・未提出ビュー両方から除外。シートのデータは消さない）。
// カットオフ日はここ1箇所で管理。
var KEIKAKUSHO_SOUFU_CUTOFF = '2026-06-15';
function getKeikakushoUnsubmitted_() {
  function _has(v) { return !!(v && String(v).trim()); }
  // 日付セルはDate型/文字列いずれもありうるのでISO(yyyy-MM-dd)へ正規化（getKeikakushoYearのfmtDate_と同等）
  function _iso(v) {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    return String(v).trim().slice(0, 10);
  }
  function _onOrAfter(v) { var d = _iso(v); return d && d >= KEIKAKUSHO_SOUFU_CUTOFF; }
  var sheet = ensureKeikakushoSheet_();
  var values = sheet.getDataRange().getValues();
  var plan = [], hyouka = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var userId = String(row[0] || ''), name = String(row[1] || '') || userId;
    var year = parseInt(row[2], 10) || 0, month = parseInt(row[3], 10) || 0;
    // 計画書: カットオフ以降に作成 かつ 未送付
    if (_onOrAfter(row[6]) && !_has(row[11])) {
      plan.push({ userId: userId, name: name, year: year, month: month, date: _iso(row[6]) });
    }
    // 評価: カットオフ以降に達成度実施 かつ pdf・print両方空
    if (_onOrAfter(row[15]) && !_has(row[9]) && !_has(row[10])) {
      hyouka.push({ userId: userId, name: name, year: year, month: month, date: _iso(row[15]) });
    }
  }
  return { planCount: plan.length, hyoukaCount: hyouka.length, plan: plan, hyouka: hyouka, cutoff: KEIKAKUSHO_SOUFU_CUTOFF };
}

// ===== morningDigest 純関数（scripts/test-morning-digest.js と同一実装）=====
// 月〜金=true / 土日=false（祝日は営業＝true据え置き・UTC基準でTZ非依存）
function isBizDay_(dateStr) {
  var p = String(dateStr).split('-');
  var dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  return dow !== 0 && dow !== 6;
}
// 送迎日誌 getOps から当日入力の有無を 'OK'/'MISSING' に圧縮
function sougeiOpsStatus_(opsData, dateStr) {
  return (opsData && opsData.dailyOps && opsData.dailyOps[dateStr]) ? 'OK' : 'MISSING';
}
// 振替不能 records を月別集計。未解決=「回収済」以外の合計。byMonth から「回収済」は落とす。
function foldFurikaeByMonth_(records) {
  var byMonth = {};
  (records || []).forEach(function (r) {
    var m = r.month; if (!m) return;
    var st = r.status; if (!st || st === '回収済') return;
    byMonth[m] = byMonth[m] || {};
    byMonth[m][st] = (byMonth[m][st] || 0) + 1;
  });
  var unresolvedTotal = 0;
  Object.keys(byMonth).forEach(function (m) {
    Object.keys(byMonth[m]).forEach(function (st) { unresolvedTotal += byMonth[m][st]; });
  });
  return { byMonth: byMonth, unresolvedTotal: unresolvedTotal };
}
// getLongLeaveList の1レコードから朝報告フラグを計算（スキル Step 3.7 準拠の4種）
function computeLongLeaveFlags_(r, todayStr) {
  var flags = [];
  var dslc = r.daysSinceLastContact || 0;
  var hasLast = !!r.lastContact;
  if ((dslc >= 28 && hasLast) || (!hasLast && (r.elapsedDays || 0) >= 28)) flags.push('月1超過');
  if (r.contactOverdue === true) flags.push('今日連絡');
  if (r.daysUntilReturn === 1) flags.push('明日再開');
  if (!r.lastContact && !r.nextContactDue) flags.push('連絡なし');
  return flags;
}

// ===== 実績送付スキャン結果（2026/5/30追加・信号機ダッシュボード）=====
var SCAN_JISSEKI_SHEET = '実績送付スキャン結果';
var SCAN_JISSEKI_HEADER = ['年月', '氏名', 'ケアマネ事業所', 'ケアマネ担当者', 'status', 'needsReview', 'sent', 'sentDate', 'scannedAt'];

// 指定ヘッダでシートを冪等取得。無ければ作成しヘッダを書き込む。
// 年月列(A)は Sheets の日付自動変換を防ぐためテキスト形式に固定する。
function getOrCreateSheet_(name, header) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.getRange('A:A').setNumberFormat('@'); // 年月列をテキスト固定
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sh;
}

// 年月セルの値を 'YYYY-MM' 文字列に正規化（Sheetsが日付化しても比較・返却できるように）。
function ymKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
  return String(v);
}

// スキャン結果を保存。同一年月の既存行のうち sent=TRUE は保持（社長が📤で付けた送付済を消さない）、それ以外を置換する完全マージ。
function setScanJissekiCoverage_(payload) {
  var ym = String(payload.ym);
  var sh = getOrCreateSheet_(SCAN_JISSEKI_SHEET, SCAN_JISSEKI_HEADER);
  sh.getRange('A:A').setNumberFormat('@'); // 既存シートにもテキスト固定を冪等適用
  var all = sh.getDataRange().getValues();
  all.shift(); // ヘッダ除去
  // 既存の sent 状態を氏名キーで退避
  var sentMap = {};
  all.forEach(function (r) {
    if (ymKey_(r[0]) === ym && r[6] === true) sentMap[r[1]] = { sent: true, sentDate: r[7] };
  });
  // 当該年月の既存行を削除（後ろから・行番号はヘッダ+1基点）
  for (var i = all.length - 1; i >= 0; i--) {
    if (ymKey_(all[i][0]) === ym) sh.deleteRow(i + 2);
  }
  var now = new Date();
  var rows = (payload.rows || []).map(function (x) {
    var keep = sentMap[x.name] || {};
    return [ym, x.name, x.cmOffice, x.cmName, x.status, !!x.needsReview,
            keep.sent || false, keep.sentDate || '', now];
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return { ok: true, success: true, ym: ym, saved: rows.length };
}

// スキャン結果を取得。HTML信号機・朝の報告から呼ばれる。
function getScanJissekiCoverage_(ym) {
  ym = String(ym);
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SCAN_JISSEKI_SHEET);
  if (!sh) return { ok: true, success: true, ym: ym, rows: [] };
  var all = sh.getDataRange().getValues();
  all.shift();
  var rows = all.filter(function (r) { return ymKey_(r[0]) === ym; }).map(function (r) {
    return {
      name: r[1], cmOffice: r[2], cmName: r[3], status: r[4],
      needsReview: r[5] === true, sent: r[6] === true,
      sentDate: r[7] ? formatScanDate_(r[7]) : '',
    };
  });
  return { ok: true, success: true, ym: ym, rows: rows };
}

// 送付済トグル（📤タップ用）。
function markScanSent_(ym, name, sent) {
  ym = String(ym);
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(SCAN_JISSEKI_SHEET);
  if (!sh) return { ok: false, success: false, error: 'シート未作成', ym: ym, name: name };
  var all = sh.getDataRange().getValues();
  for (var i = 1; i < all.length; i++) {
    if (ymKey_(all[i][0]) === ym && all[i][1] === name) {
      sh.getRange(i + 1, 7).setValue(!!sent);                 // sent列
      sh.getRange(i + 1, 8).setValue(sent ? new Date() : ''); // sentDate列
      return { ok: true, success: true, ym: ym, name: name, sent: !!sent };
    }
  }
  return { ok: false, success: false, error: 'not found', ym: ym, name: name };
}

// 日付を YYYY-MM-DD 文字列に整形（Date以外はそのまま返す）。
function formatScanDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return String(v);
}

// ===== タスクボード機能（2026/4/11追加）=====

// タスク取得（未完了は全日返却・完了は指定日のみ・2026/4/25改修）
function getBoardTasks(ss, dateStr) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][8] || '未完了').trim();
    var d = fmtDate(data[i][1]);
    // 完了タスクは指定日のみ・未完了は全日（「完了するまでずっと残る」要件）
    if (status === '完了' && d !== dateStr) continue;
    // 未来発火ゲート（2026/06/27追加）: 未完了でも「日付(=発火日)」が未来なら、その日まで出さない。
    //   B(支給日)/G(雇用契約 満了1ヶ月前)等を「指定日になったら出し始める」終わるまで方式で運用するため。
    //   既存の未完了タスクは全て過去日(=登録日)のため影響なし／通常登録は date=今日で従来どおり。
    if (status !== '完了' && d && d > dateStr) continue;
    list.push({
      id: String(data[i][0] || ''),
      date: d,
      staff: String(data[i][2] || '').trim(),
      name: String(data[i][3] || '').trim(),
      priority: String(data[i][4] || 'normal').trim(),
      estimatedMin: data[i][5] ? parseInt(data[i][5]) : null,
      source: String(data[i][6] || '').trim(),
      registeredAt: String(data[i][7] || ''),
      status: status,
      completedAt: String(data[i][9] || ''),
      deadline: data[i][10] ? fmtDate(data[i][10]) : '',
      completedBy: String(data[i][11] || '').trim(),
      row: i + 1
    });
  }
  return list;
}

// タスク登録（2026/4/25 期限・完了者列追加）
function addBoardTask(ss, data) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) {
    // シートがなければ自動作成
    sheet = ss.insertSheet('タスクボード');
    sheet.getRange(1, 1, 1, 12).setValues([[
      'ID', '日付', 'スタッフ', 'タスク名', '優先度', '目安(分)',
      '登録者', '登録日時', 'ステータス', '完了日時', '期限', '完了者'
    ]]);
    sheet.setFrozenRows(1);
  } else {
    // 既存シートで列数が10以下なら期限・完了者列を自動追加（migration・2026/4/25）
    var lastCol = sheet.getLastColumn();
    if (lastCol < 11) {
      sheet.getRange(1, 11).setValue('期限');
      sheet.setColumnWidth(11, 110);
    }
    if (lastCol < 12) {
      sheet.getRange(1, 12).setValue('完了者');
      sheet.setColumnWidth(12, 100);
    }
    if (lastCol < 12) {
      sheet.getRange(1, 11, 1, 2).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    }
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var today = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var id = 'tb_' + new Date().getTime();

  sheet.appendRow([
    id,
    today,
    data.staff || '',
    data.name || '',
    data.priority || 'normal',
    data.estimatedMin || '',
    data.source || 'クロコ',
    now,
    '未完了',
    '',
    data.deadline || '',
    ''
  ]);

  return {
    success: true,
    message: 'タスクを登録しました: ' + (data.name || ''),
    id: id
  };
}

// タスク完了（2026/4/25 完了者列＋完了通知メール送信追加）
function completeBoardTask(ss, data) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) return { error: 'タスクボードシートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.id)) {
      var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      var completedBy = String(data.completedBy || '（不明）').trim();
      sheet.getRange(i + 1, 9).setValue('完了');
      sheet.getRange(i + 1, 10).setValue(now);
      sheet.getRange(i + 1, 12).setValue(completedBy);

      // 完了通知メール送信（NOTIFY_EMAIL宛・失敗しても完了処理は成功扱い）
      try {
        sendBoardTaskCompletionMail_({
          name: allData[i][3],
          priority: allData[i][4],
          source: allData[i][6],
          registeredAt: allData[i][7],
          deadline: allData[i][10] || ''
        }, completedBy, now);
      } catch (e) {
        Logger.log('ボードタスク完了通知メール送信失敗: ' + e.message);
      }

      return { success: true, message: 'タスクを完了にしました' };
    }
  }
  return { error: '指定されたタスクが見つかりません', success: false };
}

// ボードタスク完了通知メール（2026/4/25追加）
function sendBoardTaskCompletionMail_(task, completedBy, completedAt) {
  // 絵文字は環境依存で文字化けするので【】記法を使う
  var priorityLabel = { high: '【急ぎ】', normal: '【普通】', low: '【余裕】' };

  // Date型でも文字列でも安全にフォーマット
  var fmtTs_ = function(v, withTime) {
    if (!v) return '';
    var fmt = withTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', fmt);
    return String(v);
  };
  var registeredStr = fmtTs_(task.registeredAt, true);
  var deadlineStr = fmtTs_(task.deadline, false) || 'なし';

  // 所要時間計算
  var elapsedText = '';
  try {
    var reg = (task.registeredAt instanceof Date) ? task.registeredAt
            : new Date(String(task.registeredAt).replace(' ', 'T') + ':00+09:00');
    var done = new Date(String(completedAt).replace(' ', 'T') + ':00+09:00');
    var diffMin = Math.round((done - reg) / 60000);
    if (!isNaN(diffMin) && diffMin > 0) {
      if (diffMin >= 60) {
        elapsedText = '（所要 ' + Math.floor(diffMin/60) + '時間' + (diffMin%60 ? (diffMin%60 + '分') : '') + '）';
      } else {
        elapsedText = '（所要 ' + diffMin + '分）';
      }
    }
  } catch(e) {}

  var subject = '[完了] ボードタスク：' + String(task.name || '').slice(0, 30);
  var body = [
    '【' + completedBy + 'さん】が以下のタスクを完了しました。',
    '',
    'タスク: ' + (task.name || ''),
    '登録: ' + registeredStr + '（' + (task.source || 'クロコ') + 'より）',
    '完了: ' + completedAt + ' ' + elapsedText,
    '緊急度: ' + (priorityLabel[task.priority] || '【普通】'),
    '期限: ' + deadlineStr,
    '',
    '▼yawaragiボードで確認:',
    ScriptApp.getService().getUrl()
  ].join('\n');

  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body, {charset: 'UTF-8'});
}

// タスク削除
function deleteBoardTask(ss, data) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) return { error: 'タスクボードシートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.id)) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'タスクを削除しました' };
    }
  }
  return { error: '指定されたタスクが見つかりません', success: false };
}

// 担当者更新（2026/4/25追加・ミニミーティング画面の保存処理用）
function updateBoardTaskStaff(ss, data) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) return { error: 'タスクボードシートがありません', success: false };

  var allData = sheet.getDataRange().getValues();
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][0]) === String(data.id)) {
      sheet.getRange(i + 1, 3).setValue(String(data.staff || '').trim()); // C列=スタッフ
      return { success: true, message: '担当を更新しました' };
    }
  }
  return { error: '指定されたタスクが見つかりません', success: false };
}

// ================================================================
// ========== 利用者イベント（契約後/担会後/ケアマネ変更） ==========
// ================================================================

// イベント登録＋項目テンプレート自動展開（2026/4/28追加）
function addUserEvent(ss, data) {
  // シートがなければ自動初期化（setupSheets は冪等なので毎回呼んでも安全）
  if (!ss.getSheetByName('利用者イベント') || !ss.getSheetByName('利用者イベント項目')) {
    setupSheets();
  }
  var eventSheet = ss.getSheetByName('利用者イベント');
  var itemSheet = ss.getSheetByName('利用者イベント項目');
  if (!eventSheet || !itemSheet) {
    return { success: false, error: 'シート初期化に失敗しました。setupSheets を実行してください。' };
  }

  // バリデーション
  var eventType = String(data.eventType || '').trim();
  if (['contract_after', 'meeting_after', 'caremanager_change', 'usage_days_change', 'caremanager_relay'].indexOf(eventType) === -1) {
    return { success: false, error: 'eventType が不正: ' + eventType };
  }
  var userName = String(data.userName || '').trim();
  if (!userName) return { success: false, error: 'userName が必須' };
  var eventDate = String(data.eventDate || '').trim();
  if (!eventDate) return { success: false, error: 'eventDate が必須' };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var eventId = 'evt_' + new Date().getTime();
  var metadata = JSON.stringify(data.metadata || {});
  var createdBy = String(data.createdBy || '（不明）').trim();

  // 1. 親イベント1行追加
  eventSheet.appendRow([
    eventId, eventType, userName, eventDate, metadata,
    'in_progress', now, createdBy, '', ''
  ]);

  // 2. テンプレートから項目を展開（予約系イベントは項目を持たないので親だけ作る）
  var template = getEventTemplate(eventType);
  if (template.length === 0) {
    return { success: true, message: 'イベントを登録しました（項目展開なし）: ' + userName + ' / ' + eventType, id: eventId, itemCount: 0 };
  }
  var rows = [];
  var eventLabelMap = { contract_after: '契約後', meeting_after: '担会後', caremanager_change: 'ケアマネ変更', usage_days_change: '利用曜日変更' };
  for (var i = 0; i < template.length; i++) {
    var t = template[i];
    var itemId = 'evtitem_' + new Date().getTime() + '_' + t.seq;
    var linkedTbId = '';

    // 🟡 anyone タグの項目は今日のタスクボードに自動登録
    if (t.ownerTag === 'anyone') {
      var tbResult = addBoardTask(ss, {
        name: '【' + userName + '/' + (eventLabelMap[eventType] || eventType) + '】' + t.label,
        priority: t.isUrgent ? 'high' : 'normal',
        deadline: data.metadata && data.metadata['利用開始日'] ? data.metadata['利用開始日'] : '',
        source: '代表',
        estimatedMin: 15
      });
      if (tbResult && tbResult.success && tbResult.id) {
        linkedTbId = tbResult.id;
      }
    }

    rows.push([
      itemId, eventId, t.seq, t.label, t.ownerTag, t.isUrgent ? 'TRUE' : 'FALSE',
      'pending', '', '', '', linkedTbId
    ]);
  }
  itemSheet.getRange(itemSheet.getLastRow() + 1, 1, rows.length, 11).setValues(rows);

  return {
    success: true,
    message: 'イベントを登録しました: ' + userName + ' / ' + eventType,
    id: eventId,
    itemCount: rows.length
  };
}

// イベント一覧取得（進行中＋直近30日の完了分）（2026/4/28追加）
function listUserEvents(ss) {
  var eventSheet = ss.getSheetByName('利用者イベント');
  var itemSheet = ss.getSheetByName('利用者イベント項目');
  if (!eventSheet || !itemSheet) return [];
  if (eventSheet.getLastRow() < 2) return [];

  var eventData = eventSheet.getDataRange().getValues();
  var itemData = itemSheet.getLastRow() < 2 ? [] : itemSheet.getDataRange().getValues();

  // 親イベントごとに項目を集計
  var itemsByEvent = {};
  for (var i = 1; i < itemData.length; i++) {
    var eid = String(itemData[i][1] || '');
    if (!itemsByEvent[eid]) itemsByEvent[eid] = [];
    itemsByEvent[eid].push({
      id: String(itemData[i][0] || ''),
      seq: parseInt(itemData[i][2]) || 0,
      label: String(itemData[i][3] || ''),
      ownerTag: String(itemData[i][4] || ''),
      isUrgent: String(itemData[i][5]) === 'TRUE',
      status: String(itemData[i][6] || 'pending'),
      doneAt: String(itemData[i][7] || ''),
      doneBy: String(itemData[i][8] || ''),
      memo: String(itemData[i][9] || ''),
      linkedTaskBoardId: String(itemData[i][10] || '')
    });
  }

  var thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  var list = [];
  for (var i = 1; i < eventData.length; i++) {
    var status = String(eventData[i][5] || 'in_progress');
    var completedAt = String(eventData[i][8] || '');
    // archived は除外
    if (status === 'archived') continue;
    // 完了済みは30日以内のみ
    if (status === 'completed' && completedAt) {
      var doneDate = new Date(String(completedAt).replace(' ', 'T') + ':00+09:00');
      if (doneDate < thirtyDaysAgo) continue;
    }
    var items = (itemsByEvent[eventData[i][0]] || []).sort(function(a, b) { return a.seq - b.seq; });
    var doneCount = 0;
    for (var j = 0; j < items.length; j++) if (items[j].status === 'done') doneCount++;
    list.push({
      id: String(eventData[i][0] || ''),
      eventType: String(eventData[i][1] || ''),
      userName: String(eventData[i][2] || ''),
      eventDate: fmtDate(eventData[i][3]),
      metadata: (function() { try { return JSON.parse(eventData[i][4] || '{}'); } catch(e) { return {}; } })(),
      status: status,
      createdAt: String(eventData[i][6] || ''),
      createdBy: String(eventData[i][7] || ''),
      completedAt: completedAt,
      itemTotal: items.length,
      itemDone: doneCount,
      items: items
    });
  }
  return list;
}

// 項目編集（タグ・ラベル・急ぎフラグの更新・2026/4/29追加）
function updateEventItem(ss, data) {
  var itemSheet = ss.getSheetByName('利用者イベント項目');
  if (!itemSheet) return { success: false, error: '利用者イベント項目シートがありません' };

  var itemData = itemSheet.getDataRange().getValues();
  for (var i = 1; i < itemData.length; i++) {
    if (String(itemData[i][0]) === String(data.itemId)) {
      var row = i + 1;
      if (data.ownerTag !== undefined) {
        if (['boss', 'consultant', 'anyone'].indexOf(data.ownerTag) === -1) {
          return { success: false, error: 'ownerTag が不正: ' + data.ownerTag };
        }
        itemSheet.getRange(row, 5).setValue(data.ownerTag);
      }
      if (data.label !== undefined) {
        itemSheet.getRange(row, 4).setValue(String(data.label));
      }
      if (data.isUrgent !== undefined) {
        itemSheet.getRange(row, 6).setValue(data.isUrgent ? 'TRUE' : 'FALSE');
      }
      return { success: true, message: '項目を更新しました' };
    }
  }
  return { success: false, error: '指定された項目が見つかりません: ' + data.itemId };
}

// 項目完了（2026/4/28追加）
function completeEventItem(ss, data) {
  var itemSheet = ss.getSheetByName('利用者イベント項目');
  if (!itemSheet) return { success: false, error: '利用者イベント項目シートがありません' };

  var itemData = itemSheet.getDataRange().getValues();
  var itemRow = -1;
  var eventId = '';
  for (var i = 1; i < itemData.length; i++) {
    if (String(itemData[i][0]) === String(data.itemId)) {
      itemRow = i + 1;
      eventId = String(itemData[i][1] || '');
      break;
    }
  }
  if (itemRow === -1) return { success: false, error: '指定された項目が見つかりません: ' + data.itemId };

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var doneBy = String(data.doneBy || '（不明）').trim();
  itemSheet.getRange(itemRow, 7).setValue('done');     // status
  var doneAtCellC = itemSheet.getRange(itemRow, 8);
  doneAtCellC.setNumberFormat('@');                     // 文字列書式に固定（日付自動変換・TZずれ防止）
  SpreadsheetApp.flush();
  doneAtCellC.setValue(now);                            // doneAt
  itemSheet.getRange(itemRow, 9).setValue(doneBy);      // doneBy
  if (data.memo) itemSheet.getRange(itemRow, 10).setValue(String(data.memo));

  // 連動: linkedTaskBoardId があれば、タスクボード側も完了に
  var linkedId = String(itemData[itemRow - 1][10] || '');
  if (linkedId) {
    completeBoardTask(ss, { id: linkedId, completedBy: doneBy });
  }

  // 親イベント全項目完了チェック
  var allItems = itemSheet.getDataRange().getValues();
  var allDone = true, total = 0;
  for (var i = 1; i < allItems.length; i++) {
    if (String(allItems[i][1]) === eventId) {
      total++;
      if (String(allItems[i][6]) !== 'done') allDone = false;
    }
  }
  if (allDone && total > 0) {
    var eventSheet = ss.getSheetByName('利用者イベント');
    var eventData = eventSheet.getDataRange().getValues();
    for (var i = 1; i < eventData.length; i++) {
      if (String(eventData[i][0]) === eventId) {
        eventSheet.getRange(i + 1, 6).setValue('completed');
        eventSheet.getRange(i + 1, 9).setValue(now);
        try {
          sendUserEventCompletionMail_({
            userName: eventData[i][2], eventType: eventData[i][1],
            createdAt: eventData[i][6], total: total
          }, doneBy, now);
        } catch(e) { Logger.log('利用者イベント完了通知メール失敗: ' + e.message); }
        break;
      }
    }
  }

  return { success: true, message: '項目を完了にしました', allDone: allDone };
}

// 完了項目の訂正：完了日・完了者を上書き（2026-05-22追加）
function editEventCompletion(ss, data) {
  var itemSheet = ss.getSheetByName('利用者イベント項目');
  if (!itemSheet) return { success: false, error: '利用者イベント項目シートがありません' };
  var itemId = String((data && data.itemId) || '').trim();
  if (!itemId) return { success: false, error: 'itemId が必須です' };
  var doneDate = String((data && data.doneDate) || '').trim();
  var doneBy = String((data && data.doneBy) || '').trim();
  if (!doneDate) return { success: false, error: '完了日が必須です' };
  if (!doneBy) return { success: false, error: '完了者が必須です' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doneDate)) {
    return { success: false, error: '完了日の形式が不正です: ' + doneDate };
  }

  var itemData = itemSheet.getDataRange().getValues();
  for (var i = 1; i < itemData.length; i++) {
    if (String(itemData[i][0]) === itemId) {
      var row = i + 1;
      if (String(itemData[i][6]) !== 'done') {
        return { success: false, error: '完了済みの項目ではありません' };
      }
      // 元の doneAt から時刻部分（HH:mm）を取り出して保持・無ければ 00:00
      var oldDoneAt = String(itemData[i][7] || '');
      var m = oldDoneAt.match(/\d{1,2}:\d{2}/);
      var timePart = m ? m[0] : '00:00';
      // セルを文字列書式に固定し、日付自動変換・タイムゾーンずれを防ぐ
      var doneAtCell = itemSheet.getRange(row, 8);
      doneAtCell.setNumberFormat('@');
      SpreadsheetApp.flush();
      doneAtCell.setValue(doneDate + ' ' + timePart);
      itemSheet.getRange(row, 9).setValue(doneBy);
      return { success: true, message: '完了情報を訂正しました' };
    }
  }
  return { success: false, error: '指定された項目が見つかりません: ' + itemId };
}

// 完了項目を未完了に戻す（誤チェックの取り消し）（2026-05-22追加）
function reopenEventItem(ss, data) {
  var itemSheet = ss.getSheetByName('利用者イベント項目');
  if (!itemSheet) return { success: false, error: '利用者イベント項目シートがありません' };
  var itemId = String((data && data.itemId) || '').trim();
  if (!itemId) return { success: false, error: 'itemId が必須です' };

  var itemData = itemSheet.getDataRange().getValues();
  for (var i = 1; i < itemData.length; i++) {
    if (String(itemData[i][0]) === itemId) {
      var row = i + 1;
      var eventId = String(itemData[i][1] || '');
      var linkedId = String(itemData[i][10] || '');

      // 項目を未完了に戻す
      itemSheet.getRange(row, 7).setValue('pending');
      itemSheet.getRange(row, 8).setValue('');
      itemSheet.getRange(row, 9).setValue('');
      itemSheet.getRange(row, 10).setValue('');

      // 連動タスクボードがあれば未完了に戻す
      if (linkedId) {
        var boardSheet = ss.getSheetByName('タスクボード');
        if (boardSheet && boardSheet.getLastRow() > 1) {
          var bVals = boardSheet.getDataRange().getValues();
          for (var k = 1; k < bVals.length; k++) {
            if (String(bVals[k][0]) === linkedId) {
              boardSheet.getRange(k + 1, 9).setValue('未完了');
              boardSheet.getRange(k + 1, 10).setValue('');
              boardSheet.getRange(k + 1, 12).setValue('');
              break;
            }
          }
        }
      }

      // 親イベントが completed なら in_progress に戻す
      var eventSheet = ss.getSheetByName('利用者イベント');
      if (eventSheet && eventSheet.getLastRow() > 1) {
        var evVals = eventSheet.getDataRange().getValues();
        for (var j = 1; j < evVals.length; j++) {
          if (String(evVals[j][0]) === eventId && String(evVals[j][5]) === 'completed') {
            eventSheet.getRange(j + 1, 6).setValue('in_progress');
            eventSheet.getRange(j + 1, 9).setValue('');
            break;
          }
        }
      }
      return { success: true, message: '項目を未完了に戻しました' };
    }
  }
  return { success: false, error: '指定された項目が見つかりません: ' + itemId };
}

// 利用者イベント完了通知メール（既存 sendBoardTaskCompletionMail_ を参考）
function sendUserEventCompletionMail_(evt, doneBy, completedAt) {
  var labelMap = { contract_after: '契約後', meeting_after: '担会後', caremanager_change: 'ケアマネ変更', usage_days_change: '利用曜日変更' };
  var subject = '[完了] 利用者イベント：' + String(evt.userName || '') + ' ' + (labelMap[evt.eventType] || evt.eventType);
  var body = [
    '【' + doneBy + 'さん】が最後の項目を完了し、イベント全体が完了しました。',
    '',
    '利用者: ' + (evt.userName || ''),
    '種別: ' + (labelMap[evt.eventType] || evt.eventType),
    '項目数: ' + evt.total + '/' + evt.total + ' すべて完了',
    '登録: ' + String(evt.createdAt || ''),
    '完了: ' + completedAt,
    '',
    '▼yawaragiボードで確認:',
    ScriptApp.getService().getUrl()
  ].join('\n');
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body, { charset: 'UTF-8' });
}

// ================================================================
// ========== 実績送付メール自動化 ==========
// ================================================================

// yawaragi-apps/実績送付 フォルダを取得（なければ作成）
function getJissekiBaseFolder() {
  var folders = DriveApp.getFoldersByName('yawaragi-apps');
  while (folders.hasNext()) {
    var f = folders.next();
    var subs = f.getFoldersByName('実績送付');
    if (subs.hasNext()) return subs.next();
  }
  // 見つからなければ最初のyawaragi-apps配下に作成
  folders = DriveApp.getFoldersByName('yawaragi-apps');
  if (folders.hasNext()) {
    return folders.next().createFolder('実績送付');
  }
  throw new Error('yawaragi-appsフォルダが見つかりません');
}

// ケアマネ連絡先をマップで取得（居宅事業所名→{name, email, fax, method, dataLink}）
// 2026-05-03: 新シート「送付用居宅一覧」対応・ヘッダ名検出方式
function getCmContactsForEmail(ss) {
  var sheet = getCmContactsSheet(ss);
  if (!sheet || sheet.getLastRow() < 2) return {};

  var cols = _readCmCols(sheet);
  var data = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var office = cols.office >= 0 ? String(row[cols.office]||'').trim() : '';
    var name = cols.name >= 0 ? String(row[cols.name]||'').trim() : '';
    var email = cols.email >= 0 ? String(row[cols.email]||'').trim() : '';
    var fax = cols.fax >= 0 ? String(row[cols.fax]||'').trim().replace(/[-ー－\s]/g, '') : '';
    var method = cols.method >= 0 ? String(row[cols.method]||'').trim() : '';
    var dataLink = cols.dataLink >= 0 ? String(row[cols.dataLink]||'').trim() : '';
    // 送付方法が空の場合: メールあり→メール、FAXあり→FAX、どちらもなし→未設定
    if (!method) {
      if (email) method = 'メール';
      else if (fax) method = 'FAX';
    }
    if (office) {
      map[office] = { name: name, email: email, fax: fax, method: method, dataLink: dataLink };
    }
  }
  return map;
}

// フォルダ内の居宅一覧・状態を取得（プレビュー用）
function getJissekiFolderStatus(yearMonth) {
  try {
    var base = getJissekiBaseFolder();
    var folders = base.getFoldersByName(yearMonth);
    if (!folders.hasNext()) {
      return { success: true, yearMonth: yearMonth, folders: [], message: yearMonth + 'フォルダがまだありません' };
    }
    var monthFolder = folders.next();

    var ss = SpreadsheetApp.openById(SS_ID);
    var cmMap = getCmContactsForEmail(ss);

    var subFolders = monthFolder.getFolders();
    var list = [];
    while (subFolders.hasNext()) {
      var f = subFolders.next();
      var name = f.getName();
      var files = f.getFiles();
      var pdfCount = 0;
      var fileNames = [];
      while (files.hasNext()) {
        var file = files.next();
        if (file.getMimeType() === 'application/pdf') {
          pdfCount++;
          fileNames.push(file.getName());
        }
      }
      var contact = cmMap[name];
      var method = contact ? (contact.method || '') : '';
      list.push({
        kyotaku: name,
        pdfCount: pdfCount,
        fileNames: fileNames,
        hasEmail: !!(contact && contact.email),
        hasFax: !!(contact && contact.fax),
        method: method,
        email: contact ? contact.email : '',
        fax: contact ? contact.fax : '',
        cmName: contact ? contact.name : ''
      });
    }

    return { success: true, yearMonth: yearMonth, folders: list };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 秒速FAX送信用メールアドレス（管理画面で確認して設定）
var BYOSOKU_FAX_EMAIL = 'fax216747@ecofax.jp';

// 下書き作成＋FAX送信メイン処理
function createJissekiDrafts(yearMonth) {
  if (!yearMonth) {
    return { success: false, error: '年月(yearMonth)を指定してください（例: 2026-04）' };
  }

  var base;
  try {
    base = getJissekiBaseFolder();
  } catch (e) {
    return { success: false, error: e.message };
  }

  var folders = base.getFoldersByName(yearMonth);
  if (!folders.hasNext()) {
    return { success: false, error: yearMonth + 'フォルダが見つかりません。先にフォルダを作成してPDFを置いてください。' };
  }
  var monthFolder = folders.next();

  var ss = SpreadsheetApp.openById(SS_ID);
  var cmMap = getCmContactsForEmail(ss);

  // 持参リスト
  var JISAN_LIST = ['ふくしのまち東松山', 'わかばの丘包括', 'わかばの丘居宅'];

  // 送信記録シートを準備
  var recordSheet = ss.getSheetByName('送信記録');
  if (!recordSheet) {
    recordSheet = ss.insertSheet('送信記録');
    recordSheet.getRange(1, 1, 1, 8).setValues([[
      '送信年月', '居宅事業所名', 'ケアマネ名', '宛先',
      '添付ファイル数', '送信方法', '送信日時', 'ステータス'
    ]]);
    recordSheet.setFrozenRows(1);
  }

  // 居宅サブフォルダを巡回
  var subFolders = monthFolder.getFolders();
  var results = [];
  var emailCount = 0;
  var faxCount = 0;
  var errorCount = 0;
  var skipCount = 0;

  // 年月表示用（2026-04 → 2026年04月）
  var parts = yearMonth.split('-');
  var monthLabel = parts[0] + '年' + parts[1] + '月';

  while (subFolders.hasNext()) {
    var kyotakuFolder = subFolders.next();
    var kyotakuName = kyotakuFolder.getName();

    // 持参の居宅はスキップ
    var isJisan = false;
    for (var j = 0; j < JISAN_LIST.length; j++) {
      if (kyotakuName.indexOf(JISAN_LIST[j]) >= 0) { isJisan = true; break; }
    }
    if (isJisan) {
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: '持参対象', method: '持参' });
      skipCount++;
      continue;
    }

    // ケアマネ連絡先から検索
    var contact = cmMap[kyotakuName];
    var method = contact ? contact.method : '';

    if (!contact || (!contact.email && !contact.fax)) {
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: '連絡先が未登録', method: '' });
      skipCount++;
      continue;
    }

    // フォルダ内のPDFを取得
    var files = kyotakuFolder.getFiles();
    var attachments = [];
    var fileNames = [];
    while (files.hasNext()) {
      var file = files.next();
      if (file.getMimeType() === 'application/pdf') {
        attachments.push(file.getBlob());
        fileNames.push(file.getName());
      }
    }

    if (attachments.length === 0) {
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: 'PDFファイルがありません', method: method });
      skipCount++;
      continue;
    }

    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

    // === メール送信（Gmail下書き）===
    if (method === 'メール' && contact.email) {
      var body = kyotakuName + '\n'
        + contact.name + '様\n\n'
        + 'いつもお世話になっております。\n'
        + 'リハビリデイサービスyawaragiの勝又です。\n\n'
        + monthLabel + '分の提供票等をお送りいたします。\n\n'
        + '【添付書類】\n';
      for (var k = 0; k < fileNames.length; k++) {
        body += '・' + fileNames[k] + '\n';
      }
      body += '\nご確認のほど、よろしくお願いいたします。\n'
        + 'ご不明な点がございましたら、お気軽にご連絡ください。\n\n'
        + '━━━━━━━━━━━━━━━━━━\n'
        + 'リハビリデイサービス yawaragi\n'
        + '担当: 勝又裕子\n'
        + 'TEL/FAX: 0493-81-5125\n'
        + '━━━━━━━━━━━━━━━━━━';

      var subject = '【yawaragi】' + monthLabel + '分 提供票等のご送付（' + attachments.length + '件）';

      try {
        GmailApp.createDraft(contact.email, subject, body, {
          attachments: attachments,
          name: 'リハビリデイサービス yawaragi'
        });
        recordSheet.appendRow([yearMonth, kyotakuName, contact.name, contact.email, attachments.length, 'メール下書き', now, '成功']);
        results.push({ kyotaku: kyotakuName, cmName: contact.name, dest: contact.email, fileCount: attachments.length, status: '成功', method: 'メール' });
        emailCount++;
      } catch (e) {
        results.push({ kyotaku: kyotakuName, status: 'エラー', reason: e.message, method: 'メール' });
        errorCount++;
      }

    // === FAX送信（秒速FAX経由メール）===
    } else if (method === 'FAX' && contact.fax) {
      if (!BYOSOKU_FAX_EMAIL) {
        results.push({ kyotaku: kyotakuName, status: 'エラー', reason: '秒速FAX送信アドレスが未設定です', method: 'FAX' });
        errorCount++;
        continue;
      }

      try {
        // 秒速FAX: 件名にFAX番号、添付にPDF
        var faxTo = BYOSOKU_FAX_EMAIL;
        var faxSubject = contact.fax; // FAX番号（ハイフンなし）
        var faxBody = ''; // 本文は空（PDFのみ送信）
        GmailApp.sendEmail(faxTo, faxSubject, faxBody, {
          attachments: attachments,
          name: 'yawaragi FAX',
          from: 'r.d-yawaragi@keepfitlife.com'
        });
        recordSheet.appendRow([yearMonth, kyotakuName, contact.name, 'FAX:' + contact.fax, attachments.length, 'FAX', now, '成功']);
        results.push({ kyotaku: kyotakuName, cmName: contact.name, dest: 'FAX:' + contact.fax, fileCount: attachments.length, status: '成功', method: 'FAX' });
        faxCount++;
      } catch (e) {
        results.push({ kyotaku: kyotakuName, status: 'エラー', reason: e.message, method: 'FAX' });
        errorCount++;
      }

    // === 連絡先はあるが送付方法が不明 ===
    } else {
      var reason = 'メールアドレスもFAX番号も未登録';
      if (method === 'メール' && !contact.email) reason = 'メール指定だがメールアドレス未登録';
      if (method === 'FAX' && !contact.fax) reason = 'FAX指定だがFAX番号未登録';
      results.push({ kyotaku: kyotakuName, status: 'スキップ', reason: reason, method: method });
      skipCount++;
    }
  }

  return {
    success: true,
    yearMonth: yearMonth,
    summary: {
      total: emailCount + faxCount + errorCount + skipCount,
      email: emailCount,
      fax: faxCount,
      error: errorCount,
      skip: skipCount
    },
    details: results
  };
}

// 送信記録を取得
function getSendHistory(ss, yearMonth) {
  var sheet = ss.getSheetByName('送信記録');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var ym = String(data[i][0] || '').trim();
    if (yearMonth && ym !== yearMonth) continue;
    list.push({
      yearMonth: ym,
      kyotaku: String(data[i][1] || '').trim(),
      cmName: String(data[i][2] || '').trim(),
      email: String(data[i][3] || '').trim(),
      fileCount: data[i][4],
      method: String(data[i][5] || '').trim(),
      sentAt: String(data[i][6] || ''),
      status: String(data[i][7] || '').trim()
    });
  }
  return list;
}

// ===== ケアマネ連絡先の自動取り込み（利用者台帳から）=====
// 利用者台帳のケアマネ事業所名・メールアドレスから
// 重複なしで連絡先シート（送付用居宅一覧 or 旧ケアマネ連絡先）に取り込む
// 2026-05-03: 新シート対応・ヘッダ名検出方式
function importCmContacts() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var srcSheet = ss.getSheetByName('利用者台帳');
  if (!srcSheet) return { success: false, error: '利用者台帳シートが見つかりません' };

  var dstSheet = getCmContactsSheet(ss);
  if (!dstSheet) return { success: false, error: '連絡先シートが見つかりません（setupSheets()を実行してください）' };
  _ensureHiddenCol(dstSheet);

  var dstCols = _readCmCols(dstSheet);
  var dstLastCol = dstSheet.getLastColumn();

  // 既存連絡先を取得（上書き防止）
  var existingMap = {};
  if (dstSheet.getLastRow() >= 2) {
    var existData = dstSheet.getRange(2, 1, dstSheet.getLastRow() - 1, dstLastCol).getValues();
    for (var i = 0; i < existData.length; i++) {
      var key = dstCols.office >= 0 ? String(existData[i][dstCols.office] || '').trim() : '';
      if (key) {
        existingMap[key] = {
          row: i + 2,
          name: dstCols.name >= 0 ? String(existData[i][dstCols.name] || '').trim() : '',
          email: dstCols.email >= 0 ? String(existData[i][dstCols.email] || '').trim() : '',
          fax: dstCols.fax >= 0 ? String(existData[i][dstCols.fax] || '').trim() : '',
          method: dstCols.method >= 0 ? String(existData[i][dstCols.method] || '').trim() : ''
        };
      }
    }
  }

  // 利用者台帳からケアマネ情報を取得
  var srcData = srcSheet.getDataRange().getValues();
  var headerRow = srcData[0];

  // ヘッダーからケアマネ関連列の位置を探す
  var colCmName = -1, colCmOffice = -1, colCmEmail = -1;
  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c]).trim();
    if (h === 'ケアマネ担当') colCmName = c;
    if (h === 'ケアマネ事業所名') colCmOffice = c;
    if (h === 'ケアマネ個人メアド' || h === 'ケアマネメールアドレス') colCmEmail = c; // 2026-07-04 指示書②: 台帳N列ヘッダ改名（旧名フォールバック付き）
  }

  if (colCmOffice < 0) return { success: false, error: '利用者台帳に「ケアマネ事業所名」列が見つかりません' };

  // ユニークなケアマネ事業所を抽出
  var uniqueMap = {};
  for (var i = 1; i < srcData.length; i++) {
    var office = String(srcData[i][colCmOffice] || '').trim();
    if (!office) continue;
    if (uniqueMap[office]) continue;
    uniqueMap[office] = {
      name: colCmName >= 0 ? String(srcData[i][colCmName] || '').trim() : '',
      email: colCmEmail >= 0 ? String(srcData[i][colCmEmail] || '').trim() : ''
    };
  }

  // 新規追加
  var addCount = 0;
  var updateCount = 0;
  var offices = Object.keys(uniqueMap);

  for (var j = 0; j < offices.length; j++) {
    var officeName = offices[j];
    var info = uniqueMap[officeName];

    if (existingMap[officeName]) {
      // 既存: メールアドレスが空で台帳に入っていれば更新
      var ex = existingMap[officeName];
      if (!ex.email && info.email) {
        if (dstCols.email >= 0) dstSheet.getRange(ex.row, dstCols.email + 1).setValue(info.email);
        if (!ex.method && dstCols.method >= 0) dstSheet.getRange(ex.row, dstCols.method + 1).setValue('メール');
        updateCount++;
      }
    } else {
      // 新規追加
      var method = info.email ? 'メール' : '';
      dstSheet.appendRow(_buildContactRow(dstCols, dstLastCol, {
        office: officeName, name: info.name, email: info.email, method: method
      }));
      addCount++;
    }
  }

  return {
    success: true,
    message: '取り込み完了',
    total: offices.length,
    added: addCount,
    updated: updateCount,
    existing: Object.keys(existingMap).length
  };
}

// テスト用: 2026-03で実績送付を実行（動作確認用）
function testCreateJissekiDrafts() {
  var result = createJissekiDrafts('2026-03');
  Logger.log(JSON.stringify(result, null, 2));
}

// =====================================================================
// ===== 見学・体験・新規 Intake 関連（2026/4/19追加）================
// =====================================================================

function generateIntakeId() {
  var chars = '0123456789abcdef';
  var s = '';
  for (var i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * 16));
    if (i === 7 || i === 11 || i === 15 || i === 19) s += '-';
  }
  return 'intake_' + s;
}

function nowIso() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function todayJst() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function createIntake(ss, data) {
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: 'シートなし' };
  if (!data.氏名 || !data.TEL) {
    return { success: false, error: '氏名・TELは必須' };
  }
  if (!data.種別 || ['trial','visit','inquiry'].indexOf(data.種別) === -1) {
    return { success: false, error: '種別はinquiry/visit/trialのいずれか' };
  }
  // ペースメーカーは受付時は任意（体験ゲートで必須化）。値があれば妥当性のみ確認
  if (data.ペースメーカー && ['有','無','不明'].indexOf(data.ペースメーカー) === -1) {
    return { success: false, error: 'ペースメーカーは有/無/不明' };
  }
  if (data.連絡元区分 && ['caremane','self','walkin'].indexOf(data.連絡元区分) === -1) {
    return { success: false, error: '連絡元区分が不正' };
  }
  var id = generateIntakeId();
  var now = nowIso();
  var row = INTAKE_HEADERS.map(function(h) {
    switch (h) {
      case 'id':             return id;
      case '問い合わせ日':   return data.問い合わせ日 || todayJst();
      case 'ステータス':     return data.ステータス || 'pending';
      case 'フェーズ':       return data.フェーズ || '受付';
      case '利用有無':       return data.利用有無 || '未定';
      case '作成日時':
      case '更新日時':       return now;
      case '送迎有無':
      case '直接連絡可否':
      case '他デイ見学':
      case '利用日前日連絡フラグ':
      case 'ケアマネ連絡済':
      case '送迎時間連絡済':
      case '週間予定表仮予約済':
      case '全記入済':
      case '社長確認済':     return data[h] === true;
      default:               return data[h] != null ? data[h] : '';
    }
  });
  sheet.appendRow(row);
  // 予定日が既に入っている新規作成は社長に通知
  if (data.予定日) {
    var notifyRecord = {};
    INTAKE_HEADERS.forEach(function(h, idx) { notifyRecord[h] = row[idx]; });
    notifyOwnerOfNewSchedule(notifyRecord, true);
  }
  return { success: true, id: id };
}

// 指定日の体験予約を返す（出勤＆送迎表の自動反映用・2026-05-22追加）。
// 種別=trial（体験）のみ。cancelled は getIntakeList が除外済み、rejected はここで除外。
function getTrialsForDate(ss, dateStr) {
  if (!dateStr) return [];
  var list = getIntakeList(ss, {});
  var trials = [];
  list.forEach(function(r) {
    if (r.種別 !== 'trial') return;
    if (r.ステータス === 'rejected') return;
    if (String(r.予定日 || '') !== String(dateStr)) return;
    trials.push({
      id: r.id,
      氏名: r.氏名,
      予定日: r.予定日,
      ampm: _trialAmpm(r),
      お迎え時間: r.初回お迎え時間 || ''
    });
  });
  return trials;
}

// 体験の午前/午後を判定（'am'|'pm'|'both'）。
// 優先順: 1) yawarigi希望曜日のAM/PM, 2) 初回お迎え時間（12:00以前=am）, 3) 不明はam。
function _trialAmpm(r) {
  var parsed = _parseFirstDayWish(r.yawarigi希望曜日);
  if (parsed.ampm === '午前') return 'am';
  if (parsed.ampm === '午後') return 'pm';
  if (parsed.ampm === '午前午後') return 'both';
  var t = String(r.初回お迎え時間 || '').trim();
  var m = t.match(/^(\d{1,2})[:：]/);
  if (m) return (parseInt(m[1], 10) < 12) ? 'am' : 'pm';
  return 'am';
}

function getIntakeList(ss, opts) {
  opts = opts || {};
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var todayStr = todayJst();
  var values = sheet.getRange(2, 1, lastRow - 1, INTAKE_HEADERS.length).getValues();
  var list = values.map(function(row) {
    var o = {};
    INTAKE_HEADERS.forEach(function(h, i) {
      var v = row[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
      o[h] = v;
    });
    o.followup = computeIntakeFollowup_(o, todayStr);
    return o;
  });
  if (!opts.includeCancelled) {
    list = list.filter(function(r){ return r.ステータス !== 'cancelled'; });
  }
  if (opts.status) list = list.filter(function(r){ return r.ステータス === opts.status; });
  if (opts.pendingApproval) {
    list = list.filter(function(r){ return r.社長確認依頼日時 && !r.社長確認済; });
  }
  list.sort(function(a, b){ return (b.作成日時 || '').localeCompare(a.作成日時 || ''); });
  return list;
}

// 朝の報告用: 体験後フォロー未対応（🟡🔴）レコードを返す
function getIntakeFollowupPending(ss) {
  var list = getIntakeList(ss, {});
  var result = list.filter(function(r){
    return (r.followup && (r.followup.追客 || r.followup.ケアマネ));
  }).map(function(r){
    return {
      id: r.id, 氏名: r.氏名, ふりがな: r.ふりがな,
      予定日: r.予定日, ケアマネ氏名: r.ケアマネ氏名,
      追客: r.followup.追客, ケアマネ: r.followup.ケアマネ,
      主担当: '勝又', 副担当: '下浦'
    };
  });
  return { success: true, pending: result, count: result.length };
}

// ============================================================
// 2026-05-31 Phase C カンバン化（フェーズ移行・遷移ゲート・ドロップ・ファネル・初回利用日・自動アーカイブ）
// ============================================================

// 既存「ステータス」→「フェーズ」へ一括移行（冪等・dryRun対応）
function migrateIntakeStatusToPhase_20260531(ss, opts) {
  opts = opts || {};
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: 'シートなし' };
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(v){ return String(v).trim(); });
  var idxStatus = headers.indexOf('ステータス');
  var idxKind = headers.indexOf('種別');
  var idxPlan = headers.indexOf('予定日');
  var idxPhase = headers.indexOf('フェーズ');
  var idxName = headers.indexOf('氏名');
  if (idxStatus < 0 || idxKind < 0 || idxPhase < 0) {
    return { success: false, error: '必要列なし（ステータス/種別/フェーズ）' };
  }
  var mapping = [], ambiguous = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[idxPhase] || '').trim()) continue; // 移行済みskip
    var status = String(row[idxStatus] || '').trim();
    var kind = String(row[idxKind] || '').trim();
    var plan = row[idxPlan];
    var newPhase = '', note = '';
    if (status === 'pending' || status === 'scheduled') {
      newPhase = !plan ? '受付' : (kind === 'visit' ? '見学' : '体験');
    } else if (status === 'done') {
      newPhase = (kind === 'visit') ? '体験' : '契約準備'; note = 'done→要確認';
    } else if (status === 'on_hold') {
      newPhase = '体験'; note = '保留→体験で再判断';
    } else if (status === 'contracted') {
      newPhase = '利用開始準備';
    } else if (status === 'active') {
      newPhase = 'アーカイブ';
    } else if (status === 'rejected' || status === 'cancelled') {
      newPhase = 'ドロップ';
    } else {
      newPhase = '受付'; note = '不明ステータス:' + status;
    }
    if (note) ambiguous.push({ row: i+1, name: row[idxName], status: status, newPhase: newPhase, note: note });
    mapping.push({ row: i+1, newPhase: newPhase });
  }
  if (opts.dryRun) {
    return { success: true, dryRun: true, total: mapping.length, ambiguous: ambiguous };
  }
  mapping.forEach(function(m){ sheet.getRange(m.row, idxPhase + 1).setValue(m.newPhase); });
  return { success: true, dryRun: false, migrated: mapping.length, ambiguous: ambiguous };
}

// フェーズ遷移ゲート定義（充足必須フィールド・pacemaker は有/無いずれか必須）
var INTAKE_PHASE_GATES = {
  '受付→見学':   { fields: ['氏名','TEL','エリア','種別'] },
  '受付→体験':   { fields: ['氏名','TEL','エリア'], pacemaker: true },
  '見学→体験':   { fields: ['見学完了','体験打診結果'], pacemaker: true },
  '見学→ドロップ': { fields: ['見学完了'] },
  '体験→契約準備': { fields: ['体験完了','利用意向'] },
  '体験→ドロップ': { fields: ['体験完了'] },
  '契約準備→利用開始準備': { fields: ['契約日','本格利用開始日','利用者台帳反映済'] },
  '利用開始準備→アーカイブ': { fields: ['名札_通常済','名札_荷物済','名札_ハンガー済','名札_ドリンク済','名札_靴済','写真撮影済'] }
};

// フェーズを次段階へ進める（ゲート未充足なら blocked。data.force で強制可）
function advanceIntakePhase(ss, data) {
  if (!data || !data.id || !data.toPhase) return { success: false, error: 'id,toPhase必須' };
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: 'シートなし' };
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(v){return String(v).trim();});
  var idxId = headers.indexOf('id'), idxPhase = headers.indexOf('フェーズ');
  var values = sheet.getDataRange().getValues();
  var rowIdx = -1, rec = null;
  for (var i=1;i<values.length;i++){
    if (String(values[i][idxId]) === String(data.id)) {
      rowIdx = i+1; rec = {}; headers.forEach(function(h,j){ rec[h]=values[i][j]; }); break;
    }
  }
  if (!rec) return { success: false, error: '該当なし' };
  var transition = String(rec['フェーズ'] || '受付') + '→' + data.toPhase;
  var gate = INTAKE_PHASE_GATES[transition];
  if (!gate) return { success: false, error: '不正な遷移: ' + transition };
  var missing = [];
  gate.fields.forEach(function(f){
    var v = rec[f];
    if (v === '' || v === null || v === undefined || v === false) missing.push(f);
  });
  if (gate.pacemaker) {
    if (['有','無'].indexOf(String(rec['ペースメーカー'])) === -1) missing.push('ペースメーカー(有/無)');
  }
  if (missing.length && !data.force) {
    return { success: false, blocked: true, missing: missing, transition: transition };
  }
  sheet.getRange(rowIdx, idxPhase + 1).setValue(data.toPhase);
  sheet.getRange(rowIdx, headers.indexOf('更新日時') + 1).setValue(nowIso());
  return { success: true, transition: transition };
}

// フェーズを「ドロップ」にし理由・記録日時を保存
function dropIntake(ss, data) {
  if (!data || !data.id || !data.reason) return { success: false, error: 'id,reason必須' };
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: 'シートなし' };
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(v){return String(v).trim();});
  var idxId = headers.indexOf('id'), idxPhase = headers.indexOf('フェーズ');
  var idxReason = headers.indexOf('ドロップ理由'), idxAt = headers.indexOf('ドロップ記録日時');
  var idxDetail = headers.indexOf('利用なし理由詳細');
  var values = sheet.getDataRange().getValues(), rowIdx = -1;
  for (var i=1;i<values.length;i++){ if (String(values[i][idxId])===String(data.id)){ rowIdx=i+1; break; } }
  if (rowIdx < 0) return { success: false, error: '該当なし' };
  sheet.getRange(rowIdx, idxPhase+1).setValue('ドロップ');
  sheet.getRange(rowIdx, idxReason+1).setValue(data.reason);
  sheet.getRange(rowIdx, idxAt+1).setValue(nowIso());
  if (data.detail && idxDetail >= 0) sheet.getRange(rowIdx, idxDetail+1).setValue(data.detail);
  return { success: true };
}

// 月別ファネル（問い合わせ日の年月で集計・各段階は累積で算出）
function getIntakeFunnel(ss, params) {
  var ym = (params && params.yearMonth) ? params.yearMonth : Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM');
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: 'シートなし' };
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(v){return String(v).trim();});
  var idxAsk = headers.indexOf('問い合わせ日'), idxPhase = headers.indexOf('フェーズ');
  var idxReason = headers.indexOf('ドロップ理由');
  var counts = { 受付:0,見学:0,体験:0,契約準備:0,利用開始準備:0,アーカイブ:0,ドロップ:0 };
  var dropByReason = {};
  for (var i=1;i<values.length;i++){
    var ask = values[i][idxAsk], askYm = '';
    if (ask instanceof Date) askYm = Utilities.formatDate(ask,'Asia/Tokyo','yyyy-MM');
    else if (typeof ask === 'string' && ask.length >= 7) askYm = ask.slice(0,7);
    if (askYm !== ym) continue;
    var ph = String(values[i][idxPhase] || '受付');
    if (counts[ph] !== undefined) counts[ph]++;
    if (ph === 'ドロップ') { var rs = String(values[i][idxReason]||'other'); dropByReason[rs]=(dropByReason[rs]||0)+1; }
  }
  var funnel = {
    受付: counts.受付+counts.見学+counts.体験+counts.契約準備+counts.利用開始準備+counts.アーカイブ+counts.ドロップ,
    見学: counts.見学+counts.体験+counts.契約準備+counts.利用開始準備+counts.アーカイブ,
    体験: counts.体験+counts.契約準備+counts.利用開始準備+counts.アーカイブ,
    契約: counts.契約準備+counts.利用開始準備+counts.アーカイブ,
    利用開始: counts.利用開始準備+counts.アーカイブ
  };
  return { success: true, yearMonth: ym, funnel: funnel, dropByReason: dropByReason, rawCounts: counts };
}

// 利用開始日＋利用曜日から各曜日の初回利用日を算出（開始日から14日以内の最初の該当曜日）
function computeFirstUsageDates_(startDateStr, days, ampm) {
  if (!startDateStr || !days) return [];
  var startD = new Date(String(startDateStr).slice(0,10) + 'T00:00:00');
  if (isNaN(startD.getTime())) return [];
  var dayMap = {'日':0,'月':1,'火':2,'水':3,'木':4,'金':5,'土':6};
  var targets = String(days).split('').filter(function(c){return dayMap[c]!==undefined;}).map(function(c){return dayMap[c];});
  var result = [];
  targets.forEach(function(t){
    for (var i=0;i<14;i++){
      var d = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate()+i);
      if (d.getDay() === t) {
        result.push({ date: Utilities.formatDate(d,'Asia/Tokyo','yyyy-MM-dd'),
          dow: ['日','月','火','水','木','金','土'][t],
          ampm: (ampm && String(ampm).indexOf('午前')>=0)?'AM':'PM', 送迎準備済:false });
        break;
      }
    }
  });
  result.sort(function(a,b){ return a.date < b.date ? -1 : 1; });
  return result;
}

// 利用開始30日経過の「利用開始準備」カードを自動アーカイブ（日次トリガー）
function autoArchiveIntakeCards() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success:false, error:'シートなし' };
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(v){return String(v).trim();});
  var idxPhase = headers.indexOf('フェーズ'), idxStart = headers.indexOf('本格利用開始日');
  if (idxPhase < 0 || idxStart < 0) return { success:false, error:'列なし' };
  var today = new Date(); today.setHours(0,0,0,0);
  var threshold = new Date(today.getFullYear(), today.getMonth(), today.getDate()-30);
  var archived = 0;
  for (var i=1;i<values.length;i++){
    if (String(values[i][idxPhase]) !== '利用開始準備') continue;
    var sd = values[i][idxStart];
    var sdDate = (sd instanceof Date) ? sd : (typeof sd==='string' && sd ? new Date(sd.slice(0,10)+'T00:00:00') : null);
    if (!sdDate || isNaN(sdDate.getTime())) continue;
    if (sdDate <= threshold) { sheet.getRange(i+1, idxPhase+1).setValue('アーカイブ'); archived++; }
  }
  return { success:true, archived: archived };
}

// 自動アーカイブの日次トリガーを登録（重複排除・毎日3時台）
function setupAutoArchiveTrigger_20260531() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'autoArchiveIntakeCards') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoArchiveIntakeCards').timeBased().everyDays(1).atHour(3).create();
  return { success: true };
}

function updateIntake(ss, data) {
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet || !data.id) return { success: false, error: 'id必須' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'データなし' };
  var ids = sheet.getRange(2, INTAKE_COL.id, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === data.id) {
      var rowNum = i + 2;
      var now = nowIso();
      // 予定日変更検知用に既存値を取得
      var oldYoteibi = sheet.getRange(rowNum, INTAKE_COL['予定日']).getValue();
      var oldYoteibiStr = oldYoteibi instanceof Date
        ? Utilities.formatDate(oldYoteibi, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(oldYoteibi || '');
      INTAKE_HEADERS.forEach(function(h) {
        if (h === 'id' || h === '作成日時') return;
        if (h === '更新日時') { sheet.getRange(rowNum, INTAKE_COL[h]).setValue(now); return; }
        if (data[h] !== undefined) {
          sheet.getRange(rowNum, INTAKE_COL[h]).setValue(data[h]);
        }
      });
      var autoTs = {
        'ケアマネ連絡済': 'ケアマネ連絡日時',
        '送迎時間連絡済': '送迎時間連絡日時',
        '社長確認済':     '社長確認日時',
        'ケアマネ報告済': 'ケアマネ報告日時'
      };
      Object.keys(autoTs).forEach(function(flag) {
        if (data[flag] === true) {
          sheet.getRange(rowNum, INTAKE_COL[autoTs[flag]]).setValue(now);
        }
      });
      // 予定日が「空 → 入った」または「変更された」場合、社長に通知
      var newYoteibi = String(data.予定日 || '');
      if (newYoteibi && newYoteibi !== oldYoteibiStr) {
        var rowData = sheet.getRange(rowNum, 1, 1, INTAKE_HEADERS.length).getValues()[0];
        var notifyRecord = {};
        INTAKE_HEADERS.forEach(function(h, idx) {
          var v = rowData[idx];
          if (v instanceof Date) v = Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
          notifyRecord[h] = v;
        });
        notifyOwnerOfNewSchedule(notifyRecord, !oldYoteibiStr);
      }
      return { success: true };
    }
  }
  return { success: false, error: 'id一致せず' };
}

function deleteIntake(ss, data) {
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet || !data.id) return { success: false, error: 'id必須' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'データなし' };
  var ids = sheet.getRange(2, INTAKE_COL.id, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === data.id) {
      sheet.deleteRow(i + 2);
      return { success: true };
    }
  }
  return { success: false, error: 'id一致せず' };
}

// 2026-05-31: 受付強化＋カンバン化の新規列を冪等に追加
function ensureIntakeColumns_20260531(ss) {
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: '見学体験新規シートなし' };
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(v){ return String(v).trim(); });
  var added = [];
  INTAKE_HEADERS.forEach(function(name){
    if (headers.indexOf(name) < 0) {
      lastCol++;
      sheet.getRange(1, lastCol).setValue(name);
      added.push(name);
    }
  });
  return { success: true, addedColumns: added };
}

// 2026-05-31: 営業日（月〜金営業・土日休館・祝日は営業扱い）ベースのN営業日後を返す
function addBusinessDays_(dateStr, n) {
  var d = new Date(String(dateStr).slice(0,10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  var added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    var dow = d.getDay(); // 0=日,6=土
    if (dow !== 0 && dow !== 6) added++;
  }
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

// 体験後フォロー状態を算出（追客・ケアマネの2軸）
function computeIntakeFollowup_(r, todayStr) {
  var fu = { 追客: '', ケアマネ: '' };
  var plan = r.予定日 ? String(r.予定日).slice(0,10) : '';
  var kind = r.種別;
  // #13 追客: 体験(trial)で予定日経過・利用意向未入力
  if (kind === 'trial' && plan && plan <= todayStr) {
    var iko = String(r.利用意向 || '').trim();
    if (!iko) {
      var due = addBusinessDays_(plan, 1);
      fu.追客 = (due && todayStr > due) ? '🔴追客超過' : '🟡要追客';
    } else if (iko === '保留') {
      var base = r.更新日時 ? String(r.更新日時).slice(0,10) : plan;
      var redue = addBusinessDays_(base, 3);
      if (redue && todayStr >= redue) fu.追客 = '🟡再追客';
    }
  }
  // #14 ケアマネ可否連絡: 利用意向=あり かつ 可否連絡日 未入力
  if (String(r.利用意向 || '').trim() === 'あり' && !r.ケアマネ利用可否連絡日) {
    var base2 = r.更新日時 ? String(r.更新日時).slice(0,10) : (plan || todayStr);
    var due2 = addBusinessDays_(base2, 1);
    fu.ケアマネ = (due2 && todayStr > due2) ? '🔴ケアマネ連絡超過' : '🟡ケアマネ連絡待ち';
  }
  return fu;
}

function requestOwnerApproval(ss, data) {
  if (!data.id) return { success: false, error: 'id必須' };
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return { success: false, error: 'シートなし' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: 'データなし' };
  var ids = sheet.getRange(2, INTAKE_COL.id, lastRow - 1, 1).getValues();
  var rowNum = -1;
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === data.id) { rowNum = i + 2; break; }
  }
  if (rowNum === -1) return { success: false, error: 'id一致せず' };

  var values = sheet.getRange(rowNum, 1, 1, INTAKE_HEADERS.length).getValues()[0];
  var record = {};
  INTAKE_HEADERS.forEach(function(h, i){ record[h] = values[i]; });

  sheet.getRange(rowNum, INTAKE_COL['社長確認依頼日時']).setValue(nowIso());
  sheet.getRange(rowNum, INTAKE_COL['更新日時']).setValue(nowIso());

  var kindLabel = record.種別 === 'trial' ? '体験' : '見学';
  var subject = '【yawaragi社長確認】' + kindLabel + '記録：' + record.氏名 + '様';
  var body = [
    '社長、確認をお願いします。',
    '',
    '種別：' + kindLabel,
    '氏名：' + record.氏名 + '（' + (record.ふりがな || '') + '）',
    '介護度：' + (record.介護度 || '未入力'),
    'TEL：' + record.TEL,
    '問い合わせ日：' + record.問い合わせ日,
    '予定日：' + (record.予定日 || '未定'),
    'ケアマネ：' + (record.ケアマネ氏名 || '未入力'),
    'ペースメーカー：' + record.ペースメーカー,
    '',
    '主訴：' + (record.主訴 || ''),
    '',
    'yawaragiは何番目：' + (record.yawaragi何番目 || '-'),
    '他デイ見学：' + (record.他デイ見学 ? '有' : '無'),
    '',
    '━━━━━━━━━━━━━━━━━━━',
    'yawaragiボード > 見学・体験・新規 タブで確認＆承認してください。',
    '登録者：' + (record.登録者 || '不明')
  ].join('\n');

  try {
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, body, { charset: 'UTF-8' });
    return { success: true, emailed: true };
  } catch (e) {
    return { success: true, emailed: false, emailError: e.message };
  }
}

// ===== 区変管理: 現在区変中の利用者リストを返す =====
function handleKubunHenkouList(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;

  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var sheet = ss.getSheetByName('利用者台帳');
    if (!sheet) return respond({ error: 'シートが見つかりません' }, callback);

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return respond({ count: 0, active: [] }, callback);

    var headers = data[0].map(function(h) { return String(h).trim(); });
    var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
    var flagCol = findCol(headers, ['区変中フラグ']);
    var applyCol = findCol(headers, ['申請日']);
    var expectCol = findCol(headers, ['結果待ち目安日']);
    var prevCareCol = findCol(headers, ['区変前介護度']);

    if (flagCol < 0) return respond({ error: '「区変中フラグ」列が見つかりません' }, callback);

    var active = [];
    var now = new Date();
    for (var i = 1; i < data.length; i++) {
      var flag = String(data[i][flagCol] || '').trim().toUpperCase();
      if (flag !== 'TRUE') continue;

      var name = String(data[i][nameCol] || '').trim();
      var applyDate = fmtDate(data[i][applyCol]);
      var expectDate = fmtDate(data[i][expectCol]);
      var prevCare = prevCareCol >= 0 ? String(data[i][prevCareCol] || '').trim() : '';

      var daysOver = 0;
      if (expectDate) {
        var expect = new Date(expectDate);
        var diff = Math.floor((now - expect) / (1000 * 60 * 60 * 24));
        if (diff > 0) daysOver = diff;
      }

      active.push({
        name: name,
        applyDate: applyDate,
        expectDate: expectDate,
        prevCareLevel: prevCare,
        daysOver: daysOver
      });
    }

    return respond({
      count: active.length,
      active: active,
      generatedAt: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
    }, callback);

  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 区変管理: 区変をONにする =====
function handleKubunHenkouSet(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var name = (e && e.parameter) ? e.parameter.name : null;
  var applyDate = (e && e.parameter) ? e.parameter.applyDate : null;
  var expectDate = (e && e.parameter) ? e.parameter.expectDate : null;

  if (!name) {
    return respond({ error: 'name は必須です' }, callback);
  }
  if (applyDate === undefined) applyDate = '';

  try {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました（他の処理が実行中の可能性）' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('利用者台帳');
      if (!sheet) return respond({ error: 'シートが見つかりません' }, callback);

      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });

      var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
      var careCol = findColP(headers, '介護度');
      var flagCol = findCol(headers, ['区変中フラグ']);
      var applyCol = findCol(headers, ['申請日']);
      var expectCol = findCol(headers, ['結果待ち目安日']);
      var prevCareCol = findCol(headers, ['区変前介護度']);

      if (flagCol < 0 || applyCol < 0 || expectCol < 0 || prevCareCol < 0) {
        return respond({ error: '区変関連列が利用者台帳に見つかりません' }, callback);
      }

      var targetRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol] || '').trim() === name.trim()) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow < 0) {
        return respond({ error: '該当利用者が見つかりません: ' + name }, callback);
      }

      var currentFlag = String(data[targetRow - 1][flagCol] || '').trim().toUpperCase();
      if (currentFlag === 'TRUE') {
        var existingApply = fmtDate(data[targetRow - 1][applyCol]);
        return respond({ error: '既に区変中です（申請日: ' + existingApply + '）' }, callback);
      }

      if (!expectDate && applyDate) {
        var ad = new Date(applyDate);
        ad.setDate(ad.getDate() + 45);
        expectDate = Utilities.formatDate(ad, 'Asia/Tokyo', 'yyyy-MM-dd');
      }

      var currentCare = careCol >= 0 ? String(data[targetRow - 1][careCol] || '').trim() : '';

      sheet.getRange(targetRow, flagCol + 1).setValue('TRUE');
      sheet.getRange(targetRow, applyCol + 1).setValue(applyDate || '');
      sheet.getRange(targetRow, expectCol + 1).setValue(expectDate || '');
      sheet.getRange(targetRow, prevCareCol + 1).setValue(currentCare);

      return respond({
        ok: true,
        name: name,
        applyDate: applyDate,
        expectDate: expectDate,
        prevCareLevel: currentCare
      }, callback);

    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 区変管理: 区変中の利用者の申請日/結果待ち目安日を編集 =====
function handleKubunHenkouUpdate(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var name = (e && e.parameter) ? e.parameter.name : null;
  var applyDate = (e && e.parameter) ? e.parameter.applyDate : null;
  var expectDate = (e && e.parameter) ? e.parameter.expectDate : null;

  if (!name) {
    return respond({ error: 'name は必須です' }, callback);
  }
  if (applyDate === undefined || applyDate === null) applyDate = '';
  if (expectDate === undefined || expectDate === null) expectDate = '';

  try {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました（他の処理が実行中の可能性）' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('利用者台帳');
      if (!sheet) return respond({ error: 'シートが見つかりません' }, callback);

      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });

      var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
      var flagCol = findCol(headers, ['区変中フラグ']);
      var applyCol = findCol(headers, ['申請日']);
      var expectCol = findCol(headers, ['結果待ち目安日']);

      if (flagCol < 0 || applyCol < 0 || expectCol < 0) {
        return respond({ error: '区変関連列が利用者台帳に見つかりません' }, callback);
      }

      var targetRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol] || '').trim() === name.trim()) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow < 0) {
        return respond({ error: '該当利用者が見つかりません: ' + name }, callback);
      }

      var currentFlag = String(data[targetRow - 1][flagCol] || '').trim().toUpperCase();
      if (currentFlag !== 'TRUE') {
        return respond({ error: 'この利用者は区変中ではありません: ' + name }, callback);
      }

      sheet.getRange(targetRow, applyCol + 1).setValue(applyDate || '');
      sheet.getRange(targetRow, expectCol + 1).setValue(expectDate || '');

      return respond({
        ok: true,
        name: name,
        applyDate: applyDate,
        expectDate: expectDate
      }, callback);

    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 区変管理: 区変をOFFにする（履歴追加+介護度上書き） =====
function handleKubunHenkouClear(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var name = (e && e.parameter) ? e.parameter.name : null;
  var newCare = (e && e.parameter) ? e.parameter.newCare : null;
  var resultDate = (e && e.parameter) ? e.parameter.resultDate : null;
  var okureMonths = (e && e.parameter) ? (e.parameter.okureMonths || '') : '';
  var usageChange = (e && e.parameter) ? (e.parameter.usageChange || '') : '';
  var kind = (e && e.parameter) ? (e.parameter.kind || '') : ''; // '区分変更' or '更新'
  var authPeriodStart = (e && e.parameter) ? (e.parameter.authPeriodStart || '') : '';
  var authPeriodEnd = (e && e.parameter) ? (e.parameter.authPeriodEnd || '') : '';
  // 2026-05-29 予約反映機能: applyMonth ('immediate'/空 or 'YYYY-MM')
  var applyMonth = (e && e.parameter) ? String(e.parameter.applyMonth || '').trim() : '';

  if (!name || !newCare || !resultDate) {
    return respond({ error: 'name, newCare, resultDate は必須です' }, callback);
  }

  // applyMonth バリデーション
  var isReserve = false;
  if (applyMonth && applyMonth !== 'immediate') {
    if (!/^\d{4}-\d{2}$/.test(applyMonth)) {
      return respond({ error: 'applyMonth は YYYY-MM 形式で指定してください' }, callback);
    }
    var today_ym = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
    if (applyMonth > today_ym) {
      isReserve = true;
    }
    // 過去月や当月指定は即時扱い（isReserve=false のまま）
  }

  try {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました（他の処理が実行中の可能性）' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('利用者台帳');
      var historySheet = ss.getSheetByName('区変履歴');
      if (!sheet) return respond({ error: '利用者台帳シートが見つかりません' }, callback);
      if (!historySheet) return respond({ error: '区変履歴シートが見つかりません' }, callback);

      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });

      var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
      var careCol = findColP(headers, '介護度');
      var flagCol = findCol(headers, ['区変中フラグ']);
      var applyCol = findCol(headers, ['申請日']);
      var expectCol = findCol(headers, ['結果待ち目安日']);
      var prevCareCol = findCol(headers, ['区変前介護度']);
      // 2026-05-29 予約列
      var resCareCol = findCol(headers, ['予約介護度']);
      var resCareMonthCol = findCol(headers, ['介護度適用月']);

      if (flagCol < 0 || applyCol < 0 || expectCol < 0 || prevCareCol < 0) {
        return respond({ error: '区変関連列が利用者台帳に見つかりません' }, callback);
      }
      if (isReserve && (resCareCol < 0 || resCareMonthCol < 0)) {
        return respond({ error: '予約介護度列が利用者台帳に見つかりません（maintenance_add_yoyaku_columns を実行してください）' }, callback);
      }

      var targetRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol] || '').trim() === name.trim()) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow < 0) {
        return respond({ error: '該当利用者が見つかりません: ' + name }, callback);
      }

      var currentFlag = String(data[targetRow - 1][flagCol] || '').trim().toUpperCase();
      if (currentFlag !== 'TRUE') {
        return respond({ error: '区変中ではありません' }, callback);
      }

      var applyDate = fmtDate(data[targetRow - 1][applyCol]);
      var prevCare = String(data[targetRow - 1][prevCareCol] || '').trim();

      // 1. 履歴シートに追加（失敗したら中断・台帳は無変更）
      var okureNote = '';
      if (isReserve) {
        okureNote = '予約中:' + applyMonth;
        if (okureMonths) okureNote += ' 月遅れ:' + okureMonths;
      } else {
        okureNote = okureMonths ? '月遅れ:' + okureMonths : '';
      }
      historySheet.appendRow([
        '',
        name,
        applyDate,
        resultDate,
        prevCare,
        newCare,
        okureNote
      ]);
      var newRowIndex = historySheet.getLastRow();

      // 1.5 追加フィールドを区変履歴シートに保存
      if (usageChange || kind || authPeriodStart || authPeriodEnd) {
        migrateKubunHistoryColumns_(historySheet);
        if (usageChange) historySheet.getRange(newRowIndex, 9).setValue(usageChange);
        if (kind) historySheet.getRange(newRowIndex, 17).setValue(kind);
        if (authPeriodStart) historySheet.getRange(newRowIndex, 18).setValue(authPeriodStart);
        if (authPeriodEnd) historySheet.getRange(newRowIndex, 19).setValue(authPeriodEnd);
      }

      if (isReserve) {
        // 2-R. 予約モード: 予約列に書き込み、本体「介護度」は触らない
        sheet.getRange(targetRow, resCareCol + 1).setValue(newCare);
        sheet.getRange(targetRow, resCareMonthCol + 1).setValue(applyMonth);
        // 区変フラグ・申請日・結果待ち目安日・区変前介護度はクリア（結果は確定したため）
        sheet.getRange(targetRow, flagCol + 1).setValue('FALSE');
        sheet.getRange(targetRow, applyCol + 1).setValue('');
        sheet.getRange(targetRow, expectCol + 1).setValue('');
        sheet.getRange(targetRow, prevCareCol + 1).setValue('');
      } else {
        // 2-I. 即時モード: 従来通り台帳の介護度列を新介護度で上書き
        if (careCol >= 0) {
          sheet.getRange(targetRow, careCol + 1).setValue(newCare);
        }
        sheet.getRange(targetRow, flagCol + 1).setValue('FALSE');
        sheet.getRange(targetRow, applyCol + 1).setValue('');
        sheet.getRange(targetRow, expectCol + 1).setValue('');
        sheet.getRange(targetRow, prevCareCol + 1).setValue('');
      }

      return respond({
        ok: true,
        name: name,
        applyDate: applyDate,
        resultDate: resultDate,
        prevCareLevel: prevCare,
        newCareLevel: newCare,
        okureMonths: okureMonths,
        usageChange: usageChange,
        kind: kind,
        authPeriodStart: authPeriodStart,
        authPeriodEnd: authPeriodEnd,
        applyMonth: isReserve ? applyMonth : '',
        mode: isReserve ? 'reserve' : 'immediate',
        historyRowIndex: newRowIndex
      }, callback);

    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 予約反映機能（2026-05-29）=====

// 予約中の全利用者を返すAPI
function handleListScheduled(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var sheet = ss.getSheetByName('利用者台帳');
    if (!sheet) return respond({ error: '利用者台帳シートが見つかりません' }, callback);

    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
    var careCol = findColP(headers, '介護度');
    var cmOfficeCol = findCol(headers, ['ケアマネ事業所名', 'ケアマネ事業所']);
    var cmStaffCol = findCol(headers, ['ケアマネ担当者名', 'ケアマネ担当者', '担当ケアマネ']);
    var resCareCol = findCol(headers, ['予約介護度']);
    var resCareMonthCol = findCol(headers, ['介護度適用月']);
    var resOfficeCol = findCol(headers, ['予約ケアマネ事業所']);
    var resStaffCol = findCol(headers, ['予約ケアマネ担当者']);
    var resCmMonthCol = findCol(headers, ['ケアマネ適用月']);

    var items = [];

    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][nameCol] || '').trim();
      if (!name) continue;

      // 介護度予約
      var rCare = resCareCol >= 0 ? String(data[i][resCareCol] || '').trim() : '';
      var rCareMonth = resCareMonthCol >= 0 ? String(data[i][resCareMonthCol] || '').trim() : '';
      if (rCare && rCareMonth) {
        items.push({
          name: name,
          kind: '介護度',
          oldValue: careCol >= 0 ? String(data[i][careCol] || '').trim() : '',
          newValue: rCare,
          applyMonth: rCareMonth
        });
      }

      // ケアマネ予約
      var rOffice = resOfficeCol >= 0 ? String(data[i][resOfficeCol] || '').trim() : '';
      var rStaff = resStaffCol >= 0 ? String(data[i][resStaffCol] || '').trim() : '';
      var rCmMonth = resCmMonthCol >= 0 ? String(data[i][resCmMonthCol] || '').trim() : '';
      if (rOffice && rCmMonth) {
        var oldOffice = cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '';
        var oldStaff = cmStaffCol >= 0 ? String(data[i][cmStaffCol] || '').trim() : '';
        items.push({
          name: name,
          kind: 'ケアマネ',
          oldValue: oldOffice + ' / ' + oldStaff,
          newValue: rOffice + ' / ' + rStaff,
          applyMonth: rCmMonth
        });
      }
    }

    // 適用月昇順→種別昇順でソート
    items.sort(function(a, b) {
      if (a.applyMonth !== b.applyMonth) return a.applyMonth < b.applyMonth ? -1 : 1;
      return a.kind < b.kind ? -1 : 1;
    });

    return respond({
      count: items.length,
      items: items,
      generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
    }, callback);
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// 日次トリガーで実行する予約反映関数の本体
// 利用曜日変更の newDays（「火午後」「火午前,金午後」形式）を利用者台帳の {利用曜日, 午前/午後} に変換
function parseNewDaysToLedger_(newDays) {
  var WD = ['月', '火', '水', '木', '金', '土'];
  var slots = String(newDays || '').split(/[,、・\s]/).filter(String);
  var dayList = [], ampmByDay = {}, hasAmpm = false;
  slots.forEach(function(s) {
    var d = WD.filter(function(x) { return s.indexOf(x) >= 0; })[0];
    if (!d) return;
    if (dayList.indexOf(d) < 0) dayList.push(d);
    var ap = s.indexOf('午前') >= 0 ? '午前' : (s.indexOf('午後') >= 0 ? '午後' : '');
    if (ap) { hasAmpm = true; if (!ampmByDay[d]) ampmByDay[d] = []; if (ampmByDay[d].indexOf(ap) < 0) ampmByDay[d].push(ap); }
  });
  var days = WD.filter(function(d) { return dayList.indexOf(d) >= 0; }).join('');
  var ampm = '';
  if (hasAmpm) {
    var dwa = WD.filter(function(d) { return ampmByDay[d]; });
    var allAps = [];
    dwa.forEach(function(d) { ampmByDay[d].forEach(function(a) { if (allAps.indexOf(a) < 0) allAps.push(a); }); });
    var allSingle = dwa.every(function(d) { return ampmByDay[d].length === 1; });
    if (allSingle && allAps.length === 1) ampm = allAps[0];
    else if (dwa.every(function(d) { return ampmByDay[d].length === 2; })) ampm = '午前午後';
    else ampm = dwa.map(function(d) { return ampmByDay[d].map(function(a) { return d + a; }).join('、'); }).join('、');
  }
  return { days: days, ampm: ampm };
}

// 利用曜日変更イベント(usage_days_change)のうち適用開始日が到来した分を利用者台帳に反映
// 日単位で判定。反映済みは metadata.appliedToLedger フラグで二重反映を防止。
// dryRun=true なら台帳に書き込まず対象だけ返す（テスト用）。asOfDate で基準日を上書き可。
function applyDueUsageDaysChanges_(ss, userSheet, userData, userNameCol, daysCol, ampmCol, asOfDate, dryRun) {
  var evSheet = ss.getSheetByName('利用者イベント');
  if (!evSheet || daysCol < 0) return [];
  var todayYmd = asOfDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var evData = evSheet.getDataRange().getValues();
  // listUserEvents と同じ固定列インデックス（0:id 1:eventType 2:userName 3:eventDate 4:metadata）
  var typeC = 1, nameC = 2, metaC = 4;
  var result = [];
  for (var i = 1; i < evData.length; i++) {
    if (String(evData[i][typeC]).trim() !== 'usage_days_change') continue;
    var meta;
    try { meta = JSON.parse(evData[i][metaC] || '{}'); } catch (e) { continue; }
    if (meta.appliedToLedger) continue;
    var eff = String(meta.effectiveDate || '').trim();
    if (!eff || eff > todayYmd) continue;       // 適用日がまだ来ていない
    var newDays = String(meta.newDays || '').trim();
    if (!newDays) continue;
    var conv = parseNewDaysToLedger_(newDays);
    var uname = String(evData[i][nameC]).trim();
    var oldDays = '', oldAmpm = '', found = false;
    for (var j = 1; j < userData.length; j++) {
      if (String(userData[j][userNameCol]).trim() === uname) {
        oldDays = daysCol >= 0 ? String(userData[j][daysCol] || '').trim() : '';
        oldAmpm = ampmCol >= 0 ? String(userData[j][ampmCol] || '').trim() : '';
        if (!dryRun) {
          if (daysCol >= 0 && conv.days) userSheet.getRange(j + 1, daysCol + 1).setValue(conv.days);
          if (ampmCol >= 0 && conv.ampm) userSheet.getRange(j + 1, ampmCol + 1).setValue(conv.ampm);
        }
        found = true;
        break;
      }
    }
    if (!dryRun && found) {
      meta.appliedToLedger = true;
      meta.appliedDate = todayYmd;
      evSheet.getRange(i + 1, metaC + 1).setValue(JSON.stringify(meta));
    }
    result.push({
      name: uname, kind: '利用曜日', found: found,
      from: oldDays + (oldAmpm ? (' ' + oldAmpm) : ''),
      to: conv.days + (conv.ampm ? (' ' + conv.ampm) : ''),
      month: eff
    });
  }
  return result;
}

// ケアマネ変更予約：適用日到来かつ未適用の caremanager_relay を抽出（純関数・test-caremanager-relay.js と同一）
function pickDueCaremanagerRelays_(evRows, asOfYmd) {
  var typeC = 1, nameC = 2, metaC = 4;
  var out = [];
  for (var i = 1; i < evRows.length; i++) {
    if (String(evRows[i][typeC]).trim() !== 'caremanager_relay') continue;
    var meta;
    try { meta = JSON.parse(evRows[i][metaC] || '{}'); } catch (e) { continue; }
    if (meta.appliedToLedger) continue;
    var eff = String(meta.effectiveDate || '').trim();
    if (!eff || eff > asOfYmd) continue;
    out.push({ rowIndex: i, userName: String(evRows[i][nameC]).trim(), meta: meta });
  }
  return out;
}

// 送付用居宅一覧：事業所名で既存行を探し、あれば更新・無ければ追加（純関数・重複行を作らない）
function buildCmContactUpsert_(contactRows, cols, payload) {
  var office = String(payload.office || '').trim();
  var foundIdx = -1, dupCount = 0;
  for (var i = 0; i < contactRows.length; i++) {
    var o = cols.office >= 0 ? String(contactRows[i][cols.office] || '').trim() : '';
    if (o && o === office) { dupCount++; if (foundIdx < 0) foundIdx = i; }
  }
  var patch = {};
  if (cols.name   >= 0 && payload.name   != null) patch[cols.name]   = String(payload.name);
  if (cols.method >= 0 && payload.method != null) patch[cols.method] = String(payload.method);
  if (cols.email  >= 0 && payload.email  != null) patch[cols.email]  = String(payload.email);
  if (cols.fax    >= 0 && payload.fax    != null) patch[cols.fax]    = String(payload.fax);
  patch[cols.office] = office;
  if (foundIdx >= 0) return { action: 'update', rowIndex: foundIdx, patch: patch, dupCount: dupCount };
  return { action: 'insert', rowIndex: -1, patch: patch, dupCount: 0 };
}

// ケアマネ変更予約の反映（日次バッチから呼ぶ）。利用者台帳＋送付用居宅一覧へ波及。
// dryRun=true なら書き込まず、適用予定の差分だけ返す。
function applyDueCaremanagerChanges_(ss, asOfDate, dryRun) {
  var evSheet = ss.getSheetByName('利用者イベント');
  if (!evSheet) return [];
  var todayYmd = asOfDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var evRows = evSheet.getDataRange().getValues();
  var due = pickDueCaremanagerRelays_(evRows, todayYmd);
  if (!due.length) return [];

  var userSheet = ss.getSheetByName('利用者台帳');
  var userData = userSheet.getDataRange().getValues();
  var uh = userData[0].map(function (v) { return String(v).trim(); });
  var nameCol     = findCol(uh, ['名前', '氏名', '利用者名']);
  var cmOfficeCol = findCol(uh, ['ケアマネ事業所名', 'ケアマネ事業所']);
  var cmStaffCol  = findCol(uh, ['ケアマネ担当者名', 'ケアマネ担当', '担当ケアマネ']);
  var cmEmailCol  = findCol(uh, ['ケアマネ個人メアド', 'ケアマネメールアドレス', 'ケアマネメアド', 'メールアドレス']);
  var cmPhoneCol  = findCol(uh, ['ケアマネ電話番号', 'ケアマネTEL']);
  var cmMethodCol = findCol(uh, ['ケアマネ連絡手段', '連絡手段']);

  var cmSheet = getCmContactsSheet(ss);
  var cmCols = _readCmCols(cmSheet);
  var cmData = cmSheet.getDataRange().getValues();
  var cmContactRows = cmData.slice(1); // ヘッダ除く

  var result = [];
  due.forEach(function (d) {
    var m = d.meta;
    var newOffice = String(m.newCmOffice || '').trim();
    var newStaff  = String(m.newCmStaff || '').trim();
    var jisseki = m.jisseki || {};
    var absence = m.absence || {};

    // 1) 利用者台帳：該当利用者の行を更新（既存読み取り getUserCmContact と同じ正規化で照合・表記ゆれ対策）
    var ledgerFound = false;
    var dueNameNorm = _normalizeNameForMatch_(d.userName);
    for (var j = 1; j < userData.length; j++) {
      if (_normalizeNameForMatch_(userData[j][nameCol]) !== dueNameNorm) continue;
      ledgerFound = true;
      if (!dryRun) {
        if (cmOfficeCol >= 0 && newOffice) userSheet.getRange(j + 1, cmOfficeCol + 1).setValue(newOffice);
        if (cmStaffCol  >= 0 && newStaff)  userSheet.getRange(j + 1, cmStaffCol  + 1).setValue(newStaff);
        if (cmMethodCol >= 0 && absence.method) userSheet.getRange(j + 1, cmMethodCol + 1).setValue(absence.method);
        if (cmEmailCol  >= 0) userSheet.getRange(j + 1, cmEmailCol + 1).setValue(String(absence.email || ''));
        if (cmPhoneCol  >= 0) userSheet.getRange(j + 1, cmPhoneCol + 1).setValue(String(absence.phone || ''));
      }
      break;
    }

    // 2) 送付用居宅一覧：事業所行を upsert（重複作らない）
    var ups = null;
    if (newOffice) {
      ups = buildCmContactUpsert_(cmContactRows, cmCols, {
        office: newOffice, name: newStaff,
        method: jisseki.method || '', email: jisseki.email || '', fax: jisseki.fax || ''
      });
      if (!dryRun) {
        if (ups.action === 'update') {
          var srow = ups.rowIndex + 2; // ヘッダ＋0始まり補正
          Object.keys(ups.patch).forEach(function (cIdx) {
            cmSheet.getRange(srow, Number(cIdx) + 1).setValue(ups.patch[cIdx]);
          });
        } else {
          var lastCol = cmSheet.getLastColumn();
          var newRow = new Array(lastCol).fill('');
          Object.keys(ups.patch).forEach(function (cIdx) { newRow[Number(cIdx)] = ups.patch[cIdx]; });
          cmSheet.appendRow(newRow);
          cmContactRows.push(newRow); // 同バッチ内の後続が重複追加しないよう反映
        }
      }
    }

    // 3) 二重防止フラグ
    if (!dryRun && ledgerFound) {
      m.appliedToLedger = true;
      m.appliedDate = todayYmd;
      evSheet.getRange(d.rowIndex + 1, 5).setValue(JSON.stringify(m)); // metadata=5列目
    }

    if (ups && ups.dupCount > 1) {
      Logger.log('⚠️ ケアマネ変更反映: 送付用居宅一覧に「' + newOffice + '」が' + ups.dupCount + '行重複（要手当て・誤送信防止）');
    }

    result.push({
      name: d.userName, kind: 'ケアマネ変更', found: ledgerFound,
      to: newOffice + (newStaff ? (' / ' + newStaff) : ''),
      contactAction: ups ? ups.action : 'none',
      dupWarn: ups && ups.dupCount > 1 ? ('送付用居宅一覧に「' + newOffice + '」が' + ups.dupCount + '行重複') : '',
      month: String(m.effectiveDate || '')
    });
  });
  return result;
}

function applyScheduledKubunAndCaremanager() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('利用者台帳');
  var logSheet = ss.getSheetByName('予約反映ログ');
  if (!sheet || !logSheet) {
    Logger.log('シートが見つかりません（予約反映ログシート未作成の可能性）');
    return { applied: [] };
  }
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });

  var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
  var careCol = findColP(headers, '介護度');
  var cmOfficeCol = findCol(headers, ['ケアマネ事業所名', 'ケアマネ事業所']);
  var cmStaffCol = findCol(headers, ['ケアマネ担当者名', 'ケアマネ担当者', '担当ケアマネ']);
  var resCareCol = findCol(headers, ['予約介護度']);
  var resCareMonthCol = findCol(headers, ['介護度適用月']);
  var resOfficeCol = findCol(headers, ['予約ケアマネ事業所']);
  var resStaffCol = findCol(headers, ['予約ケアマネ担当者']);
  var resCmMonthCol = findCol(headers, ['ケアマネ適用月']);

  var applied = [];

  for (var i = 1; i < data.length; i++) {
    var row = i + 1;
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;

    // 介護度予約
    if (resCareCol >= 0 && resCareMonthCol >= 0) {
      var resCare = String(data[i][resCareCol] || '').trim();
      var resCareMonth = String(data[i][resCareMonthCol] || '').trim();
      if (resCare && resCareMonth && resCareMonth <= today) {
        var oldCare = careCol >= 0 ? String(data[i][careCol] || '').trim() : '';
        if (careCol >= 0) sheet.getRange(row, careCol + 1).setValue(resCare);
        sheet.getRange(row, resCareCol + 1).setValue('');
        sheet.getRange(row, resCareMonthCol + 1).setValue('');
        clearKubunYoyakuChuFlag_(ss, name, resCareMonth);
        applied.push({
          name: name, kind: '介護度',
          from: oldCare, to: resCare, month: resCareMonth
        });
      }
    }

    // ケアマネ予約
    if (resOfficeCol >= 0 && resStaffCol >= 0 && resCmMonthCol >= 0) {
      var resOffice = String(data[i][resOfficeCol] || '').trim();
      var resStaff = String(data[i][resStaffCol] || '').trim();
      var resCmMonth = String(data[i][resCmMonthCol] || '').trim();
      if (resOffice && resCmMonth && resCmMonth <= today) {
        var oldOffice = cmOfficeCol >= 0 ? String(data[i][cmOfficeCol] || '').trim() : '';
        var oldStaff = cmStaffCol >= 0 ? String(data[i][cmStaffCol] || '').trim() : '';
        if (cmOfficeCol >= 0) sheet.getRange(row, cmOfficeCol + 1).setValue(resOffice);
        if (cmStaffCol >= 0) sheet.getRange(row, cmStaffCol + 1).setValue(resStaff);
        sheet.getRange(row, resOfficeCol + 1).setValue('');
        sheet.getRange(row, resStaffCol + 1).setValue('');
        sheet.getRange(row, resCmMonthCol + 1).setValue('');
        applied.push({
          name: name, kind: 'ケアマネ',
          from: oldOffice + ' / ' + oldStaff,
          to: resOffice + ' / ' + resStaff,
          month: resCmMonth
        });
      }
    }
  }

  // 利用曜日変更の適用日反映（user_events を日単位で走査・適用開始日が到来した分を台帳へ）
  var udcDaysCol = findCol(headers, ['利用曜日']);
  var udcAmpmCol = findCol(headers, ['午前/午後', '午前午後']);
  applyDueUsageDaysChanges_(ss, sheet, data, nameCol, udcDaysCol, udcAmpmCol, null, false)
    .forEach(function(a) { if (a.found) applied.push(a); });

  // ケアマネ変更予約の反映（2026-06-04 追加・失敗しても他の反映を止めない）
  try {
    applyDueCaremanagerChanges_(ss, null, false)
      .forEach(function(a) { if (a.found) applied.push(a); });
  } catch (e) {
    Logger.log('applyDueCaremanagerChanges_ 失敗: ' + e);
  }

  // ログ追記
  applied.forEach(function(a) {
    logSheet.appendRow([nowStr, a.name, a.kind, a.from, a.to, a.month, '自動']);
  });

  // 通知メール
  if (applied.length > 0) {
    sendApplyNotice_(applied);
  }

  Logger.log('予約反映: ' + applied.length + '件');
  return { applied: applied };
}

// 区変履歴シートの 備考 列から「予約中:YYYY-MM」プレフィックスを削除
function clearKubunYoyakuChuFlag_(ss, name, applyMonth) {
  var historySheet = ss.getSheetByName('区変履歴');
  if (!historySheet) return;
  var hData = historySheet.getDataRange().getValues();
  for (var i = 1; i < hData.length; i++) {
    var rowName = String(hData[i][1] || '').trim();
    var biko = String(hData[i][6] || '').trim();
    if (rowName === name && biko.indexOf('予約中:' + applyMonth) >= 0) {
      // 「予約中:YYYY-MM 月遅れ:YYYY-MM」または「予約中:YYYY-MM」のパターン
      var newBiko = biko.replace(/予約中:\d{4}-\d{2}\s*/g, '').trim();
      historySheet.getRange(i + 1, 7).setValue(newBiko);
      break;
    }
  }
}

// 反映通知メール（UTF-8必須）
function sendApplyNotice_(applied) {
  if (!applied || applied.length === 0) return;

  var careItems = applied.filter(function(a) { return a.kind === '介護度'; });
  var cmItems = applied.filter(function(a) { return a.kind === 'ケアマネ'; });

  var body = '今月から適用される予約を利用者台帳に反映しました。\n\n';

  if (careItems.length > 0) {
    body += '【介護度変更】\n';
    careItems.forEach(function(a) {
      body += '- ' + a.name + '様: ' + a.from + ' → ' + a.to + '（適用月: ' + a.month + '）\n';
    });
    body += '\n';
  }

  if (cmItems.length > 0) {
    body += '【ケアマネ事業所変更】\n';
    cmItems.forEach(function(a) {
      body += '- ' + a.name + '様: ' + a.from + ' → ' + a.to + '（適用月: ' + a.month + '）\n';
    });
    body += '\n';
  }

  var udcItems = applied.filter(function(a) { return a.kind === '利用曜日'; });
  if (udcItems.length > 0) {
    body += '【利用曜日変更】\n';
    udcItems.forEach(function(a) {
      body += '- ' + a.name + '様: ' + a.from + ' → ' + a.to + '（適用日: ' + a.month + '）\n';
    });
    body += '\n';
  }

  body += '反映日時: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + '\n';
  body += '予約反映ログシートに記録されています。\n';

  GmailApp.sendEmail(
    'yawaragi.notify@gmail.com',
    '【予約反映】' + applied.length + '名の予約（介護度・事業所・利用曜日）が切り替わりました',
    body,
    { charset: 'UTF-8' }
  );
}

// 介護度予約のキャンセル
function handleKubunCancelScheduled(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var name = (e && e.parameter) ? e.parameter.name : null;
  if (!name) return respond({ error: 'name は必須です' }, callback);

  try {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); }
    catch (lockErr) { return respond({ error: 'ロック取得に失敗しました' }, callback); }

    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('利用者台帳');
      if (!sheet) return respond({ error: '利用者台帳シートが見つかりません' }, callback);
      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });
      var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
      var resCareCol = findCol(headers, ['予約介護度']);
      var resCareMonthCol = findCol(headers, ['介護度適用月']);
      if (resCareCol < 0 || resCareMonthCol < 0) {
        return respond({ error: '予約介護度列が見つかりません' }, callback);
      }
      var targetRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol] || '').trim() === name.trim()) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow < 0) return respond({ error: '該当利用者が見つかりません: ' + name }, callback);

      var applyMonth = String(data[targetRow - 1][resCareMonthCol] || '').trim();
      sheet.getRange(targetRow, resCareCol + 1).setValue('');
      sheet.getRange(targetRow, resCareMonthCol + 1).setValue('');

      // 区変履歴シートから「予約中:applyMonth」の行を削除（介護度予約のみ履歴行追加してある）
      var historySheet = ss.getSheetByName('区変履歴');
      if (historySheet && applyMonth) {
        var hData = historySheet.getDataRange().getValues();
        for (var j = hData.length - 1; j >= 1; j--) {
          var rowName = String(hData[j][1] || '').trim();
          var biko = String(hData[j][6] || '').trim();
          if (rowName === name && biko.indexOf('予約中:' + applyMonth) >= 0) {
            historySheet.deleteRow(j + 1);
            break;
          }
        }
      }

      return respond({ ok: true, name: name, canceledMonth: applyMonth }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ケアマネ予約のキャンセル
function handleCmCancelScheduled(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var name = (e && e.parameter) ? e.parameter.name : null;
  if (!name) return respond({ error: 'name は必須です' }, callback);

  try {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); }
    catch (lockErr) { return respond({ error: 'ロック取得に失敗しました' }, callback); }

    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('利用者台帳');
      if (!sheet) return respond({ error: '利用者台帳シートが見つかりません' }, callback);
      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });
      var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
      var resOfficeCol = findCol(headers, ['予約ケアマネ事業所']);
      var resStaffCol = findCol(headers, ['予約ケアマネ担当者']);
      var resCmMonthCol = findCol(headers, ['ケアマネ適用月']);
      if (resOfficeCol < 0 || resStaffCol < 0 || resCmMonthCol < 0) {
        return respond({ error: '予約ケアマネ列が見つかりません' }, callback);
      }
      var targetRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol] || '').trim() === name.trim()) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow < 0) return respond({ error: '該当利用者が見つかりません: ' + name }, callback);

      var applyMonth = String(data[targetRow - 1][resCmMonthCol] || '').trim();
      sheet.getRange(targetRow, resOfficeCol + 1).setValue('');
      sheet.getRange(targetRow, resStaffCol + 1).setValue('');
      sheet.getRange(targetRow, resCmMonthCol + 1).setValue('');

      return respond({ ok: true, name: name, canceledMonth: applyMonth }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// 今すぐ予約を本体に反映する
function handleApplyScheduledNow(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var name = (e && e.parameter) ? e.parameter.name : null;
  var kind = (e && e.parameter) ? String(e.parameter.kind || '').trim() : '';

  if (!name || !kind) return respond({ error: 'name, kind は必須です' }, callback);
  if (kind !== '介護度' && kind !== 'ケアマネ') {
    return respond({ error: 'kind は 介護度 または ケアマネ' }, callback);
  }

  try {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); }
    catch (lockErr) { return respond({ error: 'ロック取得に失敗しました' }, callback); }

    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = ss.getSheetByName('利用者台帳');
      var logSheet = ss.getSheetByName('予約反映ログ');
      if (!sheet || !logSheet) return respond({ error: 'シートが見つかりません' }, callback);

      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });
      var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
      var targetRow = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol] || '').trim() === name.trim()) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow < 0) return respond({ error: '該当利用者が見つかりません: ' + name }, callback);

      var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
      var applied = null;

      if (kind === '介護度') {
        var careCol = findColP(headers, '介護度');
        var resCareCol = findCol(headers, ['予約介護度']);
        var resCareMonthCol = findCol(headers, ['介護度適用月']);
        if (resCareCol < 0 || resCareMonthCol < 0) return respond({ error: '予約介護度列が見つかりません' }, callback);
        var resCare = String(data[targetRow - 1][resCareCol] || '').trim();
        var resCareMonth = String(data[targetRow - 1][resCareMonthCol] || '').trim();
        if (!resCare) return respond({ error: 'この利用者に介護度予約はありません' }, callback);
        var oldCare = careCol >= 0 ? String(data[targetRow - 1][careCol] || '').trim() : '';
        if (careCol >= 0) sheet.getRange(targetRow, careCol + 1).setValue(resCare);
        sheet.getRange(targetRow, resCareCol + 1).setValue('');
        sheet.getRange(targetRow, resCareMonthCol + 1).setValue('');
        clearKubunYoyakuChuFlag_(ss, name, resCareMonth);
        applied = { name: name, kind: '介護度', from: oldCare, to: resCare, month: resCareMonth };
      } else {
        var cmOfficeCol = findCol(headers, ['ケアマネ事業所名', 'ケアマネ事業所']);
        var cmStaffCol = findCol(headers, ['ケアマネ担当者名', 'ケアマネ担当者', '担当ケアマネ']);
        var resOfficeCol = findCol(headers, ['予約ケアマネ事業所']);
        var resStaffCol = findCol(headers, ['予約ケアマネ担当者']);
        var resCmMonthCol = findCol(headers, ['ケアマネ適用月']);
        if (resOfficeCol < 0 || resStaffCol < 0 || resCmMonthCol < 0) return respond({ error: '予約ケアマネ列が見つかりません' }, callback);
        var resOffice = String(data[targetRow - 1][resOfficeCol] || '').trim();
        var resStaff = String(data[targetRow - 1][resStaffCol] || '').trim();
        var resCmMonth = String(data[targetRow - 1][resCmMonthCol] || '').trim();
        if (!resOffice) return respond({ error: 'この利用者にケアマネ予約はありません' }, callback);
        var oldOffice = cmOfficeCol >= 0 ? String(data[targetRow - 1][cmOfficeCol] || '').trim() : '';
        var oldStaff = cmStaffCol >= 0 ? String(data[targetRow - 1][cmStaffCol] || '').trim() : '';
        if (cmOfficeCol >= 0) sheet.getRange(targetRow, cmOfficeCol + 1).setValue(resOffice);
        if (cmStaffCol >= 0) sheet.getRange(targetRow, cmStaffCol + 1).setValue(resStaff);
        sheet.getRange(targetRow, resOfficeCol + 1).setValue('');
        sheet.getRange(targetRow, resStaffCol + 1).setValue('');
        sheet.getRange(targetRow, resCmMonthCol + 1).setValue('');
        applied = {
          name: name, kind: 'ケアマネ',
          from: oldOffice + ' / ' + oldStaff,
          to: resOffice + ' / ' + resStaff,
          month: resCmMonth
        };
      }

      logSheet.appendRow([nowStr, applied.name, applied.kind, applied.from, applied.to, applied.month, '手動即時適用']);

      return respond({ ok: true, applied: applied }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== ケアマネ連絡先を更新（JSONP経由）=====
// 2026-05-03: 新シート「送付用居宅一覧」対応・ヘッダ名検出方式・dataLink追加
function handleUpdateContact(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var office = (e && e.parameter) ? (e.parameter.office || '').trim() : '';
  var cmName = (e && e.parameter) ? (e.parameter.cmName || '') : '';
  var email = (e && e.parameter) ? (e.parameter.email || '') : '';
  var fax = (e && e.parameter) ? (e.parameter.fax || '') : '';
  var method = (e && e.parameter) ? (e.parameter.method || '') : '';
  var dataLink = (e && e.parameter) ? (e.parameter.dataLink || '') : '';

  if (!office) {
    return respond({ error: 'office は必須です' }, callback);
  }

  try {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var sheet = getCmContactsSheet(ss);
      if (!sheet) return respond({ error: '連絡先シートが見つかりません' }, callback);
      _ensureHiddenCol(sheet);

      var cols = _readCmCols(sheet);
      var lastCol = sheet.getLastColumn();
      var data = sheet.getDataRange().getValues();

      for (var i = 1; i < data.length; i++) {
        var existOffice = cols.office >= 0 ? String(data[i][cols.office] || '').trim() : '';
        if (existOffice === office) {
          // 既存行を更新（指定された値のみ）
          if (cmName && cols.name >= 0) sheet.getRange(i + 1, cols.name + 1).setValue(cmName);
          if (cols.email >= 0) sheet.getRange(i + 1, cols.email + 1).setValue(email);
          if (cols.fax >= 0) sheet.getRange(i + 1, cols.fax + 1).setValue(fax);
          if (cols.method >= 0) sheet.getRange(i + 1, cols.method + 1).setValue(method);
          if (dataLink && cols.dataLink >= 0) sheet.getRange(i + 1, cols.dataLink + 1).setValue(dataLink);
          return respond({ ok: true, office: office, updated: true }, callback);
        }
      }
      // 見つからなければ新規行追加
      sheet.appendRow(_buildContactRow(cols, lastCol, {
        office: office, name: cmName, email: email, fax: fax, method: method, dataLink: dataLink
      }));
      return respond({ ok: true, office: office, added: true }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 区変管理: 月遅れ請求対象者の一覧を返す =====
function handleKubunDelayList(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var historySheet = ss.getSheetByName('区変履歴');
    if (!historySheet) return respond({ items: [] }, callback);
    migrateKubunHistoryColumns_(historySheet); // 保険情報列(T/U/V)の存在を保証

    var data = historySheet.getDataRange().getValues();
    if (data.length < 2) return respond({ items: [] }, callback);

    // 想定列: A:ID / B:氏名 / C:申請日 / D:結果日 / E:旧介護度 / F:新介護度 / G:備考(月遅れ:YYYY-MM,YYYY-MM)
    //        T(20):保険情報入手日時 / U(21):保険情報入手者 / V(22):保険情報メモ
    var items = [];
    for (var i = 1; i < data.length; i++) {
      var note = String(data[i][6] || '').trim();
      if (note.indexOf('月遅れ:') !== 0) continue;
      var monthsStr = note.replace('月遅れ:', '').trim();
      if (!monthsStr) continue;
      var months = monthsStr.split(',').map(function(m) { return String(m).trim(); }).filter(function(m) { return m; });
      if (months.length === 0) continue;

      items.push({
        name: String(data[i][1] || '').trim(),
        applyDate: fmtDate(data[i][2]),
        resultDate: fmtDate(data[i][3]),
        prevCare: String(data[i][4] || '').trim(),
        newCare: String(data[i][5] || '').trim(),
        months: months,
        rowIndex: i + 1,
        insuranceReceivedAt: (data[i][19] instanceof Date)
          ? Utilities.formatDate(data[i][19], 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
          : String(data[i][19] || '').trim(),
        insuranceReceivedBy: String(data[i][20] || '').trim(),
        insuranceMemo: String(data[i][21] || '').trim()
      });
    }

    // 結果日の新しい順
    items.sort(function(a, b) {
      return (b.resultDate || '').localeCompare(a.resultDate || '');
    });

    return respond({
      count: items.length,
      items: items,
      generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
    }, callback);

  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 月遅れ請求対象: 保険情報入手の登録/取消/メモ編集 =====
// 書込先: 区変履歴シート T(20):入手日時 / U(21):入手者 / V(22):メモ
function handleUpdateKubunDelayInsurance(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var rowIndex = parseInt(p.rowIndex, 10);
    var operation = String(p.operation || '').trim(); // 'set' | 'unset' | 'editMemo'
    var receivedBy = String(p.receivedBy || '').trim();
    var memo = String(p.memo || '').trim();

    if (!rowIndex || isNaN(rowIndex) || rowIndex < 2) {
      return respond({ ok: false, error: 'rowIndex不正' }, callback);
    }
    if (operation !== 'set' && operation !== 'unset' && operation !== 'editMemo') {
      return respond({ ok: false, error: 'operation不正' }, callback);
    }

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return respond({ ok: false, error: 'lock取得失敗' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var historySheet = ss.getSheetByName('区変履歴');
      if (!historySheet) {
        return respond({ ok: false, error: '区変履歴シートなし' }, callback);
      }
      migrateKubunHistoryColumns_(historySheet); // 保険情報列(T/U/V)の存在を保証

      var rowValues = historySheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
      var name = String(rowValues[1] || '').trim();
      var applyDate = fmtDate(rowValues[2]);
      var prevCare = String(rowValues[4] || '').trim();
      var newCare = String(rowValues[5] || '').trim();
      var months = String(rowValues[6] || '').replace('月遅れ:', '').trim();

      if (operation === 'set') {
        var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
        historySheet.getRange(rowIndex, 20).setValue(nowStr);     // T列: 入手日時
        historySheet.getRange(rowIndex, 21).setValue(receivedBy); // U列: 入手者
        historySheet.getRange(rowIndex, 22).setValue(memo);       // V列: メモ
        sendKubunDelayInsuranceMail('set', {
          name: name, applyDate: applyDate, prevCare: prevCare, newCare: newCare,
          months: months, receivedAt: nowStr, receivedBy: receivedBy, memo: memo
        });
      } else if (operation === 'unset') {
        var canceledAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
        historySheet.getRange(rowIndex, 20).setValue('');
        historySheet.getRange(rowIndex, 21).setValue('');
        historySheet.getRange(rowIndex, 22).setValue('');
        sendKubunDelayInsuranceMail('unset', {
          name: name, applyDate: applyDate, canceledAt: canceledAt, canceledBy: receivedBy
        });
      } else if (operation === 'editMemo') {
        historySheet.getRange(rowIndex, 22).setValue(memo);
        // editMemoは通知メールなし
      }

      return respond({ ok: true, operation: operation }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: err.message }, callback);
  }
}

// ===== 月遅れ請求対象: 保険情報入手・取消の通知メール =====
function sendKubunDelayInsuranceMail(op, info) {
  try {
    var to = 'yawaragi.notify@gmail.com';
    var subject, body;
    if (op === 'set') {
      subject = '【区変フォロー】' + info.name + '様 保険情報入手';
      body = [
        '保険情報を入手しました。計画書作成・月遅れ請求の準備に進めます。',
        '',
        '- 利用者: ' + info.name,
        '- 新介護度: ' + info.newCare + '（' + info.prevCare + 'から区変）',
        '- 月遅れ対象月: ' + info.months,
        '- 入手日時: ' + info.receivedAt,
        '- 入手者: ' + (info.receivedBy || '(未入力)'),
        '- メモ: ' + (info.memo || '(なし)'),
        '',
        '【次のアクション】',
        '・看護師: 計画書作成',
        '・請求担当: 月遅れ請求準備'
      ].join('\n');
    } else if (op === 'unset') {
      subject = '【区変フォロー】' + info.name + '様 保険情報入手の取り消し';
      body = [
        '保険情報入手の登録が取り消されました。再度確認をお願いします。',
        '',
        '- 利用者: ' + info.name,
        '- 取り消し日時: ' + info.canceledAt,
        '- 取り消し者: ' + (info.canceledBy || '(未入力)')
      ].join('\n');
    } else {
      return;
    }
    MailApp.sendEmail({ to: to, subject: subject, body: body });
  } catch (err) {
    Logger.log('sendKubunDelayInsuranceMail error: ' + err.message);
  }
}

// ===== 区変履歴シートに「介護度変更後 後続作業」用列を自動追加 =====
// H: リハブ更新日時 / I: 利用日変動 / J: 調整済(廃止) / K: 完了日時 / L: リハブ更新者
// M: 適用開始日 / N: 適用予定_曜日 / O: 適用予定_午前午後 / P: 適用済み日時
function migrateKubunHistoryColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  var colDefs = [
    [8, 'リハブ更新日時', 140],
    [9, '利用日変動', 100],
    [10, '調整済', 100],
    [11, '完了日時', 140],
    [12, 'リハブ更新者', 100],
    [13, '適用開始日', 110],
    [14, '適用予定_曜日', 100],
    [15, '適用予定_午前午後', 120],
    [16, '適用済み日時', 140],
    [17, '種別', 100],
    [18, '認定有効期間_開始', 130],
    [19, '認定有効期間_終了', 130],
    // 月遅れ請求対象「保険情報入手」ボタン用（2026-05-29追加・旧計画のH/I/J列は後続作業列で埋まっているためT/U/V列へ）
    [20, '保険情報入手日時', 140],
    [21, '保険情報入手者', 110],
    [22, '保険情報メモ', 220]
  ];
  colDefs.forEach(function(def) {
    if (lastCol < def[0]) {
      sheet.getRange(1, def[0]).setValue(def[1]);
      sheet.setColumnWidth(def[0], def[2]);
      sheet.getRange(1, def[0]).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
    }
  });
}

// ===== 区変管理: 介護度変更後の後続作業一覧（直近3ヶ月＋未完了は無期限）=====
function handleKubunHistoryList(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var historySheet = ss.getSheetByName('区変履歴');
    if (!historySheet) return respond({ items: [] }, callback);

    migrateKubunHistoryColumns_(historySheet);

    var data = historySheet.getDataRange().getValues();
    if (data.length < 2) return respond({ items: [] }, callback);

    // 利用者台帳から「利用曜日」「午前/午後」を name → values でマップ化
    var userMap = {};
    var userSheet = ss.getSheetByName('利用者台帳');
    if (userSheet) {
      var userData = userSheet.getDataRange().getValues();
      if (userData.length >= 2) {
        var uHeaders = userData[0].map(function(h) { return String(h).trim(); });
        var uNameCol = findCol(uHeaders, ['名前', '氏名', '利用者名']);
        var uDaysCol = findCol(uHeaders, ['利用曜日']);
        var uAmpmCol = findCol(uHeaders, ['午前/午後', '午前午後', '種別']);
        if (uNameCol >= 0) {
          for (var ui = 1; ui < userData.length; ui++) {
            var un = String(userData[ui][uNameCol] || '').trim();
            if (!un) continue;
            userMap[un] = {
              days: uDaysCol >= 0 ? String(userData[ui][uDaysCol] || '').trim() : '',
              ampm: uAmpmCol >= 0 ? String(userData[ui][uAmpmCol] || '').trim() : ''
            };
          }
        }
      }
    }

    var now = new Date();
    var threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    var items = [];
    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][1] || '').trim();
      if (!name) continue;

      var resultDateStr = fmtDate(data[i][3]);
      if (!resultDateStr) continue;

      var resultDate = new Date(resultDateStr);
      // 直近3ヶ月以内のものだけ取得（古いものは除外）
      if (resultDate < threeMonthsAgo) continue;

      var rehabUpdatedRaw = String(data[i][7] || '').trim();
      var usageChange = String(data[i][8] || '').trim();
      var adjustDone = String(data[i][9] || '').trim();
      var completedAtStr = fmtDate(data[i][10]);
      var rehabUpdatedBy = data[i].length > 11 ? String(data[i][11] || '').trim() : '';
      var effectiveDate = data[i].length > 12 ? fmtDate(data[i][12]) : '';
      var scheduledDays = data[i].length > 13 ? String(data[i][13] || '').trim() : '';
      var scheduledAmpm = data[i].length > 14 ? String(data[i][14] || '').trim() : '';
      var appliedAt = data[i].length > 15 ? String(data[i][15] || '').trim() : '';

      // 完了から30日経過しているものは非表示
      if (completedAtStr) {
        var completedAt = new Date(completedAtStr);
        if (completedAt < thirtyDaysAgo) continue;
      }

      var currentInfo = userMap[name] || { days: '', ampm: '' };

      // rehabUpdatedRawが「○」または日時文字列の場合は更新済みとする
      var rehabUpdated = rehabUpdatedRaw !== '';
      items.push({
        rowIndex: i + 1,
        name: name,
        applyDate: fmtDate(data[i][2]),
        resultDate: resultDateStr,
        prevCare: String(data[i][4] || '').trim(),
        newCare: String(data[i][5] || '').trim(),
        rehabUpdated: rehabUpdated,
        rehabUpdatedAt: rehabUpdated ? rehabUpdatedRaw : '',
        rehabUpdatedBy: rehabUpdatedBy,
        usageChange: usageChange || '',
        adjustDone: adjustDone === '○',
        completedAt: completedAtStr || '',
        currentDays: currentInfo.days,
        currentAmpm: currentInfo.ampm,
        effectiveDate: effectiveDate || '',
        scheduledDays: scheduledDays,
        scheduledAmpm: scheduledAmpm,
        appliedAt: appliedAt
      });
    }

    // 結果日の新しい順
    items.sort(function(a, b) {
      return (b.resultDate || '').localeCompare(a.resultDate || '');
    });

    return respond({
      count: items.length,
      items: items,
      generatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
    }, callback);

  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 区変管理: 介護度変更後の後続作業チェック状態を更新 =====
// パラメータ: rowIndex, field（rehabUpdated/usageChange/markAllDone/clearCompleted/clearRehabUpdated）, value, operatorBy
function handleKubunHistoryUpdate(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var rowIndex = (e && e.parameter) ? parseInt(e.parameter.rowIndex, 10) : 0;
  var field = (e && e.parameter) ? e.parameter.field : '';
  var value = (e && e.parameter) ? (e.parameter.value || '') : '';
  var operatorBy = (e && e.parameter) ? (e.parameter.operatorBy || '') : '';

  if (!rowIndex || rowIndex < 2) return respond({ error: 'rowIndexが不正です' }, callback);
  if (!field) return respond({ error: 'fieldは必須です' }, callback);

  try {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var historySheet = ss.getSheetByName('区変履歴');
      if (!historySheet) return respond({ error: '区変履歴シートが見つかりません' }, callback);

      migrateKubunHistoryColumns_(historySheet);

      var lastRow = historySheet.getLastRow();
      if (rowIndex > lastRow) return respond({ error: '行が範囲外です: ' + rowIndex }, callback);

      var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

      if (field === 'rehabUpdated') {
        // 必ずタイムスタンプ＋実行者で記録
        if (!operatorBy) return respond({ error: '実行者名が必須です' }, callback);
        historySheet.getRange(rowIndex, 8).setValue(nowStr);
        historySheet.getRange(rowIndex, 12).setValue(operatorBy);
      } else if (field === 'clearRehabUpdated') {
        historySheet.getRange(rowIndex, 8).setValue('');
        historySheet.getRange(rowIndex, 12).setValue('');
      } else if (field === 'usageChange') {
        historySheet.getRange(rowIndex, 9).setValue(value || '');
      } else if (field === 'markAllDone') {
        // 全部完了: リハブ更新（時刻＋実行者）・完了日時にタイムスタンプ
        if (operatorBy) {
          historySheet.getRange(rowIndex, 8).setValue(nowStr);
          historySheet.getRange(rowIndex, 12).setValue(operatorBy);
        }
        historySheet.getRange(rowIndex, 11).setValue(nowStr);
      } else if (field === 'clearCompleted') {
        historySheet.getRange(rowIndex, 11).setValue('');
      } else {
        return respond({ error: 'fieldが不正です: ' + field }, callback);
      }

      return respond({ ok: true, rowIndex: rowIndex, field: field, value: value, operatorBy: operatorBy, updatedAt: nowStr }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 区変管理: 後続作業カードの記録を編集（介護度・区変日/更新月・結果日） =====
// パラメータ: rowIndex, name（必須）, applyDate, resultDate, prevCare, newCare
// 氏名は台帳連携の都合上フロントでは変更不可だが、後方互換のため name も受け取りB列に書き戻す
function handleKubunHistoryEdit(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var rowIndex = (e && e.parameter) ? parseInt(e.parameter.rowIndex, 10) : 0;
  var name = (e && e.parameter) ? String(e.parameter.name || '').trim() : '';
  var applyDate = (e && e.parameter) ? String(e.parameter.applyDate || '').trim() : '';
  var resultDate = (e && e.parameter) ? String(e.parameter.resultDate || '').trim() : '';
  var prevCare = (e && e.parameter) ? String(e.parameter.prevCare || '').trim() : '';
  var newCare = (e && e.parameter) ? String(e.parameter.newCare || '').trim() : '';

  if (!rowIndex || rowIndex < 2) return respond({ error: 'rowIndexが不正です' }, callback);
  if (!name) return respond({ error: '氏名は必須です' }, callback);

  try {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var historySheet = ss.getSheetByName('区変履歴');
      if (!historySheet) return respond({ error: '区変履歴シートが見つかりません' }, callback);

      migrateKubunHistoryColumns_(historySheet);

      var lastRow = historySheet.getLastRow();
      if (rowIndex > lastRow) return respond({ error: '行が範囲外です: ' + rowIndex }, callback);

      // B=氏名(2), C=区変日/更新月(3), D=結果日(4), E=前介護度(5), F=後介護度(6)
      historySheet.getRange(rowIndex, 2).setValue(name);
      historySheet.getRange(rowIndex, 3).setValue(applyDate);
      historySheet.getRange(rowIndex, 4).setValue(resultDate);
      historySheet.getRange(rowIndex, 5).setValue(prevCare);
      historySheet.getRange(rowIndex, 6).setValue(newCare);

      return respond({ ok: true, rowIndex: rowIndex }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 区変管理: 後続作業カードの記録を行ごと物理削除（テスト行・登録ミスの掃除用） =====
// パラメータ: rowIndex
function handleKubunHistoryDelete(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var rowIndex = (e && e.parameter) ? parseInt(e.parameter.rowIndex, 10) : 0;

  if (!rowIndex || rowIndex < 2) return respond({ error: 'rowIndexが不正です' }, callback);

  try {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);
      var historySheet = ss.getSheetByName('区変履歴');
      if (!historySheet) return respond({ error: '区変履歴シートが見つかりません' }, callback);

      var lastRow = historySheet.getLastRow();
      if (rowIndex > lastRow) return respond({ error: '行が範囲外です: ' + rowIndex }, callback);

      historySheet.deleteRow(rowIndex);

      return respond({ ok: true, rowIndex: rowIndex }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 利用者台帳の「利用曜日」「午前/午後」を更新／未来日付なら予約 =====
// パラメータ: name（必須）, days, ampm, effectiveDate（任意・YYYY-MM-DD）, historyRowIndex（予約時必須・区変履歴シートの行）
function handleUpdateUserUsageDays(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var name = (e && e.parameter) ? e.parameter.name : '';
  var days = (e && e.parameter) ? (e.parameter.days || '') : '';
  var ampm = (e && e.parameter) ? (e.parameter.ampm || '') : '';
  var effectiveDate = (e && e.parameter) ? (e.parameter.effectiveDate || '') : '';
  var historyRowIndex = (e && e.parameter) ? parseInt(e.parameter.historyRowIndex || 0, 10) : 0;

  if (!name) return respond({ error: '名前は必須です' }, callback);

  try {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return respond({ error: 'ロック取得に失敗しました' }, callback);
    }
    try {
      var ss = SpreadsheetApp.openById(SS_ID);

      // 適用開始日が未来日付なら予約として区変履歴シートに保存
      var isFuture = false;
      if (effectiveDate) {
        var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
        if (effectiveDate > todayStr) isFuture = true;
      }

      if (isFuture && historyRowIndex >= 2) {
        var historySheet = ss.getSheetByName('区変履歴');
        if (!historySheet) return respond({ error: '区変履歴シートが見つかりません' }, callback);
        migrateKubunHistoryColumns_(historySheet);
        // M列(13): 適用開始日 / N列(14): 予定曜日 / O列(15): 予定午前午後
        historySheet.getRange(historyRowIndex, 13).setValue(effectiveDate);
        historySheet.getRange(historyRowIndex, 14).setValue(days);
        historySheet.getRange(historyRowIndex, 15).setValue(ampm);
        historySheet.getRange(historyRowIndex, 16).setValue(''); // 適用済み日時クリア（再予約時）
        return respond({
          ok: true,
          reserved: true,
          name: name,
          effectiveDate: effectiveDate,
          newDays: days,
          newAmpm: ampm,
          message: effectiveDate + 'に自動反映予定として予約しました'
        }, callback);
      }

      // 即時更新（適用開始日なし or 今日以前）
      var sheet = ss.getSheetByName('利用者台帳');
      if (!sheet) return respond({ error: '利用者台帳シートが見つかりません' }, callback);

      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });
      var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
      var daysCol = findCol(headers, ['利用曜日']);
      var ampmCol = findCol(headers, ['午前/午後', '午前午後', '種別']);

      if (nameCol < 0) return respond({ error: '名前列が見つかりません' }, callback);
      if (daysCol < 0) return respond({ error: '利用曜日列が見つかりません' }, callback);

      var targetRow = -1;
      var prevDays = '', prevAmpm = '';
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol] || '').trim() === name.trim()) {
          targetRow = i + 1;
          prevDays = String(data[i][daysCol] || '').trim();
          if (ampmCol >= 0) prevAmpm = String(data[i][ampmCol] || '').trim();
          break;
        }
      }
      if (targetRow < 0) return respond({ error: '該当利用者が見つかりません: ' + name }, callback);

      sheet.getRange(targetRow, daysCol + 1).setValue(days);
      if (ampmCol >= 0) {
        sheet.getRange(targetRow, ampmCol + 1).setValue(ampm);
      }

      // 即時反映だが effectiveDate が今日以前で history指定があれば、予約も即適用済として記録
      if (historyRowIndex >= 2) {
        var historySheet2 = ss.getSheetByName('区変履歴');
        if (historySheet2) {
          migrateKubunHistoryColumns_(historySheet2);
          if (effectiveDate) {
            historySheet2.getRange(historyRowIndex, 13).setValue(effectiveDate);
          }
          historySheet2.getRange(historyRowIndex, 14).setValue(days);
          historySheet2.getRange(historyRowIndex, 15).setValue(ampm);
          historySheet2.getRange(historyRowIndex, 16).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'));
        }
      }

      return respond({
        ok: true,
        reserved: false,
        name: name,
        prevDays: prevDays,
        prevAmpm: prevAmpm,
        newDays: days,
        newAmpm: ampm,
        updatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
      }, callback);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ===== 適用開始日が来た予約曜日変更を利用者台帳に反映する（朝ロード時に呼ばれる）=====
function handleApplyScheduledUsageDays(e) {
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var historySheet = ss.getSheetByName('区変履歴');
    if (!historySheet) return respond({ ok: true, applied: 0, items: [] }, callback);
    migrateKubunHistoryColumns_(historySheet);

    var data = historySheet.getDataRange().getValues();
    if (data.length < 2) return respond({ ok: true, applied: 0, items: [] }, callback);

    var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

    var userSheet = ss.getSheetByName('利用者台帳');
    if (!userSheet) return respond({ error: '利用者台帳シートが見つかりません' }, callback);
    var userData = userSheet.getDataRange().getValues();
    var uHeaders = userData[0].map(function(h) { return String(h).trim(); });
    var uNameCol = findCol(uHeaders, ['名前', '氏名', '利用者名']);
    var uDaysCol = findCol(uHeaders, ['利用曜日']);
    var uAmpmCol = findCol(uHeaders, ['午前/午後', '午前午後', '種別']);

    var applied = [];
    for (var i = 1; i < data.length; i++) {
      var effectiveDate = fmtDate(data[i][12]);
      var scheduledDays = String(data[i][13] || '').trim();
      var appliedAt = String(data[i][15] || '').trim();
      if (!effectiveDate || appliedAt) continue;
      if (effectiveDate > todayStr) continue; // まだ未来
      if (!scheduledDays) continue;

      var name = String(data[i][1] || '').trim();
      var scheduledAmpm = String(data[i][14] || '').trim();

      // 利用者台帳の該当行を更新
      for (var ui = 1; ui < userData.length; ui++) {
        if (String(userData[ui][uNameCol] || '').trim() === name) {
          var targetRow = ui + 1;
          if (uDaysCol >= 0) userSheet.getRange(targetRow, uDaysCol + 1).setValue(scheduledDays);
          if (uAmpmCol >= 0) userSheet.getRange(targetRow, uAmpmCol + 1).setValue(scheduledAmpm);
          historySheet.getRange(i + 1, 16).setValue(nowStr);
          applied.push({ name: name, days: scheduledDays, ampm: scheduledAmpm, effectiveDate: effectiveDate });
          break;
        }
      }
    }

    return respond({ ok: true, applied: applied.length, items: applied }, callback);
  } catch (err) {
    return respond({ error: err.message }, callback);
  }
}

// ================================================================
// ========== 長期休み管理機能（2026-04-28追加） ==========
// 既存「出欠変更」シートに3列（復帰予定日・最終連絡日・連絡履歴）追加。
// 復帰済化は既存registerResume流用。
// ================================================================

// 出欠変更シートに長期休み用の5列を自動追加（migration）
// I:復帰予定日 / J:最終連絡日 / K:連絡履歴 / L:次回連絡予定日 / M:最終連絡結果区分
function migrateLongLeaveColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 9) {
    sheet.getRange(1, 9).setValue('復帰予定日');
    sheet.setColumnWidth(9, 110);
  }
  if (lastCol < 10) {
    sheet.getRange(1, 10).setValue('最終連絡日');
    sheet.setColumnWidth(10, 110);
  }
  if (lastCol < 11) {
    sheet.getRange(1, 11).setValue('連絡履歴');
    sheet.setColumnWidth(11, 400);
    sheet.getRange(1, 9, 1, 3).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
  }
  if (lastCol < 12) {
    sheet.getRange(1, 12).setValue('次回連絡予定日');
    sheet.setColumnWidth(12, 120);
    sheet.getRange(1, 12).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
  }
  if (lastCol < 13) {
    sheet.getRange(1, 13).setValue('最終連絡結果区分');
    sheet.setColumnWidth(13, 120);
    sheet.getRange(1, 13).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
  }
  if (lastCol < 14) {
    sheet.getRange(1, 14).setValue('長期休みケアマネ連絡');
    sheet.setColumnWidth(14, 140);
    sheet.getRange(1, 14).setBackground('#2d3748').setFontColor('#ffffff').setFontWeight('bold');
  }
}

// 長期休み中の利用者一覧を取得（経過日数計算込み・重複検出）
function getLongLeaveList(ss) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return [];

  migrateLongLeaveColumns_(sheet);

  var data = sheet.getDataRange().getValues();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');
  var todayMs = new Date(todayStr + 'T00:00:00+09:00').getTime();

  // 2026-05-23: ケアマネ連絡履歴を辞書化（N+1回避）
  var cmLogIndex = _buildCmLogIndex_(ss);

  // 2026-05-23: 「今月連絡済み」判定用に履歴を当月単位でも辞書化
  var thisMonthStart = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-01');
  var nextMonthStartDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  var nextMonthStart = Utilities.formatDate(nextMonthStartDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  var contactedThisMonth = {};
  try {
    var logSh = ss.getSheetByName('ケアマネ連絡履歴');
    if (logSh && logSh.getLastRow() >= 2) {
      var logData = logSh.getDataRange().getValues();
      for (var li = 1; li < logData.length; li++) {
        var ts = logData[li][0];
        if (!(ts instanceof Date)) continue;
        var tsStr = Utilities.formatDate(ts, 'Asia/Tokyo', 'yyyy-MM-dd');
        if (tsStr < thisMonthStart || tsStr >= nextMonthStart) continue;
        var actName = _normalizeNameForMatch_(logData[li][1]);
        contactedThisMonth[actName] = true;
      }
    }
  } catch (e) {}

  var seenKeys = {};
  var list = [];

  for (var i = 1; i < data.length; i++) {
    var startDate = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    var type = String(data[i][3] || '').trim();
    if (type !== '長期休み') continue;

    var reason = String(data[i][4] || '').trim();
    var reporter = String(data[i][5] || '').trim();
    var endDate = data[i][7] ? fmtDate(data[i][7]) : '';

    // 復帰済はスキップ。H列（再開日 endDate）に何か入っていれば、過去/今日/未来を問わず即時除外
    // 再開登録（resume）で必ずH列に日付が書かれるので、社長運用「再開登録したら即消す」と整合
    // 2026-05-27変更
    if (endDate) continue;

    var expectedReturn = String(data[i][8] || '').trim();
    var lastContact = data[i][9] ? fmtDate(data[i][9]) : '';
    var contactLog = String(data[i][10] || '');
    var nextContactDue = data[i][11] ? fmtDate(data[i][11]) : '';
    var lastResultType = String(data[i][12] || '').trim();  // 'resume' / 'extend' / 'pending'
    var cmNotified = String(data[i][13] || '').trim();      // N列(14, 0-indexed 13) 長期休みケアマネ連絡

    // 経過日数
    var startMs = new Date(startDate + 'T00:00:00+09:00').getTime();
    var elapsedDays = Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24));

    // 復帰までの日数（expectedReturn or endDate を使用）
    var returnDate = expectedReturn || endDate;
    var daysUntilReturn = null;
    if (returnDate && returnDate !== '未定') {
      try {
        var returnMs = new Date(returnDate + 'T00:00:00+09:00').getTime();
        daysUntilReturn = Math.floor((returnMs - todayMs) / (1000 * 60 * 60 * 24));
      } catch (e) {}
    }

    // 最終連絡日からの経過日数
    var daysSinceLastContact = null;
    if (lastContact) {
      try {
        var lastMs = new Date(lastContact + 'T00:00:00+09:00').getTime();
        daysSinceLastContact = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));
      } catch (e) {}
    }

    // 重複検出
    var key = name + '_' + startDate;
    if (seenKeys[key]) {
      seenKeys[key].duplicate = true;
      continue;
    }

    // 2026-05-23: 履歴シートから最終操作者・最終手段を取得
    var ltLookupKey = _normalizeNameForMatch_(name) + '|' + startDate;
    var ltLastLog = cmLogIndex[ltLookupKey] || { operator: '', method: '' };

    // 2026-05-23: 連絡時注意事項を利用者台帳から取得（個別ルール表示用）
    var ltCmInfo = getUserCmContact(ss, name);
    var contactNote = ltCmInfo && ltCmInfo.contactNote ? ltCmInfo.contactNote : '';

    var item = {
      row: i + 1,
      name: name,
      startDate: startDate,
      reason: reason,
      reporter: reporter,
      endDate: endDate,
      expectedReturn: expectedReturn || (endDate || '未定'),
      lastContact: lastContact,
      contactLog: contactLog,
      cmNotified: cmNotified,
      lastOperator: ltLastLog.operator,
      lastMethod: ltLastLog.method,
      contactNote: contactNote,
      elapsedDays: elapsedDays,
      daysUntilReturn: daysUntilReturn,
      daysSinceLastContact: daysSinceLastContact,
      nextContactDue: nextContactDue,
      lastResultType: lastResultType,
      // 2026-05-23: 「月1回必ず連絡」判定用
      contactedThisMonth: !!contactedThisMonth[_normalizeNameForMatch_(name)],
      duplicate: false
    };

    // 次回連絡日の緊急度判定
    if (nextContactDue) {
      try {
        var dueMs = new Date(nextContactDue + 'T00:00:00+09:00').getTime();
        item.daysUntilNextContact = Math.floor((dueMs - todayMs) / (1000 * 60 * 60 * 24));
        item.contactOverdue = item.daysUntilNextContact <= 0;
        item.contactWarning = item.daysUntilNextContact > 0 && item.daysUntilNextContact <= 3;
      } catch (e) {
        item.daysUntilNextContact = null;
        item.contactOverdue = false;
        item.contactWarning = false;
      }
    } else {
      item.daysUntilNextContact = null;
      item.contactOverdue = false;
      item.contactWarning = false;
    }

    seenKeys[key] = item;
    list.push(item);
  }

  // 経過日数で降順ソート
  list.sort(function (a, b) { return b.elapsedDays - a.elapsedDays; });

  return list;
}

// 連絡履歴に追記＋最終連絡日・次回連絡予定日・結果区分を更新＋通知メール送信
function addContactLog(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: 'シートがありません', success: false };

  migrateLongLeaveColumns_(sheet);

  // 必須バリデーション（メモは任意化・10文字制限は撤廃）
  var content = String(data.content || '').trim();
  var resultType = String(data.resultType || '').trim();
  if (['resume', 'extend', 'pending'].indexOf(resultType) === -1) {
    return { error: '結果区分が不正です', success: false };
  }
  if (resultType === 'extend' && !data.newExpectedReturn) {
    return { error: '延長を選んだ場合は新しい再開予定日が必須です', success: false };
  }

  // 対象行を後ろから探索（終了日が空 or 今日以降＝まだ復帰していない長期休みが対象）
  var todayYMD = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var rows = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var i = rows.length - 1; i >= 1; i--) {
    var name = String(rows[i][1] || '').trim();
    var type = String(rows[i][3] || '').trim();
    var endCol = rows[i][7] ? fmtDate(rows[i][7]) : '';
    if (name === data.name && type === '長期休み' && (!endCol || endCol >= todayYMD)) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow < 0) return { error: '休み中の長期休みが見つかりません', success: false };

  // 履歴追記
  var todayMD = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d');
  var contact = data.contact || '比嘉';
  var method = data.method || '電話';
  var resultLabel = resultType === 'resume' ? '再開' : (resultType === 'extend' ? '延長' : '未定');
  var newLine = todayMD + ' ' + contact + '→' + method + ' [' + resultLabel + '] ' + content;

  var existingLog = String(sheet.getRange(foundRow, 11).getValue() || '');
  var newLog = existingLog ? (existingLog + '\n' + newLine) : newLine;

  sheet.getRange(foundRow, 10).setValue(todayYMD);
  sheet.getRange(foundRow, 11).setValue(newLog);

  // 結果区分に応じた更新
  if (resultType === 'extend') {
    sheet.getRange(foundRow, 9).setValue(data.newExpectedReturn);  // I列：復帰予定日
  }
  // 次回連絡予定日（L列）
  var nextDue = data.nextContactDue || '';
  if (!nextDue) {
    if (resultType === 'pending') {
      // 未定 → 14日後
      var d = new Date();
      d.setDate(d.getDate() + 14);
      nextDue = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else if (resultType === 'extend') {
      // 延長 → 新予定日の7日前
      var rd = new Date(data.newExpectedReturn + 'T00:00:00+09:00');
      rd.setDate(rd.getDate() - 7);
      nextDue = Utilities.formatDate(rd, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else {
      // 再開 → 空（タスク不要）
      nextDue = '';
    }
  }
  sheet.getRange(foundRow, 12).setValue(nextDue);
  sheet.getRange(foundRow, 13).setValue(resultType);  // M列：結果区分

  // 通知メール送信
  try {
    var subject = '[長期休み連絡] ' + data.name + 'さん ' + resultLabel;
    var bodyLines = [
      '長期休み利用者への連絡が記録されました。',
      '',
      '利用者：' + data.name + 'さん',
      '担当者：' + contact + '（' + method + '）',
      '結果：' + resultLabel
    ];
    if (resultType === 'extend') bodyLines.push('新しい再開予定日：' + data.newExpectedReturn);
    if (nextDue) bodyLines.push('次回連絡予定日：' + nextDue);
    bodyLines.push('');
    bodyLines.push('メモ：');
    bodyLines.push(content);
    bodyLines.push('');
    bodyLines.push('yawaragiボードで詳細確認できます。');
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, bodyLines.join('\n'), { charset: 'UTF-8' });
  } catch (e) {
    Logger.log('長期休み連絡 通知メール送信失敗: ' + e.message);
  }

  return {
    success: true,
    message: '連絡履歴を記録しました',
    logLine: newLine,
    nextContactDue: nextDue,
    resultType: resultType
  };
}

// 復帰予定日を更新
function updateExpectedReturn(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: 'シートがありません', success: false };

  migrateLongLeaveColumns_(sheet);

  var todayYMD = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var name = String(rows[i][1] || '').trim();
    var type = String(rows[i][3] || '').trim();
    var endCol = rows[i][7] ? fmtDate(rows[i][7]) : '';
    if (name === data.name && type === '長期休み' && (!endCol || endCol >= todayYMD)) {
      sheet.getRange(i + 1, 9).setValue(data.expectedReturn || '未定');
      return { success: true, message: '復帰予定日を更新しました' };
    }
  }
  return { error: '休み中の長期休みが見つかりません', success: false };
}

// 手動でタスクボードに「○○様 長期休み利用連絡」を追加
function addLongLeaveTaskboard(ss, data) {
  var list = getLongLeaveList(ss);
  var user = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].name === data.name) { user = list[i]; break; }
  }
  if (!user) return { error: '対象利用者が見つかりません', success: false };

  return addBoardTask(ss, {
    name: user.name + '様 長期休み利用連絡',
    priority: 'high',
    deadline: (user.expectedReturn && user.expectedReturn !== '未定') ? user.expectedReturn : '',
    source: '代表'
  });
}

// 同名利用者の重複行を削除（種別="長期休み" + 同じ開始日）
function dedupeLongTermAbsence(ss) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { error: 'シートがありません', success: false };

  var data = sheet.getDataRange().getValues();
  var seenKeys = {};
  var deletedRows = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var startDate = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    var type = String(data[i][3] || '').trim();
    if (type !== '長期休み') continue;

    var key = name + '_' + startDate;
    if (seenKeys[key]) {
      sheet.deleteRow(i + 1);
      deletedRows.push({ row: i + 1, name: name, startDate: startDate });
    } else {
      seenKeys[key] = true;
    }
  }

  return {
    success: true,
    deletedCount: deletedRows.length,
    deletedRows: deletedRows,
    message: deletedRows.length + '件の重複行を削除しました'
  };
}

// 自動リマインド（GASトリガー：毎日朝6時実行）
// - 復帰予定日の7日前ジャストでタスク投入
// - 復帰未定で最終連絡から14日経過でタスク投入
// - 同日同利用者で重複防止
function dailyLongLeaveReminder() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var list = getLongLeaveList(ss);
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  var added = [];
  list.forEach(function (user) {
    var shouldRemind = false;
    if (user.expectedReturn && user.expectedReturn !== '未定') {
      if (user.daysUntilReturn === 7) shouldRemind = true;
    } else {
      // 復帰未定: 最終連絡日があれば14日経過、なければ開始日から14日経過で発火
      var checkDays = user.daysSinceLastContact !== null ? user.daysSinceLastContact : user.elapsedDays;
      if (checkDays >= 14) shouldRemind = true;
    }

    if (shouldRemind && !alreadyAddedTodayLongLeave_(ss, user.name, today)) {
      addBoardTask(ss, {
        name: user.name + '様 長期休み利用連絡',
        priority: 'high',
        deadline: (user.expectedReturn && user.expectedReturn !== '未定') ? user.expectedReturn : '',
        source: '代表'
      });
      added.push(user.name);
    }
  });

  return { success: true, addedCount: added.length, added: added };
}

// dailyLongLeaveReminder の毎朝6時トリガーをセットアップ（GASエディタから1回実行する）
function setupLongLeaveTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  var matched = existing.filter(function(t) {
    return t.getHandlerFunction() === 'dailyLongLeaveReminder';
  });
  if (matched.length > 0) {
    Logger.log('既に存在しています: count=' + matched.length + ' uniqueId=' + matched[0].getUniqueId());
    return;
  }
  var newTrigger = ScriptApp.newTrigger('dailyLongLeaveReminder')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();
  Logger.log('作成完了: uniqueId=' + newTrigger.getUniqueId() + ' 関数=dailyLongLeaveReminder 毎朝6時');
}

// 同日に同じ「○○様 長期休み利用連絡」タスクが既に登録されてるか
function alreadyAddedTodayLongLeave_(ss, userName, todayStr) {
  var sheet = ss.getSheetByName('タスクボード');
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  var taskName = userName + '様 長期休み利用連絡';
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][1]);
    var name = String(data[i][3] || '').trim();
    if (d === todayStr && name === taskName) return true;
  }
  return false;
}

// ============================================================
// ===== メール対応カウンター（2026/5/3追加）=====
// 共有メール r.d-yawaragi@keepfitlife.com の未対応件数を保存・配信
// 個人情報なし・件数とドメインリストのみ
// 設計: docs/superpowers/specs/2026-05-03-メール対応タスク機能-design-v2.md
// ============================================================

function handleMailTaskCounts(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var date = e && e.parameter ? e.parameter.date : null;
  if (!date) {
    date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('mail_tasks_' + date);
  var data;
  if (raw) {
    try { data = JSON.parse(raw); } catch (err) { data = { care_manager: 0, user_family: 0, updated_at: null }; }
  } else {
    data = { care_manager: 0, user_family: 0, updated_at: null };
  }
  return respond({ success: true, date: date, data: data }, callback);
}

function handleListMailDomains(e) {
  var callback = e && e.parameter ? e.parameter.callback : null;
  var props = PropertiesService.getScriptProperties();
  var listStr = props.getProperty('care_manager_domains') || '[]';
  var domains;
  try { domains = JSON.parse(listStr); } catch (err) { domains = []; }
  return respond({ success: true, domains: domains }, callback);
}

function handleUpdateMailTaskCounts(data) {
  if (!data.date || typeof data.care_manager !== 'number' || typeof data.user_family !== 'number') {
    return { success: false, error: 'invalid_body (date/care_manager/user_family必須)' };
  }
  var props = PropertiesService.getScriptProperties();
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var payload = {
    care_manager: data.care_manager,
    user_family: data.user_family,
    updated_at: nowStr
  };
  props.setProperty('mail_tasks_' + data.date, JSON.stringify(payload));
  return { success: true, date: data.date, saved: payload };
}

function handleManageMailDomain(data) {
  if (!data.domain || (data.op !== 'add' && data.op !== 'remove')) {
    return { success: false, error: 'invalid_body (op=add|remove, domain必須)' };
  }
  var props = PropertiesService.getScriptProperties();
  var listStr = props.getProperty('care_manager_domains') || '[]';
  var list;
  try { list = JSON.parse(listStr); } catch (err) { list = []; }
  var d = String(data.domain).toLowerCase().trim();
  if (data.op === 'add') {
    if (list.indexOf(d) === -1) list.push(d);
  } else {
    list = list.filter(function (x) { return x !== d; });
  }
  props.setProperty('care_manager_domains', JSON.stringify(list));
  return { success: true, op: data.op, domain: d, domains: list };
}

// ============================================================
// ===== 旧「ケアマネ連絡先」シートを deprecate（2026/5/3追加）=====
// 「送付用居宅一覧」への移行完了後、旧シートをグレーアウト＋名前変更
// 1ヶ月後に手動削除予定（社長判断）
// ============================================================
function deprecateOldCmContactsSheet(ss) {
  var oldSheet = ss.getSheetByName('ケアマネ連絡先');
  if (!oldSheet) return { success: false, message: '既に「ケアマネ連絡先」シートはありません' };
  if (oldSheet.getName().indexOf('【旧') >= 0) {
    return { success: false, message: '既に旧シート化済み' };
  }
  // 新シート存在チェック（移行先がないとデータロスのリスク）
  var newSheet = ss.getSheetByName('送付用居宅一覧');
  if (!newSheet) return { success: false, error: '新シート「送付用居宅一覧」が存在しないため、deprecateを中止しました（先にsetupSheets()を実行してください）' };

  oldSheet.setName('ケアマネ連絡先【旧_5月末廃止】');
  oldSheet.setTabColor('#bdc3c7');
  if (oldSheet.getLastRow() >= 1 && oldSheet.getLastColumn() >= 1) {
    oldSheet.getRange(1, 1, 1, oldSheet.getLastColumn()).setBackground('#7f8c8d').setFontColor('#ffffff');
  }
  return { success: true, message: '旧シートを「ケアマネ連絡先【旧_5月末廃止】」にリネーム＆グレーアウトしました' };
}

// ===== 紹介管理（2026/5/3追加） =====
//
// 設計書: docs/superpowers/specs/2026-05-03-紹介管理機能-design.md
// プラン: docs/superpowers/plans/2026-05-03-紹介管理機能.md
//
// ケアマネからの「サービス担当者に対する照会(依頼)」（通称「紹介」）を
// 受付→担当決定→記入→PDF生成→FAX送信→完了 のフローで管理する。

var SHOKAI_SHEET = '紹介管理';
var JIGYOSYO_MASTER_SHEET = '居宅事業所マスタ';
var CAREMANAGER_MASTER_SHEET = 'ケアマネマスタ';

function ensureShokaiSheets_(ss) {
  if (!ss) ss = SpreadsheetApp.openById(SS_ID);
  var created = [];

  // 紹介管理シート
  var sheet = ss.getSheetByName(SHOKAI_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SHOKAI_SHEET);
    sheet.getRange(1, 1, 1, 21).setValues([[
      'ID', '受信日', '提出期限', '利用者名', '居宅事業所', '担当ケアマネ',
      '紹介理由', '理由詳細', '優先度', '受信方法',
      '記入担当', 'ステータス', '検討内容', '当事業所意見', '結論',
      '回答者', '回答日', '受信FAXファイル', '生成PDFリンク',
      '送信完了日', 'タスクボードID'
    ]]);
    sheet.getRange(1, 1, 1, 21).setFontWeight('bold').setBackground('#e8f0fe');
    sheet.setFrozenRows(1);
    created.push(SHOKAI_SHEET);
  }

  // 居宅事業所マスタ
  var jSheet = ss.getSheetByName(JIGYOSYO_MASTER_SHEET);
  if (!jSheet) {
    jSheet = ss.insertSheet(JIGYOSYO_MASTER_SHEET);
    jSheet.getRange(1, 1, 1, 9).setValues([[
      '事業所ID', '事業所名', '事業所番号', '住所',
      'TEL', 'FAX', 'メール', 'メール対応OK', '備考'
    ]]);
    jSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#e8f0fe');
    jSheet.setFrozenRows(1);
    created.push(JIGYOSYO_MASTER_SHEET);
  }

  // ケアマネマスタ
  var cSheet = ss.getSheetByName(CAREMANAGER_MASTER_SHEET);
  if (!cSheet) {
    cSheet = ss.insertSheet(CAREMANAGER_MASTER_SHEET);
    cSheet.getRange(1, 1, 1, 6).setValues([[
      'ケアマネID', 'ケアマネ名', '所属事業所ID',
      '直通TEL', '担当利用者リスト', '備考'
    ]]);
    cSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e8f0fe');
    cSheet.setFrozenRows(1);
    created.push(CAREMANAGER_MASTER_SHEET);
  }

  return {
    success: true,
    created: created,
    message: created.length === 0 ? '3シートとも既存（変更なし）' : (created.join(' / ') + ' を作成しました')
  };
}

// ============================================================
// ===== 通所介護計画モニタリング（2026/5/9追加）=====
// ============================================================
// 要支援1・要支援2・事業対象を毎月モニタリングするチェック表
// 「モニタリングチェック」シートに記録（userId/name/year/month/recordDate/pdfDate/updatedAt）

// シート初期化: 「モニタリングチェック」シートが無ければ作る（既にあればそれを返す）
function ensureMonitoringSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('モニタリングチェック');
  var HEADERS = ['userId', 'name', 'year', 'month', 'recordDate', 'pdfDate', 'updatedAt',
                 'pdfSendDate', 'printSendDate', 'operator'];
  if (!sheet) {
    sheet = ss.insertSheet('モニタリングチェック');
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e8f5e9');
    return sheet;
  }
  // マイグレーション: 新列(pdfSendDate=8, printSendDate=9, operator=10)が無ければ追加
  var lastCol = sheet.getLastColumn();
  if (lastCol < HEADERS.length) {
    var addCount = HEADERS.length - lastCol;
    sheet.insertColumnsAfter(lastCol, addCount);
    for (var k = lastCol; k < HEADERS.length; k++) {
      sheet.getRange(1, k + 1).setValue(HEADERS[k]).setFontWeight('bold').setBackground('#e8f5e9');
    }
  }
  return sheet;
}

// シート初期化: 「モニタリング設定」シート (userId / planStart / finalEvalMonth / updatedAt)
function ensureMonitoringConfigSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('モニタリング設定');
  var HEADERS = ['userId', 'planStart', 'finalEvalMonth', 'updatedAt'];
  if (!sheet) {
    sheet = ss.insertSheet('モニタリング設定');
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e8f5e9');
  }
  return sheet;
}

// ===== 通所介護計画書 期限切れチェック ヘルパー関数群（2026/5/30追加）=====

// 計画開始月 + 11ヶ月 で最終評価月を計算
// planStart "YYYY-MM" → "YYYY-MM"
function _calcFinalEvalMonth_(planStart) {
  if (!planStart) return '';
  var m = String(planStart).match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  var y = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10) + 11;
  while (mo > 12) { mo -= 12; y += 1; }
  return y + '-' + (mo < 10 ? '0' + mo : '' + mo);
}

// 今日の翌月を YYYY-MM で返す
function _nextMonthYYYYMM_() {
  var d = new Date();
  var y = d.getFullYear();
  var mo = d.getMonth() + 2; // getMonth()は0始まり、+2で翌月
  if (mo > 12) { mo -= 12; y += 1; }
  return y + '-' + (mo < 10 ? '0' + mo : '' + mo);
}

// 利用者台帳の「利用開始日」列から仮の planStart を推定
// 戻り値: { name: planStartYYYYMM, ... }（キーは氏名）
function _inferPlanStartFromUserList_(ss) {
  var uSheet = ss.getSheetByName('利用者台帳');
  if (!uSheet) return {};
  var lastRow = uSheet.getLastRow();
  if (lastRow < 2) return {};
  var head = uSheet.getRange(1, 1, 1, uSheet.getLastColumn()).getValues()[0]
              .map(function(v){ return String(v).trim(); });
  var nameCol = -1, startCol = -1;
  ['名前','氏名','利用者名'].forEach(function(n){ if (nameCol < 0) nameCol = head.indexOf(n); });
  ['利用開始日','利用開始'].forEach(function(n){ if (startCol < 0) startCol = head.indexOf(n); });
  if (nameCol < 0 || startCol < 0) return {};
  var values = uSheet.getRange(2, 1, lastRow - 1, uSheet.getLastColumn()).getValues();
  var result = {};
  values.forEach(function(row){
    var name = String(row[nameCol] || '').trim();
    if (!name) return;
    var startVal = row[startCol];
    if (!startVal) return;
    var startYM = '';
    if (startVal instanceof Date) {
      var y = startVal.getFullYear();
      var m = startVal.getMonth() + 1;
      startYM = y + '-' + (m < 10 ? '0' + m : '' + m);
    } else {
      var s = String(startVal).match(/^(\d{4})[-\/](\d{1,2})/);
      if (s) startYM = s[1] + '-' + (s[2].length === 1 ? '0' + s[2] : s[2]);
    }
    if (startYM) result[name] = startYM;
  });
  return result;
}

// 利用者台帳の「ステータス」が「中止」かどうか
// 戻り値: { name: { stopped: true/false, stopDate: 'YYYY-MM-DD' } }（キーは氏名）
function _getUserStoppedMap_(ss) {
  var uSheet = ss.getSheetByName('利用者台帳');
  if (!uSheet) return {};
  var lastRow = uSheet.getLastRow();
  if (lastRow < 2) return {};
  var head = uSheet.getRange(1, 1, 1, uSheet.getLastColumn()).getValues()[0]
              .map(function(v){ return String(v).trim(); });
  var nameCol = -1, statusCol = -1, stopDateCol = -1;
  ['名前','氏名','利用者名'].forEach(function(n){ if (nameCol < 0) nameCol = head.indexOf(n); });
  ['ステータス','利用状況'].forEach(function(n){ if (statusCol < 0) statusCol = head.indexOf(n); });
  ['中止日','利用終了日'].forEach(function(n){ if (stopDateCol < 0) stopDateCol = head.indexOf(n); });
  if (nameCol < 0) return {};
  var values = uSheet.getRange(2, 1, lastRow - 1, uSheet.getLastColumn()).getValues();
  var result = {};
  values.forEach(function(row){
    var name = String(row[nameCol] || '').trim();
    if (!name) return;
    var status = statusCol >= 0 ? String(row[statusCol] || '').trim() : '';
    var stopDate = stopDateCol >= 0 ? row[stopDateCol] : '';
    var stopDateStr = '';
    if (stopDate instanceof Date) {
      stopDateStr = Utilities.formatDate(stopDate, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else if (stopDate) {
      stopDateStr = String(stopDate);
    }
    result[name] = {
      stopped: status.indexOf('中止') >= 0,
      stopDate: stopDateStr
    };
  });
  return result;
}

// ケアマネ送付方法を利用者名→{method, reason}で返す
// 2026-06-17 案B作り直し: 送付用居宅一覧の送付方法列を正本に、利用者台帳の(cmOffice+cmName)で結合。
//   分類: メール/FAX→'PDF' / 持参/郵送→'印刷' / 不明・未登録→'PDF'。
//   優先: 利用者台帳「送付方法上書き」(PDF/印刷) があれば最優先。
//   混在事業所は cmName 一致行→ケアマネ名空の汎用行→先頭行 で解決。
//   純ロジック正本: scripts/lib/send-method-core.js（同一ルール・node 22PASS）。
//   ※ハードコード持参判定(JISAN_OFFICES)は撤去。consumer(口腔/モニタリング/個訓)は .method をそのまま読む。
function _smcClassifyMethod_(houhou) {
  var s = String(houhou || '').trim();
  if (s === '持参' || s === '郵送') return '印刷';
  if (s === 'メール' || s === 'FAX') return 'PDF';
  return 'PDF';
}
function _smcNorm_(s) { return String(s || '').replace(/[\s　]/g, '').trim(); }

// 2026-06-17 社長確定: 送付方法は cmOffice 単位で1つ（cmName では分けない）。
//   送付用居宅一覧を事業所単位に集約（持参/郵送が1行でもあれば紙優先で'印刷'）。
//   利用者台帳「送付方法上書き」(PDF/印刷)が最優先。表記揺れ(全角スペース)は正規化照合。
//   純ロジック正本: scripts/lib/send-method-core.js（同一ルール・node 21PASS）。
function _getCaremaneSendMethodMap_(ss) {
  // 1) 送付用居宅一覧 → 事業所単位の送付方法（紙優先集約）
  var cmSheet = getCmContactsSheet(ss);
  var officeMethod = {};   // normOffice -> 'PDF' | '印刷'
  if (cmSheet && cmSheet.getLastRow() >= 2) {
    var cols = _readCmCols(cmSheet);
    var cvals = cmSheet.getRange(2, 1, cmSheet.getLastRow() - 1, cmSheet.getLastColumn()).getValues();
    cvals.forEach(function (row) {
      var office = cols.office >= 0 ? _smcNorm_(row[cols.office]) : '';
      if (!office) return;
      var m = _smcClassifyMethod_(cols.method >= 0 ? row[cols.method] : '');
      if (officeMethod[office] === '印刷') return;   // 既に印刷確定なら据え置き
      if (m === '印刷') { officeMethod[office] = '印刷'; return; }
      if (!officeMethod[office]) officeMethod[office] = 'PDF';
    });
  }

  // 2) 利用者台帳 → 各利用者を cmOffice 単独で解決（上書き優先）
  var uSheet = ss.getSheetByName('利用者台帳');
  if (!uSheet) return {};
  var lastRow = uSheet.getLastRow();
  if (lastRow < 2) return {};
  var head = uSheet.getRange(1, 1, 1, uSheet.getLastColumn()).getValues()[0]
              .map(function (v) { return String(v).trim(); });
  var nameCol = -1, officeCol = -1, overrideCol = -1;
  ['名前', '氏名', '利用者名'].forEach(function (n) { if (nameCol < 0) nameCol = head.indexOf(n); });
  ['ケアマネ事業所名', 'ケアマネ事業所', '居宅'].forEach(function (n) { if (officeCol < 0) officeCol = head.indexOf(n); });
  ['送付方法上書き', '送付方法上書', '送付上書き'].forEach(function (n) { if (overrideCol < 0) overrideCol = head.indexOf(n); });
  if (nameCol < 0) return {};
  var values = uSheet.getRange(2, 1, lastRow - 1, uSheet.getLastColumn()).getValues();
  var result = {};
  values.forEach(function (row) {
    var name = String(row[nameCol] || '').trim();
    if (!name) return;
    var override = overrideCol >= 0 ? String(row[overrideCol] || '').trim() : '';
    if (override === 'PDF' || override === '印刷') {
      result[name] = { method: override, reason: '送付方法上書き', override: true, unregistered: false };
      return;
    }
    var office = officeCol >= 0 ? _smcNorm_(row[officeCol]) : '';
    var officeRaw = officeCol >= 0 ? String(row[officeCol] || '').trim() : '';
    if (office && officeMethod.hasOwnProperty(office)) {
      result[name] = { method: officeMethod[office], reason: '事業所単位[' + officeRaw + ']', override: false, unregistered: false };
    } else {
      result[name] = { method: 'PDF', reason: '送付用居宅一覧に未登録（PDF扱い）: ' + (officeRaw || '事業所空'), override: false, unregistered: true };
    }
  });
  return result;
}

// 対象者抽出: 利用者台帳から「要支援1/要支援2/事業対象」かつ「終了/中止/卒業」でない利用者を返す
// 注: 利用者台帳には「利用者ID」列が存在しないため、名前をuserIdとして使用する
// 注: 「要介護度」列の値は半角全角混在（要支援1/要支援１）のため、両方を許容する
function getMonitoringTargetUsers_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var userSheet = ss.getSheetByName('利用者台帳');
  if (!userSheet) return [];
  var values = userSheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
  var careCol = findCol(headers, ['要介護度', '介護度']);
  var statusCol = findCol(headers, ['利用ステータス']);
  if (statusCol < 0) statusCol = findColP(headers, 'ステータス');
  if (statusCol < 0) statusCol = findColP(headers, '利用状況');
  var furiCol = findCol(headers, ['フリガナ', 'ふりがな', 'カナ']);
  var daysCol = findCol(headers, ['利用曜日', '契約曜日', '曜日']);
  var ampmCol = findCol(headers, ['午前/午後', '契約時間帯', '時間帯', '午前午後']);
  var officeCol = findCol(headers, ['ケアマネ事業所名', 'ケアマネ事業所', '居宅']);
  var cmNameCol = findCol(headers, ['ケアマネ担当者名', 'ケアマネ担当', 'ケアマネ氏名', '担当ケアマネ']);
  if (nameCol < 0 || careCol < 0) return [];

  function normalize(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .trim();
  }
  var TARGETS = ['要支援1', '要支援2', '事業対象'];

  // モニタリング設定シートから planStart/finalEvalMonth を取得
  // 注: '2025-12' はSheetsが日付値に自動変換するため、Dateで返ることがある。
  //     フロントは 'YYYY-MM' 文字列を期待するので必ず整形する。
  function fmtYM_(v) {
    if (!v && v !== 0) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})/);
    return m ? (m[1] + '-' + m[2]) : s;
  }
  var configSheet = ensureMonitoringConfigSheet_();
  var configValues = configSheet.getDataRange().getValues();
  var configMap = {};
  for (var ci = 1; ci < configValues.length; ci++) {
    var cuid = String(configValues[ci][0] || '').trim();
    if (cuid) {
      configMap[cuid] = {
        planStart: fmtYM_(configValues[ci][1]),
        finalEvalMonth: fmtYM_(configValues[ci][2])
      };
    }
  }

  var users = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var name = String(row[nameCol] || '').trim();
    if (!name) continue;
    if (statusCol >= 0) {
      var st = String(row[statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    var careRaw = String(row[careCol] || '').trim();
    var careNorm = normalize(careRaw);
    if (TARGETS.indexOf(careNorm) < 0) continue;
    var cfg = configMap[name] || { planStart: '', finalEvalMonth: '' };
    users.push({
      userId: name,
      name: name,
      category: careNorm,
      furigana: furiCol >= 0 ? String(row[furiCol] || '').trim() : '',
      days: daysCol >= 0 ? String(row[daysCol] || '').trim() : '',
      ampm: ampmCol >= 0 ? String(row[ampmCol] || '').trim() : '',
      caremaneOffice: officeCol >= 0 ? String(row[officeCol] || '').trim() : '',
      caremaneName: cmNameCol >= 0 ? String(row[cmNameCol] || '').trim() : '',
      planStart: cfg.planStart,
      finalEvalMonth: cfg.finalEvalMonth
    });
  }
  return users;
}

// 来月（または指定月）が最終評価月の利用者リストを返す
// targetMonth: 'YYYY-MM' 形式、省略時は来月
function _getMonitoringPlanExpiring_(targetMonth) {
  var month = targetMonth || _nextMonthYYYYMM_();
  var ss = SpreadsheetApp.openById(SS_ID);

  // 1. 全モニタリング対象者
  // ※ getMonitoringTargetUsers_ は 'モニタリング設定' シートを読み、
  //   各ユーザに fmtYM_ 適用済みの planStart / finalEvalMonth を付与して返す。
  //   よってここで configシートを再読み込みする必要はない。
  var targetUsers = getMonitoringTargetUsers_();

  // 2. 利用者台帳から推定用データ
  var inferredStarts = _inferPlanStartFromUserList_(ss);
  var stoppedMap = _getUserStoppedMap_(ss);
  var sendMethodMap = _getCaremaneSendMethodMap_(ss);

  // 3. 対象判定
  var result = [];
  targetUsers.forEach(function(u){
    var planStart = u.planStart;
    var inferred = false;
    if (!planStart) {
      planStart = inferredStarts[u.name] || '';
      inferred = !!planStart;
    }
    if (!planStart) return; // 計画期間判定不能

    var finalEval = u.finalEvalMonth || _calcFinalEvalMonth_(planStart);
    if (finalEval !== month) return; // 来月期限切れではない

    var stopInfo = stoppedMap[u.name] || { stopped: false, stopDate: '' };
    // 中止者は当面全員残す（送付済フラグは後続実装）
    // ただし getMonitoringTargetUsers_ が中止者を除外しているため、
    // 現状この isStoppedUser は常に false（別specで中止者対応予定）

    var sm = sendMethodMap[u.name] || { method: 'PDF', reason: '送付方法不明（PDF扱い）' };

    result.push({
      userId: u.userId,
      name: u.name,
      furigana: u.furigana || '',
      planStart: planStart,
      finalEvalMonth: finalEval,
      inferred: inferred,
      caremaneOffice: u.caremaneOffice || '',
      caremaneName: u.caremaneName || '',
      sendMethod: sm.method,
      sendReason: sm.reason,
      isStoppedUser: stopInfo.stopped,
      stopDate: stopInfo.stopDate
    });
  });

  return { month: month, users: result };
}

// ===== 利用率分析: 月の通所予定回数を計算 =====
// weekdaysRaw: '月水金' のような曜日列。複合パターン（'月午前、木午後'）から曜日のみ抽出
// year, month: 集計対象の年・月（month は 1-12）
// 戻り値: その月のカレンダー上、weekdaysRaw に含まれる曜日に該当する日の数
function calcMonthlyScheduledByPattern(weekdaysRaw, year, month) {
  if (!weekdaysRaw) return 0;
  var dayChars = ['月','火','水','木','金','土','日'];
  var dayMap = {'日':0,'月':1,'火':2,'水':3,'木':4,'金':5,'土':6};
  // weekdaysRaw から曜日文字を抽出（重複除外）
  var found = {};
  for (var i = 0; i < weekdaysRaw.length; i++) {
    var c = weekdaysRaw.charAt(i);
    if (dayChars.indexOf(c) >= 0) found[c] = true;
  }
  var weekdays = Object.keys(found);
  if (weekdays.length === 0) return 0;
  // 月の日数を求める
  var lastDay = new Date(year, month, 0).getDate();
  var count = 0;
  for (var d = 1; d <= lastDay; d++) {
    var dow = new Date(year, month - 1, d).getDay();
    var dowChar = null;
    for (var k in dayMap) { if (dayMap[k] === dow) { dowChar = k; break; } }
    if (dowChar && weekdays.indexOf(dowChar) >= 0) count++;
  }
  return count;
}

// ===== 利用率アラート: しきい値（調整時はこの値を変更して再デプロイ）=====
// high* = 高出席率（枠追加候補・要介護のみ・全曜日もこの値以上）
var USAGE_ALERT_THRESHOLDS = { redOverall: 65, redWorst: 50, yellowOverall: 85, yellowWorst: 80, highOverall: 95, highWorst: 95 };

// ===== 利用率アラート: 利用率からバッジ色を判定（純関数）=====
// overallRate / worstDayRate: 0-100 の数値、または null（データ不足）
// T: USAGE_ALERT_THRESHOLDS
// 戻り値: 'red' | 'yellow' | null
function judgeUsageBadge(overallRate, worstDayRate, T) {
  if (overallRate == null) return null;
  if (overallRate < T.redOverall) return 'red';
  if (worstDayRate != null && worstDayRate < T.redWorst) return 'red';
  if (overallRate < T.yellowOverall) return 'yellow';
  if (worstDayRate != null && worstDayRate < T.yellowWorst) return 'yellow';
  return null;
}

function calcUsageDayBreakdown(weekdaysRaw, absenceDates, longAbsenceDates, months) {
  var dayChars = ['月','火','水','木','金','土','日'];
  var found = {};
  for (var i = 0; i < (weekdaysRaw || '').length; i++) {
    var c = weekdaysRaw.charAt(i);
    if (dayChars.indexOf(c) >= 0) found[c] = true;
  }
  var contractDays = Object.keys(found);
  var byDay = {};
  contractDays.forEach(function(dc) {
    var scheduled = 0;
    months.forEach(function(m) { scheduled += calcMonthlyScheduledByPattern(dc, m.year, m.month); });
    byDay[dc] = { scheduled: scheduled, absences: 0, actual: 0, rate: null };
  });
  function dowCharOf(ds) {
    var dow = new Date(parseInt(ds.slice(0,4)), parseInt(ds.slice(5,7)) - 1, parseInt(ds.slice(8,10))).getDay();
    return dayChars[(dow + 6) % 7];
  }
  var ltSet = {};
  (longAbsenceDates || []).forEach(function(ds) { ltSet[ds] = true; });
  Object.keys(ltSet).forEach(function(ds) {
    var dc = dowCharOf(ds);
    if (byDay[dc]) byDay[dc].absences++;
  });
  var seen = {};
  (absenceDates || []).forEach(function(ds) {
    if (ltSet[ds] || seen[ds]) return;
    seen[ds] = true;
    var dc = dowCharOf(ds);
    if (byDay[dc]) byDay[dc].absences++;
  });
  var overallSch = 0, overallAbs = 0, worstDay = null;
  contractDays.forEach(function(dc) {
    var b = byDay[dc];
    if (b.absences > b.scheduled) b.absences = b.scheduled;
    b.actual = b.scheduled - b.absences;
    b.rate = b.scheduled > 0 ? Math.round(b.actual / b.scheduled * 1000) / 10 : null;
    overallSch += b.scheduled;
    overallAbs += b.absences;
    if (b.rate != null && (worstDay == null || b.rate < worstDay.rate)) worstDay = { day: dc, rate: b.rate };
  });
  var overallActual = overallSch - overallAbs;
  var overallRate = overallSch > 0 ? Math.round(overallActual / overallSch * 1000) / 10 : null;
  return {
    byDay: byDay,
    overall: { scheduled: overallSch, absences: overallAbs, actual: overallActual, rate: overallRate },
    worstDay: worstDay
  };
}

// ===== 利用率トレンド: 期間別集計 =====
function calcUsagePeriods(weekdaysRaw, absenceDates, longAbsenceDates, toYM, operationStartYM) {
  var dayChars = ['月','火','水','木','金','土','日'];
  var found = {};
  for (var i = 0; i < (weekdaysRaw || '').length; i++) {
    var c = weekdaysRaw.charAt(i);
    if (dayChars.indexOf(c) >= 0) found[c] = true;
  }
  var contractPerWeek = Object.keys(found).length;
  var specs = [
    { label: '直近1ヶ月', count: 1 },
    { label: '直近2ヶ月', count: 2 },
    { label: '直近3ヶ月', count: 3 },
  ];
  var ty = parseInt(toYM.slice(0, 4)), tm = parseInt(toYM.slice(5, 7));
  var periods = [];
  specs.forEach(function(sp) {
    var months = [];
    var ymSet = {};
    for (var k = sp.count - 1; k >= 0; k--) {
      var d = new Date(ty, tm - 1 - k, 1);
      var ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (ym >= operationStartYM) {
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
        ymSet[ym] = true;
      }
    }
    var fAbs = (absenceDates || []).filter(function(ds) { return ymSet[ds.slice(0, 7)]; });
    var fLt = (longAbsenceDates || []).filter(function(ds) { return ymSet[ds.slice(0, 7)]; });
    var bd = calcUsageDayBreakdown(weekdaysRaw, fAbs, fLt, months);
    var rate = bd.overall.rate;
    var actualPerWeek = (rate == null) ? null : Math.round(contractPerWeek * rate / 100 * 10) / 10;
    periods.push({
      label: sp.label,
      months: sp.count,
      rate: rate,
      contractPerWeek: contractPerWeek,
      actualPerWeek: actualPerWeek,
    });
  });
  return periods;
}

// 単体テスト: GAS エディタから手動実行して確認
function _test_calcMonthlyScheduledByPattern() {
  // 2026年4月: 月曜=4回、水曜=5回、金曜=4回 → 月水金=13回
  var r1 = calcMonthlyScheduledByPattern('月水金', 2026, 4);
  Logger.log('月水金 2026-04: ' + r1 + ' (期待値 13)');

  // 2026年4月: 火曜=4回 → 火=4回
  var r2 = calcMonthlyScheduledByPattern('火', 2026, 4);
  Logger.log('火 2026-04: ' + r2 + ' (期待値 4)');

  // 複合パターンから曜日抽出: 月午前、木午後 → 月木=2曜日
  // 2026年4月の月=4回、木=5回 → 計9回
  var r3 = calcMonthlyScheduledByPattern('月午前、木午後', 2026, 4);
  Logger.log('月午前、木午後 2026-04: ' + r3 + ' (期待値 9)');

  // 空文字
  var r4 = calcMonthlyScheduledByPattern('', 2026, 4);
  Logger.log('空 2026-04: ' + r4 + ' (期待値 0)');
}

// ===== 利用率分析: 名前正規化（NFKC + 「様」除去）=====
function _normalizeUserName(name) {
  if (!name) return '';
  return String(name).normalize('NFKC')
    .replace(/[\s　]/g, '')
    .replace(/(様|さま|サマ)$/g, '')
    .trim();
}

// ===== 利用率分析: 期間内の月別欠席数を集計 =====
// 戻り値: {
//   absences: {norm:{ym:count}},           // 通常欠席のカウント（参考）
//   absenceDays: {norm:{ym:[YYYY-MM-DD]}},  // 通常欠席の日付配列（重複除去用）
//   longAbsenceDays: {norm:{ym:[YYYY-MM-DD配列]}} // 長期休みの日付配列（全曜日）
// }
// - 通常欠席は1日=1カウント（同じ日に午前/午後の2行があれば1日扱い）
// - 長期休みは「日付配列」のまま返し、契約曜日でのフィルタは呼出側で行う
// - 取消行はスキップ
function getMonthlyAbsenceCounts(ss, fromYM, toYM) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return { absences: {}, absenceDays: {}, longAbsenceDays: {} };
  var data = sheet.getDataRange().getValues();

  var fromParts = fromYM.split('-');
  var toParts = toYM.split('-');
  var rangeStart = Utilities.formatDate(new Date(parseInt(fromParts[0]), parseInt(fromParts[1])-1, 1), 'Asia/Tokyo', 'yyyy-MM-dd');
  var rangeEnd = Utilities.formatDate(new Date(parseInt(toParts[0]), parseInt(toParts[1]), 0), 'Asia/Tokyo', 'yyyy-MM-dd');

  // 通常欠席用: dayMarks[norm][ym][d] = true
  var dayMarks = {};
  // 長期休み用: longMarks[norm][ym][d] = true（後で配列に変換）
  var longMarks = {};

  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    if (!name || !d) continue;
    var type = String(data[i][3] || '').trim();
    var norm = _normalizeUserName(name);

    if (type === '欠席') {
      if (d < rangeStart || d > rangeEnd) continue;
      var ym = d.slice(0, 7);
      if (!dayMarks[norm]) dayMarks[norm] = {};
      if (!dayMarks[norm][ym]) dayMarks[norm][ym] = {};
      dayMarks[norm][ym][d] = true;
    } else if (type === '長期休み') {
      var endDate = data[i][7] ? fmtDate(data[i][7]) : '';
      // 期間: d 〜 (endDate-1日)。endDate は再開日（=その日から戻ってくる）なので欠席ではない。
      var ltStart = d > rangeStart ? d : rangeStart;
      var lastAbsentDay;
      if (endDate) {
        var resumeD = new Date(parseInt(endDate.slice(0,4)), parseInt(endDate.slice(5,7))-1, parseInt(endDate.slice(8,10)));
        resumeD.setDate(resumeD.getDate() - 1);
        lastAbsentDay = Utilities.formatDate(resumeD, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        lastAbsentDay = rangeEnd;
      }
      var ltEnd = lastAbsentDay < rangeEnd ? lastAbsentDay : rangeEnd;
      if (ltEnd < ltStart) continue;
      var cur = new Date(parseInt(ltStart.slice(0,4)), parseInt(ltStart.slice(5,7))-1, parseInt(ltStart.slice(8,10)));
      var endD = new Date(parseInt(ltEnd.slice(0,4)), parseInt(ltEnd.slice(5,7))-1, parseInt(ltEnd.slice(8,10)));
      while (cur <= endD) {
        var dayStr = Utilities.formatDate(cur, 'Asia/Tokyo', 'yyyy-MM-dd');
        var ymKey = dayStr.slice(0, 7);
        if (!longMarks[norm]) longMarks[norm] = {};
        if (!longMarks[norm][ymKey]) longMarks[norm][ymKey] = {};
        longMarks[norm][ymKey][dayStr] = true;
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  // dayMarks → カウント形式 + 日付配列形式
  var absences = {};
  var absenceDays = {};
  Object.keys(dayMarks).forEach(function(norm) {
    absences[norm] = {};
    absenceDays[norm] = {};
    Object.keys(dayMarks[norm]).forEach(function(ym) {
      var days = Object.keys(dayMarks[norm][ym]).sort();
      absences[norm][ym] = days.length;
      absenceDays[norm][ym] = days;
    });
  });
  // longMarks → 日付配列形式
  var longAbsenceDays = {};
  Object.keys(longMarks).forEach(function(norm) {
    longAbsenceDays[norm] = {};
    Object.keys(longMarks[norm]).forEach(function(ym) {
      longAbsenceDays[norm][ym] = Object.keys(longMarks[norm][ym]).sort();
    });
  });

  return { absences: absences, absenceDays: absenceDays, longAbsenceDays: longAbsenceDays };
}

// 動作確認用テスト
function _test_getMonthlyAbsenceCounts() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var r = getMonthlyAbsenceCounts(ss, '2026-04', '2026-05');
  Logger.log('absences 先頭5名:');
  var aKeys = Object.keys(r.absences).slice(0, 5);
  aKeys.forEach(function(k) { Logger.log('  ' + k + ': ' + JSON.stringify(r.absences[k])); });
  Logger.log('longAbsenceDays 先頭5名:');
  var lKeys = Object.keys(r.longAbsenceDays).slice(0, 5);
  lKeys.forEach(function(k) { Logger.log('  ' + k + ': ' + JSON.stringify(r.longAbsenceDays[k])); });
}

// ===== 利用率分析: 期間×利用者×月の予定/欠席を返す =====
// 引数: ss, fromYM='YYYY-MM', toYM='YYYY-MM'
// 戻り値: { operationStart, users: [{name, weekdaysRaw, monthly: {ym: {scheduled, absences, isPreOperational}}}] }
function getUsageStats(ss, fromYM, toYM) {
  // 月リストを生成
  var months = [];
  var fp = fromYM.split('-'), tp = toYM.split('-');
  var cur = new Date(parseInt(fp[0]), parseInt(fp[1]) - 1, 1);
  var end = new Date(parseInt(tp[0]), parseInt(tp[1]) - 1, 1);
  while (cur <= end) {
    months.push({
      key: Utilities.formatDate(cur, 'Asia/Tokyo', 'yyyy-MM'),
      year: cur.getFullYear(),
      month: cur.getMonth() + 1
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  // 利用者台帳から通所パターン取得
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { error: '利用者台帳シートなし', users: [] };
  var data = sheet.getDataRange().getValues();
  var h = data[0].map(function(v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var daysCol = findCol(h, ['利用曜日']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  if (nameCol < 0) return { error: '名前列が見つかりません', users: [] };
  if (daysCol < 0) return { error: '利用曜日列が見つかりません', users: [] };

  // 月別欠席を一括取得（通常+長期）
  var counts = getMonthlyAbsenceCounts(ss, fromYM, toYM);
  var dayChars = ['日','月','火','水','木','金','土'];

  var users = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    var weekdaysRaw = daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '';
    if (!weekdaysRaw) continue;

    var norm = _normalizeUserName(name);
    var monthly = {};
    months.forEach(function(m) {
      var scheduled = calcMonthlyScheduledByPattern(weekdaysRaw, m.year, m.month);
      // 長期休み日のうち、契約曜日に該当するものを収集（日付セット + カウント）
      var ltDates = (counts.longAbsenceDays[norm] && counts.longAbsenceDays[norm][m.key]) || [];
      var ltDateSet = {};  // 長期休み期間の日付セット（全曜日）
      var ltContractDates = {};  // 長期休み期間のうち契約曜日の日付セット
      for (var li = 0; li < ltDates.length; li++) {
        var ds = ltDates[li];
        ltDateSet[ds] = true;
        var dow = new Date(parseInt(ds.slice(0,4)), parseInt(ds.slice(5,7))-1, parseInt(ds.slice(8,10))).getDay();
        if (weekdaysRaw.indexOf(dayChars[dow]) >= 0) ltContractDates[ds] = true;
      }
      var ltAbs = Object.keys(ltContractDates).length;
      // 通常欠席のうち、長期休み期間と重複しない日のみカウント（二重カウント防止）
      // counts.absences は日数のみなので、重複計算には absenceDays（日付配列）を使う
      var absDates = (counts.absenceDays[norm] && counts.absenceDays[norm][m.key]) || [];
      var normalAbs = 0;
      for (var ai = 0; ai < absDates.length; ai++) {
        if (!ltDateSet[absDates[ai]]) normalAbs++;
      }
      var absences = normalAbs + ltAbs;
      // その月の月末日が運用開始日以前なら isPreOperational
      var monthEnd = Utilities.formatDate(new Date(m.year, m.month, 0), 'Asia/Tokyo', 'yyyy-MM-dd');
      var isPreOperational = monthEnd < OPERATION_START_DATE;
      monthly[m.key] = { scheduled: scheduled, absences: absences, isPreOperational: isPreOperational };
    });
    users.push({ name: name, weekdaysRaw: weekdaysRaw, monthly: monthly });
  }

  return { operationStart: OPERATION_START_DATE, users: users };
}

// ===== 利用率アラート v2: 判定軸作り替え（2026-05-21・契約過多A・不在B・曜日別C） =====
// 旧 USAGE_ALERT_THRESHOLDS / judgeUsageBadge は段階移行のため一時併存。getUsageAlerts を v2 化した後に廃止予定。
var USAGE_ALERT_THRESHOLDS_V2 = {
  contractGapYellow: 1.0,         // 実績週回数 ≤ 契約週回数 - 1.0 で🟡（要介護のみ）
  contractGapRedHalfRatio: 0.5,   // 実績週回数 ≤ 契約週回数 × 0.5 で🔴（要介護のみ）
  absenceDaysYellow: 21,          // 要介護: 最終利用から21日(3週間)以上で🟡
  absenceDaysRed: 30,             // 要介護: 最終利用から30日(1ヶ月)以上で🔴
  shienAbsenceDaysYellow: 70,     // 要支援/事業対象: 70日(3ヶ月失効手前)で🟡
  shienAbsenceDaysRed: 85,        // 要支援/事業対象: 85日(失効5日前)で🔴
  yellowWorst: 80,                // 曜日別利用率 < 80% で🟡（要介護のみ）
  redWorst: 50,                   // 曜日別利用率 < 50% で🔴（要介護のみ）
};

// today('YYYY-MM-DD')から契約曜日を遡り、欠席記録にない最初の日 = 最終利用日。
// absenceDates/longAbsenceDates は 'YYYY-MM-DD' 配列。過去60日まで遡る（週1契約でも8週間カバー）。
function calcLastVisitDate(weekdaysRaw, absenceDates, longAbsenceDates, today) {
  if (!weekdaysRaw) return null;
  var dayChars = ['月','火','水','木','金','土','日'];
  var found = {};
  for (var i = 0; i < weekdaysRaw.length; i++) {
    var c = weekdaysRaw.charAt(i);
    if (dayChars.indexOf(c) >= 0) found[c] = true;
  }
  var absSet = {};
  (absenceDates || []).forEach(function(d) { absSet[d] = true; });
  (longAbsenceDates || []).forEach(function(d) { absSet[d] = true; });
  var d = new Date(parseInt(today.slice(0,4)), parseInt(today.slice(5,7)) - 1, parseInt(today.slice(8,10)));
  for (var k = 0; k < 60; k++) {
    var dow = (d.getDay() + 6) % 7;  // 0=月 ... 6=日
    var dc = dayChars[dow];
    if (found[dc]) {
      var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      if (!absSet[ds]) return ds;
    }
    d.setDate(d.getDate() - 1);
  }
  return null;
}

// 'YYYY-MM-DD' 同士の日数差（later - earlier）。null入力で null。
function daysBetween(later, earlier) {
  if (!later || !earlier) return null;
  var l = new Date(parseInt(later.slice(0,4)), parseInt(later.slice(5,7))-1, parseInt(later.slice(8,10)));
  var e = new Date(parseInt(earlier.slice(0,4)), parseInt(earlier.slice(5,7))-1, parseInt(earlier.slice(8,10)));
  return Math.round((l - e) / 86400000);
}

// 3軸統合バッジ判定（v2.1 / 2026-05-31 介護度別判定対応）。
// careLevel: '要介護X' / '要支援X' / '事業対象者' / '' / 未指定
//   - 要支援/事業対象: 軸A・軸C スキップ、軸Bのみ（閾値は shienAbsenceDays = 70/85日）
//   - 要介護/空欄/不明: 3軸全部適用（既定で厳しめ）
// 戻り値: { badge: 'red'|'yellow'|null, reasons: [string...] }
function judgeUsageBadgeV2(actualPerWeek, contractPerWeek, daysSinceLastVisit, worstDayObj, T, careLevel) {
  var badges = [];
  var reasons = [];
  var lv = String(careLevel || '');
  var isShien = lv.indexOf('要支援') >= 0 || lv.indexOf('事業対象') >= 0;
  var isKaigo = !isShien;  // 要介護および介護度不明は要介護扱い
  if (isKaigo && actualPerWeek != null && contractPerWeek > 0) {
    if (actualPerWeek <= contractPerWeek * T.contractGapRedHalfRatio) {
      badges.push('red');
      reasons.push('実績が契約の半分以下（週' + contractPerWeek + '回→週' + actualPerWeek + '回）');
    } else if (actualPerWeek <= contractPerWeek - T.contractGapYellow) {
      var gap = Math.round((contractPerWeek - actualPerWeek) * 10) / 10;
      badges.push('yellow');
      reasons.push('契約より' + gap + '回少ない（週' + contractPerWeek + '回→週' + actualPerWeek + '回・見直し検討）');
    }
  }
  if (daysSinceLastVisit != null) {
    var redDays = isShien ? T.shienAbsenceDaysRed : T.absenceDaysRed;
    var yellowDays = isShien ? T.shienAbsenceDaysYellow : T.absenceDaysYellow;
    if (daysSinceLastVisit >= redDays) {
      badges.push('red');
      var rest = Math.max(0, 90 - daysSinceLastVisit);
      reasons.push('最終利用から' + daysSinceLastVisit + '日不在' + (isShien ? '（3ヶ月失効まで残り' + rest + '日）' : '（1ヶ月超）'));
    } else if (daysSinceLastVisit >= yellowDays) {
      badges.push('yellow');
      reasons.push('最終利用から' + daysSinceLastVisit + '日経過' + (isShien ? '（3ヶ月失効に注意）' : ''));
    }
  }
  if (isKaigo && worstDayObj && worstDayObj.rate != null) {
    if (worstDayObj.rate < T.redWorst) {
      badges.push('red');
      reasons.push(worstDayObj.day + '曜の利用率が極端に低い（' + worstDayObj.rate + '%）');
    } else if (worstDayObj.rate < T.yellowWorst) {
      badges.push('yellow');
      reasons.push(worstDayObj.day + '曜の利用率が低い（' + worstDayObj.rate + '%）');
    }
  }
  var badge = null;
  if (badges.indexOf('red') >= 0) badge = 'red';
  else if (badges.indexOf('yellow') >= 0) badge = 'yellow';
  return { badge: badge, reasons: reasons };
}

// ===== 利用率アラート: 現在長期休み中の利用者（正規化名）セットを返す =====
// 出欠変更シートの type='長期休み' 行で、再開日(列8/index7)が空 or today より後 なら長期休み中。
function getOnLongLeaveSet(ss, today) {
  var set = {};
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return set;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var type = String(data[i][3] || '').trim();
    if (type !== '長期休み') continue;
    var name = String(data[i][1] || '').trim();
    if (!name) continue;
    var resume = data[i][7] ? fmtDate(data[i][7]) : '';
    // 再開日が空（復帰未定）または today より後なら、現在も長期休み中
    if (!resume || resume > today) set[_normalizeUserName(name)] = true;
  }
  return set;
}

// ===== 利用率アラート: 全利用者のバッジ判定結果を返す =====
// 引数: ss, fromYM='YYYY-MM', toYM='YYYY-MM', today='YYYY-MM-DD'
// 戻り値: { period, thresholds, users: [...], redList: [...], highList: [...] }
//   highList = 要介護・週1〜2回・全体>=highOverall かつ 全曜日>=highWorst（増回おすすめ）。週回数昇順→利用率降順
// 集計窓内に「実際の曜日変更」があった利用者の正規化名セットを返す（利用率の参考値化用）。
// 曜日変更があると、変更前の期間に現在の契約曜日を遡及適用してしまい利用率が幻になる
// （例: 伊東玄太郎=月→火6/2 で火曜の幻100%）。窓内に発効した変更があれば利用率アラート対象から外す。
// ※ newDays を持たないイベント（区分変更フォローが usage_days_change に誤ラベルされたもの＝本郷安子の例）は
//   曜日変更ではないので対象外にする（誤検出防止）。
function getWeekdayChangeUsersSince(ss, sinceYmd) {
  var set = {};
  var sheet = ss.getSheetByName('利用者イベント');
  if (!sheet || sheet.getLastRow() < 2) return set;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1] || '') !== 'usage_days_change') continue;  // [1]=eventType
    var name = String(data[i][2] || '').trim();                      // [2]=userName
    if (!name) continue;
    var meta = {};
    try { meta = JSON.parse(data[i][4] || '{}'); } catch (e) { meta = {}; }  // [4]=metadata(JSON)
    if (!meta.newDays) continue;  // 本当の曜日変更のみ（区分変更の誤ラベルを除外）
    var eff = meta.effectiveDate ? fmtDate(meta.effectiveDate) : fmtDate(data[i][3]);  // [3]=eventDate
    if (!eff || eff < sinceYmd) continue;  // 窓より前の変更＝窓全体が新曜日で信頼できる→対象外
    set[_normalizeUserName(name)] = true;
  }
  return set;
}

function getUsageAlerts(ss, fromYM, toYM, today) {
  var T = USAGE_ALERT_THRESHOLDS;
  var careLevelMap = buildCareLevelMap(ss);
  // 月リスト生成
  var months = [];
  var fp = fromYM.split('-'), tp = toYM.split('-');
  var cur = new Date(parseInt(fp[0]), parseInt(fp[1]) - 1, 1);
  var end = new Date(parseInt(tp[0]), parseInt(tp[1]) - 1, 1);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  // 利用者台帳
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { error: '利用者台帳シートなし', users: [], redList: [] };
  var data = sheet.getDataRange().getValues();
  var h = data[0].map(function(v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var daysCol = findCol(h, ['利用曜日']);
  var statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var startCol = findCol(h, ['利用開始日', '利用開始']);
  if (nameCol < 0) return { error: '名前列が見つかりません', users: [], redList: [] };
  if (daysCol < 0) return { error: '利用曜日列が見つかりません', users: [], redList: [] };

  // 欠席集計（既存関数を再利用）
  var counts = getMonthlyAbsenceCounts(ss, fromYM, toYM);
  // 長期休み中セット
  var onLongLeave = getOnLongLeaveSet(ss, today);
  // 集計窓内に曜日変更があった利用者（利用率を参考値扱いにして除外する）
  var weekdayChanged = getWeekdayChangeUsersSince(ss, fromYM + '-01');
  // 直近欠席履歴（理由付き）を norm 別に収集
  // ※「前回お休み」判定は当月の欠席が要るため、表示用 recentAbsences だけ当月まで範囲拡張する。
  //   利用率計算は完了月の absDates（getMonthlyAbsenceCounts 由来）のまま据え置き＝副作用なし。
  var curYM = today.slice(0, 7);                 // 例 '2026-06'
  var absTo = curYM > toYM ? curYM : toYM;       // 当月まで範囲拡張
  var absDetail = getRecentAbsencesByUser(ss, fromYM, absTo);
  // 軸B（最終利用日・不在見守り）用の欠席集合は当月込みが要る（recentAbsences と同じ理由）。
  // 率計算は counts（完了月）据え置き。当月拡張時のみ追加で集計（ループ外で1回だけ）。
  var countsForVisit = (absTo === toYM) ? counts : getMonthlyAbsenceCounts(ss, fromYM, absTo);
  // 新規利用者の基準日（today の1ヶ月前）
  var newCutoff = '';
  if (startCol >= 0) {
    var nd = new Date(parseInt(today.slice(0,4)), parseInt(today.slice(5,7)) - 1, parseInt(today.slice(8,10)));
    nd.setMonth(nd.getMonth() - 1);
    newCutoff = Utilities.formatDate(nd, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  var users = [], redList = [], highList = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    var weekdaysRaw = String(data[i][daysCol] || '').trim();
    if (!weekdaysRaw) continue;
    var norm = _normalizeUserName(name);

    // 除外: 長期休み中
    if (onLongLeave[norm]) {
      users.push({ name: name, weekdaysRaw: weekdaysRaw, badge: null, excluded: true, excludeReason: '長期休み中' });
      continue;
    }
    // 除外: 新規利用者（利用開始日が1ヶ月以内）
    if (startCol >= 0) {
      var startDate = data[i][startCol] ? fmtDate(data[i][startCol]) : '';
      if (startDate && startDate > newCutoff) {
        users.push({ name: name, weekdaysRaw: weekdaysRaw, badge: null, excluded: true, excludeReason: '新規利用者（1ヶ月未満）' });
        continue;
      }
    }
    // 除外: 集計窓内に曜日変更あり（旧曜日期間が混ざり利用率が不正確＝参考値）
    if (weekdayChanged[norm]) {
      users.push({ name: name, weekdaysRaw: weekdaysRaw, badge: null, excluded: true, excludeReason: '曜日変更あり（利用率は参考値）' });
      continue;
    }
    // 欠席日付を期間平坦化
    var absDates = [], ltDates = [];
    var amap = counts.absenceDays[norm] || {};
    Object.keys(amap).forEach(function(ym) { absDates = absDates.concat(amap[ym]); });
    var lmap = counts.longAbsenceDays[norm] || {};
    Object.keys(lmap).forEach(function(ym) { ltDates = ltDates.concat(lmap[ym]); });

    var bd = calcUsageDayBreakdown(weekdaysRaw, absDates, ltDates, months);
    var periods = calcUsagePeriods(weekdaysRaw, absDates, ltDates, toYM, OPERATION_START_YM);

    // 軸A用: 直近2ヶ月の実績週回数（運用クランプで〜2026-06は実質1〜2ヶ月）
    var period2m = periods[1];
    var actualPerWeek = period2m ? period2m.actualPerWeek : null;
    var contractPerWeek = period2m ? period2m.contractPerWeek : Object.keys(bd.byDay).length;

    // 軸B用: 最終利用日と経過日数（当月込みの欠席集合で判定・不在見守りトリガー）
    var vAbs = [], vLt = [];
    var vAmap = countsForVisit.absenceDays[norm] || {};
    Object.keys(vAmap).forEach(function(ym){ vAbs = vAbs.concat(vAmap[ym]); });
    var vLmap = countsForVisit.longAbsenceDays[norm] || {};
    Object.keys(vLmap).forEach(function(ym){ vLt = vLt.concat(vLmap[ym]); });
    var lastVisit = calcLastVisitDate(weekdaysRaw, vAbs, vLt, today);
    var daysSince = lastVisit ? daysBetween(today, lastVisit) : null;

    // 3軸統合判定（v2.1 = 契約過多A・不在B・曜日別C・介護度別）
    var careLv = String(careLevelMap[name] || '').trim();
    var v2Result = judgeUsageBadgeV2(actualPerWeek, contractPerWeek, daysSince, bd.worstDay, USAGE_ALERT_THRESHOLDS_V2, careLv);
    var badge = v2Result.badge;
    var reasons = v2Result.reasons;

    var u = {
      name: name,
      weekdaysRaw: weekdaysRaw,
      contractCount: Object.keys(bd.byDay).length,
      overall: bd.overall,
      byDay: bd.byDay,
      worstDay: bd.worstDay,
      periods: periods,
      lastVisitDate: lastVisit,
      daysSinceLastVisit: daysSince,
      recentAbsences: absDetail[norm] || [],
      badge: badge,
      reasons: reasons,
      excluded: false
    };
    users.push(u);
    if (badge === 'red') {
      redList.push({
        name: name,
        contractPerWeek: contractPerWeek,
        actualPerWeek: actualPerWeek,
        lastVisitDate: lastVisit,
        daysSinceLastVisit: daysSince,
        worstDay: bd.worstDay,
        reasons: reasons
      });
    }
    // 高出席率（要介護のみ・全体>=highOverall かつ 全曜日>=highWorst）
    // 「要介護1〜5」の記載がある人だけ。事業対象(Aコード)・要支援・空欄は除外
    var careLv = String(careLevelMap[name] || '').trim();
    var isKaigo = careLv.indexOf('要介護') >= 0;
    if (isKaigo && badge == null && bd.overall.rate != null && bd.overall.rate >= T.highOverall) {
      var allDayHigh = true;
      var bestDay = null;
      Object.keys(bd.byDay).forEach(function(dc) {
        var b = bd.byDay[dc];
        if (b.rate == null || b.rate < T.highWorst) allDayHigh = false;
        if (b.rate != null && (bestDay == null || b.rate > bestDay.rate)) bestDay = { day: dc, rate: b.rate };
      });
      // 増回を勧める対象: 契約が週1〜2回の人だけ（週3回以上は枠余地が小さいので除外）
      var highContractCount = Object.keys(bd.byDay).length;
      if (allDayHigh && highContractCount <= 2) {
        highList.push({ name: name, rate: bd.overall.rate, worstDay: bd.worstDay, bestDay: bestDay, careLevel: careLv, contractCount: highContractCount });
      }
    }
  }
  // 並び順: high は「週回数が少ない順 → その中で利用率が高い順」
  // → 一番上に「週1回でほぼ皆勤」の最も増回を勧めやすい人が来る
  highList.sort(function(a, b) {
    if (a.contractCount !== b.contractCount) return a.contractCount - b.contractCount;
    return b.rate - a.rate;
  });
  return {
    period: { from: fromYM, to: toYM },
    thresholds: T,
    thresholdsV2: USAGE_ALERT_THRESHOLDS_V2,
    today: today,
    users: users,
    redList: redList,
    highList: highList
  };
}

// ===== 利用率アラート: 期間内の通常欠席を理由付きで norm 別に収集（モーダル表示用・最新5件）=====
function getRecentAbsencesByUser(ss, fromYM, toYM) {
  var result = {};
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return result;
  var data = sheet.getDataRange().getValues();
  var fromParts = fromYM.split('-'), toParts = toYM.split('-');
  var rangeStart = Utilities.formatDate(new Date(parseInt(fromParts[0]), parseInt(fromParts[1]) - 1, 1), 'Asia/Tokyo', 'yyyy-MM-dd');
  var rangeEnd = Utilities.formatDate(new Date(parseInt(toParts[0]), parseInt(toParts[1]), 0), 'Asia/Tokyo', 'yyyy-MM-dd');
  var dayChars = ['日','月','火','水','木','金','土'];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][3] || '').trim() !== '欠席') continue;
    var d = fmtDate(data[i][0]);
    var name = String(data[i][1] || '').trim();
    if (!name || !d || d < rangeStart || d > rangeEnd) continue;
    var norm = _normalizeUserName(name);
    if (!result[norm]) result[norm] = [];
    var dow = new Date(parseInt(d.slice(0,4)), parseInt(d.slice(5,7)) - 1, parseInt(d.slice(8,10))).getDay();
    result[norm].push({ date: d, dow: dayChars[dow], unit: String(data[i][2] || ''), reason: String(data[i][4] || '') });
  }
  // 日付降順ソート＋最新5件に絞る
  Object.keys(result).forEach(function(norm) {
    result[norm].sort(function(a, b) { return a.date < b.date ? 1 : -1; });
    result[norm] = result[norm].slice(0, 5);
  });
  return result;
}

// 動作確認用テスト（GASエディタから手動実行）
function _test_getUsageAlerts() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var r = getUsageAlerts(ss, '2026-04', '2026-05', '2026-05-20');
  Logger.log('赤リスト: ' + JSON.stringify(r.redList));
  var sugizawa = r.users.filter(function(u) { return u.name.indexOf('杉') >= 0; });
  Logger.log('杉澤さん: ' + JSON.stringify(sugizawa));
  if (sugizawa.length) Logger.log('杉澤さん periods: ' + JSON.stringify(sugizawa[0].periods));
  var yellow = r.users.filter(function(u) { return u.badge === 'yellow'; }).length;
  var red = r.users.filter(function(u) { return u.badge === 'red'; }).length;
  Logger.log('黄: ' + yellow + '名 / 赤: ' + red + '名 / 全' + r.users.length + '名');
}

// ===== ケアマネ欠席連絡 即時方式 Phase 1（2026-05-10） =====
// 利用者のケアマネ事業所+氏名から、送付用居宅一覧の連絡先を引く
// 2026-05-21: 事業所名のみ一致のフォールバックを追加。
//   担当者名（name）まで完全一致しなくても、事業所名が一致しメアドがある行を返す。
//   → 送付用居宅一覧の担当者名がほぼ空でも、欠席メールのメアド自動表示が機能する。
//   完全一致（exact）を最優先し、無ければ事業所名一致（office）にフォールバックする。
function getCmContact(ss, office, name) {
  var sheet = getCmContactsSheet(ss);
  if (!sheet || sheet.getLastRow() < 2) return { found: false };
  var cols = _readCmCols(sheet);
  if (cols.office < 0 || cols.name < 0) return { found: false, error: 'office/name 列なし' };

  var data = sheet.getDataRange().getValues();
  var normOffice = _normalizeNameForMatch_(office);
  var normName = _normalizeNameForMatch_(name);

  function rowToContact(i, matchType) {
    return {
      found: true,
      matchType: matchType,   // 'exact'（事業所＋担当者一致）/ 'office'（事業所のみ一致）
      row: i + 1,
      office: data[i][cols.office],
      name: data[i][cols.name],
      email: cols.email >= 0 ? String(data[i][cols.email] || '').trim() : '',
      method: cols.method >= 0 ? String(data[i][cols.method] || '').trim() : ''
    };
  }

  var officeFallback = -1;  // 事業所名のみ一致＋メアド有りの最初の行

  for (var i = 1; i < data.length; i++) {
    var rowOffice = _normalizeNameForMatch_(data[i][cols.office]);
    if (rowOffice !== normOffice) continue;
    var rowName = _normalizeNameForMatch_(data[i][cols.name]);
    // 1) 事業所名＋担当者名 完全一致 → 最優先で即返す
    if (rowName === normName) {
      return rowToContact(i, 'exact');
    }
    // 2) フォールバック候補：事業所名一致＋メアド有り（最初の1件を採用）
    if (officeFallback < 0 && cols.email >= 0) {
      if (String(data[i][cols.email] || '').trim()) officeFallback = i;
    }
  }

  // 完全一致が無ければ、事業所名一致のメアド有り行を返す
  if (officeFallback >= 0) return rowToContact(officeFallback, 'office');
  return { found: false };
}

// 名前照合用正規化（NFKC＋様除去＋空白除去）
function _normalizeNameForMatch_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  s = s.normalize ? s.normalize('NFKC') : s;
  s = s.replace(/様$/, '').replace(/さん$/, '').replace(/[\s　]/g, '');
  return s;
}

// 送付用居宅一覧にメアド保存（既存行なら更新、なければ追加）
function updateCmContact(ss, data) {
  var office = String(data.office || '').trim();
  var name = String(data.name || '').trim();
  var email = String(data.email || '').trim();
  if (!office || !name) return { success: false, error: 'office/name は必須' };
  if (!email) return { success: false, error: 'email は必須' };

  var sheet = getCmContactsSheet(ss);
  if (!sheet) return { success: false, error: '送付用居宅一覧シートがありません' };
  var cols = _readCmCols(sheet);
  if (cols.office < 0 || cols.name < 0 || cols.email < 0) {
    return { success: false, error: 'office/name/email 列なし' };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch(e) { return { success: false, error: 'ロック取得失敗' }; }

  try {
    var existing = getCmContact(ss, office, name);
    if (existing.found) {
      // 既存行のメアドが空のときだけ更新（既存メアドは尊重）
      if (!existing.email) {
        sheet.getRange(existing.row, cols.email + 1).setValue(email);
      }
      // 送付方法も空なら「メール」を入れておく
      if (cols.method >= 0 && !existing.method) {
        sheet.getRange(existing.row, cols.method + 1).setValue('メール');
      }
      return { success: true, action: 'updated', row: existing.row };
    } else {
      // 新規行を追加
      var lastCol = sheet.getLastColumn();
      var newRow = new Array(lastCol).fill('');
      newRow[cols.office] = office;
      newRow[cols.name] = name;
      newRow[cols.email] = email;
      if (cols.method >= 0) newRow[cols.method] = 'メール';
      sheet.appendRow(newRow);
      return { success: true, action: 'inserted', row: sheet.getLastRow() };
    }
  } finally {
    lock.releaseLock();
  }
}

// テスト関数
function _test_getCmContact() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var r = getCmContact(ss, 'テスト居宅介護支援事業所', 'テスト 花子');
  Logger.log(JSON.stringify(r, null, 2));
}

function _test_updateCmContact() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var r = updateCmContact(ss, {
    office: 'テスト居宅介護支援事業所',
    name: 'テスト 花子',
    email: 'test@example.com'
  });
  Logger.log(JSON.stringify(r));
}

// ===== ケアマネ連絡履歴シートの「テスト」行クリーンアップ（2026-05-24・一度きりのメンテ用）=====
// G列(operator)が「テスト」または「test」の行を物理削除する。
// 履歴シートは原則「追記式・削除不可」だが、テストデータ掃除は例外。
// doGet ?action=cleanup_test_log でドライラン、&run=1 で実行。
function cleanupTestLogEntries(ss, dryRun) {
  var sheet = ss.getSheetByName('ケアマネ連絡履歴');
  if (!sheet) return { success: false, error: 'ケアマネ連絡履歴シートがありません' };
  var data = sheet.getDataRange().getValues();
  var deletedRows = [];
  // ヘッダーは行1、データは行2から。後ろから削除（行ずれ防止）
  for (var i = data.length - 1; i >= 1; i--) {
    var operator = String(data[i][6] || '').trim();  // G列(7番目、0-indexed 6)
    var opLower = operator.toLowerCase();
    if (operator === 'テスト' || opLower === 'test') {
      deletedRows.push({
        row: i + 1,
        ts: String(data[i][0] || ''),
        userName: String(data[i][1] || ''),
        date: String(data[i][2] || ''),
        action: String(data[i][3] || ''),
        operator: operator
      });
      if (!dryRun) sheet.deleteRow(i + 1);
    }
  }
  return {
    success: true,
    dryRun: dryRun,
    count: deletedRows.length,
    rows: deletedRows
  };
}

// ===== 送付用居宅一覧シートの掃除（2026-05-21・一度きりのメンテ用）=====
// ・テストデータ行を削除
// ・「総合福祉エリア地域包括支援センター」の重複/空行を整理し、
//   代表メール運用に合わせて houkatsu@ の1行（担当者名クリア）に集約する
// doGet ?action=cleanup_cm_contacts でドライラン、&run=1 で実行。
function cleanupCmContactsSheet(ss, dryRun) {
  var sheet = getCmContactsSheet(ss);
  if (!sheet) return { success: false, error: '連絡先シートがありません' };
  var cols = _readCmCols(sheet);
  if (cols.office < 0) return { success: false, error: 'office 列なし' };

  var data = sheet.getDataRange().getValues();
  var SOUFUKUSHI = _normalizeNameForMatch_('総合福祉エリア地域包括支援センター');

  var toDelete = [];          // 削除する行番号（1始まり）
  var actions = [];
  var soufukushiRepRow = -1;  // 総合福祉エリア地域包括の代表行（残す行）

  for (var i = 1; i < data.length; i++) {
    var rowNo = i + 1;
    var office = String(data[i][cols.office] || '').trim();
    var normOffice = _normalizeNameForMatch_(office);
    var name = cols.name >= 0 ? String(data[i][cols.name] || '').trim() : '';
    var email = cols.email >= 0 ? String(data[i][cols.email] || '').trim() : '';

    // A) テストデータ行（事業所名 or 担当者名に「テスト」）
    if (normOffice.indexOf('テスト') >= 0 || _normalizeNameForMatch_(name) === 'テスト') {
      toDelete.push(rowNo);
      actions.push('削除(テスト): 行' + rowNo + ' ' + office + ' / ' + (name || '(空)'));
      continue;
    }

    // B) 総合福祉エリア地域包括支援センター（全角スペース等の表記ゆれも正規化で同一視）
    if (normOffice === SOUFUKUSHI) {
      if (email) {
        if (soufukushiRepRow < 0) {
          soufukushiRepRow = rowNo;  // メアド有りの最初の行を代表行として残す
        } else {
          toDelete.push(rowNo);      // 2件目以降のメアド有り行（沼田様等の重複）は削除
          actions.push('削除(総合福祉エリア重複): 行' + rowNo + ' ' + (name || '(空)'));
        }
      } else {
        toDelete.push(rowNo);        // メアド無し（全空など）は削除
        actions.push('削除(総合福祉エリア空行): 行' + rowNo + ' ' + (name || '(空)'));
      }
      continue;
    }
  }

  // 総合福祉エリア代表行を正規化（代表メール運用 → 担当者名はクリア・送付方法はメール）
  if (soufukushiRepRow > 0) {
    actions.push('代表行化: 行' + soufukushiRepRow + ' を総合福祉エリア地域包括の代表メール行に（担当者名クリア）');
    if (!dryRun) {
      if (cols.name >= 0) sheet.getRange(soufukushiRepRow, cols.name + 1).setValue('');
      if (cols.method >= 0) sheet.getRange(soufukushiRepRow, cols.method + 1).setValue('メール');
    }
  }

  // 行削除は下から（行番号ズレ防止）
  toDelete.sort(function (a, b) { return b - a; });
  if (!dryRun) {
    toDelete.forEach(function (r) { sheet.deleteRow(r); });
  }

  return {
    success: true,
    dryRun: !!dryRun,
    deletedCount: toDelete.length,
    soufukushiRepRow: soufukushiRepRow,
    actions: actions
  };
}



// ===== ケアマネ宛メールのバウンス自動検知（2026-05-21追加）=====
// mailer-daemon からのバウンス通知をスキャンし、該当の欠席行(H列/cmNotified)を
// 「エラー：…」に書き換える。→ 欠席一覧で赤い「⚠ メール失敗」バッジが自動表示される。
// 実行アカウント(USER_DEPLOYING=m-higa@)の受信トレイを GmailApp で検索する。
var BOUNCE_LABEL_NAME = 'yawaragi-bounce-handled';

function scanCmMailBounces() {
  var report = { scanned: 0, flagged: [], skipped: [], noRow: [] };
  var label = GmailApp.getUserLabelByName(BOUNCE_LABEL_NAME) || GmailApp.createLabel(BOUNCE_LABEL_NAME);
  var threads = GmailApp.search('from:mailer-daemon -label:' + BOUNCE_LABEL_NAME, 0, 50);
  if (threads.length === 0) return report;

  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('出欠変更');
  var data = sheet ? sheet.getDataRange().getValues() : [];

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    report.scanned++;
    var msgs = thread.getMessages();
    var origSubject = '', origDate = null;
    for (var m = 0; m < msgs.length; m++) {
      var sj = msgs[m].getSubject() || '';
      if (sj.indexOf('【yawaragi】') === 0 && sj.indexOf('お休み連絡') >= 0) {
        origSubject = sj; origDate = msgs[m].getDate(); break;
      }
    }
    if (!origSubject) {
      // yawaragi欠席連絡のバウンスではない（請求関連など）→ ラベルだけ付け次回除外
      thread.addLabel(label);
      report.skipped.push('対象外バウンス');
      continue;
    }
    var info = _parseAbsenceMailSubject_(origSubject, origDate);
    var hit = false;
    for (var di = 0; di < info.dates.length; di++) {
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][3] || '').trim() !== '欠席') continue;
        if (_fmtDateForBounce_(data[r][0]) !== info.dates[di]) continue;
        if (_normalizeNameForMatch_(data[r][1]) !== _normalizeNameForMatch_(info.name)) continue;
        hit = true;
        var cur = String(data[r][7] || '').trim();
        if (cur === '送信済' || cur === '手動メール送信済') {
          sheet.getRange(r + 1, 8).setValue('エラー：ケアマネにメールが届きませんでした（バウンス・要再連絡）');
          report.flagged.push(info.dates[di] + ' ' + info.name + '様');
          // 2026-05-23: 履歴シートにバウンス記録（運営指導の証憑）
          _appendCmLog_(ss, {
            userName: String(data[r][1] || ''),
            date: _fmtDateForBounce_(data[r][0]),
            action: '自動メール再送',
            method: '自動メール',
            contactedAddr: '',
            operator: 'system',
            result: 'バウンス',
            note: 'mailer-daemon検知 → 要再連絡'
          });
        } else {
          report.skipped.push(info.dates[di] + ' ' + info.name + '様（H列=' + cur + '・変更せず）');
        }
      }
    }
    if (!hit) report.noRow.push(origSubject);
    thread.addLabel(label);
  }

  // 新規にバウンスを検知したら通知メール
  if (report.flagged.length > 0 || report.noRow.length > 0) {
    try {
      var body = '';
      if (report.flagged.length > 0) {
        body += '【ケアマネに届かなかった欠席連絡】\n'
             + report.flagged.map(function(x){ return '・' + x; }).join('\n')
             + '\n\nyawaragiボードの欠席一覧に赤い「⚠ メール失敗」と表示されています。\n'
             + 'ケアマネ連絡先メアドを確認のうえ、再連絡をお願いします。\n';
      }
      if (report.noRow.length > 0) {
        body += '\n【バウンスを検知（該当の欠席行は見つからず）】\n'
             + report.noRow.map(function(x){ return '・' + x; }).join('\n') + '\n';
      }
      GmailApp.sendEmail(NOTIFY_EMAIL + ',r.d-yawaragi@keepfitlife.com',
        '【yawaragi】⚠️ケアマネ宛メールが届いていません（バウンス検知）',
        body, { charset: 'UTF-8' });
    } catch (e) {}
  }
  return report;
}

// 件名から利用者名と日付配列を抽出
// 例: 【yawaragi】5月21日(木) 成田繁子様 お休み連絡
function _parseAbsenceMailSubject_(subject, origDate) {
  var body = String(subject).replace('【yawaragi】', '').replace('お休み連絡', '');
  var year = origDate ? origDate.getFullYear() : new Date().getFullYear();
  var dates = [], re = /(\d{1,2})月(\d{1,2})日/g, mm;
  while ((mm = re.exec(body)) !== null) {
    dates.push(year + '-' + ('0' + mm[1]).slice(-2) + '-' + ('0' + mm[2]).slice(-2));
  }
  // 日付トークン(M月D日(曜))を除去 → 残りが「氏名様」
  var nameOnly = body.replace(/\d{1,2}月\d{1,2}日(\([^)]*\)|（[^）]*）)?/g, '');
  nameOnly = nameOnly.replace(/[、,\s　]/g, '').replace(/様$/, '');
  return { name: nameOnly, dates: dates };
}

function _fmtDateForBounce_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  return String(v || '').trim().substring(0, 10);
}

// バウンス検知の定期トリガー設置（初回は既存バウンスを処理済みにしてスキップ）
function installBounceTrigger() {
  var label = GmailApp.getUserLabelByName(BOUNCE_LABEL_NAME) || GmailApp.createLabel(BOUNCE_LABEL_NAME);
  // 初期化: 既存のバウンス通知（成田・貝原など対応済み）は全て処理済みラベルを付与
  var existing = GmailApp.search('from:mailer-daemon -label:' + BOUNCE_LABEL_NAME, 0, 80);
  for (var i = 0; i < existing.length; i++) existing[i].addLabel(label);
  // 既存トリガー削除 → 1時間ごとのトリガー作成
  var trigs = ScriptApp.getProjectTriggers();
  for (var j = 0; j < trigs.length; j++) {
    if (trigs[j].getHandlerFunction() === 'scanCmMailBounces') ScriptApp.deleteTrigger(trigs[j]);
  }
  ScriptApp.newTrigger('scanCmMailBounces').timeBased().everyHours(1).create();
  return { existingBouncesMarked: existing.length, triggerInstalled: true, intervalHours: 1 };
}


// 利用者イベント削除（2026/5/21追加・カード+項目+連動タスクボードを一括削除）
function deleteUserEvent(ss, data) {
  var id = String((data && data.id) || '').trim();
  if (!id) return { success: false, error: 'id が必須です' };
  var deleted = { event: 0, items: 0, boardTasks: 0 };
  var linkedTaskIds = [];

  var itemSheet = ss.getSheetByName('利用者イベント項目');
  if (itemSheet && itemSheet.getLastRow() > 1) {
    var itemVals = itemSheet.getDataRange().getValues();
    for (var i = itemVals.length - 1; i >= 1; i--) {
      if (String(itemVals[i][1]) === id) {
        var linked = String(itemVals[i][10] || '').trim();
        if (linked) linkedTaskIds.push(linked);
        itemSheet.deleteRow(i + 1);
        deleted.items++;
      }
    }
  }

  var eventSheet = ss.getSheetByName('利用者イベント');
  if (eventSheet && eventSheet.getLastRow() > 1) {
    var evVals = eventSheet.getDataRange().getValues();
    for (var j = evVals.length - 1; j >= 1; j--) {
      if (String(evVals[j][0]) === id) {
        eventSheet.deleteRow(j + 1);
        deleted.event++;
      }
    }
  }

  if (linkedTaskIds.length) {
    var boardSheet = ss.getSheetByName('タスクボード');
    if (boardSheet && boardSheet.getLastRow() > 1) {
      var bVals = boardSheet.getDataRange().getValues();
      for (var k = bVals.length - 1; k >= 1; k--) {
        if (linkedTaskIds.indexOf(String(bVals[k][0])) !== -1) {
          boardSheet.deleteRow(k + 1);
          deleted.boardTasks++;
        }
      }
    }
  }

  if (deleted.event === 0) {
    return { success: false, error: '指定IDのイベントが見つかりません: ' + id };
  }
  return { success: true, deleted: deleted };
}

// ============================================================
// ===== 個別機能訓練計画書（2026/5/25追加）=====
// ============================================================
// 要介護のみ・3ヶ月サイクルで作成月を管理するチェック表
// 「個別機能訓練計画書記録」シートに記録（userId/name/year/month/kyoumi_date/seikatsu_date/keikaku_date/updatedAt）
// 注: 利用者台帳に「利用者ID」列が無いため、名前そのものをuserIdとして使用（通所モニタリングと同型）

// シート初期化: 操作ログシート「個別機能訓練計画書記録_ログ」（appendOnly）
function ensureKeikakushoLogSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('個別機能訓練計画書記録_ログ');
  if (!sheet) {
    sheet = ss.insertSheet('個別機能訓練計画書記録_ログ');
    sheet.getRange(1, 1, 1, 10).setValues([[
      'timestamp', 'operator', 'userId', 'name',
      'year', 'month', 'action', 'field', 'old_value', 'new_value'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 10).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
  }
  return sheet;
}

// ログ書き込み（共通ヘルパー）
function logKeikakushoOp_(operator, userId, name, year, month, action, field, oldValue, newValue) {
  try {
    var sheet = ensureKeikakushoLogSheet_();
    var ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([
      ts, operator || '(未指定)', userId || '', name || '',
      year || '', month || '', action || '', field || '',
      oldValue || '', newValue || ''
    ]);
  } catch (logErr) {
    // ログ書き込みエラーは本処理を止めない（コンソールにだけ吐く）
    Logger.log('logKeikakushoOp_ failed: ' + logErr);
  }
}

// シート初期化: 「通所介護計画書記録」「通所介護計画書設定」が無ければ作る（冪等）
// Phase 1-B（2026-05-27追加）
function ensureTsushoPlansSheets_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var recordSheet = ss.getSheetByName('通所介護計画書記録');
  if (!recordSheet) {
    recordSheet = ss.insertSheet('通所介護計画書記録');
    recordSheet.getRange(1, 1, 1, 9).setValues([[
      'userId', 'year', 'month', 'plan_date',
      'sent_to_cm', 'sent_date', 'memo', 'createdBy', 'updatedAt'
    ]]);
    recordSheet.setFrozenRows(1);
    recordSheet.getRange(1, 1, 1, 9).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
  }
  var configSheet = ss.getSheetByName('通所介護計画書設定');
  if (!configSheet) {
    configSheet = ss.insertSheet('通所介護計画書設定');
    configSheet.getRange(1, 1, 1, 3).setValues([['userId', 'cycleMonths', 'updatedAt']]);
    configSheet.setFrozenRows(1);
    configSheet.getRange(1, 1, 1, 3).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
  }
  return { recordSheet: recordSheet, configSheet: configSheet };
}

// 口腔②「今月の締め担当」保存シート（月 YYYY-MM × 担当者）。無ければ作る（冪等）。
// 全列テキスト書式で 'YYYY-MM' の日付誤変換を防ぐ。既存シート・請求・morningDigestには非接触。
function ensureOralCloseSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('口腔締め担当');
  if (!sh) {
    sh = ss.insertSheet('口腔締め担当');
    sh.getRange('A:D').setNumberFormat('@');
    sh.getRange(1, 1, 1, 4).setValues([['月', '担当者', '更新日時', '更新者']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// シート初期化: 「口腔機能向上記録」「口腔機能向上設定」が無ければ作る（冪等）
// Phase 1-D（2026-05-27追加・口腔(II) 3ヶ月送付管理）
function ensureOralPlansSheets_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var recordSheet = ss.getSheetByName('口腔機能向上記録');
  if (!recordSheet) {
    recordSheet = ss.insertSheet('口腔機能向上記録');
    recordSheet.getRange(1, 1, 1, 18).setValues([[
      'userId', 'year', 'month', 'plan_date',
      'sent_to_cm', 'sent_date', 'memo', 'createdBy', 'updatedAt', 'eval_result', 'sent_by',
      'moni1_date', 'moni2_date', 'houkoku_date',
      'houkoku_by', 'plan_by', 'moni1_by', 'moni2_by'
    ]]);
    recordSheet.setFrozenRows(1);
    recordSheet.getRange(1, 1, 1, 18).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
  } else {
    // マイグレーション: eval_result 列（10列目）が無ければ追加（2026-05-30・評価結果のケアマネ情報提供 証跡）
    var oralHdr = recordSheet.getRange(1, 1, 1, Math.max(recordSheet.getLastColumn(), 18)).getValues()[0];
    if (oralHdr.indexOf('eval_result') === -1) {
      recordSheet.getRange(1, 10).setValue('eval_result');
      recordSheet.getRange(1, 10).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    // マイグレーション: sent_by 列（11列目・最終評価出力の担当看護師）が無ければ追加（2026-06-05）
    if (oralHdr.indexOf('sent_by') === -1) {
      recordSheet.getRange(1, 11).setValue('sent_by');
      recordSheet.getRange(1, 11).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    // マイグレーション: 口腔②列（moni1_date/moni2_date/houkoku_date）を additive 追加（2026-07・口腔②）
    if (oralHdr.indexOf('moni1_date') === -1) {
      recordSheet.getRange(1, 12).setValue('moni1_date');
      recordSheet.getRange(1, 12).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (oralHdr.indexOf('moni2_date') === -1) {
      recordSheet.getRange(1, 13).setValue('moni2_date');
      recordSheet.getRange(1, 13).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (oralHdr.indexOf('houkoku_date') === -1) {
      recordSheet.getRange(1, 14).setValue('houkoku_date');
      recordSheet.getRange(1, 14).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    // マイグレーション: 口腔② by列（各提出物の担当看護師名）を additive 追加（2026-07・15-18列）
    if (oralHdr.indexOf('houkoku_by') === -1) {
      recordSheet.getRange(1, 15).setValue('houkoku_by');
      recordSheet.getRange(1, 15).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (oralHdr.indexOf('plan_by') === -1) {
      recordSheet.getRange(1, 16).setValue('plan_by');
      recordSheet.getRange(1, 16).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (oralHdr.indexOf('moni1_by') === -1) {
      recordSheet.getRange(1, 17).setValue('moni1_by');
      recordSheet.getRange(1, 17).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (oralHdr.indexOf('moni2_by') === -1) {
      recordSheet.getRange(1, 18).setValue('moni2_by');
      recordSheet.getRange(1, 18).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
  }
  var configSheet = ss.getSheetByName('口腔機能向上設定');
  if (!configSheet) {
    configSheet = ss.insertSheet('口腔機能向上設定');
    configSheet.getRange(1, 1, 1, 7).setValues([['userId', 'is_target', 'started_at', 'updatedAt', 'eval_anchor', 'plan_start', 'plan_end']]);
    configSheet.setFrozenRows(1);
    configSheet.getRange(1, 1, 1, 7).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
  } else {
    // マイグレーション: eval_anchor 列（5列目・基準評価月 YYYY-MM）が無ければ追加（2026-05-31 v2）
    var cfgHdr = configSheet.getRange(1, 1, 1, Math.max(configSheet.getLastColumn(), 7)).getValues()[0];
    if (cfgHdr.indexOf('eval_anchor') === -1) {
      configSheet.getRange(1, 5).setValue('eval_anchor');
      configSheet.getRange(1, 5).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    // マイグレーション: 口腔②個人サイクル列（plan_start=計画作成/節目アンカー YYYY-MM / plan_end=イレギュラー終了 YYYY-MM）2026-07・器のみ／初回投入は別
    if (cfgHdr.indexOf('plan_start') === -1) {
      configSheet.getRange(1, 6).setValue('plan_start');
      configSheet.getRange(1, 6).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (cfgHdr.indexOf('plan_end') === -1) {
      configSheet.getRange(1, 7).setValue('plan_end');
      configSheet.getRange(1, 7).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
  }
  return { recordSheet: recordSheet, configSheet: configSheet };
}

// 口腔送付フォルダ（yawaragi-apps/口腔送付/YYYY-MM/）をスキャンし、年度内(4月〜翌3月)の
// 各月フォルダのPDFファイル名を集め、氏名一致で送付済み月を返す（2026-05-31 v2）
// 戻り: { ok, year, found:{'YYYY-MM':[filename...]}, byUser:{氏名:['YYYY-MM'...]} }
function scanOralSendFolder_(year) {
  var root = null;
  var apps = DriveApp.getFoldersByName('yawaragi-apps');
  if (apps.hasNext()) {
    var appsFolder = apps.next();
    var sub = appsFolder.getFoldersByName('口腔送付');
    if (sub.hasNext()) root = sub.next();
  }
  if (!root) {
    // フォルダ未作成でも壊れない（全員未提出扱い）
    return { ok: true, year: year, found: {}, byUser: {}, note: '口腔送付フォルダ未作成' };
  }
  var users = getOralTargetUsers_(true);
  var names = users.map(function (u) { return u.name; });
  var yms = [];
  for (var m = 4; m <= 12; m++) yms.push(year + '-' + ('0' + m).slice(-2));
  for (var m2 = 1; m2 <= 3; m2++) yms.push((year + 1) + '-' + ('0' + m2).slice(-2));
  var found = {};
  var byUser = {};
  yms.forEach(function (ym) {
    var mf = root.getFoldersByName(ym);
    if (!mf.hasNext()) return;
    var folder = mf.next();
    var files = folder.getFiles();
    var fnames = [];
    while (files.hasNext()) { fnames.push(files.next().getName()); }
    if (fnames.length) found[ym] = fnames;
    names.forEach(function (nm) {
      if (!nm) return;
      var hit = fnames.some(function (fn) { return fn.indexOf(nm) >= 0; });
      if (hit) {
        if (!byUser[nm]) byUser[nm] = [];
        if (byUser[nm].indexOf(ym) < 0) byUser[nm].push(ym);
      }
    });
  });
  return { ok: true, year: year, found: found, byUser: byUser };
}

// 口腔(II) 算定対象者候補取得（介護保険利用者全員＝要支援+要介護・事業対象除外）
// 設定シート（口腔機能向上設定）の is_target=true の利用者だけが「算定中」
// is_target=false または未登録の利用者は「候補」として返す（社長/看護師がアプリ内で切替）
function getOralTargetUsers_(includeCancelled) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var kanaCol = findCol(h, ['氏名(カナ)', '氏名(カナ)', 'カナ', 'フリガナ', 'ふりがな']);
  var categoryCol = findCol(h, ['要介護度', '介護度', '区分']);
  var statusCol = findCol(h, ['利用ステータス']);
  if (statusCol < 0) statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var cmOfficeCol = findColContains(h, 'ケアマネ', '事業所');
  if (cmOfficeCol < 0) cmOfficeCol = findColP(h, '居宅');
  var riyouStartCol = findCol(h, ['利用開始日', '利用開始']);  // 利用開始前ユーザー非表示用（2026-06-12）
  if (nameCol < 0) return [];

  // 設定シートから is_target / started_at を取得
  var configSheets = ensureOralPlansSheets_();
  var configValues = configSheets.configSheet.getDataRange().getValues();
  var configMap = {};
  for (var ci = 1; ci < configValues.length; ci++) {
    var ckey = _normalizeUserName(configValues[ci][0]);  // P-4: 表記ゆれ吸収
    if (ckey) {
      configMap[ckey] = {
        isTarget: configValues[ci][1] === true || String(configValues[ci][1]).toLowerCase() === 'true',
        startedAt: (function (v) {
          if (!v) return '';
          if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
          return String(v);
        })(configValues[ci][2]),
        evalAnchor: (function (v) {
          if (!v) return '';
          if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
          return String(v);
        })(configValues[ci][4]),
        // 口腔②個人サイクル: plan_start(6列)=計画作成/節目アンカー・plan_end(7列)=イレギュラー終了（YYYY-MM）
        planStart: (function (v) {
          if (!v) return '';
          if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
          return String(v);
        })(configValues[ci][5]),
        planEnd: (function (v) {
          if (!v) return '';
          if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
          return String(v);
        })(configValues[ci][6])
      };
    }
  }

  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = String(row[nameCol] || '').trim();
    if (!name) continue;
    var isCancelled = false;
    if (statusCol >= 0) {
      var st = String(row[statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) {
        if (!includeCancelled) continue;
        isCancelled = true;
      }
    }
    var category = categoryCol >= 0 ? String(row[categoryCol] || '').trim() : '';
    // 事業対象（総合事業）も要支援と同等に算定対象として扱う（2026-06-12 社長判断）
    // ※以前は事業対象を除外していたが、総合事業の口腔機能向上も要支援と同じ運用に統一。
    //   除外していたため事業対象者が口腔アプリで常に【非対象】へ落ちていた不具合の是正。
    // 2026-07-03: 設定シートに「行が無い」新規利用者は加算算定の同意済み＝対象(true)を既定とする。
    // 明示的に is_target=false の行がある利用者（未同意でOFF操作された人）は false のまま維持する。
    // 従来は「行なし」と「明示false」を同じ default {isTarget:false} に潰しており、新規が必ず【非対象】へ落ちていた不具合の是正。
    var _oralNormName = _normalizeUserName(name);
    var _oralHasCfg = Object.prototype.hasOwnProperty.call(configMap, _oralNormName);
    var cfg = configMap[_oralNormName] || { isTarget: false, startedAt: '', evalAnchor: '', planStart: '', planEnd: '' };  // P-4: 正規化キーで照合
    list.push({
      userId: name,
      name: name,
      furigana: kanaCol >= 0 ? String(row[kanaCol] || '') : '',
      category: category,
      cmOffice: cmOfficeCol >= 0 ? String(row[cmOfficeCol] || '') : '',
      isTarget: _oralHasCfg ? cfg.isTarget : true,
      startedAt: cfg.startedAt || '2026-06-01',  // 未設定はデフォルト 2026-06-01
      evalAnchor: cfg.evalAnchor || '',
      planStart: cfg.planStart || '',  // 口腔②個人サイクルアンカー（YYYY-MM・器のみ・初回投入は別GO）
      planEnd: cfg.planEnd || '',
      cancelled: isCancelled,
      // 台帳の利用開始日（YYYY-MM-DD 正規化・未設定や'-'は空文字）。フロントで利用開始前ユーザーの非表示判定に使用
      riyouStart: (function (v) {
        if (!v && v !== 0) return '';
        if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
        var s = String(v).trim();
        if (s === '' || s === '-') return '';
        var m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
        return s;
      })(riyouStartCol >= 0 ? row[riyouStartCol] : '')
    });
  }
  return list;
}

// 口腔(II) 送付月判定: 2026-06基準で3ヶ月ごと（=6/9/12/3月）
// かつ startedAt の年月以降であること
// 引数: year/month (number), startedAt (string 'YYYY-MM-DD'・nullなら startedAt 制約なし)
// 返値: boolean
function isOralSendMonth_(year, month, startedAt) {
  if ([3, 6, 9, 12].indexOf(month) < 0) return false;
  if (!startedAt) return true;  // startedAt 制約なしなら送付月かどうかだけで判定
  var sm = String(startedAt).match(/^(\d{4})-(\d{2})/);
  if (!sm) return false;
  var sYear = parseInt(sm[1], 10);
  var sMonth = parseInt(sm[2], 10);
  var sTotal = sYear * 12 + sMonth;
  var tTotal = year * 12 + month;
  return tTotal >= sTotal;
}

// 通所介護計画書 対象利用者取得（介護保険利用者全員＝要支援＋要介護・事業対象除外）
function getTsushoTargetUsers_(includeCancelled) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var kanaCol = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var categoryCol = findCol(h, ['要介護度', '介護度', '区分']);
  var statusCol = findCol(h, ['利用ステータス']);
  if (statusCol < 0) statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var cmOfficeCol = findColContains(h, 'ケアマネ', '事業所');
  if (cmOfficeCol < 0) cmOfficeCol = findColP(h, '居宅');
  if (nameCol < 0) return [];

  // 設定シートからサイクル取得
  var configSheets = ensureTsushoPlansSheets_();
  var configValues = configSheets.configSheet.getDataRange().getValues();
  var cycleMap = {};
  for (var ci = 1; ci < configValues.length; ci++) {
    var ckey = _normalizeUserName(String(configValues[ci][0] || ''));  // P-4: 表記ゆれ吸収
    if (ckey) cycleMap[ckey] = parseInt(configValues[ci][1], 10) || 12;
  }

  // 半角全角どちらでも当たるように正規化
  function normalize(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .trim();
  }

  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = String(row[nameCol] || '').trim();
    if (!name) continue;
    var isCancelled = false;
    if (statusCol >= 0) {
      var st = String(row[statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) {
        if (!includeCancelled) continue;
        isCancelled = true;
      }
    }
    var careRaw = categoryCol >= 0 ? String(row[categoryCol] || '').trim() : '';
    var careNorm = normalize(careRaw);
    // 事業対象（総合事業のみ）は除外、介護保険利用者（要支援＋要介護）のみ
    if (!careNorm) continue;
    if (careNorm.indexOf('事業対象') >= 0) continue;
    if (careNorm.indexOf('要介護') < 0 && careNorm.indexOf('要支援') < 0) continue;
    list.push({
      userId: name,
      name: name,
      furigana: kanaCol >= 0 ? String(row[kanaCol] || '').trim() : '',
      category: careNorm,
      cmOffice: cmOfficeCol >= 0 ? String(row[cmOfficeCol] || '').trim() : '',
      cycleMonths: cycleMap[_normalizeUserName(name)] || 12,  // P-4: 正規化キーで照合
      cancelled: isCancelled
    });
  }
  return list;
}

// 通所介護計画書 対象利用者取得 V2（介護保険利用者＋事業対象者・isJigyoフラグ付き）
// 2026-07-02 Phase 0（ケアマネ提出物統合管理）: 既存 getTsushoTargetUsers_ は不変更のまま、
// 事業対象者を除外しない版を純粋追加。差分は除外条件と isJigyo フラグのみ。
function getTsushoTargetUsersV2_(includeCancelled) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var kanaCol = findCol(h, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var categoryCol = findCol(h, ['要介護度', '介護度', '区分']);
  var statusCol = findCol(h, ['利用ステータス']);
  if (statusCol < 0) statusCol = findColP(h, 'ステータス');
  if (statusCol < 0) statusCol = findColP(h, '利用状況');
  var cmOfficeCol = findColContains(h, 'ケアマネ', '事業所');
  if (cmOfficeCol < 0) cmOfficeCol = findColP(h, '居宅');
  if (nameCol < 0) return [];

  // 設定シートからサイクル取得
  var configSheets = ensureTsushoPlansSheets_();
  var configValues = configSheets.configSheet.getDataRange().getValues();
  var cycleMap = {};
  for (var v2Ci = 1; v2Ci < configValues.length; v2Ci++) {
    var v2Ckey = _normalizeUserName(String(configValues[v2Ci][0] || ''));
    if (v2Ckey) cycleMap[v2Ckey] = parseInt(configValues[v2Ci][1], 10) || 12;
  }

  // 半角全角どちらでも当たるように正規化
  function v2Normalize(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .trim();
  }

  var list = [];
  for (var v2I = 1; v2I < data.length; v2I++) {
    var row = data[v2I];
    var name = String(row[nameCol] || '').trim();
    if (!name) continue;
    var isCancelled = false;
    if (statusCol >= 0) {
      var st = String(row[statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) {
        if (!includeCancelled) continue;
        isCancelled = true;
      }
    }
    var careRaw = categoryCol >= 0 ? String(row[categoryCol] || '').trim() : '';
    var careNorm = v2Normalize(careRaw);
    if (!careNorm) continue;
    var isJigyo = careNorm.indexOf('事業対象') >= 0;
    // V2: 事業対象者は除外しない。要介護/要支援/事業対象のいずれでもない値のみ除外
    if (!isJigyo && careNorm.indexOf('要介護') < 0 && careNorm.indexOf('要支援') < 0) continue;
    list.push({
      userId: name,
      name: name,
      furigana: kanaCol >= 0 ? String(row[kanaCol] || '').trim() : '',
      category: careNorm,
      cmOffice: cmOfficeCol >= 0 ? String(row[cmOfficeCol] || '').trim() : '',
      cycleMonths: cycleMap[_normalizeUserName(name)] || 12,
      isJigyo: isJigyo,
      cancelled: isCancelled
    });
  }
  return list;
}

// 提出送付台帳 語彙定数（Phase 1）: upsert のバリデーションに使用
// kokun_set=個訓セット(結果報告書+計画書) / oral_plan=口腔計画書+評価 / oral_moni=口腔モニ(内部)
// tsusho_keikaku=通所介護計画書 / tsusho_moni=通所モニ / tsusho_hyouka=通所評価
// sokutei=測定結果(要支援4ヶ月) / jisseki=実績(利用者単位で保持・表示は事業所集計)
var SOUFU_DOC_TYPES = ['kokun_set', 'oral_plan', 'oral_moni', 'tsusho_keikaku', 'tsusho_moni', 'tsusho_hyouka', 'sokutei', 'jisseki'];
var SOUFU_STATUSES = ['揃った', '送付済'];

// 台帳1行 → オブジェクト（Date型で保存されても YYYY-MM / YYYY-MM-dd に正規化して吸収）
function soufuLedgerRowToObj_(row) {
  function slF(v) {
    if (!v && v !== 0) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    return String(v);
  }
  function slFYm(v) {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
    return String(v || '').trim();
  }
  function slFD(v) {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    return String(v || '').trim();
  }
  return {
    userId: String(row[0] || '').trim(),
    docType: String(row[1] || '').trim(),
    taishoTsuki: slFYm(row[2]),
    tekiyoTsuki: slFYm(row[3]),
    status: String(row[4] || '').trim(),
    sorotta_at: slF(row[5]),
    sorotta_by: String(row[6] || '').trim(),
    sofu_at: slF(row[7]),
    soufusha: String(row[8] || '').trim(),
    soufuHouhou: String(row[9] || '').trim(),
    kurikoshiRiyu: String(row[10] || '').trim(),
    signKigen: slFD(row[11]),
    updatedBy: String(row[12] || '').trim(),
    updatedAt: slF(row[13])
  };
}

// シート初期化: 「提出送付台帳」シートが無ければ作る（既にあればそれを返す・冪等）
// 2026-07-02 Phase 1（ケアマネ提出物統合管理）: (userId, docType, taishoTsuki) をキーに
// 送付状態を明示保存する追加レイヤ。「未作成」は行を書かず毎回算出（凍結と再計算の分離）。
// status に入るのは '揃った' / '送付済' のみ。「揃った」＝サイン完了・即送付可能な状態（確定定義）。
// sorotta_by は属人化集計（v1.2 §7）の核＝「揃った」を押した人を送付時の上書きから守る専用列。
// docType: kokun_set / oral_plan / oral_moni / tsusho_keikaku / tsusho_moni / tsusho_hyouka / sokutei / jisseki
function ensureSoufuLedgerSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('提出送付台帳');
  if (!sheet) {
    sheet = ss.insertSheet('提出送付台帳');
    sheet.getRange(1, 1, 1, 14).setValues([[
      'userId', 'docType', 'taishoTsuki', 'tekiyoTsuki', 'status',
      'sorotta_at', 'sorotta_by', 'sofu_at', 'soufusha', 'soufuHouhou', 'kurikoshiRiyu',
      'signKigen', 'updatedBy', 'updatedAt'
    ]]);
  }
  // 全列テキスト書式（冪等）: シートTZ（米西海岸系）による日時文字列のDate自動解釈＝
  // +16hずれ・書き戻し増幅を根絶する。文字列で書いて文字列で読む。
  // ⚠️ 列を増設する場合は 'A:N' の書式範囲もセットで拡張すること（範囲外の新列はDate解釈が復活する）。
  sheet.getRange('A:N').setNumberFormat('@');
  return sheet;
}

// 要支援測定記録（sokutei Phase B・設計書2026-07-02 §5-6準拠）
// 要支援/事業対象者の身体機能測定記録。要介護分は個別機能訓練計画書記録シートの
// sokutei_date/sokutei_by を使う（既存・別シート・このシートとは無関係）。
// source: 'paper'（紙台帳投入）／'app'（アプリからのワンタップ記録）
function ensureShienSokuteiSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('要支援測定記録');
  if (!sheet) {
    sheet = ss.insertSheet('要支援測定記録');
    sheet.getRange(1, 1, 1, 7).setValues([[
      'name', 'care', 'sokutei_date', 'sokutei_by', 'source', 'note', 'createdAt'
    ]]);
  }
  // 全列テキスト書式（冪等）: シートTZによる日時文字列のDate自動解釈を根絶する。
  sheet.getRange('A:G').setNumberFormat('@');
  return sheet;
}

function shienSokuteiRowToObj_(row) {
  return {
    name: String(row[0] || '').trim(),
    care: String(row[1] || '').trim(),
    sokutei_date: String(row[2] || '').trim(),
    sokutei_by: String(row[3] || '').trim(),
    source: String(row[4] || '').trim(),
    note: String(row[5] || '').trim()
  };
}

// 紙台帳投入元データ（sokutei-paper-2026.json・社長提供2026-07-03・照合承認済み・60名）
// anchorYm = 紙台帳の測定予定月アンカー（周期=アンカー月+4ヶ月ローリング）。
// 字体2件は台帳表記に正規化済み（円城寺弘江→圓城寺弘江／成田繫子→成田繁子）。
// 平野啓二=利用終了（履歴として投入・アクティブ利用者一覧には出ないため表示対象外）。
var SHIEN_SOKUTEI_PAPER_SEED = [
  { name: '荒谷宗親', anchorYm: '2026-07' }, { name: '飯田邦子', anchorYm: '2026-07' },
  { name: '大槻尚子', anchorYm: '2026-07' }, { name: '貝原信子', anchorYm: '2026-07' },
  { name: '加藤彰', anchorYm: '2026-07' }, { name: '亀山常子', anchorYm: '2026-07' },
  { name: '亀山實子', anchorYm: '2026-07' }, { name: '圓城寺弘江', anchorYm: '2026-07' },
  { name: '小倉都', anchorYm: '2026-07' }, { name: '久保田富子', anchorYm: '2026-07' },
  { name: '齋藤セイ子', anchorYm: '2026-07' }, { name: '小谷野進', anchorYm: '2026-07' },
  { name: '高嶋京子', anchorYm: '2026-07' }, { name: '塩島孝子', anchorYm: '2026-07' },
  { name: '成田繁子', anchorYm: '2026-07' }, { name: '長谷川正', anchorYm: '2026-07' },
  { name: '長谷部としみ', anchorYm: '2026-07' }, { name: '平井和子', anchorYm: '2026-07' },
  { name: '藤江由子', anchorYm: '2026-07' }, { name: '細谷テツコ', anchorYm: '2026-07' },
  { name: '本郷安子', anchorYm: '2026-07' }, { name: '水戸忠', anchorYm: '2026-07' },
  { name: '山岡澄子', anchorYm: '2026-07' }, { name: '中村美恵子', anchorYm: '2026-07' },
  { name: '柳浦武治', anchorYm: '2026-07' },
  { name: '大里よし子', anchorYm: '2026-08' }, { name: '佐藤千代子', anchorYm: '2026-08' },
  { name: '鈴木菊枝', anchorYm: '2026-08' }, { name: '高橋喜久子', anchorYm: '2026-08' },
  { name: '知久淑子', anchorYm: '2026-08' }, { name: '中馬マツミ', anchorYm: '2026-08' },
  { name: '登山京子', anchorYm: '2026-08' }, { name: '登山孝', anchorYm: '2026-08' },
  { name: '中島千枝子', anchorYm: '2026-08' }, { name: '町田和子', anchorYm: '2026-08' },
  { name: '吉田美ち子', anchorYm: '2026-08' }, { name: '松田照子', anchorYm: '2026-08' },
  { name: '吉崎洋子', anchorYm: '2026-08' }, { name: '南靜子', anchorYm: '2026-08' },
  { name: '山中和子', anchorYm: '2026-08' },
  { name: '今村禮子', anchorYm: '2026-09' }, { name: '川邊アキ子', anchorYm: '2026-09' },
  { name: '木村光夫', anchorYm: '2026-09' }, { name: '鈴木みつ', anchorYm: '2026-09' },
  { name: '関口榮', anchorYm: '2026-09' }, { name: '根本カツエ', anchorYm: '2026-09' },
  { name: '高橋義昭', anchorYm: '2026-09' }, { name: '橋本優子', anchorYm: '2026-09' },
  { name: '柳瀬さと', anchorYm: '2026-09' }, { name: '野口英子', anchorYm: '2026-09' },
  { name: '野澤喜治', anchorYm: '2026-09' }, { name: '芳賀和子', anchorYm: '2026-09' },
  { name: '吉橋年子', anchorYm: '2026-09' }, { name: '平野啓二', anchorYm: '2026-09' },
  { name: '福島春代', anchorYm: '2026-09' }, { name: '古川照子', anchorYm: '2026-09' },
  { name: '松嵜由子', anchorYm: '2026-09' }, { name: '村田幸子', anchorYm: '2026-09' },
  { name: '森仁子', anchorYm: '2026-09' }, { name: '山下操子', anchorYm: '2026-09' }
];

// スタッフマスタ（Phase 2・ケアマネ提出物統合管理の操作者リスト）
// 名前の正本は既存 staff_list（シフト希望SS）＝入退社はそちらの更新で足りる。
// 本シートは統合アプリ固有の属性（role/提出物担当/表示順）だけを上乗せする差分シート。
// role: 'staff'（通常）/ 'owner'（代表＝送付済ボタン・権限出し分けキー。呼称は「代表」で統一）。
function ensureStaffMasterSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('スタッフマスタ');
  if (!sheet) {
    sheet = ss.insertSheet('スタッフマスタ');
    sheet.getRange(1, 1, 1, 4).setValues([['name', 'role', 'teishutsu_target', 'order']]);
  }
  sheet.getRange('A:D').setNumberFormat('@');
  return sheet;
}

// シート初期化: 「個別機能訓練計画書記録」シートが無ければ作る（既にあればそれを返す・冪等）
// 9列目 blocked_reason / 10列目 hyouka_pdf_date / 11列目 hyouka_print_date は後付け
// 13〜16列目 sokutei_date / sokutei_by / output_by / tasseido_date は後付け（2026-06-15 個訓Phase1）
function ensureKeikakushoSheet_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName('個別機能訓練計画書記録');
  if (!sheet) {
    sheet = ss.insertSheet('個別機能訓練計画書記録');
    sheet.getRange(1, 1, 1, 16).setValues([[
      'userId', 'name', 'year', 'month',
      'kyoumi_date', 'seikatsu_date', 'keikaku_date', 'updated_at', 'blocked_reason',
      'hyouka_pdf_date', 'hyouka_print_date', 'keikaku_sent_date',
      'sokutei_date', 'sokutei_by', 'output_by', 'tasseido_date'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 16).setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
  } else {
    var headerLastCol = sheet.getLastColumn();
    if (headerLastCol < 9) {
      sheet.getRange(1, 9).setValue('blocked_reason').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (headerLastCol < 10) {
      sheet.getRange(1, 10).setValue('hyouka_pdf_date').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (headerLastCol < 11) {
      sheet.getRange(1, 11).setValue('hyouka_print_date').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (headerLastCol < 12) {
      sheet.getRange(1, 12).setValue('keikaku_sent_date').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    // 2026-06-15 個訓Phase1: 測定/出力/達成度の4列を後付け（additive・既存データ非破壊）
    if (headerLastCol < 13) {
      sheet.getRange(1, 13).setValue('sokutei_date').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (headerLastCol < 14) {
      sheet.getRange(1, 14).setValue('sokutei_by').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (headerLastCol < 15) {
      sheet.getRange(1, 15).setValue('output_by').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
    if (headerLastCol < 16) {
      sheet.getRange(1, 16).setValue('tasseido_date').setBackground('#2c7a7b').setFontColor('#ffffff').setFontWeight('bold');
    }
  }
  return sheet;
}

// 対象者抽出: 利用者台帳から「要介護1〜5」かつ「終了/中止/卒業」でない利用者を返す
// 注: 名前自体をuserIdとして使用（通所モニタリングと同方式）
// 注: 「要介護度」列の値は半角全角混在（要介護1/要介護１）のため、両方を許容する
function getKeikakushoTargetUsers_(includeCancelled) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var userSheet = ss.getSheetByName('利用者台帳');
  if (!userSheet) return [];
  var values = userSheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(headers, ['名前', '氏名', '利用者名']);
  var careCol = findCol(headers, ['要介護度', '介護度']);
  var furiCol = findCol(headers, ['氏名（カナ）', 'カナ', 'フリガナ', 'ふりがな']);
  var statusCol = findCol(headers, ['利用ステータス']);
  if (statusCol < 0) statusCol = findColP(headers, 'ステータス');
  if (statusCol < 0) statusCol = findColP(headers, '利用状況');
  var daysCol = findCol(headers, ['利用曜日', '曜日']);
  var unitCol = findCol(headers, ['単位', '午前午後', 'AMPM']);
  var planStartCol = findCol(headers, ['計画書開始']);
  var planMonthsCol = findCol(headers, ['計画月数']);  // C案: 計画の長さ（月数・既定3）
  var cmOfficeCol = findCol(headers, ['ケアマネ事業所名', 'ケアマネ事業所', '居宅事業所', '居宅']);
  var cmNameCol = findCol(headers, ['ケアマネ名', '担当ケアマネ', 'ケアマネ']);
  if (nameCol < 0 || careCol < 0) return [];

  // 半角全角どちらでも当たるように正規化して比較
  function normalize(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .trim();
  }

  var users = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var name = String(row[nameCol] || '').trim();
    if (!name) continue;
    var isCancelled = false;
    if (statusCol >= 0) {
      var st = String(row[statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) {
        if (!includeCancelled) continue;
        isCancelled = true;
      }
    }
    var careRaw = String(row[careCol] || '').trim();
    var careNorm = normalize(careRaw);
    // 要介護のみ（要支援・事業対象を除外）
    if (careNorm.indexOf('要介護') !== 0) continue;

    // planStart: 利用者台帳「計画書開始」列を YYYY-MM 形式に正規化
    var planStart = '';
    if (planStartCol >= 0) {
      var psRaw = row[planStartCol];
      if (psRaw instanceof Date) {
        planStart = Utilities.formatDate(psRaw, 'Asia/Tokyo', 'yyyy-MM');
      } else {
        var psStr = String(psRaw || '').trim();
        var psm = psStr.match(/(\d{4})[-\/](\d{1,2})/);
        if (psm) planStart = psm[1] + '-' + String(psm[2]).padStart(2, '0');
      }
    }

    // planMonths: 利用者台帳「計画月数」列（1〜12の整数・既定3）。列が無い/未設定/範囲外は3。
    var planMonths = 3;
    if (planMonthsCol >= 0) {
      var pmRaw = parseInt(row[planMonthsCol], 10);
      if (pmRaw >= 1 && pmRaw <= 12) planMonths = pmRaw;
    }

    // ampm: 単位列から「午前/午後」推定
    var ampm = '午前';
    if (unitCol >= 0) {
      var unitRaw = String(row[unitCol] || '');
      if (unitRaw.indexOf('午後') >= 0 || unitRaw.toUpperCase().indexOf('PM') >= 0
          || unitRaw.indexOf('2単位') >= 0 || unitRaw.indexOf('二単位') >= 0) {
        ampm = '午後';
      }
    }

    users.push({
      userId: name,  // 利用者ID列が無いため名前を使用
      name: name,
      furigana: furiCol >= 0 ? String(row[furiCol] || '').trim() : '',
      category: careNorm,
      days: daysCol >= 0 ? String(row[daysCol] || '').trim() : '',
      ampm: ampm,
      planStart: planStart,
      planMonths: planMonths,
      cancelled: isCancelled,
      cmOffice: cmOfficeCol >= 0 ? String(row[cmOfficeCol] || '').trim() : '',
      cmName: cmNameCol >= 0 ? String(row[cmNameCol] || '').trim() : ''
    });
  }
  return users;
}

// 保留マーク付与時に、タスクボードへ自動登録（相談員への依頼として）
// 既に同じ年月・利用者で未完了タスクがあればスキップ（重複登録防止）
function addBlockedKeikakushoTask_(userId, name, category, year, month, reason) {
  try {
    var ss = SpreadsheetApp.openById(SS_ID);
    var taskSheet = ss.getSheetByName('タスクボード');
    var taskName = '[計画書保留] ' + name + (category ? '（' + category + '）' : '') + ' ' + year + '/' + month + '月 ' + reason + ' → 相談員へ依頼';
    // 重複チェック: 同じタスク名で未完了が既にあればスキップ
    if (taskSheet) {
      var taskValues = taskSheet.getDataRange().getValues();
      for (var i = 1; i < taskValues.length; i++) {
        if (String(taskValues[i][3] || '') === taskName
            && String(taskValues[i][8] || '') !== '完了') {
          return { added: false, reason: 'already exists', existingId: String(taskValues[i][0] || '') };
        }
      }
    }
    // 期限: 当月末
    var deadline = year + '-' + String(month).padStart(2, '0') + '-' + new Date(year, month, 0).getDate();
    var result = addBoardTask(ss, {
      name: taskName,
      priority: 'high',
      estimatedMin: 10,
      source: '代表',
      deadline: deadline
    });
    return { added: true, taskId: result && result.id ? result.id : null };
  } catch (err) {
    return { added: false, error: String(err) };
  }
}

// ===== 月次利用状況（出席予定タブの名前タップで開くモーダル用・2026-05-25追加） =====
// 利用者台帳の利用曜日 + 出欠変更シート + 出勤送迎表GAS の dailyOps を突合して
// 該当月の利用予定日／来館日／欠席日／送迎なし日を集計して返す

// 利用曜日文字列 → 曜日番号(0=日, 1=月, …, 6=土) の配列に変換
// 例: "月水金" → [1,3,5]、"月午前、木午後" → [1,4]
function _muParseWeekdays(daysStr) {
  if (!daysStr) return [];
  var map = { '日':0, '月':1, '火':2, '水':3, '木':4, '金':5, '土':6 };
  var set = {};
  var s = String(daysStr);
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (map.hasOwnProperty(c)) set[map[c]] = true;
  }
  var result = [];
  for (var d = 0; d < 7; d++) if (set[d]) result.push(d);
  return result;
}

// 対象月の指定曜日にあたる日付（YYYY-MM-DD）を全列挙
function _muScheduledDatesInMonth(yearMonth, weekdayCodes) {
  var parts = yearMonth.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var lastDay = new Date(y, m, 0).getDate();
  var out = [];
  for (var d = 1; d <= lastDay; d++) {
    var dt = new Date(y, m - 1, d);
    if (weekdayCodes.indexOf(dt.getDay()) >= 0) {
      out.push(Utilities.formatDate(dt, 'Asia/Tokyo', 'yyyy-MM-dd'));
    }
  }
  return out;
}

// 出勤送迎表の dailyOps を取得し、該当月のキーだけ抽出して返す
// 返り値: { 'YYYY-MM-DD': dayOps, ... }
function _muFetchDailyOpsForMonth(yearMonth) {
  try {
    var resp = UrlFetchApp.fetch(DIGEST_OPS_URL, {
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = resp.getResponseCode();
    if (code !== 200) return {};
    var json = JSON.parse(resp.getContentText());
    var all = json && json.dailyOps ? json.dailyOps : {};
    var filtered = {};
    Object.keys(all).forEach(function(key) {
      if (key.indexOf(yearMonth) === 0) filtered[key] = all[key];
    });
    return filtered;
  } catch (e) {
    return {};  // 取得失敗時は空（来館日表示なしで継続）
  }
}

// dayOps（1日分の出勤送迎表データ）から該当利用者の (attended, noPickup) を判定
// 出勤送迎表の userStatus 値：
//   'absent' / 'longabsent' = 欠席（来館なし）
//   'family' / 'walk' = 来館だが送迎なし（Cバッジ相当）
//   'trial' / 'new' / undefined = 通常来館
function _muExtractUserDayState(dayOps, name) {
  var state = { attended: false, noPickup: false };
  if (!dayOps) return state;

  ['am', 'pm'].forEach(function(unit) {
    var u = dayOps[unit];
    if (!u) return;

    var inUsers = Array.isArray(u.users) && u.users.indexOf(name) >= 0;
    if (!inUsers) return;

    var st = (u.userStatus && u.userStatus[name]) || '';
    if (st === 'absent' || st === 'longabsent') return;  // 欠席系は来館でない

    state.attended = true;
    if (st === 'family' || st === 'walk') state.noPickup = true;
  });

  return state;
}

// 該当利用者の該当月の欠席日マップ（通常欠席＋長期休み中）
// 返り値: { 'YYYY-MM-DD': { reason: '...', isLongTerm: true|false } }
function _muGetAbsenceMapForUserMonth(ss, name, yearMonth) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet || sheet.getLastRow() < 2) return {};

  var parts = yearMonth.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var monthStart = Utilities.formatDate(new Date(y, m - 1, 1), 'Asia/Tokyo', 'yyyy-MM-dd');
  var monthEnd   = Utilities.formatDate(new Date(y, m, 0),     'Asia/Tokyo', 'yyyy-MM-dd');

  var data = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var rowName = String(data[i][1] || '').trim();
    if (rowName !== name) continue;
    var d = fmtDate(data[i][0]);
    var type = String(data[i][3] || '').trim();
    var reason = String(data[i][4] || '').trim();

    if (type === '欠席' && d >= monthStart && d <= monthEnd) {
      map[d] = { reason: reason, isLongTerm: false };
    }

    if (type === '長期休み') {
      // 開始日〜終了日（無ければ無限）が当月と重なる範囲を「欠席」として塗る
      var startD = d;
      var endD = data[i][7] ? fmtDate(data[i][7]) : '9999-12-31';
      var overlapStart = startD > monthStart ? startD : monthStart;
      var overlapEnd   = endD   < monthEnd   ? endD   : monthEnd;
      if (overlapStart <= overlapEnd) {
        var sParts = overlapStart.split('-');
        var sd = new Date(parseInt(sParts[0]), parseInt(sParts[1]) - 1, parseInt(sParts[2]));
        var eParts = overlapEnd.split('-');
        var ed = new Date(parseInt(eParts[0]), parseInt(eParts[1]) - 1, parseInt(eParts[2]));
        for (var cur = new Date(sd.getTime()); cur <= ed; cur.setDate(cur.getDate() + 1)) {
          var key = Utilities.formatDate(cur, 'Asia/Tokyo', 'yyyy-MM-dd');
          if (!map[key]) {
            map[key] = { reason: '長期休み（' + reason + '）', isLongTerm: true };
          }
        }
      }
    }
  }
  return map;
}

function getMonthlyUsage(ss, name, yearMonth) {
  if (!name || !yearMonth) {
    return { success: false, error: 'name と yearMonth が必須です' };
  }
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return { success: false, error: 'yearMonth は YYYY-MM 形式で指定してください' };
  }

  // 利用者台帳から利用曜日を取得（中止者の過去履歴も見たいので includeCancelled=true）
  var patterns = getUserPatterns(ss, true);
  var pat = patterns[name];
  if (!pat) {
    return { success: false, error: '利用者「' + name + '」が利用者台帳に見つかりません' };
  }
  var weekdayCodes = _muParseWeekdays(pat.days);
  var weekdayLabels = weekdayCodes.map(function(d) {
    return ['日','月','火','水','木','金','土'][d];
  });
  var scheduledDates = _muScheduledDatesInMonth(yearMonth, weekdayCodes);

  // 集計のためのマップ初期化
  var dayMap = {};
  scheduledDates.forEach(function(date) {
    dayMap[date] = { date: date, attended: false, absent: false, noPickup: false, reason: '' };
  });

  // 欠席マージ
  var absMap = _muGetAbsenceMapForUserMonth(ss, name, yearMonth);
  var absent = 0;
  Object.keys(absMap).forEach(function(date) {
    if (!dayMap[date]) {
      // 利用予定外の日に欠席記録がある（イレギュラー）→ days に追加
      dayMap[date] = {
        date: date, attended: false, absent: true, noPickup: false,
        reason: absMap[date].reason, isLongTerm: absMap[date].isLongTerm
      };
    } else {
      dayMap[date].absent = true;
      dayMap[date].reason = absMap[date].reason;
      dayMap[date].isLongTerm = absMap[date].isLongTerm;
    }
    absent++;
  });

  // 出勤送迎表からの来館・送迎なし反映
  // 注意: yawaragi は地域密着型通所介護で同日午前午後の両方利用なし運用なので、
  // 出欠変更シートに欠席記録がある日は、出勤送迎表側で予定が残っていても来館扱いしない。
  // （欠席登録後に出勤送迎表側の予定が削除されないままになるケースを補正）
  var dailyOps = _muFetchDailyOpsForMonth(yearMonth);
  var attended = 0;
  var noPickup = 0;
  Object.keys(dailyOps).forEach(function(date) {
    if (dayMap[date] && dayMap[date].absent) return;  // 欠席登録ある日はスキップ
    var st = _muExtractUserDayState(dailyOps[date], name);
    if (!st.attended) return;
    if (!dayMap[date]) {
      // 利用予定外の日に来館（イレギュラー出席）→ days に追加
      dayMap[date] = { date: date, attended: true, absent: false, noPickup: st.noPickup, reason: '' };
    } else {
      dayMap[date].attended = true;
      dayMap[date].noPickup = st.noPickup;
    }
    attended++;
    if (st.noPickup) noPickup++;
  });

  // days を並び替え
  var sortedKeys = Object.keys(dayMap).sort();
  var days = sortedKeys.map(function(k) { return dayMap[k]; });

  return {
    success: true,
    name: name,
    yearMonth: yearMonth,
    scheduledWeekdays: weekdayLabels,
    days: days,
    summary: {
      attended: attended,
      absent: absent,
      noPickup: noPickup,
      scheduledTotal: scheduledDates.length
    }
  };
}

// ===== 業務担当アプリ 新規シート作成（2026-05-26追加）=====
// 初回1度だけ実行。既に存在するシートはスキップ。
function setupTasksSheets() {
  var ss = SpreadsheetApp.openById(SS_ID);

  // tasks_master
  if (!ss.getSheetByName('tasks_master')) {
    var s = ss.insertSheet('tasks_master');
    s.getRange(1, 1, 1, 20).setValues([[
      'task_id', 'category_id', 'task_name', 'kind',
      'primary_id', 'secondary_id', 'end_date', 'memo', 'sort_order',
      'approval_status',
      'proposed_by_id', 'proposed_by_name_snapshot', 'proposed_at', 'proposal_note',
      'approved_by_id', 'approved_at',
      'rejected_by_id', 'rejected_at', 'rejected_reason',
      'status'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 20).setBackground('#f5c518').setFontWeight('bold');
    s.getRange('G:G').setNumberFormat('@');  // end_date列を文字列書式に（締切自由記述対応）
  }
  // 既存シートのG列を文字列書式に矯正（締切自由記述対応・2026-05-26）
  var taskMasterSh = ss.getSheetByName('tasks_master');
  if (taskMasterSh) taskMasterSh.getRange('G:G').setNumberFormat('@');

  // tasks_history
  if (!ss.getSheetByName('tasks_history')) {
    var s = ss.insertSheet('tasks_history');
    s.getRange(1, 1, 1, 12).setValues([[
      'history_id', 'task_id', 'changed_at',
      'changed_by_id', 'changed_by_name_snapshot',
      'action', 'field',
      'old_value', 'old_value_snapshot',
      'new_value', 'new_value_snapshot',
      'note'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 12).setBackground('#1b293f').setFontColor('#ffffff').setFontWeight('bold');
  }

  // tasks_categories
  if (!ss.getSheetByName('tasks_categories')) {
    var s = ss.insertSheet('tasks_categories');
    s.getRange(1, 1, 1, 7).setValues([[
      'category_id', 'name', 'sort_order', 'color', 'status',
      'created_at', 'updated_at'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 7).setBackground('#58e1c4').setFontWeight('bold');
  }

  // tasks_comments
  if (!ss.getSheetByName('tasks_comments')) {
    var s = ss.insertSheet('tasks_comments');
    s.getRange(1, 1, 1, 6).setValues([[
      'comment_id', 'task_id',
      'commenter_id', 'commenter_name_snapshot',
      'body', 'created_at'
    ]]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, 6).setBackground('#ff7a3a').setFontColor('#ffffff').setFontWeight('bold');
  }
}

// ===== 業務担当アプリ ID採番ヘルパー（2026-05-26追加）=====
function _nextTasksId_(sheetName, idColumn, prefix, padLength) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('sheet not found: ' + sheetName);
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) {
    return prefix + String(1).padStart(padLength, '0');
  }
  var values = sh.getRange(2, idColumn, lastRow - 1, 1).getValues();
  var maxNum = 0;
  values.forEach(function(row) {
    var v = String(row[0] || '');
    if (v.indexOf(prefix) === 0) {
      var n = parseInt(v.substring(prefix.length), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return prefix + String(maxNum + 1).padStart(padLength, '0');
}

function _nextTaskId_()     { return _nextTasksId_('tasks_master',     1, 'T',  4); }
function _nextHistoryId_()  { return _nextTasksId_('tasks_history',    1, 'H',  5); }
function _nextCategoryId_() { return _nextTasksId_('tasks_categories', 1, 'C',  2); }
function _nextCommentId_()  { return _nextTasksId_('tasks_comments',   1, 'CM', 5); }

// ===== 業務担当アプリ スタッフ名取得ヘルパー（2026-05-26追加）=====
// 注: 現状 yawaragiボードのスタッフマスター（getStaffListFromShiftSheet）は
//     名前文字列の配列のみ（ID列を持たない）。よって本アプリでは
//     primary_id / secondary_id 等の "id" にスタッフ名そのものを格納する運用とし、
//     本ヘルパーは「IDとして渡された値が既存スタッフ名と一致するか」を検証して返す。
//     一致しなければ空文字を返す（履歴snapshotの整合性保証）。
function _getStaffNameById_(staffId) {
  if (!staffId) return '';
  var sid = String(staffId);
  if (sid === 'guest') return 'ゲスト';
  if (sid === 'daihyo') return '代表';
  try {
    var list = getStaffListFromShiftSheet();  // 文字列配列 ['名前1','名前2',...]
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]) === sid) {
        return sid;
      }
    }
  } catch (e) {
    // スタッフシートが取れなければ空
  }
  return '';
}

// ===== 業務担当アプリ カテゴリAPI（2026-05-26追加）=====
function listCategories_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_categories');
  if (!sh || sh.getLastRow() <= 1) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  return values
    .filter(function(r) { return r[4] !== 'archived'; })
    .map(function(r) {
      return {
        category_id: r[0],
        name:        r[1],
        sort_order:  r[2],
        color:       r[3],
        status:      r[4]
      };
    })
    .sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
}

function addCategory_(p) {
  if (!p.name) return { ok: false, error: 'name required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_categories');
  var id = _nextCategoryId_();
  var now = new Date();
  sh.appendRow([
    id, p.name,
    (sh.getLastRow() - 1) * 10 + 10,
    p.color || '#f5c518',
    'active',
    now, now
  ]);
  return { ok: true, category_id: id };
}

function updateCategory_(p) {
  if (!p.category_id) return { ok: false, error: 'category_id required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_categories');
  if (sh.getLastRow() <= 1) return { ok: false, error: 'no categories' };
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === p.category_id) {
      var row = i + 2;
      if (p.name !== undefined && p.name !== '') sh.getRange(row, 2).setValue(p.name);
      if (p.sort_order !== undefined && p.sort_order !== '') sh.getRange(row, 3).setValue(Number(p.sort_order));
      if (p.color !== undefined && p.color !== '') sh.getRange(row, 4).setValue(p.color);
      sh.getRange(row, 7).setValue(new Date());
      return { ok: true };
    }
  }
  return { ok: false, error: 'category not found' };
}

function archiveCategory_(p) {
  if (!p.category_id) return { ok: false, error: 'category_id required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  // 「未分類」は削除不可
  var ss = SpreadsheetApp.openById(SS_ID);
  var shc = ss.getSheetByName('tasks_categories');
  if (shc.getLastRow() <= 1) return { ok: false, error: 'no categories' };
  var values = shc.getRange(2, 1, shc.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === p.category_id && values[i][1] === '未分類') {
      return { ok: false, error: '「未分類」カテゴリはアーカイブできません' };
    }
  }
  // 配下業務を「未分類」へ移動
  var miscId = _findOrCreateMiscCategoryId_();
  var shm = ss.getSheetByName('tasks_master');
  if (shm.getLastRow() > 1) {
    var taskValues = shm.getRange(2, 1, shm.getLastRow() - 1, 2).getValues();
    for (var j = 0; j < taskValues.length; j++) {
      if (taskValues[j][1] === p.category_id) {
        shm.getRange(j + 2, 2).setValue(miscId);
      }
    }
  }
  // 当該カテゴリをarchivedに
  for (var k = 0; k < values.length; k++) {
    if (values[k][0] === p.category_id) {
      shc.getRange(k + 2, 5).setValue('archived');
      shc.getRange(k + 2, 7).setValue(new Date());
      return { ok: true };
    }
  }
  return { ok: false, error: 'category not found' };
}

function _findOrCreateMiscCategoryId_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_categories');
  if (sh.getLastRow() > 1) {
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][1] === '未分類') return values[i][0];
    }
  }
  // なければ作る
  var id = _nextCategoryId_();
  var now = new Date();
  sh.appendRow([id, '未分類', 9999, '#cccccc', 'active', now, now]);
  return id;
}

function listTasks_(include) {
  // include: "approved" / "proposed" / "rejected" / "all" / 省略時="approved,proposed"
  var includeArr = (include || 'approved,proposed').split(',').map(function(s){ return s.trim(); });
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_master');
  if (!sh || sh.getLastRow() <= 1) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();
  return values
    .filter(function(r) {
      if (r[19] === 'archived') return false;
      if (includeArr.indexOf('all') >= 0) return true;
      return includeArr.indexOf(r[9]) >= 0;
    })
    .map(function(r) {
      return {
        task_id:                   r[0],
        category_id:               r[1],
        task_name:                 r[2],
        kind:                      r[3],
        primary_id:                r[4],
        secondary_id:              r[5],
        end_date:                  r[6] instanceof Date ? Utilities.formatDate(r[6], 'Asia/Tokyo', 'yyyy-MM-dd') : String(r[6] || ''),
        memo:                      r[7],
        sort_order:                r[8],
        approval_status:           r[9],
        proposed_by_id:            r[10],
        proposed_by_name_snapshot: r[11],
        proposed_at:               r[12] ? Utilities.formatDate(new Date(r[12]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') : '',
        proposal_note:             r[13],
        approved_by_id:            r[14],
        approved_at:               r[15] ? Utilities.formatDate(new Date(r[15]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') : '',
        rejected_by_id:            r[16],
        rejected_at:               r[17] ? Utilities.formatDate(new Date(r[17]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') : '',
        rejected_reason:           r[18],
        status:                    r[19]
      };
    });
}

function addTask_(p) {
  if (!p.task_name) return { ok: false, error: 'task_name required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_master');
  var id = _nextTaskId_();
  var now = new Date();
  var operatorName = _getStaffNameById_(p.operator_id);

  var approvalStatus, proposedById, proposedByName, proposedAt, proposalNote;
  var approvedById = '', approvedAt = '';

  if (p.is_proposal) {
    approvalStatus = 'proposed';
    proposedById = p.operator_id;
    proposedByName = operatorName;
    proposedAt = now;
    proposalNote = p.memo || '';
  } else {
    approvalStatus = 'approved';
    proposedById = p.operator_id;
    proposedByName = operatorName;
    proposedAt = now;
    proposalNote = '';
    approvedById = p.operator_id;
    approvedAt = now;
  }

  sh.appendRow([
    id, p.category_id || '', p.task_name, p.kind || '定期',
    p.primary_id || '', p.secondary_id || '',
    p.end_date || '', p.memo || '',
    (sh.getLastRow() - 1) * 10 + 10,
    approvalStatus,
    proposedById, proposedByName, proposedAt, proposalNote,
    approvedById, approvedAt,
    '', '', '',
    'active'
  ]);

  _logTaskHistory_(id, p.operator_id, operatorName, p.is_proposal ? 'proposed' : 'created', '', '', '', '', '', '');

  if (p.is_proposal) {
    _sendTaskNotification_(
      '[業務担当] 新規提案: ' + p.task_name + ' (by ' + operatorName + ')',
      '業務名: ' + p.task_name + '\n提案者: ' + operatorName + '\nメモ: ' + (p.memo || '(なし)')
    );
  } else {
    _sendTaskNotification_(
      '[業務担当] 新規登録: ' + p.task_name + ' (by ' + operatorName + ')',
      '業務名: ' + p.task_name + '\n登録者: ' + operatorName
    );
  }

  return { ok: true, task_id: id };
}

function _logTaskHistory_(taskId, operatorId, operatorName, action, field, oldValue, oldSnapshot, newValue, newSnapshot, note) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_history');
  sh.appendRow([
    _nextHistoryId_(), taskId, new Date(),
    operatorId, operatorName,
    action, field || '',
    oldValue || '', oldSnapshot || '',
    newValue || '', newSnapshot || '',
    note || ''
  ]);
}

function _sendTaskNotification_(subject, body) {
  try {
    // 2026-05-26: charset未指定でJapanese丸ごと化け（����m�F�e�X�g 等）→ UTF-8 明示
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, body, { charset: 'UTF-8' });
  } catch (e) {
    // 通知失敗は本処理を止めない
    console.log('notify failed: ' + e);
  }
}

function updateTask_(p) {
  if (!p.task_id) return { ok: false, error: 'task_id required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };

  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_master');
  if (sh.getLastRow() <= 1) return { ok: false, error: 'no tasks' };

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] !== p.task_id) continue;
    var row = i + 2;
    var current = values[i];
    var operatorName = _getStaffNameById_(p.operator_id);
    var changes = [];

    // 各フィールドの差分検出（指定されたフィールドのみ）
    var fieldMap = [
      { key: 'category_id',  col: 2,  idx: 1, isStaff: false, isCategory: true },
      { key: 'task_name',    col: 3,  idx: 2, isStaff: false },
      { key: 'kind',         col: 4,  idx: 3, isStaff: false },
      { key: 'primary_id',   col: 5,  idx: 4, isStaff: true  },
      { key: 'secondary_id', col: 6,  idx: 5, isStaff: true  },
      { key: 'end_date',     col: 7,  idx: 6, isStaff: false },
      { key: 'memo',         col: 8,  idx: 7, isStaff: false },
      { key: 'sort_order',   col: 9,  idx: 8, isStaff: false }
    ];

    fieldMap.forEach(function(f) {
      if (p[f.key] === undefined) return;  // 指定なしはスキップ
      var oldVal = String(current[f.idx] || '');
      var newVal = String(p[f.key]);
      if (oldVal === newVal) return;  // 同値はスキップ
      sh.getRange(row, f.col).setValue(p[f.key]);
      var oldSnap = '', newSnap = '';
      if (f.isStaff) {
        oldSnap = _getStaffNameById_(oldVal);
        newSnap = _getStaffNameById_(newVal);
      } else if (f.isCategory) {
        oldSnap = _getCategoryNameById_(oldVal);
        newSnap = _getCategoryNameById_(newVal);
      }
      changes.push({ field: f.key, oldVal: oldVal, oldSnap: oldSnap, newVal: newVal, newSnap: newSnap });
    });

    // 履歴1変更=1行
    changes.forEach(function(c) {
      _logTaskHistory_(p.task_id, p.operator_id, operatorName, 'updated',
        c.field, c.oldVal, c.oldSnap, c.newVal, c.newSnap, p.note || '');
    });

    // 通知メール（変更があった時のみ）
    if (changes.length > 0) {
      var bodyLines = ['業務名: ' + current[2], '編集者: ' + operatorName, ''];
      changes.forEach(function(c) {
        bodyLines.push('・' + c.field + ': ' +
          (c.oldSnap || c.oldVal || '(空)') + ' → ' +
          (c.newSnap || c.newVal || '(空)'));
      });
      if (p.note) bodyLines.push('\n理由: ' + p.note);
      _sendTaskNotification_(
        '[業務担当] 編集: ' + current[2] + ' (by ' + operatorName + ')',
        bodyLines.join('\n')
      );
    }

    return { ok: true, changes_count: changes.length };
  }
  return { ok: false, error: 'task not found' };
}

function _getCategoryNameById_(categoryId) {
  if (!categoryId) return '';
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_categories');
  if (sh.getLastRow() <= 1) return '';
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(categoryId)) return String(values[i][1] || '');
  }
  return '';
}

function approveTask_(p) {
  if (!p.task_id) return { ok: false, error: 'task_id required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_master');
  if (sh.getLastRow() <= 1) return { ok: false, error: 'no tasks' };
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();
  var operatorName = _getStaffNameById_(p.operator_id);
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] !== p.task_id) continue;
    var row = i + 2;
    if (p.category_id !== undefined && p.category_id !== '') sh.getRange(row, 2).setValue(p.category_id);
    if (p.task_name !== undefined && p.task_name !== '')     sh.getRange(row, 3).setValue(p.task_name);
    if (p.kind !== undefined && p.kind !== '')               sh.getRange(row, 4).setValue(p.kind);
    if (p.primary_id !== undefined)                          sh.getRange(row, 5).setValue(p.primary_id);
    if (p.secondary_id !== undefined)                        sh.getRange(row, 6).setValue(p.secondary_id);
    if (p.end_date !== undefined)                            sh.getRange(row, 7).setValue(p.end_date);
    if (p.memo !== undefined)                                sh.getRange(row, 8).setValue(p.memo);
    sh.getRange(row, 10).setValue('approved');
    sh.getRange(row, 15).setValue(p.operator_id);
    sh.getRange(row, 16).setValue(new Date());
    _logTaskHistory_(p.task_id, p.operator_id, operatorName, 'approved', '', '', '', '', '', '');
    _sendTaskNotification_(
      '[業務担当] 承認: ' + (p.task_name || values[i][2]) + ' (by ' + operatorName + ')',
      '主担当: ' + _getStaffNameById_(p.primary_id || values[i][4]) + '\n' +
      '副担当: ' + _getStaffNameById_(p.secondary_id || values[i][5])
    );
    return { ok: true };
  }
  return { ok: false, error: 'task not found' };
}

function rejectTask_(p) {
  if (!p.task_id) return { ok: false, error: 'task_id required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  if (!p.reason) return { ok: false, error: 'reason required' };
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_master');
  if (sh.getLastRow() <= 1) return { ok: false, error: 'no tasks' };
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();
  var operatorName = _getStaffNameById_(p.operator_id);
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] !== p.task_id) continue;
    var row = i + 2;
    sh.getRange(row, 10).setValue('rejected');
    sh.getRange(row, 17).setValue(p.operator_id);
    sh.getRange(row, 18).setValue(new Date());
    sh.getRange(row, 19).setValue(p.reason);
    _logTaskHistory_(p.task_id, p.operator_id, operatorName, 'rejected', '', '', '', '', '', p.reason);
    _sendTaskNotification_(
      '[業務担当] 却下: ' + values[i][2] + ' (by ' + operatorName + ')',
      '業務名: ' + values[i][2] + '\n却下者: ' + operatorName + '\n却下理由: ' + p.reason
    );
    return { ok: true };
  }
  return { ok: false, error: 'task not found' };
}

function archiveTask_(p) {
  if (!p.task_id) return { ok: false, error: 'task_id required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_master');
  if (sh.getLastRow() <= 1) return { ok: false, error: 'no tasks' };
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 20).getValues();
  var operatorName = _getStaffNameById_(p.operator_id);
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] !== p.task_id) continue;
    sh.getRange(i + 2, 20).setValue('archived');
    _logTaskHistory_(p.task_id, p.operator_id, operatorName, 'archived', '', '', '', '', '', p.note || '');
    _sendTaskNotification_(
      '[業務担当] アーカイブ: ' + values[i][2] + ' (by ' + operatorName + ')',
      '業務名: ' + values[i][2] + '\n理由: ' + (p.note || '(なし)')
    );
    return { ok: true };
  }
  return { ok: false, error: 'task not found' };
}

function listTaskHistory_(taskId) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_history');
  if (!sh || sh.getLastRow() <= 1) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
  return values
    .filter(function(r) { return !taskId || r[1] === taskId; })
    .map(function(r) {
      return {
        history_id:               r[0],
        task_id:                  r[1],
        changed_at:               r[2] ? Utilities.formatDate(new Date(r[2]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') : '',
        changed_by_id:            r[3],
        changed_by_name_snapshot: r[4],
        action:                   r[5],
        field:                    r[6],
        old_value:                r[7],
        old_value_snapshot:       r[8],
        new_value:                r[9],
        new_value_snapshot:       r[10],
        note:                     r[11]
      };
    })
    .sort(function(a, b) { return a.changed_at > b.changed_at ? -1 : 1; });
}

function addComment_(p) {
  if (!p.task_id) return { ok: false, error: 'task_id required' };
  if (!p.body) return { ok: false, error: 'body required' };
  if (!p.operator_id) return { ok: false, error: 'operator_id required' };
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_comments');
  var id = _nextCommentId_();
  var operatorName = _getStaffNameById_(p.operator_id);
  sh.appendRow([id, p.task_id, p.operator_id, operatorName, p.body, new Date()]);

  // 業務名を取得して通知
  var shm = ss.getSheetByName('tasks_master');
  var taskName = '';
  if (shm.getLastRow() > 1) {
    var values = shm.getRange(2, 1, shm.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === p.task_id) { taskName = values[i][2]; break; }
    }
  }
  _sendTaskNotification_(
    '[業務担当] コメント: ' + taskName + ' (by ' + operatorName + ')',
    '業務名: ' + taskName + '\nコメント: ' + p.body
  );
  return { ok: true, comment_id: id };
}

function listComments_(taskId) {
  if (!taskId) return [];
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_comments');
  if (!sh || sh.getLastRow() <= 1) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  return values
    .filter(function(r) { return r[1] === taskId; })
    .map(function(r) {
      return {
        comment_id:               r[0],
        task_id:                  r[1],
        commenter_id:             r[2],
        commenter_name_snapshot:  r[3],
        body:                     r[4],
        created_at:               r[5] ? Utilities.formatDate(new Date(r[5]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') : ''
      };
    })
    .sort(function(a, b) { return a.created_at < b.created_at ? -1 : 1; });
}

// ===== 業務担当アプリ 初期カテゴリ投入（2026-05-26追加・1度だけ実行）=====
// setupTasksSheets() でシート作成後、この関数を1度だけ実行して初期12カテゴリ＋未分類を投入する。
// 既にカテゴリがある場合は何もしない（重複実行ガード）。
function _seedInitialCategories_() {
  var ss = SpreadsheetApp.openById(SS_ID);
  var sh = ss.getSheetByName('tasks_categories');
  if (!sh) {
    throw new Error('tasks_categories シートが存在しません。先に setupTasksSheets() を実行してください。');
  }
  if (sh.getLastRow() > 1) {
    Logger.log('既にカテゴリあり。skip');
    return;
  }
  var initial = [
    '通所介護計画書', '個別機能訓練計画書', 'LIFE加算記録', '体力測定・評価',
    '看護師業務', 'リハビリ・運動指導', '送迎業務', '入浴介助',
    'フロア運営', '委員会・研修', '利用者ケア管理', '未分類'
  ];
  var now = new Date();
  initial.forEach(function(name, i) {
    var id = 'C' + String(i + 1).padStart(2, '0');
    var sortOrder = (name === '未分類') ? 9999 : (i + 1) * 10;
    var color = (name === '未分類') ? '#cccccc' : '#f5c518';
    sh.appendRow([id, name, sortOrder, color, 'active', now, now]);
  });
  Logger.log('初期12カテゴリ＋未分類を投入しました');
}

// ===== アプリ台帳（2026-06-08 P1 / 2026-06-10 P1.1: 社長専用SS移設＋scope=all認証）=====
// 設計書: docs/superpowers/specs/2026-06-08-アプリ台帳システムP1-design.md
// P1.1変更: 台帳は利用者台帳SS(共有)から社長専用SSへ移設(ScriptProperties 'APPREGISTRY_SS_ID')。
//          scope=staffは無認証で4フィールドのみ。scope=allはadminKey必須(ScriptProperties照合)。
var APPREGISTRY_SHEET = 'アプリ台帳';
var APPREGISTRY_HEADERS = ['アプリ名','カテゴリ','説明','スタッフ用URL','公開区分',
  '記録シートID','ソース場所','GASデプロイID','注意点','作成日','最終更新日','管理者メモ',
  'icon','表示順'];

// 台帳の置き場所(社長専用SS)を ScriptProperties から解決
function appregistrySS_() {
  var id = PropertiesService.getScriptProperties().getProperty('APPREGISTRY_SS_ID');
  if (!id) throw new Error('APPREGISTRY_SS_ID 未設定。先に action=appregistry_init を実行してください');
  return SpreadsheetApp.openById(id);
}

// action=appregistry_init : 一度きり。社長専用SSを作成＋adminKey生成→ScriptProperties保存→m-higaへメール。
// 既に設定済みなら何もせず現状を返す。adminKeyはレスポンスに含めない(メールのみ)。
function appregistryInit_() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('APPREGISTRY_SS_ID');
  var ssCreated = false;
  if (!ssId) {
    var ss = SpreadsheetApp.create('アプリ台帳（管理用）'); // 実行者(m-higa)のマイドライブ直下・非共有
    ssId = ss.getId();
    props.setProperty('APPREGISTRY_SS_ID', ssId);
    ssCreated = true;
  }
  var key = props.getProperty('APPREGISTRY_ADMIN_KEY');
  var keyCreated = false;
  if (!key) {
    key = Utilities.getUuid();
    props.setProperty('APPREGISTRY_ADMIN_KEY', key);
    keyCreated = true;
  }
  var url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/edit';
  if (ssCreated || keyCreated) {
    GmailApp.sendEmail('m-higa@keepfitlife.com',
      '【アプリ台帳】管理用スプレッドシートと管理キー(adminKey)',
      'アプリ台帳（管理用）の準備ができました。社外秘です。\n\n' +
      '◆台帳URL(社長専用・スタッフ非共有):\n' + url + '\n\n' +
      '◆管理キー(adminKey):\n' + key + '\n\n' +
      '◆全件(internal含む)を見る時のURL例:\n' +
      'https://script.google.com/macros/s/AKfycbwo1UGxsK1qgmO8IDaqT-inDM0Qgoe_MRvxfKDxHy_gXANi4FwNFlgn2pEanMXVQxsdlw/exec?action=getAppRegistry&scope=all&adminKey=' + key + '\n\n' +
      '※このキーはスタッフに渡さないでください。');
  }
  return { success: true, ssCreated: ssCreated, keyCreated: keyCreated, ssId: ssId, ssUrl: url, emailedTo: 'm-higa@keepfitlife.com' };
}

// action=appregistry_setup : 台帳シートのヘッダ行を作成（冪等）
function appregistrySetup_() {
  var ss = appregistrySS_();
  var sheet = ss.getSheetByName(APPREGISTRY_SHEET);
  if (!sheet) sheet = ss.insertSheet(APPREGISTRY_SHEET);
  sheet.getRange(1, 1, 1, APPREGISTRY_HEADERS.length).setValues([APPREGISTRY_HEADERS]);
  return { success: true, sheet: APPREGISTRY_SHEET, headers: APPREGISTRY_HEADERS.length };
}

// action=appregistry_bulk_upsert (POST) : data.rows をアプリ名キーで upsert
function appregistryBulkUpsert_(data) {
  var ss = appregistrySS_();
  var sheet = ss.getSheetByName(APPREGISTRY_SHEET);
  if (!sheet) throw new Error("Sheet '" + APPREGISTRY_SHEET + "' not found. action=appregistry_setup を先に実行");
  var COLS = APPREGISTRY_HEADERS.length;
  var lastRow = sheet.getLastRow();
  var existing = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, COLS).getValues() : [];
  var nameToRow = {};
  existing.forEach(function(r, i) { nameToRow[r[0]] = i + 2; });
  var toAppend = [];
  (data.rows || []).forEach(function(item) {
    var row = [item.アプリ名, item.カテゴリ, item.説明, item.スタッフ用URL, item.公開区分,
      item.記録シートID || '', item.ソース場所, item.GASデプロイID || '', item.注意点 || '',
      item.作成日, item.最終更新日, item.管理者メモ || '', item.icon || '', item.表示順 || ''];
    if (nameToRow[item.アプリ名]) sheet.getRange(nameToRow[item.アプリ名], 1, 1, COLS).setValues([row]);
    else toAppend.push(row);
  });
  if (toAppend.length) sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, COLS).setValues(toAppend);
  return { success: true, upserted: (data.rows || []).length, appended: toAppend.length };
}

// action=getAppRegistry : ?scope=staff(既定・無認証・4項目のみ) / scope=all(adminKey必須・全項目)
function getAppRegistry_(e) {
  var scope = (e && e.parameter && e.parameter.scope) || 'staff';
  if (scope === 'all') {
    var provided = e && e.parameter && e.parameter.adminKey;
    var expected = PropertiesService.getScriptProperties().getProperty('APPREGISTRY_ADMIN_KEY');
    if (!expected || provided !== expected) {
      return { error: 'forbidden', status: 403, message: 'scope=all には正しい adminKey が必要です' };
    }
  }
  var ss = appregistrySS_();
  var sheet = ss.getSheetByName(APPREGISTRY_SHEET);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, APPREGISTRY_HEADERS.length).getValues() : [];
  var apps = values.map(function(row) {
    return { アプリ名:row[0], カテゴリ:row[1], 説明:row[2], スタッフ用URL:row[3], 公開区分:row[4],
      記録シートID:row[5], ソース場所:row[6], GASデプロイID:row[7], 注意点:row[8],
      作成日:row[9], 最終更新日:row[10], 管理者メモ:row[11], icon:row[12], 表示順:row[13] };
  });
  // カテゴリ順(LAUNCHER_CATEGORY_ORDER)→カテゴリ内は表示順(数値)で並べる
  var catOrder = (typeof LAUNCHER_CATEGORY_ORDER !== 'undefined') ? LAUNCHER_CATEGORY_ORDER : [];
  function catRank_(c){ var i = catOrder.indexOf(c); return i < 0 ? 999 : i; }
  function ordNum_(v){ var n = parseInt(v, 10); return isNaN(n) ? 999 : n; }
  apps.sort(function(a,b){ return (catRank_(a.カテゴリ)-catRank_(b.カテゴリ)) || (ordNum_(a.表示順)-ordNum_(b.表示順)); });
  if (scope === 'all') return apps; // 全項目(internal含む)
  // staff: staff行のみ＋公開フィールド(デプロイID/注意点等の内部情報は返さない)。icon/表示順は公開してよい(機微情報でない)
  return apps.filter(function(a) { return a.公開区分 === 'staff'; })
    .map(function(a) { return { アプリ名:a.アプリ名, カテゴリ:a.カテゴリ, 説明:a.説明, スタッフ用URL:a.スタッフ用URL, icon:a.icon, 表示順:a.表示順 }; });
}

// action=appregistry_drop_legacy : 旧シート(利用者台帳SS内「アプリ台帳」タブ)を削除（二重管理/情報漏れ防止）
function appregistryDropLegacy_() {
  var ss = SpreadsheetApp.openById(SS_ID); // 利用者台帳SS(共有)
  var sheet = ss.getSheetByName(APPREGISTRY_SHEET);
  if (!sheet) return { success: true, note: '旧タブは存在しない（削除済み）' };
  ss.deleteSheet(sheet);
  return { success: true, deleted: APPREGISTRY_SHEET, from: '利用者台帳SS' };
}

// 台帳の監査＋重複行整理（dryRun=既定で読むだけ・apply+deleteNamesで指定アプリ名の行を削除）。
// 重複=同一スタッフ用URLが複数行 / retired / 壊れURL を検出して返す。削除は指定名の完全一致のみ（安全）。
function appregistryAuditDedup_(opts) {
  opts = opts || {};
  var ss = appregistrySS_();
  var sheet = ss.getSheetByName(APPREGISTRY_SHEET);
  if (!sheet) return { error: 'no_sheet' };
  var COLS = APPREGISTRY_HEADERS.length;
  var lastRow = sheet.getLastRow();
  var rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, COLS).getValues() : [];
  var byUrl = {};
  rows.forEach(function (r, i) {
    var u = String(r[3] || '').trim().toLowerCase();
    (byUrl[u] = byUrl[u] || []).push({ rowNum: i + 2, name: String(r[0] || ''), cat: String(r[1] || ''), url: String(r[3] || ''), pub: String(r[4] || '') });
  });
  var dupGroups = [];
  Object.keys(byUrl).forEach(function (u) { if (u && byUrl[u].length > 1) dupGroups.push({ url: u, rows: byUrl[u] }); });
  var retired = rows.filter(function (r) { return String(r[4]) === 'retired'; }).map(function (r) { return { name: String(r[0]), url: String(r[3]), cat: String(r[1]) }; });
  var broken = rows.filter(function (r) { return !/^https?:\/\//i.test(String(r[3] || '')); }).map(function (r) { return { name: String(r[0]), url: String(r[3]), pub: String(r[4]) }; });
  var report = { total: rows.length, dupCount: dupGroups.length, dupGroups: dupGroups, retiredCount: retired.length, retired: retired, brokenCount: broken.length, broken: broken };
  if (opts.apply && opts.pairs && opts.pairs.length) {
    // (url, pub)の完全一致のみ削除＝同名でも公開区分で区別し現役staffを保護
    var toDel = [], deleted = [];
    function nfc_(s) { try { return String(s || '').normalize('NFC'); } catch (e) { return String(s || ''); } }
    rows.forEach(function (r, i) {
      var u = nfc_(r[3]), p = String(r[4] || '');
      for (var k = 0; k < opts.pairs.length; k++) {
        var urlMatch = (opts.pairs[k].url === '*') || (nfc_(opts.pairs[k].url) === u);
        if (urlMatch && opts.pairs[k].pub === p) { toDel.push(i + 2); deleted.push({ name: String(r[0]), url: String(r[3]), pub: p }); break; }
      }
    });
    toDel.sort(function (a, b) { return b - a; }).forEach(function (rn) { sheet.deleteRow(rn); });
    report.applied = true; report.deletedRows = toDel.length; report.deleted = deleted;
  }
  return report;
}

// ===== ランチャー(portal/admin)一本化 データ移行 =====
// applauncher-mapping-core.js の純関数 launcherApplyMapping_ を使い、台帳を正本マッピングへ一括更新する。
// icon/表示順 列を追加し、マッピング該当行=staff・該当外=internal(retiredはそのまま)・照会回答作成を追加・全行の最終更新日=2026-06-18。
// 実行は editor から appregistryMigrateLauncherV2() を1回（または clasp run）。冪等(再実行可)。
function appregistryMigrateLauncherV2_() {
  var ss = appregistrySS_();
  var sheet = ss.getSheetByName(APPREGISTRY_SHEET);
  if (!sheet) throw new Error("台帳シート '" + APPREGISTRY_SHEET + "' が無い。action=appregistry_setup を先に");
  var COLS = APPREGISTRY_HEADERS.length; // 14
  var lastRow = sheet.getLastRow();
  var rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, COLS).getValues() : [];
  var res = launcherApplyMapping_(rows, '2026-06-18');
  // ヘッダを14列へ更新
  sheet.getRange(1, 1, 1, COLS).setValues([APPREGISTRY_HEADERS]);
  // 旧データ域をクリアしてから書き戻し(行数が増えるため)
  if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, COLS).clearContent();
  if (res.rows.length) sheet.getRange(2, 1, res.rows.length, COLS).setValues(res.rows);
  return { success: true, beforeRows: rows.length, afterRows: res.rows.length, summary: res.summary };
}

// editor / clasp run 用の公開エントリ(末尾アンダースコア無し)
function appregistryMigrateLauncherV2() {
  return appregistryMigrateLauncherV2_();
}

// =============================================================
// 伝達ボード（社長⇄スタッフ⇄スタッフ 3方向メッセージ板・2026-06-18）
//   シート「伝達ボード」列=id/from/to/body/deadline/createdAt/done/doneAt/doneBy
//   純関数の正本は scripts/test-dengon-board.js（34テストPASS）と同一実装（二重持ち）。
// =============================================================
var DENGON_SHEET = '伝達ボード';
var DB_COL = { ID: 0, FROM: 1, TO: 2, BODY: 3, DEADLINE: 4, CREATED: 5, DONE: 6, DONEAT: 7, DONEBY: 8 };
var DB_HEADER = ['id', 'from', 'to', 'body', 'deadline', 'createdAt', 'done', 'doneAt', 'doneBy'];

// 旧pendingTasks 4件の移行シード（from=社長/to=社長＝朝報告に残す・id流用で二重化防止）。
var DENGON_MIGRATE_SEED = [
  { id: 'nyukin-dashboard', createdAt: '2026-06-14', body: '🔴 入金管理ダッシュボード（返戻側）未実装｜設計確定済み（取りこぼし集中／PDF自動＋手入力保険／4段階ステータス／返戻・引落を朝報告で監視）' },
  { id: 'furikae-kaizen', createdAt: '2026-06-14', body: '🔴 振替不能アプリ改修＋繰越確認｜未回収サマリー最上段／表2段階／放置アラート＋「4月の未回収者が5月画面に繰り越されるか」要確認' },
  { id: 'tanka-chosa', createdAt: '2026-06-14', body: '🔴 東松山市の総合事業/介護予防の正確な単価を調べる｜返戻金額を概算→正確化。6級地。出所＝市の総合事業の手引き／運営推進会議資料' },
  { id: 'kobetsu-phase1-verify', createdAt: '2026-06-15', body: '🟡 個別機能訓練計画書チェックPhase1 実装完了・社長のiPad実機確認待ち｜GAS @252／確認＝計画/評価2列・測定者プルダウン8名・📮ケアマネ未提出ビュー' }
];

// --- 純関数（scripts/test-dengon-board.js と同一実装）---
function dbIsDone_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined || v === '') return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === '✓';
}
// Sheets が日付文字列を Date型で保存する対策：Date なら yyyy-MM-dd、それ以外は文字列のまま。
function _dbYmd_(v) {
  if (v instanceof Date) {
    var y = v.getFullYear();
    var m = ('0' + (v.getMonth() + 1)).slice(-2);
    var d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return String(v || '').trim();
}
function dbNormalizeRow_(row) {
  return {
    id: String(row[DB_COL.ID] || '').trim(),
    from: String(row[DB_COL.FROM] || '').trim() || '社長',
    to: String(row[DB_COL.TO] || '').trim() || '全員',
    body: String(row[DB_COL.BODY] || '').trim(),
    deadline: _dbYmd_(row[DB_COL.DEADLINE]),
    createdAt: String(row[DB_COL.CREATED] || '').trim(),
    done: dbIsDone_(row[DB_COL.DONE]),
    doneAt: String(row[DB_COL.DONEAT] || '').trim(),
    doneBy: String(row[DB_COL.DONEBY] || '').trim()
  };
}
function dbFilterActive_(values, today) {
  // 2026-06-21 期限超過の自動非表示を撤去。完了するまで常に表示する（期限切れでも残す）。
  // today 引数は呼び出し側互換のため残置（未使用）。
  var out = [];
  if (!values || values.length < 2) return out;
  for (var i = 1; i < values.length; i++) {
    var o = dbNormalizeRow_(values[i]);
    if (!o.id) continue;
    if (o.done) continue;
    out.push({ id: o.id, from: o.from, to: o.to, body: o.body, deadline: o.deadline, createdAt: o.createdAt, row: i + 1 });
  }
  return out;
}
// 完了履歴：done=true のみ。doneAt 降順（新しい完了を上に・空doneAtは末尾）。
function dbFilterDone_(values) {
  var out = [];
  if (!values || values.length < 2) return out;
  for (var i = 1; i < values.length; i++) {
    var o = dbNormalizeRow_(values[i]);
    if (!o.id) continue;
    if (!o.done) continue;
    out.push({ id: o.id, from: o.from, to: o.to, body: o.body, deadline: o.deadline, createdAt: o.createdAt, doneAt: o.doneAt, doneBy: o.doneBy, row: i + 1 });
  }
  out.sort(function (a, b) { return String(b.doneAt || '').localeCompare(String(a.doneAt || '')); });
  return out;
}
function dbFilterForOwner_(values, today) {
  return dbFilterActive_(values, today).filter(function (x) { return x.to === '社長'; });
}
function dbShouldNotifyStaff_(to) {
  return String(to || '').trim() !== '社長';
}
function dbFindRowIndex_(values, id) {
  var target = String(id || '').trim();
  if (!target || !values) return -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][DB_COL.ID] || '').trim() === target) return i;
  }
  return -1;
}
function dbValidateNew_(data) {
  data = data || {};
  var from = String(data.from || '').trim();
  var to = String(data.to || '').trim();
  var body = String(data.body || '').trim();
  var deadline = String(data.deadline || '').trim();
  if (!from) return { ok: false, error: '投稿者(from)がありません' };
  if (!to) return { ok: false, error: '宛先(to)がありません' };
  if (!body) return { ok: false, error: '一言(body)が空です' };
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { ok: false, error: '期限(deadline)は yyyy-MM-dd 形式で' };
  return { ok: true };
}
// "yyyy-MM-dd HH:mm:ss"（or HH:mm）→ ミリ秒。空・不正は 0。
function _dbParseTs_(s) {
  s = String(s || '').trim();
  if (!s) return 0;
  var t = new Date(s.replace(' ', 'T')).getTime();
  return isNaN(t) ? 0 : t;
}
// 直近 windowMs 内の「同一 from×to×body の未完了行」のidを返す（二重送信ガード）。無ければ null。
function dbFindRecentDuplicate_(values, from, to, body, nowMs, windowMs) {
  if (!values) return null;
  for (var i = 1; i < values.length; i++) {
    var o = dbNormalizeRow_(values[i]);
    if (!o.id || o.done) continue;
    if (o.from === from && o.to === to && o.body === body) {
      var ts = _dbParseTs_(o.createdAt);
      if (ts && (nowMs - ts) < windowMs) return o.id;
    }
  }
  return null;
}

// --- I/O（GAS固有）---
function _dengonToday_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// シート作成＋ヘッダ＋done列チェックボックス＋旧pendingTasks移行（既存idスキップ＝冪等）。
function setupDengonBoard(ss) {
  ss = ss || SpreadsheetApp.openById(SS_ID); // エディタ手動実行（引数なし）でも動く
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DENGON_SHEET);
    sheet.getRange(1, 1, 1, DB_HEADER.length).setValues([DB_HEADER]);
    sheet.getRange(1, 1, 1, DB_HEADER.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  // 期限列はテキスト書式に固定（Sheetsの日付自動変換を防ぐ＝文字列比較を守る）
  sheet.getRange(1, DB_COL.DEADLINE + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  var values = sheet.getDataRange().getValues();
  var now = _dengonToday_();
  var added = [];
  DENGON_MIGRATE_SEED.forEach(function (t) {
    if (dbFindRowIndex_(values, t.id) !== -1) return; // 既存idスキップ＝冪等
    sheet.appendRow([t.id, '社長', '社長', t.body, '', t.createdAt || now, false, '', '']);
    added.push(t.id);
  });
  var last = sheet.getLastRow();
  if (last >= 2) {
    sheet.getRange(2, DB_COL.DONE + 1, last - 1, 1).insertCheckboxes();
  }
  return { ok: true, sheet: DENGON_SHEET, added: added, totalRows: Math.max(0, last - 1) };
}

// 一覧：未完了のみ（dbFilterActive_）。期限切れも完了するまで残す。読み取り専用。
function getDengonBoard(ss, today) {
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) return [];
  return dbFilterActive_(sheet.getDataRange().getValues(), today || _dengonToday_());
}

// 完了履歴：done=true を doneAt降順で返す。読み取り専用。
function getDengonHistory(ss) {
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) return [];
  return dbFilterDone_(sheet.getDataRange().getValues());
}

// 朝報告用：宛先=社長 の未完了を pendingTasks 互換形（{id,title,status,note}）で返す。
function getDengonForOwner_(ss) {
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) return [];
  var owner = dbFilterForOwner_(sheet.getDataRange().getValues(), _dengonToday_());
  return owner.map(function (x) {
    return { id: x.id, title: x.body, status: x.deadline ? ('期限 ' + x.deadline) : '', note: '' };
  });
}

// 投稿：バリデーション→append→書込後に読み直してid存在を検証（成功したフリをしない）。
function addDengonMessage(ss, data) {
  data = data || {};
  var v = dbValidateNew_(data);
  if (!v.ok) return { success: false, error: v.error };
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) { setupDengonBoard(ss); sheet = ss.getSheetByName(DENGON_SHEET); }
  var from = String(data.from).trim(), to = String(data.to).trim(), body = String(data.body).trim();
  // 二重送信ガード：直近30秒の同一 from×to×body の未完了があれば新規追加せず既存idを返す（連打対策）
  var dupId = dbFindRecentDuplicate_(sheet.getDataRange().getValues(), from, to, body, new Date().getTime(), 30000);
  if (dupId) return { success: true, id: dupId, duplicate: true };
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'); // 秒精度（重複判定に使う）
  var id = 'db_' + new Date().getTime();
  var deadline = String(data.deadline || '').trim();
  sheet.appendRow([id, from, to, body, deadline, now, false, '', '']);
  SpreadsheetApp.flush();
  var idx = dbFindRowIndex_(sheet.getDataRange().getValues(), id);
  if (idx === -1) return { success: false, error: 'verify_failed', verified: false };
  sheet.getRange(idx + 1, DB_COL.DONE + 1).insertCheckboxes();
  return { success: true, id: id, verified: true };
}

// 完了：冪等／id無効は明示／書込後に読み直して done を確認。スタッフ宛て（社長以外）はnotify@へ完了通知。
function completeDengonMessage(ss, id, doneBy) {
  var taskId = String(id || '').trim();
  if (!taskId) return { ok: false, error: 'missing_id' };
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet', id: taskId };
  var values = sheet.getDataRange().getValues();
  var idx = dbFindRowIndex_(values, taskId);
  if (idx === -1) return { ok: false, error: 'no_such_id', id: taskId };
  var rowNum = idx + 1;
  var item = dbNormalizeRow_(values[idx]);
  var alreadyDone = item.done;
  sheet.getRange(rowNum, DB_COL.DONE + 1).setValue(true);
  if (!String(values[idx][DB_COL.DONEAT] || '').trim()) {
    sheet.getRange(rowNum, DB_COL.DONEAT + 1).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'));
  }
  if (doneBy) sheet.getRange(rowNum, DB_COL.DONEBY + 1).setValue(String(doneBy).trim());
  SpreadsheetApp.flush();
  var after = sheet.getRange(rowNum, DB_COL.DONE + 1).getValue();
  if (!dbIsDone_(after)) return { ok: false, error: 'verify_failed', id: taskId, verified: false };
  var notified = false;
  if (!alreadyDone && dbShouldNotifyStaff_(item.to)) {
    try { sendDengonCompletionMail_(item, String(doneBy || '（不明）').trim()); notified = true; }
    catch (err) { Logger.log('伝達ボード完了通知メール失敗: ' + err.message); }
  }
  return { ok: true, id: taskId, completed: true, alreadyDone: alreadyDone, verified: true, notified: notified };
}

// 未完了に戻す：done=false・doneAt/doneByをクリア。書込後に読み直して検証。2026-06-21
function reopenDengonMessage(ss, id) {
  var taskId = String(id || '').trim();
  if (!taskId) return { ok: false, error: 'missing_id' };
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet', id: taskId };
  var values = sheet.getDataRange().getValues();
  var idx = dbFindRowIndex_(values, taskId);
  if (idx === -1) return { ok: false, error: 'no_such_id', id: taskId };
  var rowNum = idx + 1;
  sheet.getRange(rowNum, DB_COL.DONE + 1).setValue(false);
  sheet.getRange(rowNum, DB_COL.DONEAT + 1).setValue('');
  sheet.getRange(rowNum, DB_COL.DONEBY + 1).setValue('');
  SpreadsheetApp.flush();
  var after = sheet.getRange(rowNum, DB_COL.DONE + 1).getValue();
  if (dbIsDone_(after)) return { ok: false, error: 'verify_failed', id: taskId, verified: false };
  return { ok: true, id: taskId, reopened: true, verified: true };
}

// 完了通知メール（board_tasks の sendBoardTaskCompletionMail_ とは別関数・既存通知に非干渉）。
function sendDengonCompletionMail_(item, doneBy) {
  var subject = '[完了] 伝達ボード：' + String(item.body || '').slice(0, 30);
  var body = [
    '【' + doneBy + 'さん】が伝達ボードの項目を完了しました。',
    '',
    '内容: ' + (item.body || ''),
    '投稿者: ' + (item.from || ''),
    '宛先: ' + (item.to || ''),
    '期限: ' + (item.deadline || 'なし'),
    '',
    '▼yawaragiボードで確認:',
    ScriptApp.getService().getUrl()
  ].join('\n');
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body, { charset: 'UTF-8' });
}

// テスト/誤投稿の掃除用：db_ で始まるidのみ物理削除（実データ＝db_以外のidは保護）。
function deleteDengonMessage(ss, id) {
  var taskId = String(id || '').trim();
  if (taskId.indexOf('db_') !== 0) return { ok: false, error: 'db_以外は削除不可（実データ保護）', id: taskId };
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet', id: taskId };
  var idx = dbFindRowIndex_(sheet.getDataRange().getValues(), taskId);
  if (idx === -1) return { ok: false, error: 'no_such_id', id: taskId };
  sheet.deleteRow(idx + 1);
  return { ok: true, deleted: taskId };
}

// 掃除用：id が 'db_' で始まる行（テスト/誤投稿・完了済み含む）を全削除。実データ(db_以外)は保護。
function clearDengonTestRows(ss) {
  ss = ss || SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(DENGON_SHEET);
  if (!sheet) return { ok: false, error: 'no_sheet' };
  var values = sheet.getDataRange().getValues();
  var deleted = [];
  for (var i = values.length - 1; i >= 1; i--) { // 下から削除＝行ずれ防止
    var id = String(values[i][DB_COL.ID] || '').trim();
    if (id.indexOf('db_') === 0) { sheet.deleteRow(i + 1); deleted.push(id); }
  }
  return { ok: true, deleted: deleted, remaining: Math.max(0, sheet.getLastRow() - 1) };
}
