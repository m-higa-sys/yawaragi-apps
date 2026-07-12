# 中止チェックリスト ステージ構造改修 設計（第1便）

作成日: 2026-07-12 / 基準: **origin/master 起点**（作業ツリー feat/asa-board は本番より古く不使用）

## 目的
中止カードのチェックリストを実作業順に統一する：
**段階1(計画書・順不同) → リハブ中止(段階1完了かつ翌月11日で解禁・3状態表示) → 中止後の作業(科学的・ADL・順不同)**。
静的 callout（請求漏れ防止の注意書き）を廃止し、リハブ中止ステップ直下の**動的3状態ゲート表示**へ置換する。3面（leave-terminate / yawaragi-board / genba）を leave-terminate 形に統一。GAS は不触。

## 対象と現状（フェーズ0調査・origin/master）
| 面 | 段階2 | リハブ中止項目 | 日付ゲート | マスク変数 | ADLマスク |
|---|---|---|---|---|---|
| leave-terminate | リハブ中止 | あり | あり | isShienMode(要支援+事業対象) | あり |
| yawaragi-board | リハブ中止 | あり | なし | isShienMode | あり |
| genba | 科学的 | **なし** | なし | isNoKotraining(個訓専用) | **なし(全員表示)** |

## 目標レイアウト（案B・段階番号なし）
```
📋 リハブクラウド作業チェックリスト
段階1: この3つ(要支援・事業対象は2つ)を完了させる（順不同）
  ☐ 通所計画書  ☐ 個別機能訓練(要支援/事業対象は非表示)  ☐ 口腔機能向上
  〔リハブ中止 3状態ゲート表示〕     ← 静的callout廃止・この位置に置換
  ☐ リハブクラウドで利用中止操作     ← disabled = !stage1Done || cancelLocked
中止後の作業（順不同）                ← 段階番号なしの見出し
  ☐ 科学的介護推進体制  ☐ ADL維持等加算(要支援/事業対象は非表示)
```

## 3状態ゲート表示（リハブ中止項目の直下・callout置換）
判定順：
1. `!stage1Done` → 赤: 「⚠️ まだリハブで中止しないでください／先に段階1の書類を仕上げてください。」
2. `stage1Done && cancelLocked` → 赤: 「⚠️ まだリハブで中止しないでください／書類は完了。{unlockMD} 以降にOKになります。」
3. `stage1Done && !cancelLocked` → 緑: 「✓ リハブで利用中止にしてください／{lastUseMonth}月分の実績は確定済み。今から中止してOK。」

- `cancelLocked = trmIsCancelLocked(t.lastUseDate, toLocalDateStr())`
- `unlockMD = M/D`（trmCancelUnlockDate の月/日）、`lastUseMonth = 最終利用日の月`
- **ローカル日付・yyyy-MM-dd 文字列辞書順比較（new Date 生比較禁止・5時UTCズレ回避を維持）**

## 日付ゲート関数（移植元 leave-terminate）
- `toLocalDateStr(d)`: getFullYear/getMonth+1/getDate（ローカル）
- `trmCancelUnlockDate(lastUseDate)`: 解禁日 = 最終利用日の翌月11日 = `toLocalDateStr(new Date(y, m, 11))`（m=1-index月）
- `trmIsCancelLocked(lastUseDate, todayStr)`: `(todayStr||toLocalDateStr()) < unlock`（不明時 false=誤ロックしない）
- board / genba に無い分のみ移植（重複定義しない）

## 順不同（科学的・ADL）
- 両者の disabled = `!stage2Done`（stage2Done = stage1Done && rihab_chushi）。rihab_chushi 済みで**両者独立にチェック可**（片方が他方を待たない）。
- allDone = stage1Done && rihab_chushi && kagakuteki && (isShienMode || adl)。
- leave-terminate / board は既にこの挙動＝**案Bの見出し変更＋3状態表示＋callout削除が主**。
- genba は sequential（ADLが科学的待ち）→ 改修必要。

## マスク統一
- 3面とも `isShienMode = careLevel.indexOf('要支援')!==-1 || careLevel.indexOf('事業対象')!==-1`。
- genba: 変数名 isNoKotraining → isShienMode に統一。**ADLマスクを新規追加**（`isShienMode ? '' : ADL`）。個訓マスクの現挙動は維持。

## フェーズ・スコープ・版
| Ph | ファイル | 変更 | 版bump | diff |
|---|---|---|---|---|
| A | yawaragi-board.html | 日付ゲート移植+案B+3状態+callout削除 | 不要(no-store) | board単独 |
| B | leave-terminate.html | 案B+3状態+callout削除（ゲート既存） | 不要(gate外) | leave単独 |
| C | genba.html | リハブ中止新設+ゲート移植+順不同再編+isShienMode統一+ADLマスク+3状態+callout削除 | **必須** | genba+version.txt |
| D | gas コード.js | chushiApplicableKeys_ が目標と整合＝変更不要を確認（読取のみ） | 触らない | なし |

## 検証（各フェーズ render 実測）
- 状態遷移：段階1未完/完了・日付前/日付後・要介護/要支援/事業対象 の全ケースで表示・解禁が正しい。
- ★順不同：rihab_chushi 済みで「科学的だけ→ADL未成立」「ADLだけ→科学的未成立」両方が成立（片方が他方を待たない）。
- ★callout：静的callout削除で callout枚数=1（削除漏れなし）・位置がリハブ中止項目の直下。
- 個訓・ADLマスク：要支援/事業対象で個訓・ADL非表示、要介護で表示（退行なし）。

## 制約
- 各フェーズ着手前SHA記録・単独commit・push前後SHA一致実測。Cのみ版bump（bump-app-version.js経由）。A/Bは version.txt 不触。
- 隔離ワークツリー（origin/master起点）・認証/FF衝突で停止。genba版bumpは衝突時 FF拒否→次版振り直し。
- 個訓/ADLマスク・morningDigest・注意書き以外の文言/色は変えない。GASは不触。
