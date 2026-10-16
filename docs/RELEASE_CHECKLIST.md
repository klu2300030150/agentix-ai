# Release verification checklist

- [ ] `npm install` completes on target OS.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` completes.
- [ ] Electron opens and closes cleanly.
- [ ] OS credential encryption is available; verify tokens never appear in SQLite plaintext.
- [ ] Open a disposable test project and confirm its path and tree.
- [ ] Confirm path traversal and symlink escape tests pass.
- [ ] Confirm secret files are excluded from file listings and reads.
- [ ] Configure a valid Hugging Face model and test a real request.
- [ ] Approve and decline terminal commands; verify real output and exit codes.
- [ ] Run an existing project's build/tests and check the evidence in Activity.
- [ ] Start, health-check, open, and stop a preview server.
- [ ] Configure E2B and run a small Python snippet; confirm the sandbox is killed after execution.
- [ ] Create a checkpoint and restore it in a disposable project.
- [ ] Close/reopen the app and verify chats and paused task state persist.
- [ ] Package the app for each supported OS on that OS.
