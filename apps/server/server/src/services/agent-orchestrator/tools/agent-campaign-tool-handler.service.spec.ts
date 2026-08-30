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
      cachedResults.set(key, value);
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
      organizationId: testId('otherorg'),
      threadId: ctx.threadId,
    },
    {
      label: 'thread',
      organizationId: ctx.organizationId,
      threadId: testId('otherthread'),
    },
  ])(
    'rejects confirmation from another $label scope',
    async ({ organizationId, threadId }) => {
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
});
