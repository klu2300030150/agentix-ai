# Agentix AI

Agentix AI is a local-first desktop coding-agent starter built with Electron, React, TypeScript, SQLite, Hugging Face Inference, and optional E2B code-interpreter sandboxes. It is designed to work on a real, explicitly selected project folder—not a demo project hidden inside the app.

## What is implemented

- Electron desktop shell with `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, and narrow preload IPC.
- Persistent SQLite conversation history, model settings, feedback submissions, checkpoints, and audit events.
- Real workspace picker, file tree, file read/edit/save, text search, and workspace-root path checks. Secret-like files and symlink escapes are excluded/blocked.
- Hugging Face chat completion integration and configurable OpenAI-compatible Hugging Face Router endpoint. API credentials are not inserted into conversation text.
- Agent orchestration loop with bounded cycles, real tool calls (`inspect_project`, `list_files`, `read_file`, `search_files`, `write_file`, `run_command`, `verify_completion`), recorded results, and a Continue Task flow for paused work. The agent is instructed to stop when the requested outcome is verified; repeating the same consecutive action plan stops the task with an explicit no-progress reason.
- User approval dialog for terminal commands; command output and exit status are captured. Commands are limited to the selected workspace as their working directory, with timeout/output caps.
- Preview process launcher for `npm run dev`, `npm run start`, and a basic `index.html` project, plus URL display, stop, and HTTP health check.
- Snapshot checkpoints and explicit confirmation before restoration.
- Feedback is persisted to a separate queue rather than injected into active chat.
- E2B Python code execution through a disposable E2B sandbox when an E2B key is configured (Settings currently stores the key; the call is available through the preload API for a future dedicated sandbox UI).
- Vitest workspace tests.

## Requirements

- Node.js 20+ and npm.
- A Hugging Face token with inference permissions for the selected model. Model availability and tool capabilities depend on the provider/model/account.
- Optional E2B API key for isolated Python execution.

## Quick start

```bash
npm install
npm run dev
```

Run checks:

```bash
npm test
npm run typecheck
npm run build
```

Create a distributable for your current OS:

```bash
npm run package
```

The first Electron/native dependency install may require build tools for `better-sqlite3`. If installation fails, install the supported compiler/build tools for your OS and rerun `npm install`.

## Configure providers

Open **Settings & API keys** in Agentix and enter your Hugging Face token. The default model is `Qwen/Qwen2.5-Coder-32B-Instruct`; availability can change and may depend on Hugging Face routing/permissions. If that model is not served for your account, choose another currently available chat-completion model. Use the connection test to surface actual API errors.

For OpenAI-compatible routing, select that provider and set the endpoint, for example `https://router.huggingface.co/v1`, with a model ID accepted by that endpoint. This uses `/chat/completions` and reports HTTP/provider errors instead of fabricating success.

For a Microsoft Foundry Azure OpenAI deployment, select **OpenAI-compatible / Azure Foundry**, enter the base endpoint from the code sample (for example, `https://your-resource.openai.azure.com/openai/v1/`), use the deployment name as the model ID, and enter the API key in Settings. Azure requests use the `api-key` header and Responses API. If the v1 Responses route returns 404, Agentix retries the legacy `/openai/responses?api-version=2025-04-01-preview` route. The key is stored using Electron `safeStorage`. Model discovery is optional and its failure does not determine whether inference works; use **Test connection & inference** to make a real inference request.

For Docker Model Runner, select **OpenAI-compatible endpoint** and use:

```text
Endpoint: http://localhost:12434/engines/v1
Model ID: docker.io/ai/smollm2:360M-Q4_K_M
API token: leave blank
```

Agentix sends the request to `/chat/completions`. Docker Model Runner does not require a Hugging Face token. The **Use Docker Model Runner (local)** preset fills these values in for you.

For Amazon Bedrock, select **Amazon Bedrock**, choose a Bedrock model ID, and set the AWS region (the preset uses `amazon.nova-lite-v1:0` in `us-east-1`). Agentix uses the AWS SDK default credential chain; configure an AWS profile with `AWS_PROFILE`, or provide `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_SESSION_TOKEN` as environment variables before launching Electron. The IAM identity needs permission for `bedrock:InvokeModel` and model access must be enabled in the selected region. AWS credentials are not stored in Agentix.

Never commit `.env`, tokens, or private keys. `.env.example` contains placeholders only. The settings database is stored under Electron's app user-data directory; API keys are encrypted with Electron safeStorage when the OS credential backend is available. Agentix refuses to save non-empty API keys if encryption is unavailable.

## Workspace and security notes

- Use **Open project folder** to choose the actual project. Agentix does not copy that folder into its own repository.
- Filesystem operations reject `..` escapes, skip symlinks, skip common generated/dependency folders, and block secret-like files.
- Terminal commands always require an approval dialog and execute with the selected workspace as their working directory. This is a developer tool; inspect each command before approving it. The approval dialog is not a full operating-system sandbox.
- The preview runs locally and should only bind to loopback. Review project scripts before running them.
- Checkpoint restore overwrites matching files; confirm before restoring and create a new checkpoint first if you need to preserve the current state. This basic snapshot does not delete files created after the checkpoint.
- Model responses are parsed as structured JSON before tool actions are run. Invalid JSON does not execute actions. Cycle count is bounded; a repeated consecutive action plan stops as blocked rather than being run again, and a paused task can be continued manually.
- Completion claims should be checked against the activity panel and actual build/test output. Browser-based screenshot/console verification and a full visual-regression harness are not included yet.

## Project structure

- `src/main` — Electron main process, IPC handlers, SQLite, preview, terminal approvals.
- `src/preload` — narrow renderer bridge.
- `src/renderer` — React application, explorer/editor, chat, activity, preview, settings.
- `src/agent` — workspace guard and model provider integration.
- `src/shared` — IPC/UI types.
- `tests` — workspace boundary tests.
- The supplied Python SpongeBob AI archive is retained locally for architecture review but is excluded from this repository because it has no redistribution license.

## Known limitations before production

1. Model orchestration uses a constrained JSON action protocol, not provider-native function/tool calling; unsupported models may fail to follow it. The app validates JSON and refuses to execute actions when parsing fails.
2. Credentials are stored in the local SQLite settings row; OS keychain integration is recommended before production.
3. The E2B code runner executes Python in a disposable remote sandbox; it is separate from the selected local workspace and does not sync workspace files into the sandbox automatically.
4. Checkpoints snapshot eligible text files only; they do not capture binary assets or remove newly created files on restore.
5. Preview URL detection depends on common dev-server log formats; unsupported project types need a custom launch profile.
6. Command approval is a confirmation boundary, not a robust sandbox. Do not approve untrusted/destructive commands.
7. Provider-native tool calls, browser automation, and a reviewed feedback-lesson approval workflow remain extension points rather than completed features. Image generation depends on Hugging Face model access/availability and may be denied for some accounts.

## SpongeBob AI reference

The supplied `spongebob-ai-main` source is retained locally under `reference/` for architecture review. It is not imported as runtime code; Agentix's current implementation is TypeScript. The archive has no redistribution license, so it is excluded from this repository.
