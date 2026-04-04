# @genfeedai/errors

Shared terminal-friendly error primitives for Genfeed CLIs.

## Install

```bash
npm i @genfeedai/errors
```

## Usage

```ts
import { ApiError, formatError, handleError } from '@genfeedai/errors';

try {
  throw new ApiError('Request failed', 500, 'Retry in a few seconds');
} catch (err) {
  console.error(formatError(err));
  handleError(err);
}
```

## Related Packages

- `@genfeedai/cli`
- `@genfeedai/skills-pro`

## Build Faster with Genfeed

Ship consistent CLI error handling or run everything in Genfeed at [https://genfeed.ai](https://genfeed.ai).

## License

MIT
