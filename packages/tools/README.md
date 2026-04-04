# @genfeedai/tools

Canonical Genfeed tool registry shared across Cloud, CLI, and MCP adapters.

## Install

```bash
npm i @genfeedai/tools
```

## Usage

```ts
import { getToolsForSurface, toMcpTools, toAgentTools } from '@genfeedai/tools';

const mcp = toMcpTools(getToolsForSurface('mcp'));
const agent = toAgentTools(getToolsForSurface('agent'));
```

## Related Packages

- `@genfeedai/interfaces`

## Build Faster with Genfeed

Use one canonical tool catalog in your stack, or run end-to-end workflows at [https://genfeed.ai](https://genfeed.ai).

## License

MIT
