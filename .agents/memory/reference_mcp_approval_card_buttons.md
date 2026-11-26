---
name: mcp-approval-card-buttons
description: Why the MCP approval card buttons call the app-only answer_approval tool with a signed card proof, not resolve_approval
type: reference
---

The Approve and Decline buttons on the MCP App approval card call `answer_approval`, not `resolve_approval`.

**Why:** `resolve_approval` is admin-gated, so it is listed and callable on the admin endpoint only, while a gated call such as `generate_media` queues its approval on the standard endpoint. A card there cannot reach `resolve_approval`. A model's tool call and a card click are the same request, so the card needs a proof the model never sees: the server returns a short-lived HMAC proof (one approval, one member, 10 minutes) in the pending result's `_meta`, which MCP Apps hosts keep out of the model's context. `answer_approval` carries `_meta.ui.visibility: ["app"]`, so hosts hide it from the model too. The API still accepts the answer only from the requester, as owner or admin (`POST /mcp-approvals/:id/confirm`).

**How to apply:**
- Never put the proof in `content` or `structuredContent`; only `_meta`.
- `resolve_approval` approve stays refused for a model, proof or not.
- `answer_approval` has no Claude-connector grant (`claudeAccess`); the Claude directory endpoint keeps its reviewed tool list. It counts toward `MCP_TOOL_CAP` (30 of 30), so new user-facing tools must merge into an existing one.
- Code: `apps/server/mcp/src/services/mcp-card-approval-proof.util.ts`, `ToolRegistryService.handleAnswerApproval`, `ui/card-data.ts` (`approvalActions`).
