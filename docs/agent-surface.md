# Agent Surface

How AI agents drive Genfeed, and why the tool surface looks the way it does.
This is the contributor view — user-facing setup instructions live at
[docs.genfeed.ai](https://docs.genfeed.ai/api-reference/mcp).

Counts in this document reflect the repository state on 2026-08-11. The catalog
is the authority; re-read it rather than trusting a number here.

## Entry points

Four surfaces, one REST API underneath.

| Surface          | Transport                        | Source                                            |
| ---------------- | -------------------------------- | ------------------------------------------------- |
| **MCP server**   | Streamable HTTP, bearer API key  | `apps/server/mcp`                                 |
| **In-app agent** | Product UI and agent runs        | `apps/server/api/src/services/agent-orchestrator` |
| **CLI**          | HTTPS + Socket.IO                | `packages/cli`                                    |
| **REST API**     | HTTPS, OpenAPI at `/v1/openapi.json` | `apps/server/api`                             |

Agents are not restricted to reads. `create_post` returns a publish confirmation
card and, once confirmed, publishes an existing content item or ingredient to the
selected platforms — optionally at a `scheduledAt` time. Combined with the
generation tools (`generate_image`, `generate_video`, `generate_music`,
`generate_voice`, `generate_content_batch`) and the scheduler tools, one
connection covers generate → draft → schedule → approve → publish. Two things
bound it: the scopes on the API key, and the MCP approval gate below.

## The curated action catalog

`packages/actions/src/registry/curated-action-catalog.ts` is the single source of
truth for which actions exist and which surfaces they appear on. Each entry is
a name plus a `surfaces` array of `'agent'`, `'mcp'`, or both.

Current shape: **162 curated actions — 105 on MCP, 93 on the agent, 36 on both.**

Schemas and metadata live separately, in the definition shards under
`packages/actions/src/registry/source/`. The catalog decides surface intent; the
shards describe the tool.

### Curated catalog, not OpenAPI parity

**MCP tools are hand-reviewed product actions. They are not generated from
OpenAPI, and API-to-tool parity is not a correctness measure.**

An earlier OpenAPI-generated design advertised 1,119 MCP tools — 1,041 endpoint
mirrors plus 78 curated actions. That degraded tool selection and mistook
transport coverage for user capability. The reviewed hand-authored union
replaced it.

Consequences for contributors:

- Adding an HTTP endpoint does not add a tool, and is not tool debt.
- Endpoint-count ledgers and parity gates are not used here.
- OpenAPI emit and validation continue normally — for API documentation only.
- A new tool is a deliberate catalog entry with a definition, an executor, and
  focused test coverage.

### Enforcement

Drift is caught in three places, all fatal rather than advisory:

- **Module load** — `packages/actions/src/registry/tool-registry.ts` throws when a
  catalog entry has no definition, a definition has no catalog entry, or either
  side holds duplicates.
- **MCP boot** — `ToolRegistryService.validateDispatchCoverage` (`OnModuleInit`)
  crashes startup when an MCP-surfaced tool classifies to no executor, or when an
  approval-gated name is not actually MCP-surfaced. A failed boot keeps
  `/v1/health` red and blocks the deploy.
- **Agent registry + CI** — `assertExtensionsAreCurated` throws at module load
  when `CLOUD_AGENT_TOOL_EXTENSIONS` names an action the catalog does not surface
  to the agent, and `bun run check:agent-tool-dispatch` fails on drift in either
  direction, cataloged-but-unroutable or routable-but-unreviewed.

`.github/workflows/curated-action-catalog.yml` annotates changed catalog lines
and publishes a step-summary table on every pull request that touches the file.
The reporter parses the file literally, so entries must stay in the canonical
single-line form (`{ name: '...', surfaces: [...] },`) or the four-line
publishing-approval variant.

`CLOUD_AGENT_TOOL_EXTENSIONS` refines cataloged actions with cloud-only schema or
prompt wording. It is not a place to introduce an action.

## Why the surfaces differ

The split is intentional and reviewed, not an oversight backlog.

**Agent-only**, because the value is in-product interaction: `prepare_voice_clone`
and the rest of the `prepare_*` family produce action cards whose point is inline
selection and upload; `create_brand` is a guided onboarding flow; the campaign
family has no MCP discovery path, so a campaign tool would be uncallable without
an id; `schedule_post` reaches the same `/post-groups` backend the agent already
holds a post id for.

**MCP-only**, because the agent does not do that job: the Meta, Google, and
TikTok ads reporting tools are headless reporting surfaces. The agent's ads story
is research and remix — `list_ads_research`, `get_ad_research_detail`, and
`create_ad_remix_workflow` are already on both surfaces. Adding per-account
reporting tools to the agent would enlarge its selection space for nothing.

**Both**, when a tool is headless-safe: it returns data or an asset URL from a
concrete executor case, reachable through the `/agent-tools/:name/execute` proxy
with no new handler, and it does not publish.

Rationale per boundary is recorded in
[`.agents/memory/curated_action_surface_boundaries.md`](../.agents/memory/curated_action_surface_boundaries.md)
and pinned by `curated-action-catalog.spec.ts`.

## MCP server

`apps/server/mcp` is a NestJS workspace on port 3014.

- **Transport** — Streamable HTTP. `POST`, `GET`, and `DELETE` on `/mcp`, mounted
  before the `v1` global prefix, so the endpoint path carries no version segment.
- **Auth** — `Authorization: Bearer <gf_... API key>`. Missing or invalid tokens
  return JSON-RPC `-32001` with a `WWW-Authenticate` header pointing at
  `/.well-known/oauth-protected-resource`, which advertises the API as
  authorization server. OAuth-capable clients use that for browser sign-in;
  headless clients use a manually created key.
- **Rate limiting** — per-caller sliding window, keyed by hashed token or client
  IP, checked before authentication. Defaults to 60 requests per minute
  (`MCP_RATE_LIMIT_PER_MINUTE`, `MCP_RATE_LIMIT_WINDOW_MS`); exhaustion returns
  JSON-RPC `-32029` with `Retry-After` and `X-RateLimit-*` headers.
- **Setup page** — `GET /` serves an HTML page with client configuration
  snippets, or JSON on an `Accept: application/json` request.

The MCP workspace proxies to the API; it owns routing and validation boundaries,
not domain logic. Ten specialized dispatch groups live in
`apps/server/mcp/src/tools`:

| Group                | Tools                                                                |
| -------------------- | -------------------------------------------------------------------- |
| `scheduler`          | Scheduled release create / get / update / control                    |
| `workflow-control`   | Duplicate, inspect, runs, schedules, system-workflow install         |
| `agent-chat`         | Chats, messages, agent-run list / get / retry / cancel               |
| `clip-projects`      | YouTube clip projects, highlights, clip generation                   |
| `social-messages`    | Conversations, reply drafts, approvals, replies, DMs, triage         |
| `account-management` | Account info, brands, job status                                     |
| `ads-gateway`        | Cross-provider ad and ad-set insights                                |
| `google-ads`         | Customers, campaigns, ad groups, keywords, search terms              |
| `meta-ads`           | Ad accounts, campaigns, creatives, insights, top performers          |
| `tiktok-ads`         | Ad accounts, campaigns, ad groups, ads, insights                     |

Remaining MCP-surfaced actions route through the shared agent-executor path.

### Approval gate

High-risk and expensive mutations do not execute on call. They persist a pending
approval and run only once a human approves — `APPROVAL_REQUIRED_TOOLS` in
`apps/server/mcp/src/services/tool-registry.service.ts`: post and article
creation, batch generation, the brand interview writes, external social sends
(`approve_social_draft`, `post_social_reply`, `send_social_dm`), clip project
creation and analysis, remix workflow creation, and every scheduled-release
mutation.

Every entry must be MCP-surfaced or boot fails.

These queued writes are **not** approved by the `posts:approve` API-key scope.
That scope and the `resolve_approval` MCP tool are separate paths; see
[Approval paths](#approval-paths).

### Role filtering and credit visibility

`tools/list` is filtered by the authenticated caller's role
(`filterToolsByRole`); the authoritative gate is still the per-call role check in
`handleToolCall`, and a registry instance resolved without a per-request role
falls back to `user`, denying admin tools by default.

MCP maps the caller's organization membership from `/auth/whoami`
(`apps/server/mcp/src/services/auth.service.ts`): `owner` and `admin` become MCP
`admin`; anything else, including an empty membership, becomes `user`. The MCP
`superadmin` tier is not granted to organization owners or admins. Org
reviewers therefore see user- and admin-tier tools, but not `resolve_approval`.

Each tool advertises its minimum credit charge at
`_meta['genfeed.ai/creditCost']`. `_meta` is the only place vendor data survives
a `tools/list` round trip — the MCP SDK strips unknown keys from `annotations`.

## API keys and scopes

Presets are defined in `packages/contracts/src/constants/api-key-presets.constant.ts`:
`read`, `content`, `mcp`, and `full`.

The **`mcp` preset is approval-first**: it carries `posts:create`, `posts:draft`,
`posts:schedule`, and `posts:approve`, but **not** `posts:publish`. An MCP client
can compose and schedule; `posts:approve` covers approval-scoped REST actions
below, not the `resolve_approval` MCP tool. Direct publish requires a
`full`-scope key, which is how the CLI and API cover the last step.

### Approval paths

`posts:approve`, REST MCP-approval resolve, and the `resolve_approval` MCP tool
are three different grants. Do not treat them as one "approve" permission.

| Path | Who can call it | What it authorizes |
| ---- | --------------- | ------------------ |
| REST / MCP **`approve_social_draft`**, `POST /publish-approvals`, and other approval-scoped product APIs | API key with **`posts:approve`**. Social-inbox REST also requires organization owner or admin. | Approve a social reply/DM draft or a publish-approval. This is **not** `resolve_approval`. |
| REST **`POST /mcp-approvals/:id/resolve`** | Organization **owners** and **admins** (`RolesDecorator(OWNER, ADMIN)` on `McpApprovalsController.resolve`). Session callers use membership. API-key callers that approve a publishing MCP tool also need `posts:approve` (`assertApiKeyPublishingScope(..., 'approve')`). | Approve or decline a pending MCP write. This is the path for organization reviewers. |
| MCP tool **`resolve_approval`** | MCP role **`superadmin`** (`requiredRole` in `packages/actions/src/registry/source/mcp-only/admin.tools.ts`). Org `owner`/`admin` map to MCP `admin` and **do not** satisfy this gate. | The same resolve, exposed as an MCP tool. A `posts:approve` key does not grant it. |

An MCP client holding the `mcp` preset can therefore draft, schedule, and call
approval-scoped REST actions. It cannot discover or invoke `resolve_approval`
unless `/auth/whoami` reports the MCP `superadmin` role. Organization owners
and admins map to MCP `admin` and resolve the queued write from the REST
endpoint or the product UI, not by handing the client `resolve_approval`.

`SELF_SERVICE_API_KEY_SCOPES` is the union of all presets and bounds what a user
may request through the public endpoint. Privileged scopes (`admin`,
`credits:provision`, `managed-inference:execute`) and wildcards are excluded —
those are minted server-side for managed and system keys only.

Keys are created in organization settings, through the guided
[Connect Genfeed](https://app.genfeed.ai/connect) flow, with `gf keys create`, or
through the REST API.

## CLI

`packages/cli` publishes `@genfeedai/cli` with two identical binaries, `genfeed`
and `gf`. Twenty-four command groups are registered in `packages/cli/src/index.ts`:

`auth`, `login`, `logout`, `whoami`, `keys`, `organizations`, `brands`,
`generate`, `status`, `chat`, `threads`, `workflow`, `publish`, `library`,
`profile`, `batch`, `template`, `credits`, `insights`, `schedule`,
`performance`, `posts`, `config`, `tools`.

`gf login` runs a browser PKCE flow against `https://app.genfeed.ai/oauth/cli`
(or against a self-hosted app when you pass `--api-url` / `--app-url`).
`gf login -i` opens a hidden prompt for pasting a key — use that for manual
self-hosted or headless sign-in. Point the CLI at your own deployment with
`GENFEED_API_URL` or `gf config set api-url`. The Cloud default is
`https://api.genfeed.ai/v1` (`packages/cli/src/config/endpoints.ts`).

Do not pass the key as a command-line flag. `-k` / `--key` puts the secret in
`process.argv`, where process listings and shell history can capture it.

For CI, containers, and agent runtimes, inject the key through the secret
environment and run the `gf` command directly.
`packages/cli/src/config/store.ts` reads `GENFEED_API_KEY` at runtime, so a
login step is not required:

```bash
export GENFEED_API_KEY=gf_live_xxx   # from the secret store, not argv
export GENFEED_API_URL=http://localhost:3010/v1   # self-hosted only
gf generate image "product shot on a concrete plinth"
```

## Typed packages

- **`@genfeedai/contracts/api-types`** — types and Zod schemas generated from the OpenAPI
  document, plus hand-written contracts and helpers.
- **`@genfeedai/client`** — shared request/response models and schemas.

Neither is an HTTP client. They type your own calls; there is no generated SDK
with a request layer in this repository.

## GPT Actions

`apps/server/api/src/config/gpt-actions-openapi.json` is served at
`/v1/gpt-actions.json`. It is a deliberately narrow public-read spec — six
`/public/*` paths for articles, images, videos, and publications. It is not a
second general-purpose agent surface, and the MCP catalog is unrelated to it.

## Adding an action

1. Add the definition (schema, description, credit cost, `requiredRole`) to the
   right shard in `packages/actions/src/registry/source/`.
2. Add a catalog entry in `curated-action-catalog.ts`, sorted by name, in the
   canonical single-line form, with the surfaces you intend.
3. Wire an executor: an MCP dispatch group plus a `classify()` entry, or the
   agent executor, matching the surfaces you chose.
4. If the action publishes, sends externally, or spends significant credits, add
   it to `APPROVAL_REQUIRED_TOOLS`.
5. Add focused executor coverage for every surface it lands on.

The catalog reporter will annotate the change on the pull request. A surface
transition is a reviewable decision — record the reasoning when it is not
obvious.
