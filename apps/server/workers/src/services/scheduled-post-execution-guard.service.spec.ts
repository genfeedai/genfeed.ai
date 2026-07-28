import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';

describe('ScheduledPostExecutionGuardService', () => {
  const artifactReferenceService = {
    assertVersionPinCurrent: vi.fn(),
  };
  const scopeContextService = {
    assertConsequentialBoundary: vi.fn(),
    assertResourceBrand: vi.fn(),
  };
  const service = new ScheduledPostExecutionGuardService(
    artifactReferenceService as never,
    scopeContextService as never,
  );

  beforeEach(() => {
    artifactReferenceService.assertVersionPinCurrent.mockResolvedValue({
      reference: {
        kind: 'post',
        recordId: 'post-1',
      },
    });
    scopeContextService.assertConsequentialBoundary.mockResolvedValue(
      undefined,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('validates a durable version pin in the post tenant and brand scope', async () => {
    await service.assertPublishVersionPin(
      {
        brandId: 'brand-1',
        id: 'post-1',
        organizationId: 'org-1',
        reviewVersionPinId: 'pin-1',
      } as never,
      'pin-1',
    );

    expect(
      artifactReferenceService.assertVersionPinCurrent,
    ).toHaveBeenCalledWith({
      pinId: 'pin-1',
      readContext: {
        brandId: 'brand-1',
        organizationId: 'org-1',
      },
    });
  });

  it('rejects a queued pin after the durable review pin changes', async () => {
    await expect(
      service.assertPublishVersionPin(
        {
          id: 'post-1',
          organizationId: 'org-1',
          reviewVersionPinId: 'pin-2',
        } as never,
        'pin-1',
      ),
    ).rejects.toThrow('does not match');
    expect(
      artifactReferenceService.assertVersionPinCurrent,
    ).not.toHaveBeenCalled();
  });

  it('rejects incomplete durable agent scope before provider execution', async () => {
    await expect(
      service.assertAgentPublishingScope({
        agentContextSource: 'explicit',
        agentThreadId: 'thread-1',
        id: 'post-1',
        organizationId: 'org-1',
        userId: 'user-1',
      } as never),
    ).rejects.toThrow('incomplete durable agent scope');
    expect(
      scopeContextService.assertConsequentialBoundary,
    ).not.toHaveBeenCalled();
  });

  it('enforces consequential and brand scope for agent-authored posts', async () => {
    const post = {
      agentContextSource: 'explicit',
      agentContextVersion: 2,
      agentThreadId: 'thread-1',
      brandId: 'brand-1',
      id: 'post-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };

    await service.assertAgentPublishingScope(post as never);

    const expectedScope = {
      brandId: 'brand-1',
      contextVersion: 2,
      isLegacyFallback: false,
      isVersionExplicit: true,
      organizationId: 'org-1',
      source: 'explicit',
      threadId: 'thread-1',
      userId: 'user-1',
    };
    expect(
      scopeContextService.assertConsequentialBoundary,
    ).toHaveBeenCalledWith(expectedScope, 'publish');
    expect(scopeContextService.assertResourceBrand).toHaveBeenCalledWith(
      expectedScope,
      'brand-1',
      'queued post',
    );
  });
});
