import type { CacheService } from '@api/services/cache/cache.service';
import { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import type { CrunResolvedCredential } from '@api/services/integrations/crun/crun-task.schema';

const credential: CrunResolvedCredential = {
  apiKey: 'fixture-key',
  credentialSource: 'hosted',
  credentialId: null,
  credentialFingerprint: 'a'.repeat(64),
};
const request = {
  model: 'google/nano-banana-pro',
  input: { prompt: 'fixture' },
};

describe('Crun single-request transport', () => {
  const gate = vi.fn();
  const transport = vi.fn();
  const client = new CrunClient({
    claimCrunRequestSlot: gate,
  } as unknown as CacheService);
  beforeEach(() => {
    gate.mockReset().mockResolvedValue({ isAdmitted: true, retryAfterMs: 0 });
    transport.mockReset();
    vi.stubGlobal('fetch', transport);
  });
  afterEach(() => vi.unstubAllGlobals());
  function respond(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    transport.mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers }),
    );
  }
  it('sends exact prepared input with timeout and selected credential once', async () => {
    respond(200, { code: 200, message: 'ok', data: { task_id: 'opaque/ID' } });
    expect(await client.createTask(credential, request)).toEqual({
      isValid: true,
      data: { taskId: 'opaque/ID' },
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      'https://api.crun.ai/api/v1/client/job/CreateTask',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        redirect: 'error',
        headers: {
          'X-API-KEY': 'fixture-key',
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(gate).toHaveBeenCalledWith(credential.credentialFingerprint);
  });
  it.each([401, 402, 422, 429, 455, 505])(
    'classifies documented refusal %i without retry',
    async (code) => {
      respond(200, { code, message: 'private key/prompt', data: null });
      expect(await client.createTask(credential, request)).toMatchObject({
        isValid: false,
        disposition: 'refused',
        reasonCode: `CRUN_REFUSED_${code}`,
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each([500, 502, 503])(
    'retains ambiguous acceptance on HTTP %i',
    async (status) => {
      respond(status, { code: status, message: 'private' });
      expect(await client.createTask(credential, request)).toMatchObject({
        disposition: 'ambiguous',
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it('does not retry transport loss or malformed acceptance', async () => {
    transport.mockRejectedValue(new Error('private key'));
    expect(await client.createTask(credential, request)).toMatchObject({
      reasonCode: 'CRUN_TRANSPORT_UNAVAILABLE',
      disposition: 'ambiguous',
    });
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockReset();
    respond(200, { code: 200, message: 'ok', data: {} });
    expect(await client.createTask(credential, request)).toMatchObject({
      disposition: 'ambiguous',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([null, { isAdmitted: false, retryAfterMs: 5000 }])(
    'fails closed before dispatch when shared gate denies',
    async (slot) => {
      gate.mockResolvedValue(slot);
      expect(await client.createTask(credential, request)).toMatchObject({
        disposition: 'deferred',
      });
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it('encodes opaque ID as one query value and binds response identity', async () => {
    respond(200, { code: 200, message: 'ok', data: {} });
    await client.taskInfo(credential, 'ID/&?=+');
    expect(transport.mock.calls[0][0]).toBe(
      'https://api.crun.ai/api/v1/client/job/TaskInfo?task_id=ID%2F%26%3F%3D%2B',
    );
  });
  it('defers safe reads using Retry-After and never sleeps in the request', async () => {
    respond(429, { code: 429, message: 'private' }, { 'retry-after': '75' });
    expect(await client.estimate(credential, request)).toMatchObject({
      disposition: 'deferred',
      retryAfterMs: 75000,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('reports known-task 404 for bounded durable reconciliation', async () => {
    respond(404, { code: 404, message: 'private' });
    expect(await client.taskInfo(credential, 'known')).toMatchObject({
      disposition: 'deferred',
      reasonCode: 'CRUN_TASK_NOT_FOUND',
    });
  });
});
