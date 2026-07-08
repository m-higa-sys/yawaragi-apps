# 欠席box 連絡記録の範囲拡大＋未連絡アラート二段構え — 実装plan

作成: 2026-07-09（クロコ）／指示書: クロ設計・Gaku承認済み
対象: genba.html「欠席box」（フロントのみ・GAS非接触・書込ゼロ）
起点: 本番版 2026-07-04-36（Phase3アラート＋今日ボタンまで反映済み）
作業WT: `C:/tmp/wt-kbox-flicker`・ブランチ `feat/kbox-past-day-contact`・HEAD `62ec11a`

---

## 0. 背景（指示書§0）
Phase2記録／Phase3アラートは「第3営業日以内」に限定。実運用で歪みが出た:
- 6/29 の未連絡2件が第3営業日を過ぎ**記録できなくなった**まま10日放置。
- 記録はメールと違い誰にも迷惑をかけない → **未対応が残っている限りいつでも記録できるべき**。
- 制限が必要だったのは Phase4（実メール送信）だけ。記録・アラートには不要。

方針: **記録とアラートの日数制限を撤廃**（直近12ヶ月＝技術的下限）。ただし Phase4（実メール）は非接触。

---

## 1. Phase 1 調査結果（実測・読み取りのみで確定）

| 事項 | 実測 |
|---|---|
| 記録ボタン表示条件 | genba.html **7971行** `kbPastContactEligible_(_viewDate, _today)`（`else`＝未対応節内）1箇所のみ |
| 書込側の範囲ガード | `kbSubmitPastContact_`(7840)・`kbMarkContactedPast_`(7781) に**なし**＝表示条件だけで制御 |
| 過去日ジャンプ時の月取得 | `kbRenderForDate`(7543) が viewの月を `attEnsureMonthAbsences` で自動取得（記録に追加取得不要） |
| `kbPastContactEligible_` の使用 | 7672(必要月) / 7700(集計) / 7971(ボタン) の**3箇所**。直接緩めると赤判定まで変わる→残す |
| 月取得の実体 | `attEnsureMonthAbsences`(6569)=月1本JSONP・GAS実測8秒台・20秒TO・**失敗時cache非充填**（未取得と失敗が区別可） |
| アラート充填要求 | `kbEnsureUnnotifiedMonths_`(7638) が `kbLoad`(7536) から1回呼ばれる |
| 誤陰性ゼロ設計 | `kbUnnotifiedRangeLoaded_`(7683) で「必要月が全部揃うまで0件と断定しない」既存。全範囲へ拡張する |

**結論**: 範囲拡大は「新しい範囲判定を足し、7971行と集計をそれに差し替える」だけ。`kbPastContactEligible_` は二段の「赤（直近）」用にそのまま残す。

---

## 2. 範囲判定の設計（純関数・独自の日数計算を増やさない）

- `kbPastContactEligible_(view, today)` = 過去日 && 第3営業日以内（1〜3） … **現状維持**＝二段の「直近＝赤」
- **新規** `kbPastContactRecordable_(view, today)` = 過去日 && 直近12ヶ月以内
  - 判定: `view < today` かつ `view >= (todayの12ヶ月前・同日)`。境界は月単位でなく日単位（YYYY-MM-DD 文字列比較で下限を1つ持つ）。
  - 記録ボタン表示条件（7971）＝これに差し替え
  - アラート集計の**全体範囲**＝これ
- 「古い（控えめ）」= `recordable && !eligible`

> 12ヶ月は指示書C「技術的下限・後で調整可」。定数 `KB_RECORD_MONTHS = 12` で1箇所管理。

---

## 3. データ取得（12ヶ月・遅延展開）★2026-07-09 社長確定＝遅延展開方式

必要月リストを2段に分ける（`kbPastContactRecordable_`/`kbPastContactEligible_` から導出＝独自計算を作らない）:
- `kbUnnotifiedMonthsNear_(today)` = 第3営業日以内の月（現行 `kbUnnotifiedMonths_` 相当・通常1〜2月）
- `kbUnnotifiedMonthsAll_(today)`  = recordable 範囲の月（最大13月）

**遅延展開（初回は軽いまま・古い分は要求時のみ取得）**:
1. `kbLoad` は **near だけ** ensure（現状と完全に同じ・初回JSONP本数は増やさない）→ 赤を即出し。
2. 古ゾーンは初期状態「▽ 古い未連絡も確認する」ボタンのみ（件数を先に出さない＝old月を取らない）。
3. ボタン押下で初めて **old 月（all − near）を ensure**（順次）→ 揃ったら件数＋日付一覧を展開。
4. 各月の成否は既存どおり `attMonthAbsCache[ym]` の有無で判定。

**★誤陰性ゼロを全範囲で維持（指示書D・I6型再発防止）**:
- 失敗フラグを**near用/old用で分離**（後勝ちで消えないよう、範囲ごとに保持）。
- 赤ゾーン: near月が全部揃うまで「確認中…」／near失敗で「確認できませんでした」（Phase3の現状を維持）。
- 古ゾーン（展開後）: all月が全部揃うまで「古い未連絡を確認中…」／old失敗で「古い分を確認できませんでした」。
- 「0件で非表示/『古い未連絡はありません』」は**その範囲の全月が揃ったときだけ**到達。

---

## 4. アラート二段描画 `kbRenderUnnotifiedAlert_`（当日ビューのみ・書込ゼロ）★遅延展開
```
初期:
  ⚠️ 連絡未 1件（7/7）              ← near: eligible・赤・各日 kbJumpTo（現状の見た目・完全維持）
  ▽ 古い未連絡も確認する            ← old未取得: ボタンのみ（件数を出さない＝old月を取らない）

押下→old取得中:
  ⚠️ 連絡未 1件（7/7）
  古い未連絡を確認中…                ← 0件と断定しない

押下→揃った:
  ⚠️ 連絡未 1件（7/7）
  ほかに古い未連絡 12件 ▽（△で畳む） ← old: recordable && !eligible・控えめ・日付一覧を展開
     （6/29 ・ 6/20 … 各日 kbJumpTo）
```
- near赤は現状のまま（Phase3回帰固定を壊さない）。near 0件なら赤行なし。
- old は「未要求／取得中／失敗／N件／0件」を区別。展開状態・要求フラグは表示専用の状態（`kbState`本体を汚さない・書込ゼロ）。
- near・old ともに出すものが無ければボックス全体非表示。

---

## 5. TDD 実装ステップ（段階的・各Stepで全緑を確認してから次へ）

### Step A: 記録ボタンの範囲拡大（まず単独で）
- RED→GREEN: `kbPastContactRecordable_` 追加、7971行を差し替え。
- テスト: 過去日（第3営業日超も）で未対応なら記録ボタンが出る／当日は非常ガードのまま／done には出ない／12ヶ月超は出ない／書込・送信ゼロ維持。
- ここで一旦 全回帰＋変異（実装コミット後に `git checkout` 変異）→ 生出力提示。

### Step B: アラート二段構え（遅延展開UI）
- RED→GREEN: near集計はそのまま（`kbUnnotifiedInRange_` 維持）＋old集計関数を追加。`kbRenderUnnotifiedAlert_` を二段描画に。
  古ゾーンは初期「▽ 古い未連絡も確認する」ボタン。展開/要求状態は表示専用フラグ。
- テスト: near赤（現状回帰）／old未要求はボタンのみ（件数を出さない）／展開後の控えめ行・日付一覧＋kbJumpTo／
  両ゾーン0件で全体非表示／当日ビュー限定維持／書込ゼロ。

### Step C: old月の遅延取得（要求時のみ）
- RED→GREEN: `kbUnnotifiedMonthsNear_`/`kbUnnotifiedMonthsAll_`、old要求ハンドラ（押下で all−near を ensure）、near/old 失敗フラグ分離。
- テスト: 初回は near だけ ensure（JSONP本数が増えない）／押下で old 月を ensure ／old取得中は古ゾーン「確認中」（0件と断定しない）／
  old失敗で古ゾーン「確認できませんでした」／月跨ぎ・境界・I6型（片方失敗の後勝ち消滅なし）。

### 各Stepの規律（前2版で確立・継続）
- **実データ経路を突く**（`kbRenderChrome_`/`kbRenderUnnotifiedAlert_` を実駆動・DOM無しモックで済ませない）。
- **変異テスト**（故意にバグ→落ちる確認・毎回restore・最終diff空）。**★実装をコミットしてから**行う（前セッションで未コミット実装を消した事故の再発防止）。
- 各Step 生出力提示・要約報告禁止・`cd /c/tmp/wt-kbox-flicker` 毎回明示。

---

## 6. 触らない・制約（指示書§2）
- 書込ゼロ・送信ゼロ。`recordPastContact` POST 本体・`kbSubmitPastContact_` の記録処理は不変。
- 非接触: 当日ガード(kbIsViewToday_/N群)・当日フロー(kbExecuteSend/kbOpenSummary/kbOpenPreview)・
  メールゲート(send_box_cm_mails=1)・originガード(gnbGuardProdWrite=13)・モーダルポータル・JSONP・
  flicker 3state・版-33サマリー・版-34電話済み・版-36今日ボタン・欠席登録タブ。Phase4（実メール）非接触。
- GAS非接触（clasp不要）。
- 既存全テスト回帰ゼロ。ベースライン（実測済み 2026-07-09）:
  core59 / 構造109 / 3state27 / modal8 / JSONP15 / past-contact53 / summary-operator22 /
  phone-operator24 / unnotified-alert63 / today-button23 / picker31 / slots5。
  ※origin-guard の既知FAIL1件は版-29からの別トラック（基準線）。

## 7. 版ゲート（社長承認後・Step単位 or まとめて要相談）
fetch→本番現況版実測→bump(+1)→push前停止→承認→FF push(`feat/kbox-past-day-contact:master`)→
三点verify（SHA一致/本番version.txt/本番実コードにマーカー＋既存維持）→blob sha256突合。
★社長が本番で「古い未連絡に記録ボタンが出る／アラート二段が正しく出る」を確認するまで完了としない。

---

## 8. 設計判断（2026-07-09 社長確定）
- **古ゾーン = 遅延展開**。初回は near（赤）だけ取得＝JSONP本数を増やさない。古い分は「▽ 古い未連絡も確認する」押下時のみ old 月を取得し件数＋日付を展開。
- **版ゲート = まとめて1回**。Step A/B/C 全部を実装・全緑にしてから版-37を1回で本番反映。
