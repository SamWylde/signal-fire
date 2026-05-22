# signal-fire

## Always rebuild after pushing

After any `git push`, run `pnpm build` before reporting done. The user launches the desktop app via the "Signal Fire" shortcut on their Windows desktop, which runs `scripts/launch-desktop.vbs` → `node dist/desktop/launch.js`. The launcher uses the compiled `dist/` — it does NOT auto-rebuild — so unless you run `pnpm build` after pushing, the next launch will execute stale code.

Workflow after push:
1. `pnpm build`
2. Tell the user to close the running Signal Fire window and relaunch from the shortcut.

There is no electron-builder / electron-forge installer — `dist/` is the only build artifact.
