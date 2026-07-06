# 欠席box 移設＋polish 設計書（design.md）

- 日付: 2026-07-07
- ブランチ: feat/genba-kbox-date-view（土台=現HEAD eede196・全緑・版2026-07-04-24）
- 対象: genba.html のみ（GAS非接触・フロントのみ）
- 前提: 現緑ビルド(-24)は**破棄せず土台**。この上に5点を1パスで乗せてから版を上げ直す。
- 上位設計: [2026-07-06-genba-kesseki-box-kako-mirai-view-design.md](./2026-07-06-genba-kesseki-box-kako-mirai-view-design.md)（過去+未来ビューの土台）

---

## 0. 実コード接地（現状の事実・調査済み）

| 要素 | 現在地 | 行 |
|---|---|---|
| boxのHTML `#kbox-section` | **欠席登録タブ** `#tab-absence` 内・最上部 | 1555–1574 |
| タイトル `📮 本日の欠席連絡` | box見出し | 1558 |
| 日付帯ラベル `#kbox-datelabel` | box内・`font-weight:700; min-width:8em`（サイズ指定なし） | 1566 |
| ◀▶日付送り `kbGoDate(±1)` | box内 | 1565–1567 |
| 未来欠席チップ `#kbox-jumpchips` | box内・`kbRenderChrome_`が描画 | 1570 / 7594 |
| 出席予定タブ本体 `#tab-attendance` | 独立タブ | 1508–1520 |
| タブ切替フック（attendance） | `attLoad()` + `absLoadLongTermList()` | 2754–2758 |
| タブ切替フック（absence） | `absRenderTodayList(); absRenderUpcomingList(); kbInit()` | 2761 |
| ページロード初期化 `absInit()` | `absInitReceptionist()` + `kbInit()` | 2731 / 7335–7350 |
| 受付者(操作者)機構 `absReceptionist` | **global + localStorage 永続** | 7297/7301/7318 |
| 受付者セレクタUI `#abs-receptionist-card` | **欠席登録タブ内**（欠席登録フォームも同値を使用: 5264/5299/5481/5506） | 1577–1580 |
| AM/PM 分類の実体 | 専用classifierは無く `it.unit`（`'午前'`/`'午後'`/`'終日'` 文字列）がそのまま分類 | 7554 |
| 送信対象抽出 `kbCollectSendTargets_` | `kbState.items` を辿る（**1人1エントリ**・checked[name]鍵） | 7697–7699 |
| 月キャッシュ `attMonthAbsCache` / `attEnsureMonthAbsences` | 共有・**月命中時は再取得しない冪等**（`if(attMonthAbsCache[ym]){cb();return;}`） | 6389/6519–6523 |

---

## 1. 移設（最重要）: 欠席box を 欠席登録タブ → 出席予定タブ へ

### 1-1. DOM移設
- `#kbox-section`（1555–1574）を `#tab-absence` から切り出し、`#tab-attendance`（1508）の**最上部**（`att-date-bar` の直前、`<div id="tab-attendance">` 直後）へ移設。
- 欠席登録タブからは撤去（`#kbox-section` を消す）。**受付者カード `#abs-receptionist-card` 以下（欠席登録フォーム等）は欠席登録タブに残す**（欠席登録の機能は移設対象外・非接触）。

### 1-2. 初期化配線の移設（f774228型回避＝新id依存をinit連鎖に差し込まない）
- **attendanceフック(2754)** に `try { kbInit(); } catch(e){ console.warn('kbox init skip', e); }` を**独立の1文として後付け追記**（`attLoad()` の後）。attLoadの初期化連鎖にkboxを混ぜず、失敗しても attLoad を止めない。
- **absenceフック(2761)** から `kbInit()` を**撤去**（`absRenderTodayList(); absRenderUpcomingList();` は残す）。
- **ページロード `absInit()`(7349) の `kbInit()` は残す**（DOM上は全タブが存在するので、初期タブがdengonでもboxは初期化される＝現行と同じ挙動・回帰ゼロ）。
- `kbInit()` は既に**要素不在ガード** `if(!sec) return;`（7398–7401）を持つ＝移設後にどのタブから呼ばれても安全。これがf774228回避の核。**新idをinitの前提にする構造は作らない**（kbInitは常にguard付きで独立呼び出し）。

### 1-3. 操作者(受付者)導線 — 移設に必然的に付随する判断点 ★要レビュー
boxは操作者 `absReceptionist` に依存（kbRender 7521「先に上の受付者を選んでください」・送信/電話に必須）。だが選択UI `#abs-receptionist-card` は欠席登録タブに残す（欠席登録フォームも使うため）。boxだけ移設すると「上の受付者を選ぶ」導線が別タブに分離し、**"出席予定タブ単独完結"（別タブ前提依存禁止）に反する**。

- **採用案（推奨）**: box内に**コンパクトな操作者行を1つ埋め込む**（box見出し下）。名簿は既存 `getStaff() − EXCLUDED_STAFF` を流用、タップは**既存 `absSelectReceptionist(name, btn)` をそのまま呼ぶ**（global+localStorage更新＋既存で `kbRender()` 再描画も済 7332）。欠席登録タブの受付者カードとは**同じglobal/localStorageを共有**するので常に同期。欠席登録フォームは非接触。新分類・新状態は作らない（既存関数の再利用のみ）。
- **却下案**: boxはそのまま「欠席登録タブで受付者を選んでください」と誘導 → **別タブ前提依存**で handoff 明示禁止に抵触。

> 判断: 採用案（box内に操作者行を再利用実装）で自己完結させる。※この操作者行は5点に明記されていない「移設の必然的付随物」なのでレビューで承認可否を確認。

### 1-4. 二重fetch非発生の担保（同居しても競合しない）
- `attEnsureMonthAbsences` は月命中時 `cb()` 即returnの**冪等**。attendanceタブ本体もkboxも同じ `attMonthAbsCache` を共有 → 先に読んだ方がキャッシュを埋め、後は命中で再取得しない。**移設で新たな二重fetchは生まれない**（既存設計のまま）。
- kbox側の `kbRenderForDate` は `!attMonthAbsCache[ym] && kbState._ensuringYm !== ym` の二重ガード(7458)で同一月ensureの多重呼びも防止済。box自身が閲覧月ロードを保証する既存設計（kbox起点ロード）は維持。
- 構造証明で「attendanceタブ単独でbox描画・欠席登録タブ非依存・二重fetchなし」を固定する（§7）。

---

## 2. リネーム: 「本日の欠席連絡」→「欠席box」

- 1558 の `📮 本日の欠席連絡` → `📮 欠席box`。"本日"を外す（◀▶で他日に動くので"本日"は自己矛盾・日付は帯で表示）。
- ヘルプモーダル見出し 1617 `📮 本日の欠席連絡の使い方` → `📮 欠席box の使い方`（文言整合）。
- 空リスト時の文言(7532) `'本日'/'M/D(曜)'の欠席はありません` は既に当日判定で出し分け済＝そのまま（"本日"は当日時のみ表示で自己矛盾なし）。

---

## 3. 日付ジャンプ追加: ネイティブ `<input type="date">` 1個

- box内 `#kbox-datenav`（◀▶帯）に `<input type="date" id="kbox-datepicker">` を1個追加（◀▶の隣）。月グリッドは作らない。
- `onchange` → 既存 `kbJumpTo(value)`（7492: viewDate設定→`kbRenderForDate`）。過去日・欠席なし日にも一発ジャンプ（◀▶連打解消）。
- 当日/未来/過去ガードは**既存のまま**（kbRender内 `kbIsViewToday_` で送信・電話・チェックを当日限定・関数レベルガードN群も不変）。
- 描画後、`kbRenderChrome_` で `#kbox-datepicker.value` を現在の `viewDate` に同期（帯・チップ・pickerの表示一致）。

---

## 4. AM/PM枠: 欠席カードを AM群 / PM群 にグループ分け（訂正版・簡素化）

**前提訂正（2026-07-07 社長）**: yawaragiに同一日AM/PM併用利用者は存在しない。1人の欠席は同一日で必ずAM/PMどちらか一方（宮崎氏のように"日によってユニットが違う"利用者は居るが、1日の中では片方のみ）。→ **終日概念・両群同時表示は実装しない。二重送信/二重電話の追加挙動証明(a)(b)も不要**（既存の `kbState.items` 1人1エントリ・二重送信ガードN群がそのまま効く）。

- **既存 `it.unit`（'午前'/'午後'）を流用**（新分類を作らない）。
- kbRender のカード生成を**表示のみのバケット**に分ける（`kbState.items` 配列は非重複のまま）。各カードは it.unit に従い **AM群 または PM群 に1回だけ**入る（両群同時表示なし）:
  - `it.unit` に '午前' を含む → AM群
  - `it.unit` に '午後' を含む → PM群
- 各群の見出しに「AM」「PM」を**四角バッジ（枠囲み）**で表示。群が空なら見出しごと非表示。
- **害なき防御（実運用では発生しない前提）**: `it.unit` が '午前'/'午後' 以外（終日/空/不明）だった場合も**カードを消さない**フォールバックを1本だけ置く（既定=PM群末尾に回す。理由: 消失＝データ欠落バグの回避。#4 dedupテスト残置と同じ思想の"害なき防御"）。**終日を専用群にしたり両群表示したりはしない**（あくまで消えないための1行フォールバック）。
- 送信整合性の追加証明は不要（送信/サマリー/バッジは既存どおり `kbCollectSendTargets_`/`kbState.items` を辿る 7697–7699・checked[name]名前鍵）。

---

## 5. 日付表示拡大: 帯の日付フォントを大きく

- `#kbox-datelabel`（1566）に `font-size` を追加（現状=指定なし≒1rem）。案: `font-size:1.35rem`（視認性向上・◀▶ボタンと縦位置バランスを崩さない範囲）。
- `kbRenderChrome_`(7591) の描画内容（`kbFmtChip_(viewDate) + '（今日）'`）は不変＝サイズのみ拡大。

---

## 6. 非接触（削除ゼロ維持・回帰ゼロ）

移設・polishで以下は一切触らない/壊さない（構造証明で本数固定）:
- originガード `gnbGuardProdWrite` ×11
- カレンダー式ピッカー（欠席登録の既存）
- ②改名3・メールゲート `send_box_cm_mails` 5
- 当日ガードN群（kbExecuteSend/kbMarkPhoneDone 各先頭・fetch前・副作用ゼロ先行）
- 欠席登録タブの他機能（受付者カード・欠席登録フォーム・長期休み一覧 等）
- kbState/純関数（kbAddDaysYMD_/kbUpcomingAbsenceDates_/kbMergeDedupAbs_/kbIsViewToday_/kbJstYmdFromEpoch_ 等）＝ロジック不変・移設は描画先と配線のみ

---

## 7. TDD（承認後 writing-plans → RED→GREEN）

土台テスト `scripts/test-genba-kesseki-box.js`（core44 + 構造証明41）に**追加**（既存は壊さない）。移設は主にHTML構造・配線なので構造証明を厚くする:

**移設の構造証明（新規）**
- box `#kbox-section` が `#tab-attendance` 内に存在し、`#tab-absence` 内に存在しない（移設完了）。
- attendanceフック(2754ブロック)に `kbInit(` が含まれ、absenceフック(2761ブロック)に `kbInit(` が**含まれない**（配線移設）。
- `kbInit` は要素不在ガード `if(!sec)return`（or同等）を先頭に持つ（f774228回避＝新id依存をinitに作らない）。
- 操作者行がbox内に存在し、タップが既存 `absSelectReceptionist` を呼ぶ（自己完結・再利用）。
- 二重fetchなし: `attEnsureMonthAbsences` の月命中early-return と kbox `_ensuringYm` ガードの両方が生存（ソース存在証明）。

**polish の構造証明（新規）**
- タイトルが `欠席box`・`本日の欠席連絡` の見出し文字列が消えている（リネーム）。
- `#kbox-datepicker`（type=date）が存在し onchange が `kbJumpTo` 経路（日付ジャンプ）。
- AM/PMバッジ（四角枠）の描画分岐が kbRender に存在・群見出し「AM」「PM」。各カードは1群に1回だけ（両群表示ロジックなし）。
- `#kbox-datelabel` に拡大font-size指定が存在（日付拡大）。

**回帰防止（本数不変）**
- 当日ガード6/6・kbGoDate生存・originガード11本・メールゲート5・②改名3 の本数不変。
- （※終日両群表示の証明(a)(b)は前提訂正により削除。#4 dedupテスト＝同一人物同一日AM/PM別カードは"実運用では起きない防御"として残置＝害なし。）

**合格条件**: `node scripts/test-genba-kesseki-box.js` で既存全緑を維持しつつ新規追加も全緑。

---

## 8. 版（最後にまとめて上げ直す・push保留継続）

- 5点＋テスト全緑が乗ってから、現-24を土台に **bump-script で -25 へ繰り上げ再bump**（通し連番＝日付据え置き `2026-07-04-25`・案A commit止め）。
- push直前に origin/master 再前進チェック（前進していれば再rebase＝版も繰り上げ再提案）。
- push禁止ゲート（社長の手動2件OK＋push承認＋再前進チェック）は従来どおり継続。

---

## 9. 実装順（承認後）

1. writing-plans で RED（構造証明・純関数の失敗テストを先に追加）
2. §2 リネーム → §5 フォント（低リスク文字列/CSS）
3. §1 DOM移設 + 配線（attendance/absenceフック・操作者行）
4. §3 datepicker → §4 AM/PM群
5. 全緑確認（既存44+41＋新規）→ 非接触本数確認 → §8 bump（commit止め）
6. push前で停止・rebase結果/diff/再緑を提示

**← ここまでが spec。実装には入らず、本design.mdをレビュー承認後に writing-plans へ。**
