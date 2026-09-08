# External agent execution threat model

Scope: #3999 FR-9 and #4001 FR-9. Source reviewed: 2026-09-08.
Owners: API authentication, agent runtime, MCP and workflow maintainers.
Status: reviewable implementation inventory and gate for new external behavior;
this document does not grant rollout approval or claim live acceptance.

#4463 owns browser authorization, social connections, explicit external context,
resumable artifacts and authenticated client acceptance. It must consume these
boundaries rather than introduce another catalog, execution engine or proof.
Its child #4468 owns the CLI/Codex/Claude client evidence matrix.

## Assets and trust boundaries

Protected assets include organization/brand data, canonical user identity,
provider credentials, credit spend, publishing authority, durable work and
workflow results, and audit integrity. Potential attackers include unauthenticated
remote callers, a scoped key holder, another tenant, a compromised client,
malicious content retrieved by a model, and a model emitting forged tool
arguments or HTML.

The execution path is:

```text
Untrusted client / model / retrieved content
  -> MCP transport or CLI / product API
  -> explicit bearer authentication and organization identity
  -> curated action surface + caller role/scope checks
  -> validated thread/brand/context version
  -> canonical mutation policy
  -> prepared intent + trusted human confirmation
  -> atomic execution claim + immutable workflow execution
  -> durable result / run events
  -> typed renderer and safe markdown
```

Transport authentication, service-origin proof, and intent confirmation are
different grants. No model argument, descriptive tool annotation, or MCP role
replaces the downstream API authorization or approval check.

## Controls grounded in the current implementation

| Boundary / attack | Implementation authority | Required behavior |
| --- | --- | --- |
| Anonymous access or URL credential leakage | `apps/server/mcp/src/guards/mcp-auth.guard.ts`, raw MCP transport, `packages/libs/auth/url-credentials.ts` | Require bearer auth; reject URL credentials; use protected-resource discovery on denial |
| Key confused with membership/admin | `apps/server/api/src/helpers/guards/api-key/api-key.guard.ts`; `apps/server/mcp/src/services/auth.service.ts` | Canonical user and explicit organization; key role stays user unless explicitly granted privileged admin scope; no implicit superadmin |
| Stored API key theft | `collections/api-keys/services/api-keys.service.ts` | Store bcrypt key hashes, check expiration/revocation, expose plaintext only when issued |
| MCP OAuth token reused at REST | `ApiKeyAuthGuard`, `ApiKeysService.hasTrustedMcpOriginProof`, `mcp/shared/utils/mcp-origin-proof.util.ts` | Restrict MCP OAuth tokens to the MCP resource via trusted service-origin proof |
| Cross-tenant / stale brand context | `apps/server/api/src/agent-context/agent-scope-context.service.ts`, `agent-tools.controller.ts` | Resolve organization from auth, authorize thread and brand using scoped nondeleted reads, revalidate context version before execution; missing brand cannot authorize brand resources |
| Unreviewed or privileged tool discovery | `packages/actions/src/registry/curated-action-catalog.ts`, MCP tool registry and per-call role guard | Surface subsets come from the curated catalog; deny unknown tools, missing roles, unavailable actions; discovery is not authorization |
| Prompt injection requests a mutation | `packages/actions/src/registry/mutation-policy.ts`, `agent-tool-executor.service.ts` | Use canonical direct/approval-required policy. Approval-required with omitted/unsupported capability rejects before effects; capable hosts queue |
| Model forges confirmed/sourceActionId | `agent-tool-confirmation.service.ts`, `agent-tool-mutation-approval.util.ts` and specialized pending-confirmation handlers | Strip untrusted model proof claims; only server-owned preparation and approved product action can resume execution |
| Changed intent or cross-scope confirmation | `buildLogicalWriteKey`, scope revalidation and approval records | Bind normalized arguments, action, user, organization, thread, brand and context version; editing or changing scope requires renewed preparation |
| Duplicate approval or simultaneous retries | `collections/mcp-approvals/services/mcp-approvals.service.ts` | Atomic pending-to-resolved transition and `claimExecution` fence; an approved result replays without another effect |
| Revoked action replay | `evaluateMutationPolicy` | Check surface availability before replay or trusted-approval execution |
| Lost connection interpreted as fresh execution | Agent threads/runs and immutable workflows | Reconstruct durable run/result; retry observation rather than recreating a write; terminal state overrides stale running projection |
| Untrusted generated HTML | `packages/agent/src/components/SafeMarkdown.tsx`, `UiActionRenderer.tsx` | Safe markdown and typed components; unknown/malformed content gets a diagnostic fallback, never trusted arbitrary HTML |
| Sensitive material in evidence | Task report and live evidence schema | IDs, outcomes and timings only; private captures retained separately; no credentials or raw prompts in public reports |

Paths without an app prefix in the table are under
`apps/server/api/src`. Tests next to these controls remain the authoritative
regression evidence; the [task evaluation harness](agent-task-evaluations.md)
adds explicit versioned expectations, not a second policy engine.

The canonical catalog intentionally permits some direct writes, including
single-image generation. Do not infer approval policy from a verb, credit cost,
or this table. External scope review must inspect each actual catalog action
and the domain handler's specialized confirmation rules.

## Authentication, storage and revocation

MCP resolves bearer identity through API `/auth/whoami` and refuses incomplete
organization/user identity. User-issued `gf_` keys are not cached by MCP:
revocation must take effect on the next request. Successful non-key identity
lookups can remain cached for 60 seconds; this is a bounded revocation delay,
not instantaneous session revocation. API calls independently enforce auth.

API keys are hashed server-side. CLI `packages/cli/src/config/store.ts` can
persist a raw API key/token in `~/.gf/config.json`. Its current writer does not
set an explicit file mode or use an OS credential store. Consequently the
server's hashing guarantee does not apply to client storage. For headless use,
inject the existing `GENFEED_API_KEY` environment variable from a secret store;
limit credential lifetime/scopes and filesystem access. Client storage hardening
and evidence of actual permissions are required before advertising secure
persistent credential storage in a new external journey.

MCP's service-origin proof is a stable SHA-256-derived credential from the
service API key. It is not per-request, time-bound, or an intent nonce.
Treat it as a secret, use TLS, never expose it to clients or logs, and rotate the
service credential on compromise. It cannot serve as human confirmation or
prevent replay of a stolen bearer token.

## Scope discovery and safe defaults

Start with explicitly authenticated organization discovery and reviewed safe
reads such as `get_credits_balance`. Brand-scoped generation must require an
authorized explicit brand, even where legacy in-app thread fallback is supported.
Capture only context the user chose to share; saving it as reusable knowledge
is a separate action under the existing Knowledge owner.

Expose only catalog actions supported by the caller's reviewed surface and
role, then recheck resource scope on execution. An API key with approval scope
is not a universal tool-approval credential. Publishing, REST MCP approval
resolution and MCP `resolve_approval` have distinct authorization paths.

Default an external host's approval capability to unsupported unless it has an
actionable human approval mechanism. Show prepared arguments and the relevant
scope to the human before confirming. Never translate natural-language model
claims, a client-supplied `confirmed: true`, a service-origin header, or a role
into trusted approval. Once the context changes or the proof expires, prepare
again. Completed effects are observed by existing identifiers.

## Rate limiting and availability

MCP uses a shared Redis sliding window keyed by hashed token or unauthenticated
IP, with retry headers (defaults: 60 requests per minute). API keys also have
API-side limits and optional IP restrictions. The Redis limiter deliberately
fails open on errors; it is an availability tradeoff, not fail-closed protection.
Rotating bogus tokens also escapes a per-token quota.

Before adding external mutations, the operator must provide evidence of edge
IP/auth-attempt protection and spend/concurrency bounds during Redis failure,
or remediate the limiter within the appropriate security owner. A passing
unit-test limit check cannot establish those deployment controls.

## Proof lifetime, replay and failure recovery

Pending specialized tool confirmations use server cache records with a
3,600-second TTL. They bind organization, thread, tool and source action;
that helper alone does not consume a proof or hash mutable arguments.
Specialized handlers and the canonical approval/execution records supply the
remaining intent and effect gates. Do not reuse the helper as a complete
external proof system.

The approval service atomically claims approved execution before side effects
and only attaches a result to an approved empty-result record. This prevents
competing callers from both claiming the same effect. It does not prove
exactly-once delivery to a remote provider across an arbitrary process crash.
If execution dies after a claim or an external effect but before result
persistence, recover the existing workflow/provider result. Never clear the
claim and blindly resubmit; retain an actionable interrupted/failed state when
the result is uncertain.

Test expired/missing/mismatched/consumed proofs, concurrent confirmation,
cross-tenant IDs, changed context, policy revocation, delayed stop, interruption,
and reload at every durable boundary. Include real database/provider receipts
for the five-run in-app acceptance gate.

## Audit and observability

Correlate thread/run, scope provenance/context version, selected action,
logical intent, approval/confirmation, workflow execution and terminal result.
Record policy decision, rejection category, execution-claim result, duration,
cancel/retry/no-op/interruption and renderer diagnostics. Credentials, service
proofs and unnecessary prompt/source bodies must not enter public logs.

The existing `readAgentRunPublicError` helper returns an Error's message
verbatim. It is not a universal credential or personal-data redactor. Review
provider error payloads at the boundary and verify private capture sanitization;
do not claim global redaction coverage from the task fixture report.

## External rollout gate and ownership

Before #4463 enables a new mutation, its reviewer must verify:

1. Explicit authentication, authorized organization/brand and scoped catalog
   subset; no implicit admin, brand selection or context sharing.
2. The same prepared intent, trusted confirmation, atomic execution claim,
   immutable workflow and audit identities as the product.
3. Revocation/expiry, credential handling, rate-limit failure and provider
   uncertainty mitigations above, with real negative-case evidence.
4. Five inspected production-like in-app journeys and the relevant #4468
   external-client evidence, with exact tested client/provider/model versions.

Residual risks remain visible until their owning implementation or deployment
evidence resolves them. This threat model defines the review boundary; neither
its existence nor deterministic fixture success authorizes a new external
mutation or closes the authenticated external journey.
