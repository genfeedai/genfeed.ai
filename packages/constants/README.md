# @genfeedai/constants

Shared constants used across Genfeed apps and packages.

## Install

```bash
npm i @genfeedai/constants
```

## Usage

```ts
import { PLATFORM_COLORS, MODEL_CAPABILITIES } from '@genfeedai/constants';

const color = PLATFORM_COLORS.youtube;
const supportsImage = MODEL_CAPABILITIES['nano-banana-pro']?.image === true;
```

## Related Packages

- `@genfeedai/enums`
- `@genfeedai/interfaces`

## Build Faster with Genfeed

Use these packages inside your own tooling, or use the full platform at [https://genfeed.ai](https://genfeed.ai).

## License

MIT
