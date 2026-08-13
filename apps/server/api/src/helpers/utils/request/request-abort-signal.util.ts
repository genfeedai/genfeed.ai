import type { Request } from 'express';

/**
 * AbortSignal that fires when the HTTP client disconnects before the
 * response has been written. Used so `waitForCompletion` can cancel the
 * provider job instead of polling until timeout after the browser is gone.
 *
 * Successful responses also emit `close`; those are ignored because
 * `writableEnded` is already true.
 */
export function createRequestAbortSignal(request: Request): AbortSignal {
  const controller = new AbortController();
  const response = request.res;

  if (request.destroyed || request.aborted) {
    controller.abort();
    return controller.signal;
  }

  const abortFromClientDisconnect = () => {
    if (controller.signal.aborted) {
      return;
    }
    if (response && !response.writableEnded) {
      controller.abort();
    }
  };

  if (typeof request.once === 'function') {
    request.once('close', abortFromClientDisconnect);
  }
  if (response && typeof response.once === 'function') {
    response.once('close', abortFromClientDisconnect);
  }
  return controller.signal;
}
