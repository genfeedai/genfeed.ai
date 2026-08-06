---
name: Curated Agent and MCP actions
description: Agent/MCP expose reviewed product actions from one catalog; OpenAPI documents HTTP and never defines tool parity
type: feedback
---

**Rule:** Agent and MCP expose deliberately curated, meaningful product actions.
Do not mirror every API endpoint into either surface and do not measure
correctness with API-to-tool parity or endpoint-count debt ledgers.

**Why:** The former OpenAPI-generated design advertised 1,119 MCP tools (1,041
endpoint mirrors plus 78 curated actions), which degraded tool selection and
mistook transport coverage for user capability. Agent already exposed 78
curated actions; the reviewed hand-authored union is the correct baseline.

**How to apply:** Treat
`packages/tools/src/registry/curated-action-catalog.ts` as the single source of
truth for Agent/MCP surface intent. Keep schemas and metadata in the definition
shards, and require focused Agent/MCP executor coverage for every surfaced
action. Catalog additions, removals, and surface transitions must be intentional
and are reported by `.github/workflows/curated-action-catalog.yml`. Preserve
ordinary OpenAPI emit/validation for API documentation, but never use OpenAPI to
generate tools or parity gates.

**Enforcement (three layers, all in CI or at boot):**

- `packages/tools/src/registry/tool-registry.ts` throws at module load when a
  catalog entry has no definition, a definition has no catalog entry, or either
  side has duplicates.
- MCP: `ToolRegistryService.validateDispatchCoverage` (OnModuleInit) crashes
  boot when the MCP surface and its dispatch disagree.
- Agent: `assertExtensionsAreCurated` in
  `apps/server/api/src/services/agent-orchestrator/tools/agent-tool-registry.ts`
  throws at module load when a `CLOUD_AGENT_TOOL_EXTENSIONS` entry names an
  action the catalog does not surface to the agent, and
  `bun run check:agent-tool-dispatch`
  (`scripts/architecture/check-agent-tool-dispatch.ts`, wired into the CI
  `guards` job and `check:architecture`) fails on either direction of drift —
  cataloged-but-unroutable or routable-but-unreviewed.

`CLOUD_AGENT_TOOL_EXTENSIONS` refines cataloged actions with cloud-only schema
or prompt wording. It is not a place to introduce an action: five live,
credit-costed tools once shipped that way, two of them with an `undefined`
credit cost.
