# External agent content journey

Evidence matrix for #4463 / #4468. Live client rows stay open until an
authenticated run is recorded. Automated tests in this repository are the
reproducible substitute until those live rows pass.

## Supported clients

| Client | Version recorded | Auth | Brand | Context | Generate | Reconnect | Image | Video | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Genfeed CLI | `gf` workspace | Browser OAuth login | `gf brand` / `--brand` | `--context` (transient) | `gf gen image` / `gf gen video` | `gf status <id>` | File download | File download | Automated: connect, brand, wait recovery |
| Codex | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` | `get_job_status` / tool reconnect | Resource link + structured artifact + text | File/open link | Blocked: live Codex session not run in this change |
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

Configured pack activation is tracked privately. Public receipts contain only
sanitized pack IDs and versions.

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

For example, ask a connected agent to discover `set_generation_settings` and
turn prompt enhancement on for a selected brand. Pass `harness: false` with an
individual generation to override saved preferences. Organization identity comes
from authentication, never from caller-supplied tool arguments.

The generation integration remains pending until the central image/video path
and planned `enhance_prompt` preview executor are connected and verified. Tool registration and the
settings UI alone do not establish that enhancement ran. An applied generation
must return and persist `generationHarness` with the exact submitted prompt,
setting source, and sanitized contributing pack IDs/versions. The receipt is
shown on the generation card and in asset prompt details. Disabled enhancement
must preserve the caller's prompt and report `skipped` with no applied packs.
