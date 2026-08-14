import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { createRequestAbortSignal } from './request-abort-signal.util';

function fakeRequest(
  overrides: {
    aborted?: boolean;
    destroyed?: boolean;
    writableEnded?: boolean;
  } = {},
): Request {
  const request = new EventEmitter() as EventEmitter & Request;
  const response = new EventEmitter() as EventEmitter & Response;
  Object.assign(response, { writableEnded: overrides.writableEnded ?? false });
  Object.assign(request, {
    aborted: overrides.aborted ?? false,
    destroyed: overrides.destroyed ?? false,
    res: response,
  });
  return request;
}

describe('createRequestAbortSignal', () => {
  it('does not start aborted after the request body stream is consumed', () => {
    // Node auto-destroys IncomingMessage once Express finishes the JSON
    // body. That is the start of waitForCompletion, not a hangup.
    const signal = createRequestAbortSignal(fakeRequest({ destroyed: true }));

    expect(signal.aborted).toBe(false);
  });

  it('starts aborted when the client aborted and the response is still open', () => {
    const signal = createRequestAbortSignal(fakeRequest({ aborted: true }));

    expect(signal.aborted).toBe(true);
  });

  it('does not abort when the incoming request finishes (body received)', () => {
    const request = fakeRequest();
    const signal = createRequestAbortSignal(request);

    request.emit('close');

    expect(signal.aborted).toBe(false);
  });

  it('aborts when the client disconnects before the response ends', () => {
    const request = fakeRequest();
    const signal = createRequestAbortSignal(request);

    expect(signal.aborted).toBe(false);
    request.res?.emit('close');

    expect(signal.aborted).toBe(true);
  });

  it('does not abort when close fires after the response has been written', () => {
    const request = fakeRequest({ writableEnded: true });
    const signal = createRequestAbortSignal(request);

    request.res?.emit('close');

    expect(signal.aborted).toBe(false);
  });
});
