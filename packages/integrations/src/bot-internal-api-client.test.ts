import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type BotHttpAdapter,
  BotInternalApiClient,
} from './bot-internal-api-client';

function makeMockAdapter(): {
  adapter: BotHttpAdapter;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn();
  const post = vi.fn();
  const adapter: BotHttpAdapter = { get, post };
  return { adapter, get, post };
}

function makeClient(
  platform: 'discord' | 'slack' | 'telegram',
  adapter: BotHttpAdapter,
  apiKey = 'test-key',
): BotInternalApiClient {
  return new BotInternalApiClient({
    apiUrl: 'http://api.local',
    apiKey,
    platform,
    http: adapter,
  });
}

const validPayload = {
  id: 'int-1',
  orgId: 'org-1',
  botToken: 'tok',
  status: 'active',
  config: {},
};

describe('BotInternalApiClient', () => {
  describe('fetchActiveIntegrations', () => {
    it('calls the correct URL for the given platform', async () => {
      const { adapter, get } = makeMockAdapter();
      get.mockResolvedValue([validPayload]);
      const client = makeClient('discord', adapter);

      const result = await client.fetchActiveIntegrations();

      expect(get).toHaveBeenCalledWith(
        'http://api.local/v1/internal/integrations/discord',
        { Authorization: 'Bearer test-key' },
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('int-1');
      expect(result[0].platform).toBe('discord');
    });

    it('uses the platform segment for slack', async () => {
      const { adapter, get } = makeMockAdapter();
      get.mockResolvedValue([]);
      const client = makeClient('slack', adapter);

      await client.fetchActiveIntegrations();

      expect(get).toHaveBeenCalledWith(
        'http://api.local/v1/internal/integrations/slack',
        { Authorization: 'Bearer test-key' },
      );
    });

    it('omits Authorization header when apiKey is absent', async () => {
      const { adapter, get } = makeMockAdapter();
      get.mockResolvedValue([]);
      const client = new BotInternalApiClient({
        apiUrl: 'http://api.local',
        platform: 'telegram',
        http: adapter,
      });

      await client.fetchActiveIntegrations();

      expect(get).toHaveBeenCalledWith(
        'http://api.local/v1/internal/integrations/telegram',
        undefined,
      );
    });

    it('returns empty array when response is not an array', async () => {
      const { adapter, get } = makeMockAdapter();
      get.mockResolvedValue(null);
      const client = makeClient('discord', adapter);

      const result = await client.fetchActiveIntegrations();
      expect(result).toEqual([]);
    });

    it('filters out invalid entries silently', async () => {
      const { adapter, get } = makeMockAdapter();
      get.mockResolvedValue([validPayload, null, {}]);
      const client = makeClient('discord', adapter);

      const result = await client.fetchActiveIntegrations();
      expect(result).toHaveLength(1);
    });
  });

  describe('fetchIntegration', () => {
    it('fetches a single integration by id', async () => {
      const { adapter, get } = makeMockAdapter();
      get.mockResolvedValue(validPayload);
      const client = makeClient('telegram', adapter);

      const result = await client.fetchIntegration('int-1');

      expect(get).toHaveBeenCalledWith(
        'http://api.local/v1/internal/integrations/telegram/int-1',
        { Authorization: 'Bearer test-key' },
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe('int-1');
    });

    it('returns null when payload cannot be normalized', async () => {
      const { adapter, get } = makeMockAdapter();
      get.mockResolvedValue({});
      const client = makeClient('slack', adapter);

      const result = await client.fetchIntegration('missing');
      expect(result).toBeNull();
    });
  });

  describe('fetchOrgWorkflows', () => {
    it('returns the workflow list from the API', async () => {
      const { adapter, get } = makeMockAdapter();
      const workflows = [{ id: 'wf-1', name: 'My workflow' }];
      get.mockResolvedValue(workflows);
      const client = makeClient('discord', adapter);

      const result = await client.fetchOrgWorkflows('org-abc');

      expect(get).toHaveBeenCalledWith(
        'http://api.local/v1/orgs/org-abc/workflows',
        undefined,
      );
      expect(result).toEqual(workflows);
    });
  });

  describe('fetchWorkflow', () => {
    it('returns a single workflow by id', async () => {
      const { adapter, get } = makeMockAdapter();
      const workflow = { id: 'wf-1', name: 'My workflow', nodes: {} };
      get.mockResolvedValue(workflow);
      const client = makeClient('slack', adapter);

      const result = await client.fetchWorkflow('org-abc', 'wf-1');

      expect(get).toHaveBeenCalledWith(
        'http://api.local/v1/orgs/org-abc/workflows/wf-1',
        undefined,
      );
      expect(result).toEqual(workflow);
    });
  });
});
