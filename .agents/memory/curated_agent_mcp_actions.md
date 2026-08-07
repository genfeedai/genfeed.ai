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
and are reported by `.github/workflows/curated-action-catalog.yml`, which
annotates the changed lines and publishes a step-summary table on every pull
request touching the catalog. Keep entries in the canonical single-line form
(`{ name: '...', surfaces: [...] },`, or the four-line publishing-approval
variant) — the reporter parses the file literally and fails on any other
shape. Preserve
ordinary OpenAPI emit/validation for API documentation, but never use OpenAPI to
generate tools or parity gates.
