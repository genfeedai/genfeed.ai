import { OutreachCampaignsService } from '@server/collections/outreach-campaigns/services/outreach-campaigns.service';
import { AgentCampaignToolHandler } from '@server/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { CampaignPlatform, CampaignType } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
    start: vi.fn(),
  };

  let handler: AgentCampaignToolHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AgentCampaignToolHandler,
        {
          provide: OutreachCampaignsService,
          useValue: campaignsService,
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
});
