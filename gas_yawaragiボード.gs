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

// 利用曜日変更時テンプレート（2026/5/10追加・8項目）
var EVENT_TEMPLATE_USAGE_DAYS_CHANGE = [
  { seq: 1, label: 'リハブクラウドの提供票更新（曜日・回数）',           ownerTag: 'boss',       isUrgent: true  },
  { seq: 2, label: '出勤＆送迎表の曜日マトリクス更新',                   ownerTag: 'consultant', isUrgent: true  },
  { seq: 3, label: 'yawaragiボード「出席予定」の更新',                   ownerTag: 'consultant', isUrgent: true  },
  { seq: 4, label: '送迎日誌の更新',                                     ownerTag: 'consultant', isUrgent: false },
  { seq: 5, label: '送迎時間一覧アプリの更新',                           ownerTag: 'consultant', isUrgent: false },
  { seq: 6, label: '利用率分析アプリの契約週X回を更新',                  ownerTag: 'consultant', isUrgent: false },
  { seq: 7, label: '利用者台帳の「利用曜日」列を更新',                   ownerTag: 'consultant', isUrgent: false },
  { seq: 8, label: '翌月の請求チェッカー・提供票チェックで反映確認',     ownerTag: 'boss',       isUrgent: false }
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
  'ケアマネ報告日時','ケアマネ報告内容','ケアマネ利用可否連絡日','ケアマネ利用可否回答','契約順位','ケアマネ報告済',
  // 決定理由（選ばれた理由・経営分析用）
  '決定理由','決定理由詳細',
  // 送迎準備（追加）
  'Googleマップ登録済み',
  // 初回お迎え時間
  '初回お迎え時間','初回お迎え時間報告済',
  // 体験者として出勤＆送迎表に追加（2026-05-14追加）
  '送迎表追加済','送迎表追加日時'
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
    GmailApp.sendEmail(OWNER_EMAIL, subject, lines.join('\n'));
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

  // 既存レコード検索（同名がいないか）
  var uLastRow = uSheet.getLastRow();
  var existingRow = -1;
  if (uLastRow >= 2) {
    var nameCells = uSheet.getRange(2, nameCol, uLastRow - 1, 1).getValues();
    for (var j = 0; j < nameCells.length; j++) {
      if (String(nameCells[j][0] || '').trim() === name) { existingRow = j + 2; break; }
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
  // 最終決定曜日 → 利用曜日（パターン文字列化は省略・そのまま）
  setIfCol(['利用曜日'], iRecord.最終決定曜日);
  // 種別 → 午前/午後（送迎シミュ等の情報からは難しいので空のまま）

  var added = false;
  var rowNum;
  if (existingRow > 0) {
    rowNum = existingRow;
  } else {
    rowNum = uLastRow + 1;
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
  // 振り分け: ?mode=summary は 利用者台帳の集計エンドポイント（コード.gs の handleSummary）へ
  if (e && e.parameter && e.parameter.mode === 'summary') {
    return handleSummary(e);
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

  // 区変管理エンドポイント
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
  if (e && e.parameter && e.parameter.action === 'updateContact') {
    return handleUpdateContact(e);
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
    if (action === 'haichi') {
      var haichiSheet = ss.getSheetByName('配置データ');
      if (haichiSheet) {
        var val = haichiSheet.getRange('A1').getValue();
        result.haichi = val ? JSON.parse(val) : {};
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
    if (action === 'staff_list') {
      result.staff = getStaffListFromShiftSheet();
      return respond(result, callback);
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
            : String(mrow[6])) : ''
        });
      }
      return respond({
        ok: true,
        year: monYear,
        users: monUsers,
        records: monRecords
      }, callback);
    }

    // 通所介護計画モニタリング 更新（2026/5/9追加）
    if (action === 'updateMonitoring') {
      var muUserId = String((e && e.parameter && e.parameter.userId) || '').trim();
      var muYear = parseInt((e && e.parameter && e.parameter.year) || '', 10);
      var muMonth = parseInt((e && e.parameter && e.parameter.month) || '', 10);
      var muField = String((e && e.parameter && e.parameter.field) || '').trim();
      var muValue = String((e && e.parameter && e.parameter.value) || '');
      if (!muUserId || !muYear || muYear < 2020 || muYear > 2100
          || !muMonth || muMonth < 1 || muMonth > 12
          || (muField !== 'recordDate' && muField !== 'pdfDate')) {
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
            muRowIdx = muI + 1; // 1-indexed
            break;
          }
        }
        var muNow = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

        if (muRowIdx < 0) {
          // INSERT: 利用者台帳から正式名を取得（無ければuserIdを名前として使用）
          var muName = muUserId;
          var muTargets = getMonitoringTargetUsers_();
          for (var muT = 0; muT < muTargets.length; muT++) {
            if (muTargets[muT].userId === muUserId) {
              muName = muTargets[muT].name;
              break;
            }
          }
          var muNewRow = [muUserId, muName, muYear, muMonth, '', '', muNow];
          if (muField === 'recordDate') muNewRow[4] = muValue;
          else muNewRow[5] = muValue;
          muSheet.appendRow(muNewRow);
        } else {
          // UPDATE
          var muCol = (muField === 'recordDate') ? 5 : 6;
          muSheet.getRange(muRowIdx, muCol).setValue(muValue);
          muSheet.getRange(muRowIdx, 7).setValue(muNow);
        }
        return respond({ ok: true, updatedAt: muNow }, callback);
      } finally {
        muLock.releaseLock();
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
        var mcRec = String(mcValues[mcI][4] || '').trim();
        var mcPdf = String(mcValues[mcI][5] || '').trim();
        if (mcRec && mcPdf) mcDoneSet[String(mcValues[mcI][0] || '').trim()] = true;
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

// ===== Web API: POST =====
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SS_ID);

    switch (data.action) {
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
      case 'create_drafts':
        return jsonResp(createJissekiDrafts(data.yearMonth));
      // 2026-05-10: ケアマネ欠席連絡 即時方式 Phase 1
      case 'updateCmContact':
        return jsonResp(updateCmContact(ss, data));
      // 2026-05-13: 既存欠席のケアマネ連絡状況を手動更新（電話連絡済マーク用）
      case 'updateAbsenceCmNotified':
        return jsonResp(updateAbsenceCmNotified(ss, data));
      case 'save_haichi':
        var hSheet = ss.getSheetByName('配置データ');
        if (!hSheet) hSheet = ss.insertSheet('配置データ');
        hSheet.getRange('A1').setValue(JSON.stringify(data.haichi || {}));
        return jsonResp({ success: true });
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

  if (nameCol < 0) return { error: '名前列が見つかりません', am: [], pm: [] };

  // この日の欠席マップ
  var absMap = getAbsenceMap(ss, dateStr);

  var am = [], pm = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    if (!name) continue;

    // ステータスチェック
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
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
function getUserPatterns(ss) {
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
    if (statusCol >= 0) {
      var st = String(data[i][statusCol] || '').trim();
      if (st.indexOf('終了') >= 0 || st.indexOf('中止') >= 0 || st.indexOf('卒業') >= 0) continue;
    }
    var kana = kanaCol2 >= 0 ? String(data[i][kanaCol2] || '').trim() : '';
    var care = careCol2 >= 0 ? String(data[i][careCol2] || '').trim() : '';
    var days = daysCol >= 0 ? String(data[i][daysCol] || '').trim() : '';
    var ampm = ampmCol >= 0 ? String(data[i][ampmCol] || '').trim() : '';
    // 複合パターン（「月午前、木午後」等）はそのまま保持
    patterns[name] = { days: days, unit: ampm || '午前午後', kana: kana, care: care };
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
      row: i + 1  // updateUserCaremanager で使う
    });
  }
  return list;
}

// 利用者台帳のケアマネ列を更新（2026/5/2追加）
function updateUserCaremanager(ss, data) {
  var sheet = ss.getSheetByName('利用者台帳');
  if (!sheet) return { success: false, error: '利用者台帳シートがありません' };

  var userName = String(data.userName || '').trim();
  var newOffice = String(data.cmOffice || '').trim();
  var newStaff = String(data.cmStaff || '').trim();
  if (!userName) return { success: false, error: 'userName が必須' };
  if (!newOffice) return { success: false, error: 'cmOffice が必須' };
  if (!newStaff) return { success: false, error: 'cmStaff が必須' };

  var allData = sheet.getDataRange().getValues();
  var h = allData[0].map(function (v) { return String(v).trim(); });
  var nameCol = findCol(h, ['名前', '氏名', '利用者名']);
  var cmOfficeCol = findCol(h, ['ケアマネ事業所名', 'ケアマネ事業所', '事業所名', '居宅']);
  var cmStaffCol = findCol(h, ['ケアマネ担当者名', 'ケアマネ担当', 'ケアマネ担当者', 'ケアマネ氏名', 'ケアマネ', '担当ケアマネ']);
  if (cmOfficeCol < 0 || cmStaffCol < 0) {
    return { success: false, error: '利用者台帳にケアマネ列が見つかりません' };
  }

  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][nameCol]).trim() === userName) {
      var beforeOffice = String(allData[i][cmOfficeCol] || '').trim();
      var beforeStaff = String(allData[i][cmStaffCol] || '').trim();
      sheet.getRange(i + 1, cmOfficeCol + 1).setValue(newOffice);
      sheet.getRange(i + 1, cmStaffCol + 1).setValue(newStaff);
      return {
        success: true,
        message: '利用者台帳を更新しました: ' + userName,
        before: { cmOffice: beforeOffice, cmStaff: beforeStaff },
        after: { cmOffice: newOffice, cmStaff: newStaff }
      };
    }
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
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var d = fmtDate(data[i][0]);
    var type = String(data[i][3] || '').trim();
    var rowName = String(data[i][1] || '').trim();

    // 中止日より後の欠席はスキップ（利用中止後の幽霊レコード対策）
    var rowCancelDate = cancelMap[rowName];
    if (rowCancelDate && d > rowCancelDate) continue;

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
      list.push({
        date: d,
        name: String(data[i][1] || '').trim(),
        unit: String(data[i][2] || '').trim(),
        reason: String(data[i][4] || '').trim(),
        reporter: String(data[i][5] || '').trim(),
        contactDate: contactDate,
        cmNotified: String(data[i][7] || '').trim(),
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
      expectedReturn: lt.expectedReturn
    };
  });

  list.sort(function (a, b) { return a.date.localeCompare(b.date) || a.name.localeCompare(b.name); });
  return { absences: list, longTerm: longTermList };
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
    var dates = data.dates || [data.date];
    var unit = data.unit || '午前';

    // 2026-05-16: unit バリデーション（「終日」廃止）
    if (unit !== '午前' && unit !== '午後') {
      return { error: 'unit は 午前 または 午後 のみ（受信値: ' + unit + '）', success: false };
    }

    // 期間指定の場合、通所パターンでフィルタ
    if (dates.length > 1) {
      var userDays = getUserDaysForName(ss, data.name);
      if (userDays) {
        dates = dates.filter(function (d) {
          return userDays.indexOf(getDayOfWeek(d)) >= 0;
        });
      }
    }

    if (dates.length === 0) {
      return { error: '指定期間内に通所予定日がありません', success: false };
    }

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
    var datesSetGuard = {};
    dates.forEach(function (d) { datesSetGuard[d] = true; });
    for (var gi = 1; gi < allDataForGuard.length; gi++) {
      var gName = String(allDataForGuard[gi][1] || '').trim();
      if (gName !== data.name) continue;
      var gDate = fmtDate(allDataForGuard[gi][0]);
      if (!datesSetGuard[gDate]) continue;
      var gUnit = String(allDataForGuard[gi][2] || '').trim();
      if (gUnit !== unit) continue;  // unit違いは別物として通す
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

    // ===== 重複チェック（最終防衛・2026-05-08二重申請防止） =====
    var existingDates = findDuplicateAbsences(sheet, data.name, dates, unit);
    if (existingDates.length > 0) {
      return {
        success: false,
        duplicate: true,
        existingDates: existingDates,
        message: 'すでに申請済みの日があります'
      };
    }

    // ケアマネにメール通知（または電話連絡済みフラグを記録）
    // 2026-05-13: contactMethod='phone' なら電話連絡済として記録
    var cmNotified = '';
    if (data.contactMethod === 'phone') {
      cmNotified = '電話連絡済';
    } else if (data.cmEmail) {
      try {
        sendAbsenceEmail(
          data.name, dates, unit, data.reason || '', data.supplement || '',
          data.cmEmail, data.cmName || '', data.cmOffice || '',
          data.reporter || '',
          data.cmCustomBody || ''
        );
        cmNotified = DRAFT_MODE ? '下書き保存' : '送信済';
      } catch (emailErr) {
        cmNotified = 'エラー: ' + emailErr.message;
      }
    } else {
      cmNotified = 'メールなし';
    }

    // 社長に通知
    try {
      notifyOwner(data.name, dates, unit, data.reason || '', data.reporter || '');
    } catch (e) {
      // 通知失敗しても登録は続行
    }

    // スプレッドシートに記録（I列 = 受付日 contactDate）
    for (var i = 0; i < dates.length; i++) {
      sheet.appendRow([
        dates[i],
        data.name,
        unit,
        '欠席',
        data.reason || '',
        data.reporter || '',
        now,
        cmNotified,
        data.contactDate || ''
      ]);
    }

    return { success: true, count: dates.length, message: dates.length + '日分の欠席を登録しました' };
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

  // 長期休みの行を探して、8列目に再開日を書き込む
  for (var i = allData.length - 1; i >= 1; i--) {
    var name = String(allData[i][1] || '').trim();
    var type = String(allData[i][3] || '').trim();
    var endCol = allData[i][7] ? String(allData[i][7]).trim() : '';

    if (name === data.name && type === '長期休み' && !endCol) {
      sheet.getRange(i + 1, 8).setValue(data.resumeDate);
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

    // 2026-05-10: ケアマネに「やっぱり利用」メール送信（cmEmail があれば）
    if (data.cmEmail) {
      try {
        sendCancelEmail(data.name, data.date, data.cmEmail, data.cmName || '', data.cmOffice || '', data.canceller || '');
      } catch (emailErr) {
        Logger.log('cancel_absence メール送信エラー: ' + emailErr.message);
        // 取消自体は成功として扱う
      }
    }
  }

  return { success: true, deleted: deleted };
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

// 2026-05-13: 既存欠席の cmNotified 列（H列）を手動更新
// data: { name, date, cmNotified (例: '電話連絡済'), updater (任意・操作者名) }
function updateAbsenceCmNotified(ss, data) {
  var sheet = ss.getSheetByName('出欠変更');
  if (!sheet) return { success: false, error: '出欠変更シートがありません' };

  var name = String(data.name || '').trim();
  var dateStr = String(data.date || '').trim();
  var newValue = String(data.cmNotified || '').trim();
  if (!name || !dateStr) return { success: false, error: 'name と date が必要です' };

  var allData = sheet.getDataRange().getValues();
  var updated = 0;
  var normName = _normalizeNameForMatch_(name);
  for (var i = 1; i < allData.length; i++) {
    var d = fmtDate(allData[i][0]);
    var rowName = _normalizeNameForMatch_(allData[i][1]);
    var type = String(allData[i][3] || '').trim();
    if (d === dateStr && rowName === normName && type === '欠席') {
      sheet.getRange(i + 1, 8).setValue(newValue); // H列(8) = cmNotified
      updated++;
    }
  }

  if (updated === 0) return { success: false, error: '該当する欠席行が見つかりません', name: name, date: dateStr };
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
    bcc: 'yawaragi.notify@gmail.com,r.d-yawaragi@keepfitlife.com',
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
    bcc: 'yawaragi.notify@gmail.com,r.d-yawaragi@keepfitlife.com',
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

function notifyOwner(userName, dates, unit, reason, reporter) {
  var dateText = dates.map(function (d) {
    return fmtDateJP(d) + '（' + getDayOfWeek(d) + '）';
  }).join('、');

  var msg = '【欠席連絡】\n';
  msg += userName + '様\n';
  msg += '日付: ' + dateText + '\n';
  msg += '単位: ' + unit + '\n';
  msg += '理由: ' + (reason || '未記入') + '\n';
  msg += '連絡者: ' + (reporter || '未記入');
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
  try {
    // メッセージから件名を組む（例: 【yawaragi欠席連絡】欠席連絡 山田様）
    var lines = message.split('\n');
    var category = lines[0] ? lines[0].replace(/【|】/g, '') : '通知';
    var name = lines[1] || '';
    var subject = '【yawaragi欠席連絡】' + category + ' ' + name;
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, message);
  } catch (e) {}
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
      // A: 最終利用日 / B: 中止日（最終利用日と同期）/ C: 連絡日 / E: 理由 / F: 補足 / G: 受付者
      // D(利用者名) と H〜O(登録日時・変更前ステータス・チェックリスト) は触らない
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
  if (['contract_after', 'meeting_after', 'caremanager_change', 'usage_days_change'].indexOf(eventType) === -1) {
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

  // 2. テンプレートから項目を展開
  var template = getEventTemplate(eventType);
  if (template.length === 0) {
    return { success: false, error: 'テンプレートが空: ' + eventType };
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
  itemSheet.getRange(itemRow, 8).setValue(now);         // doneAt
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
    if (h === 'ケアマネメールアドレス') colCmEmail = c;
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
  if ((!data.氏名 && !data.ふりがな) || !data.TEL || !data.ペースメーカー || !data.種別) {
    return { success: false, error: '氏名またはふりがな・TEL・種別・ペースメーカーは必須' };
  }
  if (['trial','visit'].indexOf(data.種別) === -1) {
    return { success: false, error: '種別はtrial/visitのみ' };
  }
  if (['有','無','不明'].indexOf(data.ペースメーカー) === -1) {
    return { success: false, error: 'ペースメーカーは有/無/不明' };
  }
  var id = generateIntakeId();
  var now = nowIso();
  var row = INTAKE_HEADERS.map(function(h) {
    switch (h) {
      case 'id':             return id;
      case '問い合わせ日':   return data.問い合わせ日 || todayJst();
      case 'ステータス':     return data.ステータス || 'pending';
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

function getIntakeList(ss, opts) {
  opts = opts || {};
  var sheet = ss.getSheetByName('見学体験新規');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, INTAKE_HEADERS.length).getValues();
  var list = values.map(function(row) {
    var o = {};
    INTAKE_HEADERS.forEach(function(h, i) {
      var v = row[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
      o[h] = v;
    });
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
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
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

  if (!name || !newCare || !resultDate) {
    return respond({ error: 'name, newCare, resultDate は必須です' }, callback);
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
      if (currentFlag !== 'TRUE') {
        return respond({ error: '区変中ではありません' }, callback);
      }

      var applyDate = fmtDate(data[targetRow - 1][applyCol]);
      var prevCare = String(data[targetRow - 1][prevCareCol] || '').trim();

      // 1. 履歴シートに追加（失敗したら中断・台帳は無変更）
      var okureNote = okureMonths ? '月遅れ:' + okureMonths : '';
      historySheet.appendRow([
        '',
        name,
        applyDate,
        resultDate,
        prevCare,
        newCare,
        okureNote
      ]);

      // 2. 台帳の介護度列を新介護度で上書き
      if (careCol >= 0) {
        sheet.getRange(targetRow, careCol + 1).setValue(newCare);
      }

      // 3. 区変関連列をクリア・フラグFALSE化
      sheet.getRange(targetRow, flagCol + 1).setValue('FALSE');
      sheet.getRange(targetRow, applyCol + 1).setValue('');
      sheet.getRange(targetRow, expectCol + 1).setValue('');
      sheet.getRange(targetRow, prevCareCol + 1).setValue('');

      return respond({
        ok: true,
        name: name,
        applyDate: applyDate,
        resultDate: resultDate,
        prevCareLevel: prevCare,
        newCareLevel: newCare,
        okureMonths: okureMonths
      }, callback);

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

    var data = historySheet.getDataRange().getValues();
    if (data.length < 2) return respond({ items: [] }, callback);

    // 想定列: A:ID / B:氏名 / C:申請日 / D:結果日 / E:旧介護度 / F:新介護度 / G:備考(月遅れ:YYYY-MM,YYYY-MM)
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
        rowIndex: i + 1
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

    // 復帰済（終了日 < 今日）はスキップ。今日が終了日のレコードは「今日再開予定」として残す
    if (endDate && endDate < todayStr) continue;

    var expectedReturn = String(data[i][8] || '').trim();
    var lastContact = data[i][9] ? fmtDate(data[i][9]) : '';
    var contactLog = String(data[i][10] || '');
    var nextContactDue = data[i][11] ? fmtDate(data[i][11]) : '';
    var lastResultType = String(data[i][12] || '').trim();  // 'resume' / 'extend' / 'pending'

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
      elapsedDays: elapsedDays,
      daysUntilReturn: daysUntilReturn,
      daysSinceLastContact: daysSinceLastContact,
      nextContactDue: nextContactDue,
      lastResultType: lastResultType,
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
  if (!sheet) {
    sheet = ss.insertSheet('モニタリングチェック');
    sheet.getRange(1, 1, 1, 7).setValues([[
      'userId', 'name', 'year', 'month', 'recordDate', 'pdfDate', 'updatedAt'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#e8f5e9');
  }
  return sheet;
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
  if (nameCol < 0 || careCol < 0) return [];

  // 半角全角どちらでも当たるように正規化して比較
  function normalize(s) {
    return String(s || '')
      .replace(/[０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .trim();
  }
  var TARGETS = ['要支援1', '要支援2', '事業対象'];

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
    users.push({
      userId: name,        // 利用者ID列が無いため名前を使用
      name: name,
      category: careNorm   // 半角に正規化した値を返す
    });
  }
  return users;
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
var USAGE_ALERT_THRESHOLDS = { redOverall: 65, redWorst: 50, yellowOverall: 85, yellowWorst: 80 };

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
  // 欠席連絡運用開始日（利用率分析.html 側と同期）
  var OPERATION_START = '2026-04-06';

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
      var isPreOperational = monthEnd < OPERATION_START;
      monthly[m.key] = { scheduled: scheduled, absences: absences, isPreOperational: isPreOperational };
    });
    users.push({ name: name, weekdaysRaw: weekdaysRaw, monthly: monthly });
  }

  return { operationStart: OPERATION_START, users: users };
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
// 戻り値: { period, thresholds, users: [...], redList: [...] }
function getUsageAlerts(ss, fromYM, toYM, today) {
  var T = USAGE_ALERT_THRESHOLDS;
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
  // 直近欠席履歴（理由付き）を norm 別に収集
  var absDetail = getRecentAbsencesByUser(ss, fromYM, toYM);
  // 新規利用者の基準日（today の1ヶ月前）
  var newCutoff = '';
  if (startCol >= 0) {
    var nd = new Date(parseInt(today.slice(0,4)), parseInt(today.slice(5,7)) - 1, parseInt(today.slice(8,10)));
    nd.setMonth(nd.getMonth() - 1);
    newCutoff = Utilities.formatDate(nd, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  var users = [], redList = [];
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
    // 欠席日付を期間平坦化
    var absDates = [], ltDates = [];
    var amap = counts.absenceDays[norm] || {};
    Object.keys(amap).forEach(function(ym) { absDates = absDates.concat(amap[ym]); });
    var lmap = counts.longAbsenceDays[norm] || {};
    Object.keys(lmap).forEach(function(ym) { ltDates = ltDates.concat(lmap[ym]); });

    var bd = calcUsageDayBreakdown(weekdaysRaw, absDates, ltDates, months);
    var worstRate = bd.worstDay ? bd.worstDay.rate : null;
    var badge = judgeUsageBadge(bd.overall.rate, worstRate, T);

    // 判定理由
    var reasons = [];
    if (bd.overall.rate != null) {
      if (bd.overall.rate < T.redOverall) reasons.push('全体利用率が低い（' + bd.overall.rate + '%）');
      else if (bd.overall.rate < T.yellowOverall) reasons.push('全体利用率がやや低い（' + bd.overall.rate + '%）');
    }
    if (bd.worstDay && worstRate < T.yellowWorst) {
      reasons.push(bd.worstDay.day + '曜の利用率が低い（' + worstRate + '%）');
    }

    var u = {
      name: name,
      weekdaysRaw: weekdaysRaw,
      contractCount: Object.keys(bd.byDay).length,
      overall: bd.overall,
      byDay: bd.byDay,
      worstDay: bd.worstDay,
      periods: calcUsagePeriods(weekdaysRaw, absDates, ltDates, toYM, '2026-04'),
      recentAbsences: absDetail[norm] || [],
      badge: badge,
      reasons: reasons,
      excluded: false
    };
    users.push(u);
    if (badge === 'red') {
      redList.push({ name: name, rate: bd.overall.rate, worstDay: bd.worstDay });
    }
  }
  return {
    period: { from: fromYM, to: toYM },
    thresholds: T,
    users: users,
    redList: redList
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
      GmailApp.sendEmail(NOTIFY_EMAIL,
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
