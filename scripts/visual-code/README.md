# Visual-code renderer

Operator setup and recovery: [deployment guide](../../apps/docs/content/deployment/visual-code-renderer.mdx).
Creator/API behavior: [Motion guide](../../apps/docs/content/guides/visual-code.mdx).

The coordinator is a trusted Linux-only service. Submitted source executes only inside its fixed, isolated runsc image. Required configuration is `VISUAL_CODE_STATE_DIR` (persistent private0700 directory) and `VISUAL_CODE_RENDERER_TOKEN` (32+ characters). Start with `node scripts/visual-code/coordinator.mjs`. One process holds the state lock; maximum concurrency is two jobs. State admission stops at16GiB; no automatic receipt deletion. Keep provider/application credentials off this host.

Run protocol/coordinator units with `node --test scripts/visual-code/*.test.mjs`. Actual isolation acceptance requires Linux, installed runsc/Docker/FFmpeg and the built image: `node scripts/visual-code/isolation-acceptance.mjs`. Its artifacts include media, probe metadata, container diagnostics and evidence.json. MacOS unit tests do not prove runsc isolation.
