import { SetMetadata } from '@nestjs/common';

export const REQUEST_TIMEOUT_MS = 'requestTimeoutMs';

/** Override the 30-second request limit only for bounded, long-running handlers. */
export const RequestTimeout = (milliseconds: number) =>
  SetMetadata(REQUEST_TIMEOUT_MS, milliseconds);
