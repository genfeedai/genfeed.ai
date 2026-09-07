---
name: Dynamic video localization and composition
description: Reusable audio-driven localization and scene assembly workflows
type: project
last_verified: 2026-09-06
---

# Dynamic video workflows

Issue #4500. Complete two workflows: localize an existing ad while reusing its visuals, and compose generated scenes with independently replaceable speech and background tracks.

**Why:** Avatar generation alone cannot support editable language variants or soundtrack replacement on finished video.
**How to apply:** Use canonical workflow actions, Library media, durable provider continuations and downstream partial execution. Treat source visuals as immutable; every localization derives from the source rather than another localized render.

## Decisions

Three approaches considered: a monolithic ad generator is simple to call but forces expensive whole-run regeneration; an editor-only implementation supports manual changes but cannot be orchestrated; composable workflow actions reuse existing execution, billing, partial runs and editor exports. Choose composable actions and discoverable templates.

## Acceptance

- Video lip sync validates tenant ownership and dispatches Sync video + audio through Replicate. Image lip sync dispatches HeyGen photo + audio. Unsupported media/model combinations fail before paid dispatch.
- Localized speech preserves timestamped source and translated segments, explicitly selects a language/voice, measures generated speech and rejects timing overflow instead of truncating dialogue.
- Sound overlay accepts saved speech or music assets and honors replacement/mix settings and original video duration.
- Existing ad localization and generated-scene assembly templates are available through the same Agent workflow creation surface.
- A changed downstream node can reuse locked/cached upstream outputs through existing partial execution.
- Background stems are mixed separately; a finished ad's original dialogue is never relabeled as a clean background track. Source separation quality must be reviewed.
- Failed transformations preserve failure state and source lineage. No workflow publishes an ad automatically.

## Verification

Focused package executor/action tests, API tenant/provider dispatch tests, real FFmpeg fixture tests and template graph validation on the configured verification host. Provider/live render evidence is reported separately from mocked integration checks.

## Usage and boundaries

- `localize-existing-ad`: reuse the same original Library video for each language variant. Set `targetLanguage` and `voiceId`; do not localize a previously dubbed output. Timed `segments` can set a different voice/language per section of one continuous video.
- `generate-speaking-scenes`: one portrait and scripts produce independent speaking clips. Reuse finished clips and change only the speech or downstream lip-sync steps.
- `compose-video-scenes`: pass ordered Library clips and a saved soundtrack. Audio replacement alone does not change mouth movements; use `lipSync` when replacing visible dialogue.
- Partial Agent execution accepts `nodeIds`, `respectLocks`, and runtime `variables`. Select every downstream node that must change. Locked upstream assets remain reusable; overriding a selected lock reruns that node while retaining input values.
- Review separated background audio before mixing. Separation quality and actual multilingual lip-sync quality still require a representative provider render.
- Uploaded/validated assets are accepted; drafts require a stored media key. Processing/failed assets cannot be used as completed inputs.
- Unsupported saved lip-sync model names now fail with model-selection guidance rather than silently using another provider. Choose HeyGen for images or Sync for videos.
- Current remote-provider workflows use the existing S3 media/presigning infrastructure and require provider-accessible media URLs. Migrating legacy presigning and merge services to every local storage adapter is separate work; configured private download origins alone do not make local-only media reachable by cloud providers.
