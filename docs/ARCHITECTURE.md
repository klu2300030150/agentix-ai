# Agentix architecture and security boundaries

## Process boundaries

- **Renderer** (`src/renderer`) is a React UI. It does not import Node APIs or receive API secrets directly from the main process.
- **Preload** (`src/preload`) exposes a narrow set of typed IPC methods. The renderer has no direct Node integration.
- **Main** (`src/main`) owns native dialogs, SQLite, provider calls, command execution, preview process management, and checkpoints.
- **Agent services** (`src/agent`) contain model integration and workspace path controls.

## Agent execution

The agent receives a workspace inventory and recent conversation history. The model is instructed to return a constrained JSON action list. Only allowlisted tool names are dispatched; every action is executed in code and its actual result is fed back to the model. Invalid JSON does not run tools. Cycle budgets are bounded. Task state is persisted in SQLite and a running task is marked paused on startup.

## Workspace protection

All file operations resolve against an explicitly selected root. Parent traversal, symlinks, secret-like paths, oversized files, common generated directories, and automatic `.env` reads are blocked. Writes verify the resolved parent path. These controls reduce accidental cross-workspace access but are not a substitute for running the whole application under a restricted OS account.

## Terminal and preview

Commands are started from the selected workspace directory and require a native approval dialog. Output is capped and commands time out. Approval is not a sandbox: a command can still access other resources using the user's OS permissions, so users must inspect commands before approving them. Preview processes are launched only after approval, with localhost host hints for common dev servers.

## Persistence

SQLite in Electron's app user-data folder stores conversations, messages, settings, checkpoints, tasks, feedback queue entries, and audit events. Checkpoints are eligible text-file snapshots, not full disk or Git snapshots.

## Provider configuration

The Hugging Face SDK is used for chat completions; the OpenAI-compatible path calls `/chat/completions` on a configurable endpoint and supports optional bearer authentication for local endpoints such as Docker Model Runner. Provider-specific validation requires a Hugging Face token only for the Hugging Face provider. Provider availability and model tool-call capability vary. The current loop uses JSON action plans rather than native function calling, validates returned JSON, and reports provider errors. The E2B endpoint creates a disposable Python code-interpreter sandbox and kills it after each run.
