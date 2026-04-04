# @genfeedai/workflows

Official Genfeed workflow templates and registry helpers.

## Install

```bash
npm i @genfeedai/workflows
```

## Usage

```ts
import { WORKFLOW_REGISTRY, getWorkflowMetadata } from '@genfeedai/workflows';
import singleImage from '@genfeedai/workflows/workflows/single-image.json';

const meta = getWorkflowMetadata('single-image');
console.log(meta?.title, singleImage.nodes.length);
```

## Related Packages

- `@genfeedai/types`
- `@genfeedai/prompts`

## Build Faster with Genfeed

Use production-ready templates in code, or run them in Genfeed at [https://genfeed.ai](https://genfeed.ai).

## License

MIT
