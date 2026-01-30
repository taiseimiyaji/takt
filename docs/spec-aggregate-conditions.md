# 集約条件 `all()` / `any()` 仕様

## 背景

パラレルステップでは複数のサブステップが並列実行される。各サブステップは自身のルールで結果（approved, rejected 等）を判定するが、親ステップが「全体としてどう遷移するか」を決定する必要がある。

現状、親ステップの遷移判定は結合テキストに対する `ai()` 評価かタグ検出しかない。しかし、「全員が承認したら次へ」「1人でも却下したらやり直し」といった集約判定はルールベースで十分であり、AI呼び出しは不要。

## 目的

パラレルステップの親ルールに `all("condition")` / `any("condition")` 構文を追加し、サブステップの判定結果をルールベースで集約する。

## YAML 構文

```yaml
- name: parallel-review
  parallel:
    - name: arch-review
      agent: ~/.takt/agents/default/architect.md
      rules:
        - condition: approved
          next: _
        - condition: rejected
          next: _
    - name: security-review
      agent: ~/.takt/agents/default/security-reviewer.md
      rules:
        - condition: approved
          next: _
        - condition: rejected
          next: _
  rules:
    - condition: all("approved")
      next: COMPLETE
    - condition: any("rejected")
      next: implement
```

## 式のセマンティクス

| 式 | 意味 |
|---|------|
| `all("X")` | 全サブステップの判定結果が `X` のとき真 |
| `any("X")` | 1つ以上のサブステップの判定結果が `X` のとき真 |

「判定結果」とは、サブステップのルール評価でマッチしたルールの `condition` 値を指す。

## エッジケースの定義

| ケース | `all("X")` | `any("X")` |
|--------|-----------|-----------|
| 全サブステップが X | true | true |
| 一部が X | false | true |
| いずれも X でない | false | false |
| 判定結果なし（ルール未定義 or マッチなし） | false | そのサブステップは判定対象外 |
| サブステップ 0 件 | false | false |
| 非パラレルステップで使用 | false | false |

`all()` は「全員が確実に X」を要求するため、判定不能なサブステップがあれば false。
`any()` は「誰か1人でも X」を探すため、判定不能なサブステップは無視する。

## 評価の優先順位

親ステップの `rules` 配列は先頭から順に評価される。各ルールの種類に応じた評価方式が適用される。

| 順位 | 種類 | 評価方式 | コスト |
|------|------|---------|--------|
| 1 | `all()` / `any()` | サブステップの判定結果を集計 | なし |
| 2 | 通常条件（`done` 等） | 結合テキストで `[STEP:N]` タグ検出 | なし |
| 3 | `ai("...")` | AI judge 呼び出し | API 1回 |

最初にマッチしたルールで遷移が確定する。`all()` / `any()` を先に書けば、マッチした時点で `ai()` は呼ばれない。

## 他の条件式との混在

同一の `rules` 配列内で自由に混在できる。

```yaml
rules:
  - condition: all("approved")          # 集約（高速）
    next: COMPLETE
  - condition: any("rejected")          # 集約（高速）
    next: implement
  - condition: ai("判断が難しい場合")      # AI フォールバック
    next: manual-review
```

## サブステップのルール

サブステップの `rules` はサブステップ自身の判定結果を決めるために使う。`next` フィールドはパラレル文脈では使用されない（親の `rules` が遷移を決定する）。スキーマ互換性のため `next` は必須のまま残し、値は任意とする。

## ステータスタグの注入

親ステップの全ルールが `all()` / `any()` / `ai()` のいずれかである場合、ステータスタグ（`[STEP:N]` 系）の注入をスキップする。タグ検出が不要なため。

## 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `src/models/types.ts` | `WorkflowRule` に集約条件フラグを追加 |
| `src/config/workflowLoader.ts` | `all()` / `any()` パターンの検出と正規化 |
| `src/workflow/engine.ts` | 集約条件の評価ロジックを追加 |
| `src/workflow/instruction-builder.ts` | ステータスタグスキップ条件を拡張 |
| テスト | パース、評価、エッジケース、混在ルール |
