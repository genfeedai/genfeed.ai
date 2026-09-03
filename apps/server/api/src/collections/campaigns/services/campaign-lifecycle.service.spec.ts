import { CampaignLifecycleService } from '@api/collections/campaigns/services/campaign-lifecycle.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PostLifecycleService } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'org-1';
const BRAND_ID = 'cbrand0000001';
const CAMPAIGN_ID = 'ccampaign0001';
const USER_ID = 'legacy-base62-user-id';

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    brandId: BRAND_ID,
    brief: 'One brief',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    endDate: null,
    id: CAMPAIGN_ID,
    idempotencyKey: null,
    isDeleted: false,
    name: 'Q4 launch',
    objective: null,
    organizationId: ORG_ID,
    startDate: null,
    status: ContentCampaignStatus.DRAFT,
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

function postRow(overrides: Record<string, unknown> = {}) {
  return {
    brandId: BRAND_ID,
    campaignId: CAMPAIGN_ID,
    id: 'cpost00000001',
    organizationId: ORG_ID,
    parentId: null,
    reviewDecision: ReviewDecision.APPROVED,
    scheduledDate: new Date('2027-09-10T12:00:00.000Z'),
    targetExecutionState: TargetExecutionState.DRAFT,
    userId: USER_ID,
    ...overrides,
  };
}

function asMock(fn: unknown) {
  return fn as ReturnType<typeof vi.fn>;
}

describe('CampaignLifecycleService', () => {
  const prisma = {
    campaign: { findFirst: vi.fn(), update: vi.fn() },
    post: { findMany: vi.fn() },
  } as unknown as PrismaService;
  const postLifecycleService = {
    transition: vi.fn(),
  };
  const publishApprovalsService = {
    createForCurrentPost: vi.fn(),
  };
  const scheduledPostWorkflowQueue = { enqueue: vi.fn() };
  const logger = { log: vi.fn(), warn: vi.fn() };
  let service: CampaignLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new CampaignLifecycleService(
      prisma,
      logger as never,
      postLifecycleService as unknown as PostLifecycleService,
      publishApprovalsService as never,
      scheduledPostWorkflowQueue as never,
    );
    asMock(prisma.campaign.findFirst).mockResolvedValue(campaignRow());
    asMock(prisma.campaign.update).mockResolvedValue(
      campaignRow({ status: ContentCampaignStatus.ACTIVE }),
    );
    asMock(publishApprovalsService.createForCurrentPost).mockResolvedValue({
      artifactVersionPinId: 'pin-1',
      id: 'approval-1',
      operationId: 'op-1',
    });
  });

  it('starts approved scheduled drafts and reports ineligible review independently', async () => {
    asMock(prisma.post.findMany).mockResolvedValue([
      postRow(),
      postRow({
        id: 'cpost00000002',
        reviewDecision: ReviewDecision.REJECTED,
      }),
      postRow({
        id: 'cpost00000003',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    ]);
    asMock(postLifecycleService.transition).mockResolvedValue({
      kind: 'transitioned',
      target: postRow({
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    });

    const result = await service.start(ORG_ID, USER_ID, CAMPAIGN_ID);

    expect(result.action).toBe(ContentCampaignLifecycleAction.START);
    expect(result.campaign.status).toBe(ContentCampaignStatus.ACTIVE);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'cpost00000001',
        status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
      }),
      expect.objectContaining({
        id: 'cpost00000002',
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
      }),
      expect.objectContaining({
        id: 'cpost00000003',
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      }),
    ]);
    expect(postLifecycleService.transition).toHaveBeenCalledTimes(1);
    expect(publishApprovalsService.createForCurrentPost).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'scheduled',
        postId: 'cpost00000001',
      }),
    );
  });

  it('pauses scheduled targets and leaves queued and published work unchanged', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(
      campaignRow({ status: ContentCampaignStatus.ACTIVE }),
    );
    asMock(prisma.campaign.update).mockResolvedValue(
      campaignRow({ status: ContentCampaignStatus.PAUSED }),
    );
    asMock(prisma.post.findMany).mockResolvedValue([
      postRow({ targetExecutionState: TargetExecutionState.SCHEDULED }),
      postRow({
        id: 'cpost00000002',
        targetExecutionState: TargetExecutionState.PUBLISHING,
      }),
      postRow({
        id: 'cpost00000003',
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    ]);
    asMock(postLifecycleService.transition).mockResolvedValue({
      kind: 'transitioned',
      target: postRow({ targetExecutionState: TargetExecutionState.PAUSED }),
    });

    const result = await service.pause(ORG_ID, USER_ID, CAMPAIGN_ID);

    expect(result.campaign.status).toBe(ContentCampaignStatus.PAUSED);
    expect(result.items.map((item) => item.status)).toEqual([
      ContentCampaignItemOutcomeStatus.SUCCEEDED,
      ContentCampaignItemOutcomeStatus.SKIPPED,
      ContentCampaignItemOutcomeStatus.SKIPPED,
    ]);
    expect(postLifecycleService.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: TargetExecutionState.PAUSED,
        postId: 'cpost00000001',
      }),
    );
  });

  it('keeps a failed item retryable without rolling back siblings', async () => {
    asMock(prisma.post.findMany).mockResolvedValue([
      postRow(),
      postRow({ id: 'cpost00000002' }),
    ]);
    asMock(postLifecycleService.transition)
      .mockResolvedValueOnce({
        kind: 'transitioned',
        target: postRow({
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      })
      .mockRejectedValueOnce(new Error('approval mint failed'));

    const result = await service.start(ORG_ID, USER_ID, CAMPAIGN_ID);

    expect(result.items[0]?.status).toBe(
      ContentCampaignItemOutcomeStatus.SUCCEEDED,
    );
    expect(result.items[1]).toEqual(
      expect.objectContaining({
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.FAILED,
      }),
    );
    expect(prisma.campaign.update).toHaveBeenCalled();
  });

  it('rejects start on an archived campaign', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(
      campaignRow({ status: ContentCampaignStatus.ARCHIVED }),
    );

    await expect(
      service.start(ORG_ID, USER_ID, CAMPAIGN_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('never reads a campaign owned by another organization', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(null);

    await expect(
      service.pause('org-2', USER_ID, CAMPAIGN_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
