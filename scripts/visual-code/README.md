# Visual-code renderer

Operator setup and recovery: [deployment guide](../../apps/docs/content/deployment/visual-code-renderer.mdx).
Creator/API behavior: [Motion guide](../../apps/docs/content/guides/visual-code.mdx).

The coordinator is a trusted Linux-only service. Submitted source executes only inside its fixed, isolated runsc image. Required configuration is `VISUAL_CODE_STATE_DIR` (persistent private0700 directory) and `VISUAL_CODE_RENDERER_TOKEN` (32+ characters). Start with `node scripts/visual-code/coordinator.mjs`. One process holds the state lock; maximum concurrency is two jobs. State admission stops at16GiB; no automatic receipt deletion. Keep provider/application credentials off this host.

Run protocol/coordinator units with `node --test scripts/visual-code/*.test.mjs`. Actual isolation acceptance requires Linux, installed runsc/Docker/FFmpeg and the built image: `node scripts/visual-code/isolation-acceptance.mjs`. Its artifacts include media, probe metadata, container diagnostics and evidence.json. MacOS unit tests do not prove runsc isolation.

## Connected local acceptance

The ordinary API Library fixture uses captured queues and canned renderer responses.
The opt-in `visual-code-local-runtime.integration.spec.ts` instead connects the existing
service graph to an exclusively disposable PostgreSQL database, an owned real Redis
broker, the real Linux runsc coordinator, and `LocalStorageProvider` disk bytes.
Only the LLM dispatcher is scripted; its usage and inspection verdicts are synthetic.
This establishes local transport, media, revision and settlement behavior, not paid
provider quality, production storage selection, browser authentication or deployment.

Run tests and typechecks on the designated verification host. The coordinator requires
Linux, Node24, runsc registered with Docker, the fixed renderer image, ffmpeg/ffprobe,
and authenticated ready health through an owned loopback forward. Never substitute
runc or weaken container restrictions. Create input media once in a new private root:

```sh
node scripts/visual-code/create-fixture-media.mjs "$VISUAL_CODE_LOCAL_MEDIA_DIR"
```

The operator must confirm exclusive disposable database/container ownership and provide
`DATABASE_URL` (loopback database name includes `test`) and these six explicit values:
`VISUAL_CODE_LOCAL_RENDERER_URL`, `VISUAL_CODE_LOCAL_RENDERER_TOKEN` (32+ characters),
`VISUAL_CODE_LOCAL_REDIS_URL` (loopback port and numeric DB),
`VISUAL_CODE_LOCAL_ARTIFACT_DIR`, `VISUAL_CODE_LOCAL_MEDIA_DIR`, and
`VISUAL_CODE_LOCAL_ACCEPTANCE=1`. Directories must be absolute, existing and free of
symlinks. Renderer HTTP URLs cannot contain userinfo, query, hash or non-root paths.
Redis URLs cannot contain userinfo, query or hash. No provider secrets are required.

Before execution, write private `runtime-preflight.json` at the artifact root with
exact keys `gitHead`, `platform`, `nodeVersion`, `ffmpegVersion`, `ffprobeVersion`,
`runscVersion`, `imageId`, `dockerRuntime`, `rendererVersion`. Record actual observations:
current candidate SHA, Linux, Node24, first trimmed version lines, Docker image SHA256,
runsc and renderer 4.0.530. The suite rejects missing, malformed or stale preflight;
it also rejects changes to this file during a run. Health still requires a live check.

```sh
# cwd apps/server/api; only after owned migrated DB and dependency preparation
VISUAL_CODE_LOCAL_ACCEPTANCE=1 bunx vitest run --config vitest.config.e2e.ts \
  test/integration/visual-code/visual-code-local-runtime.integration.spec.ts
# dedicated Linux VM; copied scripts must match the candidate commit
VISUAL_CODE_ARTIFACT_DIR="$VISUAL_CODE_ISOLATION_ARTIFACT_DIR" \
  VISUAL_CODE_ACCEPTANCE_HEAD="$CANDIDATE_SHA" \
  node scripts/visual-code/isolation-acceptance.mjs
```

Without explicit opt-in the connected suite reports its prerequisite skip. Enabled
runs fail on unavailable prerequisites; there is no canned fallback. Each case retains
an independent UUID directory containing source, actual previews/outputs, ffprobe,
revision snapshots, redacted evidence and preflight hash. Cleanup removes only owned
DB seeds and prefixed queues; retained media and renderer receipts remain for manual
inspection. Linux isolation separately records image/runtime/container facts and real
network, host-file, credential, install and deadline denials. Inspect saved MP4/stills
and record their paths/hashes and honest results alongside exact-head CI. Synthetic
provider evidence cannot close all Studio/agent/auth entrypoint acceptance.
