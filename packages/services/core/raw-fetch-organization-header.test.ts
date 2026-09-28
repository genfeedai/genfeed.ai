import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  collectionDocument,
  fetchResponse,
  installMockFetch,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { ContextsService } from '@services/ai/contexts.service';
import { OptimizersService } from '@services/ai/optimizers.service';
import { ProfilesService } from '@services/ai/profiles.service';
import { SubscriptionAttributionService } from '@services/analytics/subscription-attribution.service';
import { SmartSchedulerService } from '@services/automation/schedules.service';
import { WorkflowExecutionsService } from '@services/automation/workflow-executions.service';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import { ElementsService } from '@services/elements/elements.service';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const token = 'raw-fetch-token';

/**
 * Every raw-`fetch` tenant client in this package, one request each. The
 * routed organization must reach the API so `CombinedAuthGuard` can reject
 * organization drift (#5393).
 */
const rawFetchClients: Array<{
  name: string;
  payload: unknown;
  send: () => Promise<unknown>;
}> = [
  {
    name: 'ContextsService',
    payload: collectionDocument([{ id: 'ctx_1', label: 'Docs' }]),
    send: () => ContextsService.getInstance(token).listContexts(),
  },
  {
    name: 'OptimizersService',
    payload: { overall: 80 },
    send: () =>
      OptimizersService.getInstance(token).analyzeContent({
        content: 'Draft',
        type: 'post',
      }),
  },
  {
    name: 'ProfilesService',
    payload: collectionDocument([{ id: 'tone_1', name: 'Warm' }]),
    send: () => ProfilesService.getInstance(token).getToneProfiles(),
  },
  {
    name: 'SmartSchedulerService',
    payload: resourceDocument({ status: 'running' }, { id: 'exec_1' }),
    send: () =>
      SmartSchedulerService.getInstance(token).getExecutionStatus('exec_1'),
  },
  {
    name: 'SubscriptionAttributionService',
    payload: { subscriptions: 1 },
    send: () =>
      SubscriptionAttributionService.getInstance(
        token,
      ).getContentSubscriptionStats('content_1'),
  },
  {
    name: 'WorkflowExecutionsService',
    payload: resourceDocument({ status: 'running' }, { id: 'exec_1' }),
    send: () => WorkflowExecutionsService.getInstance(token).getById('exec_1'),
  },
];

describe('raw-fetch tenant clients send the routed organization header', () => {
  let fetchMock: ReturnType<typeof installMockFetch>;

  beforeEach(() => {
    fetchMock = installMockFetch();
  });

  afterEach(() => {
    clearRequestOrganizationId();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(rawFetchClients)('$name', async ({ payload, send }) => {
    fetchMock.mockResolvedValue(fetchResponse(payload));
    setRequestOrganizationId('org-a');

    await send();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers[ORGANIZATION_CONTEXT_HEADER]).toBe('org-a');
    expect(headers.Authorization).toBe(`Bearer ${token}`);
  });

  it.each(rawFetchClients)(
    '$name omits it with no routed organization',
    async ({ payload, send }) => {
      fetchMock.mockResolvedValue(fetchResponse(payload));

      await send();

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(init.headers).not.toHaveProperty(ORGANIZATION_CONTEXT_HEADER);
    },
  );

  it('ElementsService', async () => {
    const collections = Object.fromEntries(
      [
        'blacklists',
        'cameraMovements',
        'cameras',
        'lenses',
        'lightings',
        'moods',
        'scenes',
        'sounds',
        'styles',
      ].map((key) => [key, collectionDocument([])]),
    );
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { data: collections } });
    setRequestOrganizationId('org-a');

    await ElementsService.findAllElements(token);

    const headers = get.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers[ORGANIZATION_CONTEXT_HEADER]).toBe('org-a');
    expect(headers.Authorization).toBe(`Bearer ${token}`);
  });
});
