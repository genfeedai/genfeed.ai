# @genfeedai/actions

Canonical Genfeed action registry shared by workflows, Cloud, CLI, and MCP
adapters.

Workflows execute product actions; Agent and MCP expose curated adapters over
those actions, not one tool per REST endpoint.
`src/registry/curated-action-catalog.ts` is the reviewed source of truth for
whether each action appears on Agent, MCP, or both. Definition shards provide
schemas and metadata but do not control surface exposure.

## Install

```bash
npm i @genfeedai/actions
```

## Usage

```ts
import { getToolsForSurface, toMcpTools, toAgentTools } from '@genfeedai/actions';

const mcp = toMcpTools(getToolsForSurface('mcp'));
const agent = toAgentTools(getToolsForSurface('agent'));
```

Catalog additions, removals, and surface transitions trigger the Curated Action
Catalog workflow, which emits review warnings and a step summary. Ordinary
OpenAPI generation documents the HTTP API and is intentionally independent.

## Related Packages

- `@genfeedai/contracts/interfaces`

## Build Faster with Genfeed

Use one canonical tool catalog in your stack, or run end-to-end workflows at [https://genfeed.ai](https://genfeed.ai).

## License

MIT
