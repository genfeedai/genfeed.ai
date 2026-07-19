# Editor Remotion export QA

Use the representative 9:16 branded-avatar composition when validating an
Editor export. HyperFrames is a future comparison candidate only; it is not
part of the runtime or this verification path.

## Preview and export parity

1. Open the fixture project in the Editor and confirm the 1080×1920 preview
   contains the avatar, B-roll, caption, outro, and music tracks.
2. At frames 0, 20, 90, 170, 260, and 299, capture the preview and exported
   output. Compare layer visibility, source trimming, text placement and
   styling, transitions, effects, and background color.
3. Confirm track and clip volume multipliers produce the same audible balance
   in preview and export.
4. Confirm the completed video appears in the library with the expected
   dimensions, duration, renderer version, and source-project provenance.

## Lifecycle cases

For each case, capture the project status, job status, websocket terminal
event, and content-safe structured log fields (`projectId`, `jobId`,
`rendererVersion`, progress, and terminal reason).

- Cancel an active render. It must reach `cancelled`, mark the pending
  ingredient terminal, remove temporary output, and allow a fresh render.
- Make one authorized asset unavailable. The job may retry once, then must
  reach `failed` with `asset_unavailable`.
- Force the renderer past its 15-minute deadline. It must stop and reach
  `failed` with `timed_out`.
- Restart the files worker during rendering. BullMQ must resume or retry the
  job; if its durable job record is lost, reconciliation must classify it as
  `worker_lost`.
- Retry a failed or cancelled project and confirm the new job owns all later
  completion updates.

Do not accept raw asset URLs, composition text, credentials, filesystem paths,
or provider payloads in lifecycle logs.
