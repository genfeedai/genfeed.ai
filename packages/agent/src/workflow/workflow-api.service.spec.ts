import { createWorkflowApiService } from '@genfeedai/agent/workflow/workflow-api.service';
import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createWorkflowApiService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      json: async () => ({}),
      ok: true,
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearRequestOrganizationId();
  });

  it('sends the confirmed routed organization so the API fails closed on drift', async () => {
    setRequestOrganizationId('org_alpha');
    const service = createWorkflowApiService('https://api.test', () => 'tok');

    await service.forceAdvance('workflow-1');

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer tok',
      [ORGANIZATION_CONTEXT_HEADER]: 'org_alpha',
    });
  });

  it('omits the organization header while no organization is confirmed', async () => {
    const service = createWorkflowApiService('https://api.test', () => 'tok');

    await service.forceAdvance('workflow-1');

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.headers).not.toHaveProperty(ORGANIZATION_CONTEXT_HEADER);
  });
});
