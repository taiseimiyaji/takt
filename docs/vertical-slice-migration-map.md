# Vertical Slice + Core ハイブリッド構成 マッピング案

## 目的
- CLI中心の機能（コマンド）を slice 化し、変更影響を局所化する。
- Workflow Engine などのコアは内向き依存（Clean）で保護する。
- Public API（`index.ts`）で境界を固定し、深い import を避ける。

## 依存ルール（簡易）
- `core` は外側に依存しない。
- `infra` は `core` に依存できる。
- `features` は `core` / `infra` / `shared` に依存できる。
- `app` は配線専用（入口）。

## 移行マップ

### 1) app/cli（CLI入口・配線）
```
src/cli/index.ts        -> src/app/cli/index.ts
src/cli/program.ts      -> src/app/cli/program.ts
src/cli/commands.ts     -> src/app/cli/commands.ts
src/cli/routing.ts      -> src/app/cli/routing.ts
src/cli/helpers.ts      -> src/app/cli/helpers.ts
```
- `app/cli/index.ts` は CLI エントリのみ。
- ルーティングは `features` の Public API を呼ぶだけにする。

### 2) features（コマンド単位）
```
src/commands/index.ts                      -> src/features/tasks/index.ts
src/commands/runAllTasks.ts                -> src/features/tasks/run/index.ts
src/commands/watchTasks.ts                 -> src/features/tasks/watch/index.ts
src/commands/addTask.ts                    -> src/features/tasks/add/index.ts
src/commands/listTasks.ts                  -> src/features/tasks/list/index.ts
src/commands/execution/selectAndExecute.ts -> src/features/tasks/execute/selectAndExecute.ts
src/commands/execution/types.ts            -> src/features/tasks/execute/types.ts

src/commands/pipeline/executePipeline.ts   -> src/features/pipeline/execute.ts
src/commands/pipeline/index.ts             -> src/features/pipeline/index.ts

src/commands/switchWorkflow.ts             -> src/features/config/switchWorkflow.ts
src/commands/switchConfig.ts               -> src/features/config/switchConfig.ts
src/commands/ejectBuiltin.ts               -> src/features/config/ejectBuiltin.ts
```
- `features/tasks` は run/watch/add/list の共通入口を持つ。
- `features/pipeline` は pipeline モードの専用 slice。
- `features/config` は設定系（switch/eject）を集約。

### 3) core/workflow（中核ロジック）
```
src/workflow/engine/*        -> src/core/workflow/engine/*
src/workflow/instruction/*   -> src/core/workflow/instruction/*
src/workflow/evaluation/*    -> src/core/workflow/evaluation/*
src/workflow/types.ts        -> src/core/workflow/types.ts
src/workflow/constants.ts    -> src/core/workflow/constants.ts
src/workflow/index.ts        -> src/core/workflow/index.ts
```
- `core/workflow/index.ts` だけを Public API として使用。
- `engine/`, `instruction/`, `evaluation/` 間の依存は内向き（core 内のみ）。

### 4) core/models（型・スキーマ）
```
src/models/schemas.ts        -> src/core/models/schemas.ts
src/models/types.ts          -> src/core/models/types.ts
src/models/workflow-types.ts -> src/core/models/workflow-types.ts
src/models/index.ts          -> src/core/models/index.ts
```
- `core/models/index.ts` を Public API 化。

### 5) infra（外部I/O）
```
src/providers/*     -> src/infra/providers/*
src/github/*        -> src/infra/github/*
src/config/*        -> src/infra/config/*
src/task/*          -> src/infra/task/*
src/utils/session.ts -> src/infra/fs/session.ts
src/utils/git/*     -> src/infra/git/*
```
- GitHub API / FS / Git / Provider など外部依存は `infra` に集約。

### 6) shared（横断ユーティリティ）
```
src/utils/error.ts  -> src/shared/utils/error.ts
src/utils/debug.ts  -> src/shared/utils/debug.ts
src/utils/ui.ts     -> src/shared/ui/index.ts
src/utils/*         -> src/shared/utils/* (外部I/O以外)
```
- 共有は `shared` に集めるが、肥大化は避ける。

### 7) docs（参照パス修正）
```
docs/data-flow.md           -> パス参照を app/core/features に合わせて更新
`src/cli.ts` 参照           -> `src/app/cli/index.ts` に更新
`src/workflow/state-manager.ts` 参照 -> `src/core/workflow/engine/state-manager.ts`
`src/workflow/transitions.ts` 参照  -> `src/core/workflow/engine/transitions.ts`
```

## Public API ルール
- `core/*` と `features/*` は **必ず `index.ts` から import**。
- 深い import（`../engine/xxx` など）は禁止。

## 移行順序（推奨）
1. `core/` に workflow + models を集約
2. `infra/` に外部I/Oを移動
3. `features/` にコマンド単位で集約
4. `app/cli` にエントリを移す
5. Public API を整理し、深い import を排除
6. docs の参照を更新

## 備考
- `src/workflow/index.ts` は `core/workflow/index.ts` に移し、外部からはここだけを参照。
- `src/models/workflow.ts` のようなプレースホルダは廃止するか、`core/models/index.ts` へ統合する。
