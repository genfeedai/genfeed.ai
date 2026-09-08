import { mockFetch, mockOk } from '@agent-tests/json-api-fetch.mock';
import {
  actOnWorkObject,
  getWorkObjects,
} from '@genfeedai/agent/services/agent-api/agent-api.work-objects';
import { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeApi(): AgentBaseApiService {
  return new AgentBaseApiService({
    baseUrl: 'http://api.test',
    getToken: vi.fn().mockResolvedValue('test-token'),
  });
}

describe('conversation work response decoding', () => {
  beforeEach(() => mockFetch.mockReset());

  for (const operation of ['load', 'action'] as const) {
    const invoke = () =>
      operation === 'load'
        ? getWorkObjects(makeApi(), 'thread-1', 'session-1')
        : actOnWorkObject(makeApi(), 'thread-1', 'work-1', {
            action: 'view',
            revision: 1,
            sessionId: 'session-1',
          });

    it(`${operation} accepts an empty work collection`, async () => {
      const collection = { workObjects: [], sessionAssets: [] };
      mockOk(collection);
      await expect(invoke()).resolves.toEqual(collection);
    });

    it.each([
      null,
      { data: [], meta: { totalCount: 0 } },
      { workObjects: [] },
      { sessionAssets: [] },
      { workObjects: {}, sessionAssets: [] },
      { workObjects: [], sessionAssets: {} },
    ])(
      `${operation} rejects malformed collections without opening the review gate: %j`,
      async (response) => {
        mockOk(response);
        await expect(invoke()).rejects.toBeInstanceOf(AgentApiDecodeError);
      },
    );
  }
});
