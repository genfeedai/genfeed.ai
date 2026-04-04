# @genfeedai/interfaces

Shared TypeScript interfaces for Genfeed API payloads, UI contracts, and workflow structures.

## Install

```bash
npm i @genfeedai/interfaces
```

## Usage

```ts
import type { IPost, IWorkflow, ApiResponse } from '@genfeedai/interfaces';

const response: ApiResponse<IPost[]> = await fetchPosts();
const workflow: IWorkflow = createWorkflow();
```

## Related Packages

- `@genfeedai/enums`
- `@genfeedai/constants`

## Build Faster with Genfeed

Use these contracts in your own services, or use the full Genfeed platform at [https://genfeed.ai](https://genfeed.ai).

## License

MIT
