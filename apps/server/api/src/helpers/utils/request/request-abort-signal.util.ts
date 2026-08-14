import type { Request } from 'express';

/**
 * AbortSignal that fires when the HTTP client disconnects before the
 * response has been written. Used so `waitForCompletion` can cancel the
 * provider job instead of polling until timeout after the browser is gone.
 *
 * Do not treat a consumed IncomingMessage as a hangup. Node auto-destroys
 * the request stream after Express reads the JSON body, and `request.close`
 * also fires then. Either one canceled Replicate in under a second.
 *
 * Listen only to `response.close`. Successful responses also emit `close`;
 * those are ignored because `writableEnded` is already true.
 */
export function createRequestAbortSignal(request: Request): AbortSignal {
  const controller = new AbortController();
  const response = request.res;

  if (request.aborted && !response?.writableEnded) {
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

  if (response && typeof response.once === 'function') {
    response.once('close', abortFromClientDisconnect);
  }
  return controller.signal;
}
