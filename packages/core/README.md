# @genfeedai/core

Core workflow utilities for pricing, validation, and graph ordering.

## Install

```bash
npm i @genfeedai/core
```

## Usage

```ts
import { validateWorkflow, PRICING } from '@genfeedai/core';
import { topologicalSort } from '@genfeedai/core/topological-sort';

const validation = validateWorkflow(nodes, edges);
const ordered = topologicalSort(nodes, edges);
const cost = PRICING['flux-dev'];
```

## Related Packages

- `@genfeedai/types`
- `@genfeedai/workflow-ui`

## Build Faster with Genfeed

Use these packages directly, or run complete content workflows at [https://genfeed.ai](https://genfeed.ai).

## License

AGPL-3.0
