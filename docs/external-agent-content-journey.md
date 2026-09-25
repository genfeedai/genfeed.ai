# External agent content journey

Evidence matrix for #4463 / #4468. Live client rows stay open until an
authenticated run is recorded. Automated tests in this repository are the
reproducible substitute until those live rows pass.

## Supported clients

| Client | Version recorded | Auth | Brand | Context | Generate | Reconnect | Image | Video | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Genfeed CLI | `gf` workspace | Browser OAuth login | `gf brand` / `--brand` | `--context` (transient) | `gf gen image` / `gf gen video` | `gf status <id>` | File download | File download | Automated: connect, brand, wait recovery |
| Codex | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` | `get_job_status` / tool reconnect | Resource link + structured artifact + text | File/open link | Blocked: live Codex session not run in this change |
| Grok | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` / `generate_video` | `get_job_status` / tool reconnect | Resource link + structured artifact + text | File/open link | Blocked: live Grok session not run in this change |
| Claude Code | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` | tool reconnect | Resource link + structured artifact + text | File/open link | Blocked: live Claude Code session not run in this change |
| Claude Desktop | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` | tool reconnect | Resource link + structured artifact + text | File/open link | Blocked: live Claude Desktop session not run in this change |

A fallback can pass only when it is the documented supported behavior. Video
never claims inline playback.

## Automated coverage

- Connection start, replay, tenant isolation, unconfigured provider:
  `agent-connection-request.service.spec.ts`
- Pending credential resume without a duplicate row:
  `credentials.service.spec.ts` (`beginOAuthForBrand` reuses the pending id)
- Provider denial persisted before TTL expiry:
  `oauth-callback-error.util.spec.ts`
- Explicit brand selection and unauthorized knowledge sources:
  `agent-generation-scope.service.spec.ts`
- MCP `get_brand` no longer returns the first of two brands:
  `account-management.tool.spec.ts`
- MCP image/video `resource_link` + structured artifact + text fallback:
  `packages/helpers/src/media/media-artifact.helper.test.ts`
- CLI media wait catch-up: `packages/cli/tests/commands/media-wait-recovery.test.ts`
- CLI connect browser URL: `packages/cli/tests/commands/connect.test.ts`

## Private harness

Configured pack activation is tracked privately. Pack activation receipts contain
only sanitized pack IDs and versions.

The runtime reports each `CONTENT_HARNESS_PACKAGES` specifier as `loaded`,
`unresolvable`, `invalid`, or `load_failed`
(`ContentHarnessService.getActivationReport`). Any state other than `loaded`
fails application startup. Built-in packs never count
as an activated external pack. Every brief records `appliedPacks`, the packs
that actually contributed. `HarnessGenerationService` logs them as an
operator-only receipt without pack contents.

Hosted deployment can install a compiled CommonJS bundle into a private ECR
image layered on the exact public server digest. Configure production secrets
`CONTENT_HARNESS_BUNDLE_URI` (a private S3 object) and
`CONTENT_HARNESS_BUNDLE_SHA256` (its lowercase SHA-256), together. The deploy role
needs read access to that object. The bundle must be self-contained, at most
5 MiB, and export `CONTENT_HARNESS_PACK` or a default `ContentHarnessPack`.
It must contain no credentials or source maps. The pipeline validates the
checksum before building, removes its temporary copy, and never publishes the
module to GHCR or a shared cache. API boot smoke validates pack activation
before services roll. With neither secret configured, the public base image is
used and existing runtime package configuration is preserved. Without any
external runtime configuration, only built-in packs load.

Activation is not proven by merging this code. Record the deployed image digest,
successful boot smoke, and sanitized loaded pack IDs/versions from the target
environment before claiming hosted activation.

## Closing rule

#4468 and parent #4463 stay open until every required client row is `passed` or
an exact access blocker is recorded here. Source inspection is not a live pass.

## Shared generation preferences

Studio and the Agent composer expose **Prompt enhancement settings**. The
organization switch sets the default for image and video generation across
clients. A brand can inherit that default or override it. Resetting removes the
saved override; the system default is on. Reopen the control to see changes made
through another client.

The MCP generation toolset exposes:

- `get_generation_settings`: optionally supply `brandId` to inspect the effective
  setting and its source.
- `set_generation_settings`: pass `scope` (`organization` or `brand`), `isEnabled`
  (`true`, `false`, or `null` to reset), and `brandId` for a brand override.
- `enhance_prompt`: pass `prompt`, `contentType` (`image` or `video`), selected
  `brandId`, and optionally `model` and `harness`. This previews the shared
  enhancement without creating media. Generate the returned prompt with
  `harness: false` to submit that reviewed text unchanged.

For example, ask a connected agent to discover `set_generation_settings` and
turn prompt enhancement on for a selected brand. Pass `harness: false` with an
individual generation to override saved preferences. Organization identity comes
from authentication, never from caller-supplied tool arguments. In an Agent
conversation, the validated thread brand is fixed; switch the conversation
brand before editing another brand. Threadless MCP calls can select `brandId`.

Central image/video generation resolves request, brand, then organization
preferences and calls the same Enhance implementation used by Studio and Agent.
It uses existing prompt templates, skills, and provider configuration. There is
no separate enhancement API key or environment toggle. Preferences are nullable
fields on the existing organization settings and brand records; `null` inherits.

Every generation persists `generationHarness` with the original and exact
submitted prompt, setting source, and sanitized contributing pack IDs/versions.
The receipt appears on generation cards, in asset prompt details, and in both
MCP structured data and text content. Provider-specific compilation may add
format instructions after enhancement; the stored receipt includes them.
The submitted prompt intentionally includes the per-request brand directives and
reference signals actually sent to the media provider. These are visible to the
authenticated user and their connected agent, just like the creative prompt.
Pack source code, credentials, non-applied directives, evaluation criteria and
provider hints are not included. Pack authors must treat media-prompt
contributions as user-visible output; provider-only secrets do not belong there.

An accepted retry returns the existing asset and receipt without enhancing again.
Enhancement failures stop generation explicitly instead of silently using an
unenhanced prompt.

Disabled enhancement preserves the caller's prompt byte-for-byte through
provider submission and reports `skipped` with no applied packs. Selected
context that would modify this text must be removed or enhancement enabled.
After an explicit Studio Enhance succeeds, Studio sends the existing saved
prompt ID with that exact reviewed text. The server validates the completed
prompt against the organization, brand and text, then reuses it without another
AI rewrite. Current harness guidance and composition controls still apply.
Editing the text or changing brand/model drops this reuse. Explicit raw mode
also bypasses prompt-based composition/style additions and records a
`raw_prompt_requested` compilation exemption.

Rollout requires the database migration and API/MCP/frontend deployment. The
automated checks cover mocked provider calls and cross-surface dispatch; live
client runs and hosted pack activation remain separate evidence requirements.

## Imported remix handoff

An external client can import a supported post and carry the saved concept
through an exact quote before any generation. This does not close a live client
row above. Fixture tests stand in until an authenticated client run is recorded.
No fixture run fetches paid media, publishes, or writes brand Knowledge.

Discover the actions with:

```text
?toolsets=inspiration,content,generation,analytics,brand,scheduler
```

The bare MCP URL keeps its existing default profile and tool cap. `core` remains
implicit. Downstream scheduling and analytics tools stay on `scheduler` and
`analytics`; this handoff does not replace them.

| Step | Action | Effect |
| --- | --- | --- |
| Import | `import_source_post` | Canonical scoped import for an explicit `brandId`. Approval required. X, Instagram, and TikTok only. |
| Save | `create_remix_concept` | Create or reuse the brand-owned saved concept from `sourcePostId`. No generation. |
| Edit | `update_remix_concept` | Compare-and-swap at `expectedRevision`. Stale, cross-tenant, and invalid source input fail closed. |
| Attach | `attach_remix_analysis_source` | Optional same-brand Library video for scene analysis, or `null` to clear. Free of generation spend. Imported URL remains provenance. |
| Quote | `quote_remix_generation` | Persist one exact quote. Does not dispatch. |
| Approve | `start_remix_generation` | Explicit approval of that `quoteId` and revision, then one canonical execution. |
| Reconnect | `get_remix_run` | Status, receipts, and artifacts. Does not start or charge another run. |
| Control | `control_remix_generation` | `cancel` or `resume` only when a video or avatar scene pipeline already exists. |

Image and copy use the generic generation quote. Image requires an explicit
registered image model. Copy uses the canonical background model and one credit
per variant. Platform credit total is quote unit price times variant count, or
zero when billing mode is BYOK. BYOK can still cost money at the provider. The
quote lasts 15 minutes. Changed price, model, BYOK, source, reference, or
recipe material requires a fresh quote. A quoted run cannot use an unquoted
start to skip acceptance. Repeating an accepted execution returns the same
canonical run.

Video and avatar use the scene quote family (`analysis`, `generate`, `repair`)
and do not accept a caller model. Cancel and resume keep that pipeline's
approval and quote checks. Scene service verification remains on
[#4069](https://github.com/genfeedai/genfeed.ai/issues/4069); this page does not
treat that dependency as accepted. Unsupported lifecycle actions fail explicitly.
Single-scene legacy video or avatar is not exposed as an unquoted shortcut.

Owner consent, the quoted budget, and native client acceptance stay Human Review
gates. Automated coverage for this handoff is the remix route, approval, replay,
and generation-quote fixtures. It does not record a passed live client row.
