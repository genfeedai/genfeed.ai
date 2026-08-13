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
  it('starts aborted when the request is already destroyed', () => {
    const signal = createRequestAbortSignal(fakeRequest({ destroyed: true }));

    expect(signal.aborted).toBe(true);
  });

  it('aborts when the client disconnects before the response ends', () => {
    const request = fakeRequest();
    const signal = createRequestAbortSignal(request);

    expect(signal.aborted).toBe(false);
    request.emit('close');

    expect(signal.aborted).toBe(true);
  });

  it('does not abort when close fires after the response has been written', () => {
    const request = fakeRequest({ writableEnded: true });
    const signal = createRequestAbortSignal(request);

    request.emit('close');

    expect(signal.aborted).toBe(false);
  });
});
