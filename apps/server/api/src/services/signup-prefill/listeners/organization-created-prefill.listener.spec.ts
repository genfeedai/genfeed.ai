import type { SignupPrefillWorkflowService } from '@api/services/signup-prefill/signup-prefill-workflow.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationCreatedPrefillListener } from './organization-created-prefill.listener';

describe('OrganizationCreatedPrefillListener', () => {
  const workflowService = { enqueuePrefill: vi.fn() };
  const logger = { warn: vi.fn() };
  const listener = new OrganizationCreatedPrefillListener(
    workflowService as unknown as SignupPrefillWorkflowService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    workflowService.enqueuePrefill.mockResolvedValue(undefined);
  });

  it('scans the website typed at creation for the new default brand', async () => {
    await listener.handleOrganizationCreated({
      brandId: 'brand_new',
      organizationId: 'org_new',
      userId: 'user_1',
      websiteUrl: 'acme.com',
    });

    expect(workflowService.enqueuePrefill).toHaveBeenCalledWith(
      {
        brandDomain: 'acme.com',
        brandId: 'brand_new',
        organizationId: 'org_new',
        userId: 'user_1',
      },
      'organization-create',
    );
  });

  it('still seeds defaults without a website and never falls back to an email domain', async () => {
    await listener.handleOrganizationCreated({
      brandId: 'brand_new',
      organizationId: 'org_new',
      userId: 'user_1',
    });

    const [request] = workflowService.enqueuePrefill.mock.calls[0] ?? [];
    expect(request).toEqual({
      brandId: 'brand_new',
      organizationId: 'org_new',
      userId: 'user_1',
    });
    expect(request).not.toHaveProperty('email');
  });

  it('logs and swallows a queue failure', async () => {
    workflowService.enqueuePrefill.mockRejectedValue(new Error('redis down'));

    await expect(
      listener.handleOrganizationCreated({
        brandId: 'brand_new',
        organizationId: 'org_new',
        userId: 'user_1',
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
