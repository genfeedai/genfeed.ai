# External agent content journey

Evidence matrix for #4463 / #4468, updated 2026-09-24. Live client rows remain
open until the required authenticated journey is recorded. Automated tests
provide reproducible coverage; they do not substitute for live acceptance.

## Client evidence

| Client / run | Date | Observed result | Not verified / blocker |
| --- | --- | --- | --- |
| Genfeed CLI (`gf` workspace) | Source coverage only | Automated coverage for connection, explicit brand selection, and media wait recovery. | Live browser OAuth, media delivery, and reconnect acceptance remain unverified. |
| Installed Codex connector | 2026-09-24 | Read pass: `list_brands` returned one brand; scheduler capability and readiness reads returned results. Explicit `get_brand` failed with “Brand was not found in this organization”. Facebook readiness returned `canSchedule: true` despite hidden scheduler capability. | Client version and deployed SHA were not observed. Merged #5017 needs a deployed `get_brand` retest; #5126 addresses the readiness mismatch. OAuth, two-brand isolation, media generation, costs, and reconnect were not verified. |
| Cursor / Grok Bot | 2026-09-23 | Recorded tool-read pass. | Registration and token exchange were inferred, not directly observed; refresh was untested. This is separate from native Grok acceptance. |
| Native Grok | Latest #4889 clarification | Blocked at human terms acknowledgement. | No native OAuth or media pass may be inferred from Cursor / Grok Bot. |
| Claude Code | Not run | No live acceptance recorded in this matrix. | OAuth, brand/context handling, generation, media delivery, and reconnect remain unverified. |
| Claude Desktop | Not run | No live acceptance recorded in this matrix. | OAuth, brand/context handling, generation, media delivery, and reconnect remain unverified. |

The 2026-09-24 Codex read was not a new browser OAuth handshake. Authenticated
reads, including manual API-key reads, do not prove registration, consent, token
refresh, or reconnection. The single returned brand does not prove two-brand
isolation. Before live acceptance, obtain owner consent for the relevant account
and a quoted, approved budget for paid media generation. Record client version,
deployed SHA, observed behavior, and cost evidence in the authorized run. The
read-only run established only the observations listed in the matrix above.

Expected client behavior remains explicit brand selection (`list_brands` then
`brandId`, or `gf brand` / `--brand`) and transient context (`selectedContext` or
`--context`). Image delivery may use a resource link, structured artifact, and
text fallback; video uses a file or open link and never claims inline playback.
A fallback passes only when it is the documented supported behavior and is
observed in the client.

## Available action journey

The curated MCP catalog exposes the actions below. This is source availability,
not a live pass. Use
`https://mcp.genfeed.ai/mcp?toolsets=content,generation,analytics,brand,scheduler`
or `?profile=full` to advertise the exposed content loop; `core` is always
included. The default profile advertises only `core`, `scheduler`, and `content`.
Tools may require explicit discovery selection, permissions, mutation approval,
or approved spending. Selecting a profile does not authorize writes or costs.

| Stage | Existing curated MCP actions | Availability / acceptance boundary |
| --- | --- | --- |
| Discover tools and select a brand | `search_tools`, `describe_tool`, `list_brands`, `get_brand` | Exposed; explicit brand lookup still needs the deployed #5017 retest. |
| Research | `search_articles`, `search_x_posts`, `get_trends` | Exposed through content and analytics; does not establish generic URL import. |
| Upload local media | `request_media_upload`, `complete_media_upload` | Exposed; reservation and completion are writes. Upload the bytes using the returned instructions between these calls. |
| Generic URL import | None | Absent from the curated catalog; unavailable, not passed. Coordinate the gap with #4069 / #4959. |
| Save or manage concepts | None | Saved-concept CRUD is absent from the curated catalog; unavailable, not passed. Coordinate with #4069 / #4959. |
| Generate media | `generate_image`, `generate_video` | Exposed through generation; requires owner consent and a quoted, approved paid budget for live acceptance. |
| Inspect progress | `get_job_status`, `get_video_status` | Exposed; live wait/reconnect recovery remains unverified. |
| Retrieve output | `list_images`, `list_videos`, `get_post` | Exposed; verify the actual client artifact or supported fallback. |
| Prepare and schedule | `list_scheduler_capabilities`, `list_brand_publishing_readiness`, `validate_scheduler_target`, `create_scheduled_release` | Exposed; readiness must agree with scheduler support. Creating a release is a write and retains approval checks. |
| Inspect analytics | `get_analytics`, `get_content_analytics`, `get_video_analytics` | Exposed through analytics; requires scoped account data and live verification. |

This document adds no actions or schemas and does not change the independently
packaged public agent distribution. Private activation evidence remains separate
from public client and directory acceptance.

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

#4468 and parent #4463 remain open until required live acceptance is complete.
Record exact access blockers without treating them as passes. Source inspection
and automated coverage are not live passes; #4976 directory submission and Human
Review gates also remain separate from this documentation repair.

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
