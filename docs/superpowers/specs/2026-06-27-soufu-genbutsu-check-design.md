# ケアマネ送付チェックリスト：チェック基準「現物の有無」化（B）＋名称統一（A）設計

- 作成: 2026-06-27
- 対象: `ケアマネ送付チェックリスト.html` のみ（frontendのみ・**GAS/clasp不要**・チェック状態は localStorage `yawaragi_cm_send_progress_v1`）
- 土台: origin/master `5b3e00a` の上にクリーンに載る。作業3（#4・shared.js §I/個訓/通所）とは非干渉。
- A（名称統一）は実装済み（「第一号」→「支・測定」）。本書はB＋全体まとめ。

## 確定仕様（社長確定の3分岐）

- **分岐1**: 送付方法での出し分けを**外す**。書類チェックは方法に関係なく「**現物 or PDF があれば1チェック**」。
- **分岐2**: **全書類で「現物あればチェック」に統一**。署名書類の3段階（印刷→サイン→スキャンPDF）を**1チェックに集約**。実績/モニ/体測の「印刷」も「現物」基準の1チェックに。
- **分岐3**: **マイグレーションを入れる**。6月分など既存チェックを新基準へ引き継ぐ（リセットしない）。

## スコープ境界（重要）

- **対象＝書類準備チェック**：実績・通所モニ・個別計画書・通所計画書・口腔・個訓評価・支・測定・体測。
- **対象外＝送付アクション層**（[L814-831](../../../ケアマネ送付チェックリスト.html#L814-L831)）：`書類をまとめる/封筒詰め/PDF結合済/⚠️10ページ以内/送付済(sent)`。これは「どう届けるか」の工程で本質的に方法依存。**Bは触らない**（社長指定は書類のみ）。
- 個訓評価(`hyouka`)はGAS側状態(PDF/印刷pill)で従来通り。1チェック化の対象外（既に単独）。

## 新しいチェック項目モデル（getCheckItems 書類部）

| 書類 | 旧 | 新（単一キー・方法非依存） |
|---|---|---|
| 実績 | jisseki / jisseki_print | **`jisseki`** 「🔴実績」 |
| 通所モニ(shien) | monitoring / monitoring_print | **`monitoring`** 「(✍)通所モニ」 |
| 個別計画書(hasNewPlan) | trainPrint/trainSign/trainScan | **`train`** 「個別計画書」 |
| 通所計画書 | tsushoPlan（既に単独） | `tsushoPlan`（不変） |
| 口腔 | oralPlan（既に単独） | `oralPlan`（不変） |
| 個訓評価 | hyouka（特殊pill） | `hyouka`（不変） |
| 支・測定(shien) | evalPrint/evalSign/evalScan | **`eval`** 「支・測定」 |
| 体測 | measure / measure_print | **`measure`** 「体測」 |

- `isPhysical`/`isDigital` は書類部で不要になるため削除（送付アクション層は `m === 'FAX'` 等で直接判定・不変）。

## 波及して直す箇所

1. **SKIP_GROUPS**（[L593-599](../../../ケアマネ送付チェックリスト.html#L593-L599)）: `keys` を新単一キーへ（jisseki/monitoring/train/eval/measure）。**グループキー名(gKey)は不変**＝既存 `override.skip` はそのまま効く。
2. **KEY_LABELS**（[L617-636](../../../ケアマネ送付チェックリスト.html#L617-L636)）: 繰越表示用。新キー `train`/`eval` 追加、jisseki/monitoring/measure を現物文言へ。旧段階キーは migration で消えるので不要。
3. **印刷用チップ**（[L2150-2160](../../../ケアマネ送付チェックリスト.html#L2150-L2160)）: 「印刷→サイン→スキャンPDF」「印刷/PDF」の方法分岐を除去し書類名のみ。
4. **切替ハンドラ**（[L1573-1606](../../../ケアマネ送付チェックリスト.html#L1573-L1606)）: data-key汎用＝**変更不要**。

## マイグレーション（loadProgress 内・既存 'next' 変換の直後）

各 利用者×月 オブジェクトに対し、新キーへ集約：

```
const MIG_B = [
  { nk:'jisseki',    done:['jisseki','jisseki_print'],       drop:['jisseki_print'] },
  { nk:'monitoring', done:['monitoring','monitoring_print'], drop:['monitoring_print'] },
  { nk:'measure',    done:['measure','measure_print'],       drop:['measure_print'] },
  { nk:'train',      done:['trainSign','trainScan'],          drop:['trainPrint','trainSign','trainScan'] },
  { nk:'eval',       done:['evalSign','evalScan'],            drop:['evalPrint','evalSign','evalScan'] },
];
```

- 「現物あり」の判定キー＝**サイン済 or スキャンPDF**（train/eval）。実績/モニ/体測は印刷 or PDF のどちらか。
- `done` のいずれかが true → 新キー true（**完了は引き継ぐ**）。
- `_next`（繰越）も同様に新キーへ移送。
- `drop` の旧キー（新キー自身を除く）と その `_next` を削除。
- ⚠️ 「**印刷だけ**(trainPrint/evalPrint)で止まっていた途中状態」は新基準では“現物なし＝未チェック”になる（完了済みの取りこぼしではない。署名・PDF・印刷物いずれかが立っていれば引き継ぐ）。

## 確認観点（社長の実機チェック）

1. 全書類が「現物あればチェック」の**1チェック**になっている。
2. 送付方法で出し分けされていない（持参でも メールでも同じ1チェック）。
3. **6月の既存チェックが消えていない**（サイン/スキャン/印刷PDF済みは✅のまま）。
4. 「支・測定」表記（A）。
5. 送付アクション層（書類をまとめる/送付済 等）は従来どおり残っている。

## デプロイ

frontendのみ・版ゲート対象外（no-cache）＝bump不要。実機OK → `5b3e00a` からの `--stat` で本ファイル単独・他混入なし目視 → 社長go → worktree cherry-pick push → SHA一致 → 本番実測。
