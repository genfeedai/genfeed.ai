# @genfeedai/deserializer

JSON:API deserializer for Genfeed API responses.

## Install

```bash
npm i @genfeedai/deserializer
```

## Usage

```ts
import { getDeserializer, isDeserializerRuntime } from '@genfeedai/deserializer';

const output = getDeserializer(document);

if (!isDeserializerRuntime(output)) {
  console.log(output);
}
```

## Related Packages

- `@genfeedai/interfaces`

## Build Faster with Genfeed

Consume Genfeed APIs in your own clients, or use the hosted app at [https://genfeed.ai](https://genfeed.ai).

## License

MIT
