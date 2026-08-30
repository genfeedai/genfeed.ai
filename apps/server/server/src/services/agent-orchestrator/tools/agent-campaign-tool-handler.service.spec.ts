import { CampaignPlatform, CampaignType } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutreachCampaignsService } from '@server/collections/outreach-campaigns/services/outreach-campaigns.service';
import { AgentCampaignToolHandler } from '@server/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { CacheService } from '@server/services/cache/cache.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentCampaignToolHandler', () => {
  const ctx: ToolExecutionContext = {
    brandId: testId('brand'),
    organizationId: testId('org'),
    threadId: testId('thread'),
    userId: testId('user'),
  };

  const campaignsService = {
    createScoped: vi.fn(),
    findOneById: vi.fn(),
    pause: vi.fn(),
    start: vi.fn(),
  };
  const cachedResults = new Map<string, unknown>();
  const heldLocks = new Set<string>();
  const cacheService = {
    acquireLock: vi.fn(async (key: string) => {
      if (heldLocks.has(key)) {
        return false;
      }
      heldLocks.add(key);
      return true;
    }),
    get: vi.fn(async (key: string) => cachedResults.get(key) ?? null),
    releaseLock: vi.fn(async (key: string) => {
      heldLocks.delete(key);
    }),
    set: vi.fn(async (key: string, value: unknown) => {
      cachedResults.set(key, structuredClone(value));
      return true;
    }),
  };

  let handler: AgentCampaignToolHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    cachedResults.clear();
    heldLocks.clear();
    const module = await Test.createTestingModule({
      providers: [
        AgentCampaignToolHandler,
        {
          provide: OutreachCampaignsService,
          useValue: campaignsService,
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    }).compile();

    handler = module.get(AgentCampaignToolHandler);
  });

  it('creates an executable X public-reply campaign from credentialId', async () => {
    campaignsService.createScoped.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      platform: CampaignPlatform.TWITTER,
      status: 'draft',
    });

    const result = await handler.createCampaign(
      {
        campaignType: CampaignType.MANUAL,
        credentialId: 'credential-1',
        label: 'Launch',
        platform: CampaignPlatform.TWITTER,
      },
      ctx,
    );

    expect(campaignsService.createScoped).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignType: CampaignType.MANUAL,
        credentialId: 'credential-1',
        platform: CampaignPlatform.TWITTER,
      }),
      expect.objectContaining({
        brandId: ctx.brandId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ campaignId: 'campaign-1' });
  });

  it('ignores credential and requires credentialId', async () => {
    await expect(
      handler.createCampaign(
        {
          campaignType: CampaignType.MANUAL,
          credential: 'credential-legacy',
          label: 'Launch',
          platform: CampaignPlatform.TWITTER,
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(campaignsService.createScoped).not.toHaveBeenCalled();
  });

  it('rejects an unavailable pair before persistence', async () => {
    await expect(
      handler.createCampaign(
        {
          campaignType: CampaignType.MANUAL,
          credentialId: 'credential-1',
          label: 'Launch',
          platform: CampaignPlatform.REDDIT,
        },
        ctx,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'outreach_capability.unavailable',
      }),
    });
    expect(campaignsService.createScoped).not.toHaveBeenCalled();
  });

  it('prepares an exact start intent without starting the campaign', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'draft',
    });

    const result = await handler.startCampaign(
      { campaignId: 'campaign-1' },
      ctx,
    );

    expect(campaignsService.start).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: {
        campaignId: 'campaign-1',
        currentStatus: 'draft',
        intendedStatus: 'active',
        label: 'Launch',
        pendingConfirmation: true,
        transition: 'start',
      },
      requiresConfirmation: true,
      riskLevel: 'medium',
      success: true,
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          campaignId: 'campaign-1',
          currentStatus: 'draft',
          intendedStatus: 'active',
          transition: 'start',
        }),
        requiresConfirmation: true,
        type: 'campaign_control_card',
      }),
    ]);
    expect(result.nextActions?.[0]?.ctas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'send_prompt',
          label: 'Confirm start',
          payload: {
            prompt: expect.stringContaining('campaign-1'),
          },
        }),
      ]),
    );
    expect(cacheService.set).toHaveBeenCalledWith(
      expect.stringContaining(String(result.data?.sourceActionId)),
      expect.objectContaining({
        campaignId: 'campaign-1',
        pendingConfirmation: true,
        transition: 'start',
      }),
      expect.objectContaining({ ttl: expect.any(Number) }),
    );
  });

  it('prepares an exact pause intent without pausing the campaign', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'active',
    });

    const result = await handler.pauseCampaign(
      { campaignId: 'campaign-1' },
      ctx,
    );

    expect(campaignsService.pause).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: {
        campaignId: 'campaign-1',
        currentStatus: 'active',
        intendedStatus: 'paused',
        label: 'Launch',
        pendingConfirmation: true,
        transition: 'pause',
      },
      requiresConfirmation: true,
      riskLevel: 'medium',
      success: true,
    });
  });

  it('fails closed when the confirmation preparation cannot be persisted', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'draft',
    });
    cacheService.set.mockResolvedValueOnce(false);

    await expect(
      handler.startCampaign({ campaignId: 'campaign-1' }, ctx),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(campaignsService.start).not.toHaveBeenCalled();
  });

  it('rejects campaign transitions without a thread context', async () => {
    await expect(
      handler.startCampaign(
        { campaignId: 'campaign-1' },
        { ...ctx, threadId: undefined },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(campaignsService.findOneById).not.toHaveBeenCalled();
    expect(campaignsService.start).not.toHaveBeenCalled();
  });

  it('fails closed when confirmation cache injection is unavailable', async () => {
    const handlerWithoutCache = new AgentCampaignToolHandler(
      campaignsService as never,
    );

    await expect(
      handlerWithoutCache.startCampaign({ campaignId: 'campaign-1' }, ctx),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(campaignsService.findOneById).not.toHaveBeenCalled();
    expect(campaignsService.start).not.toHaveBeenCalled();
  });

  it('treats model-supplied confirmation without a trusted origin as unconfirmed', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'draft',
    });

    const result = await handler.startCampaign(
      {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId: 'campaign-transition-untrusted',
      },
      ctx,
    );

    expect(campaignsService.start).not.toHaveBeenCalled();
    expect(result.requiresConfirmation).toBe(true);
    expect(result.data).toMatchObject({
      campaignId: 'campaign-1',
      pendingConfirmation: true,
      transition: 'start',
    });
  });

  it('starts a confirmed prepared campaign exactly once across retries', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'draft',
    });
    campaignsService.start.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'active',
    });
    const preparation = await handler.startCampaign(
      { campaignId: 'campaign-1' },
      ctx,
    );
    const sourceActionId = String(preparation.data?.sourceActionId);
    const confirmedContext: ToolExecutionContext = {
      ...ctx,
      confirmationOrigin: 'thread-ui-action',
      sourceActionId,
    };
    const params = {
      campaignId: 'campaign-1',
      confirmed: true,
      sourceActionId,
    };

    const first = await handler.startCampaign(params, confirmedContext);
    const retry = await handler.startCampaign(params, confirmedContext);

    expect(campaignsService.start).toHaveBeenCalledTimes(1);
    expect(campaignsService.start).toHaveBeenCalledWith(
      'campaign-1',
      ctx.organizationId,
      ctx.brandId,
    );
    expect(cacheService.acquireLock).toHaveBeenCalledWith(
      expect.stringContaining(sourceActionId),
      60,
    );
    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      data: {
        campaignId: 'campaign-1',
        sourceActionId,
        status: 'active',
        transition: 'start',
      },
      success: true,
    });
    expect(first.requiresConfirmation).toBeUndefined();

    const preparationEntry = Array.from(cachedResults.entries()).find(([key]) =>
      key.startsWith('agent-campaign-preparation:'),
    );
    expect(preparationEntry?.[1]).toMatchObject({
      pendingConfirmation: false,
    });
    for (const key of cachedResults.keys()) {
      if (key.startsWith('idempotency-result:')) {
        cachedResults.delete(key);
      }
    }
    heldLocks.clear();
    await expect(
      handler.startCampaign(params, confirmedContext),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(campaignsService.start).toHaveBeenCalledTimes(1);
  });

  it('pauses only the exact server-confirmed prepared campaign intent', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'active',
    });
    campaignsService.pause.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'paused',
    });
    const preparation = await handler.pauseCampaign(
      { campaignId: 'campaign-1' },
      ctx,
    );
    const sourceActionId = String(preparation.data?.sourceActionId);
    const confirmedContext: ToolExecutionContext = {
      ...ctx,
      confirmationOrigin: 'thread-ui-action',
      sourceActionId,
    };

    const result = await handler.pauseCampaign(
      {
        campaignId: 'campaign-1',
        confirmed: true,
        sourceActionId,
      },
      confirmedContext,
    );

    expect(campaignsService.pause).toHaveBeenCalledWith(
      'campaign-1',
      ctx.organizationId,
      ctx.brandId,
    );
    expect(result).toMatchObject({
      data: {
        campaignId: 'campaign-1',
        sourceActionId,
        status: 'paused',
        transition: 'pause',
      },
      success: true,
    });
    expect(result.requiresConfirmation).toBeUndefined();
  });

  it('rejects confirmation when the persisted preparation targets another campaign', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'draft',
    });
    const preparation = await handler.startCampaign(
      { campaignId: 'campaign-1' },
      ctx,
    );
    const sourceActionId = String(preparation.data?.sourceActionId);

    await expect(
      handler.startCampaign(
        {
          campaignId: 'campaign-2',
          confirmed: true,
          sourceActionId,
        },
        {
          ...ctx,
          confirmationOrigin: 'thread-ui-action',
          sourceActionId,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(campaignsService.start).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'organization',
      brandId: ctx.brandId,
      organizationId: testId('otherorg'),
      threadId: ctx.threadId,
    },
    {
      label: 'thread',
      brandId: ctx.brandId,
      organizationId: ctx.organizationId,
      threadId: testId('otherthread'),
    },
    {
      label: 'brand',
      brandId: testId('otherbrand'),
      organizationId: ctx.organizationId,
      threadId: ctx.threadId,
    },
  ])(
    'rejects confirmation from another $label scope',
    async ({ brandId, organizationId, threadId }) => {
      campaignsService.findOneById.mockResolvedValue({
        id: 'campaign-1',
        label: 'Launch',
        status: 'draft',
      });
      const preparation = await handler.startCampaign(
        { campaignId: 'campaign-1' },
        ctx,
      );
      const sourceActionId = String(preparation.data?.sourceActionId);

      await expect(
        handler.startCampaign(
          {
            campaignId: 'campaign-1',
            confirmed: true,
            sourceActionId,
          },
          {
            ...ctx,
            brandId,
            confirmationOrigin: 'thread-ui-action',
            organizationId,
            sourceActionId,
            threadId,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(campaignsService.start).not.toHaveBeenCalled();
    },
  );

  it('rejects a prepared transition when the campaign state has changed', async () => {
    campaignsService.findOneById
      .mockResolvedValueOnce({
        id: 'campaign-1',
        label: 'Launch',
        status: 'draft',
      })
      .mockResolvedValueOnce({
        id: 'campaign-1',
        label: 'Launch',
        status: 'paused',
      });
    const preparation = await handler.startCampaign(
      { campaignId: 'campaign-1' },
      ctx,
    );
    const sourceActionId = String(preparation.data?.sourceActionId);

    await expect(
      handler.startCampaign(
        {
          campaignId: 'campaign-1',
          confirmed: true,
          sourceActionId,
        },
        {
          ...ctx,
          confirmationOrigin: 'thread-ui-action',
          sourceActionId,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(campaignsService.start).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'active', transition: 'start' as const },
    { status: 'completed', transition: 'start' as const },
    { status: 'draft', transition: 'pause' as const },
    { status: 'paused', transition: 'pause' as const },
  ])(
    'rejects $transition preparation from illegal $status state',
    async ({ status, transition }) => {
      campaignsService.findOneById.mockResolvedValue({
        id: 'campaign-1',
        label: 'Launch',
        status,
      });

      const operation =
        transition === 'start'
          ? handler.startCampaign({ campaignId: 'campaign-1' }, ctx)
          : handler.pauseCampaign({ campaignId: 'campaign-1' }, ctx);

      await expect(operation).rejects.toBeInstanceOf(BadRequestException);
      expect(campaignsService.start).not.toHaveBeenCalled();
      expect(campaignsService.pause).not.toHaveBeenCalled();
    },
  );

  it('rejects a poisoned persisted preparation payload', async () => {
    campaignsService.findOneById.mockResolvedValue({
      id: 'campaign-1',
      label: 'Launch',
      status: 'draft',
    });
    const preparation = await handler.startCampaign(
      { campaignId: 'campaign-1' },
      ctx,
    );
    const sourceActionId = String(preparation.data?.sourceActionId);
    const preparationEntry = Array.from(cachedResults.entries()).find(([key]) =>
      key.includes(sourceActionId),
    );
    if (!preparationEntry) {
      throw new Error('Expected persisted campaign preparation.');
    }
    cachedResults.set(preparationEntry[0], {
      ...(preparationEntry[1] as Record<string, unknown>),
      intendedStatus: 'paused',
    });

    await expect(
      handler.startCampaign(
        {
          campaignId: 'campaign-1',
          confirmed: true,
          sourceActionId,
        },
        {
          ...ctx,
          confirmationOrigin: 'thread-ui-action',
          sourceActionId,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(campaignsService.start).not.toHaveBeenCalled();
  });
});
