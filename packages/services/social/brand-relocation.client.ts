import { BrandRelocationStatus } from '@genfeedai/contracts';
import type { IBrandRelocationOperation } from '@genfeedai/contracts/interfaces';
import type { JsonApiResponseDocument } from '@services/core/json-api';

export interface BrandRelocationPollOptions {
  signal?: AbortSignal;
  onProcessing?: (isReconnecting: boolean) => void;
}

export interface BrandRelocationDocument {
  data: { id: string; attributes: Omit<IBrandRelocationOperation, 'id'> };
  meta?: { brand?: JsonApiResponseDocument };
}

export interface BrandRelocationPollResponse {
  operation: IBrandRelocationOperation;
  brand?: JsonApiResponseDocument;
}

export class BrandRelocationFailedError extends Error {
  readonly status = 409;
}

function isDefiniteRejection(error: unknown): boolean {
  const value = error as { status?: number; response?: { status?: number } };
  const status = value?.response?.status ?? value?.status;
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    ![408, 429].includes(status)
  );
}

function pause(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, 1000);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** A lost response is an unknown outcome, never a confirmed failed move. */
export async function pollBrandRelocation(
  submit: () => Promise<BrandRelocationPollResponse>,
  read: () => Promise<BrandRelocationPollResponse>,
  options: BrandRelocationPollOptions = {},
): Promise<BrandRelocationPollResponse> {
  let isAccepted = false;
  while (true) {
    options.signal?.throwIfAborted();
    let response: BrandRelocationPollResponse;
    try {
      response = await (isAccepted ? read() : submit());
      isAccepted = true;
    } catch (error) {
      options.signal?.throwIfAborted();
      // A resubmitted request carries the same idempotency key, so a 4xx on a
      // retry is as final as one on the first attempt.
      if (isDefiniteRejection(error)) throw error;
      options.onProcessing?.(true);
      await pause(options.signal);
      continue;
    }
    if (response.operation.status === BrandRelocationStatus.DONE)
      return response;
    if (response.operation.status === BrandRelocationStatus.FAILED) {
      throw new BrandRelocationFailedError(
        response.operation.error ??
          'The move was rolled back. Please try again.',
      );
    }
    options.onProcessing?.(false);
    await pause(options.signal);
  }
}
