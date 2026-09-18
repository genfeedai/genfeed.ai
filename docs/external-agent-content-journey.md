# External agent content journey

Evidence matrix for #4463 / #4468. Live client rows stay open until an
authenticated run is recorded. Automated tests in this repository are the
reproducible substitute until those live rows pass.

## Supported clients

| Client | Version recorded | Auth | Brand | Context | Generate | Reconnect | Image | Video | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Genfeed CLI | `gf` workspace | Browser OAuth login | `gf brand` / `--brand` | `--context` (transient) | `gf gen image` / `gf gen video` | `gf status <id>` | File download | File download | Automated: connect, brand, wait recovery |
| Codex | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` | `get_job_status` / tool reconnect | Native image + text | File/open link | Blocked: live Codex session not run in this change |
| Claude Code | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` | tool reconnect | Native image + text | File/open link | Blocked: live Claude Code session not run in this change |
| Claude Desktop | not run | MCP browser OAuth | `list_brands` then `brandId` | `selectedContext` | `generate_image` | tool reconnect | Native image + text | File/open link | Blocked: live Claude Desktop session not run in this change |

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
- MCP image native part + video file link:
  `packages/helpers/src/media/media-artifact.helper.test.ts`
- CLI media wait catch-up: `packages/cli/tests/commands/media-wait-recovery.test.ts`
- CLI connect browser URL: `packages/cli/tests/commands/connect.test.ts`

## Private harness

Configured pack activation remains in private tracking. Public receipts must
contain only sanitized IDs and package versions.

## Closing rule

#4468 and parent #4463 stay open until every required client row is `passed` or
an exact access blocker is recorded here. Source inspection is not a live pass.
