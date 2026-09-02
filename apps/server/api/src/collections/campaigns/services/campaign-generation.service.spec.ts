import { CampaignGenerationService } from '@api/collections/campaigns/services/campaign-generation.service';
import type { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import type { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentCampaignItemOutcomeStatus,
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
  CredentialPlatform,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'org-1';
const BRAND_ID = 'cbrand0000001';
const CAMPAIGN_ID = 'ccampaign0001';
const USER_ID = 'legacy-base62-user-id';
const CREDENTIAL_ID = 'ccred00000001';

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    brandId: BRAND_ID,
    brief: 'One reveal beat',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    endDate: null,
    id: CAMPAIGN_ID,
    idempotencyKey: null,
    isDeleted: false,
    name: 'Q4 launch',
    objective: 'Fill the pipeline',
    organizationId: ORG_ID,
    startDate: null,
    status: ContentCampaignStatus.DRAFT,
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

function asMock(fn: unknown) {
  return fn as ReturnType<typeof vi.fn>;
}

describe('CampaignGenerationService', () => {
  const prisma = {
    campaign: { findFirst: vi.fn() },
    credential: { findMany: vi.fn() },
    post: { findMany: vi.fn(), updateMany: vi.fn() },
  } as unknown as PrismaService;
  const contentGeneratorService = { generateContent: vi.fn() };
  const postGroupsService = { create: vi.fn() };
  const logger = { log: vi.fn(), warn: vi.fn() };
  let service: CampaignGenerationService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new CampaignGenerationService(
      prisma,
      logger as never,
      contentGeneratorService as unknown as ContentGeneratorService,
      postGroupsService as unknown as PostGroupsService,
    );
    asMock(prisma.campaign.findFirst).mockResolvedValue(campaignRow());
    asMock(prisma.credential.findMany).mockResolvedValue([
      {
        id: CREDENTIAL_ID,
        platform: 'INSTAGRAM',
      },
    ]);
    asMock(prisma.post.findMany).mockResolvedValue([]);
    asMock(contentGeneratorService.generateContent).mockResolvedValue([
      { content: 'IG variant of the brief' },
    ]);
    asMock(postGroupsService.create).mockResolvedValue({
      id: 'group-1',
      targets: [
        {
          executionState: TargetExecutionState.DRAFT,
          id: 'cpost00000001',
        },
      ],
    });
  });

  it('creates draft platform variants stamped with campaign and lineage', async () => {
    const result = await service.generate(ORG_ID, USER_ID, CAMPAIGN_ID, {
      contentRunId: 'crun0000000001',
      source: 'remix',
      workflowExecutionId: 'wexec000000001',
    });

    expect(result.action).toBe(ContentCampaignLifecycleAction.GENERATE);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'cpost00000001',
        status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
      }),
    );
    expect(postGroupsService.create).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      expect.objectContaining({
        brandId: BRAND_ID,
        campaignId: CAMPAIGN_ID,
        status: ReleaseStatus.DRAFT,
        targets: [
          expect.objectContaining({
            credentialId: CREDENTIAL_ID,
            platform: CredentialPlatform.INSTAGRAM,
          }),
        ],
      }),
      undefined,
      {
        contentRunId: 'crun0000000001',
        source: 'remix',
        workflowExecutionId: 'wexec000000001',
      },
    );
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      data: { contentRunId: 'crun0000000001' },
      where: {
        groupId: 'group-1',
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
  });

  it('skips credentials that already have campaign content', async () => {
    asMock(prisma.post.findMany).mockResolvedValue([
      { credentialId: CREDENTIAL_ID },
    ]);

    const result = await service.generate(ORG_ID, USER_ID, CAMPAIGN_ID, {});

    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: CREDENTIAL_ID,
        status: ContentCampaignItemOutcomeStatus.SKIPPED,
      }),
    );
  });

  it('preserves a generation failure as a retryable item outcome', async () => {
    asMock(postGroupsService.create).mockRejectedValue(
      new Error('release create failed'),
    );

    const result = await service.generate(ORG_ID, USER_ID, CAMPAIGN_ID, {});

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        retryable: true,
        status: ContentCampaignItemOutcomeStatus.FAILED,
      }),
    );
  });
});
