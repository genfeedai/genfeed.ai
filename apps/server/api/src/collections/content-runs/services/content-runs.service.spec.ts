import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import type {
  CreateContentRunInput,
  UpdateContentRunInput,
} from '@genfeedai/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-05-03T10:00:00.000Z');
const updatedAt = new Date('2026-05-03T10:05:00.000Z');

type ContentRunRecord = {
  brandId: string;
  config: Record<string, unknown> | null;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  status: ContentRunStatus;
  updatedAt: Date;
};

type ContentRunDelegate = {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const baseConfig = {
  analyticsSummary: {
    engagementRate: 0.19,
    metadata: { window: '7d' },
    summary: 'Founder-led angle won',
    winningVariantId: 'variant-a',
  },
  brief: {
    audience: 'founders',
    evidence: ['Support tickets mention ideation latency'],
    hypothesis: 'Specific operator pain beats generic AI framing',
  },
  creditsUsed: 0,
  input: { topic: 'AI strategy' },
  publish: {
    experimentId: 'exp-1',
    metadata: { slot: 'morning' },
    platform: 'twitter',
    variantId: 'variant-a',
  },
  recommendations: [
    {
      confidence: 0.78,
      metadata: { source: 'analytics' },
      type: 'repurpose',
    },
  ],
  skillSlug: 'content-writing',
  source: ContentRunSource.HOSTED,
  variants: [
    {
      content: 'A draft',
      id: 'variant-a',
      metadata: { hook: 'pain-first' },
      platform: 'twitter',
      status: 'generated',
      type: 'text',
    },
  ],
};

const makeRun = (
  overrides: Partial<ContentRunRecord> = {},
): ContentRunRecord => ({
  brandId: 'brand-1',
  config: baseConfig,
  createdAt,
  id: 'run-1',
  isDeleted: false,
  organizationId: 'org-1',
  status: ContentRunStatus.PENDING,
  updatedAt,
  ...overrides,
});

describe('ContentRunsService', () => {
  let contentRun: ContentRunDelegate;
  let service: ContentRunsService;

  beforeEach(() => {
    vi.clearAllMocks();

    contentRun = {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    };

    service = new ContentRunsService({
      contentRun,
    } as unknown as PrismaService);
  });

  it('creates a run with lifecycle fields in config and returns the serializer contract', async () => {
    const payload: CreateContentRunInput = {
      brand: 'brand-1',
      organization: 'org-1',
      status: ContentRunStatus.PENDING,
      ...baseConfig,
    };
    contentRun.create.mockResolvedValue(makeRun());

    const result = await service.createRun(payload);

    expect(contentRun.create).toHaveBeenCalledWith({
      data: {
        brandId: 'brand-1',
        config: expect.objectContaining({
          analyticsSummary: baseConfig.analyticsSummary,
          brief: baseConfig.brief,
          input: baseConfig.input,
          publish: baseConfig.publish,
          recommendations: baseConfig.recommendations,
          skillSlug: 'content-writing',
          source: ContentRunSource.HOSTED,
          variants: baseConfig.variants,
        }),
        isDeleted: false,
        organizationId: 'org-1',
        status: ContentRunStatus.PENDING,
      },
    });
    expect(result).toMatchObject({
      _id: 'run-1',
      analyticsSummary: baseConfig.analyticsSummary,
      brand: 'brand-1',
      brief: baseConfig.brief,
      organization: 'org-1',
      publish: baseConfig.publish,
      recommendations: baseConfig.recommendations,
      skillSlug: 'content-writing',
      source: ContentRunSource.HOSTED,
      status: ContentRunStatus.PENDING,
      variants: baseConfig.variants,
    });
  });

  it('creates a research brief run with source evidence preserved', async () => {
    contentRun.create.mockResolvedValue(
      makeRun({
        config: {
          brief: {
            angle: 'AI agents are getting embedded directly into workflows',
            audience: 'founders',
            callToAction: 'Try the workflow template',
            channelFit: 'Works as a concise X thread',
            confidence: 0.84,
            evidence: [
              'AI agents are getting embedded directly into content workflows.',
              'Creator: @builderx',
              'Source: https://x.com/builderx/status/1',
              'Matched trends: #AIAgents',
            ],
            hypothesis:
              'Operational AI agent examples will outperform generic AI claims',
            risk: 'Avoid implying autonomous publishing without review',
            sourceId: 'source-ref-1',
            sourceUrl: 'https://x.com/builderx/status/1',
          },
          creditsUsed: 0,
          handoffType: 'research-to-brief',
          input: {
            handoffType: 'research-to-brief',
            platform: 'twitter',
            trendId: 'trend-1',
            trendTopic: '#AIAgents',
          },
          publish: {
            metadata: {
              sourceReferenceId: 'source-ref-1',
              sourceUrl: 'https://x.com/builderx/status/1',
              trendId: 'trend-1',
              trendTopic: '#AIAgents',
            },
            platform: 'twitter',
          },
          skillSlug: 'trend-remix',
          source: ContentRunSource.HOSTED,
        },
      }),
    );

    const result = await service.createBriefRun('org-1', 'brand-1', {
      authorHandle: 'builderx',
      audience: 'founders',
      callToAction: 'Try the workflow template',
      channelFit: 'Works as a concise X thread',
      confidence: 0.84,
      evidence: [
        'AI agents are getting embedded directly into content workflows.',
      ],
      hypothesis:
        'Operational AI agent examples will outperform generic AI claims',
      matchedTrends: ['#AIAgents'],
      platform: 'twitter',
      risk: 'Avoid implying autonomous publishing without review',
      sourceReferenceId: 'source-ref-1',
      sourceUrl: 'https://x.com/builderx/status/1',
      text: 'AI agents are getting embedded directly into content workflows.',
      title: 'AI agents are getting embedded directly into workflows',
      trendId: 'trend-1',
      trendTopic: '#AIAgents',
    });

    expect(contentRun.create).toHaveBeenCalledWith({
      data: {
        brandId: 'brand-1',
        config: expect.objectContaining({
          brief: expect.objectContaining({
            audience: 'founders',
            callToAction: 'Try the workflow template',
            channelFit: 'Works as a concise X thread',
            confidence: 0.84,
            evidence: expect.arrayContaining([
              'AI agents are getting embedded directly into content workflows.',
              'Creator: @builderx',
              'Source: https://x.com/builderx/status/1',
              'Matched trends: #AIAgents',
            ]),
            hypothesis:
              'Operational AI agent examples will outperform generic AI claims',
            risk: 'Avoid implying autonomous publishing without review',
            sourceId: 'source-ref-1',
            sourceUrl: 'https://x.com/builderx/status/1',
          }),
          input: expect.objectContaining({
            handoffType: 'research-to-brief',
            platform: 'twitter',
            trendId: 'trend-1',
          }),
          publish: expect.objectContaining({
            metadata: expect.objectContaining({
              sourceReferenceId: 'source-ref-1',
              sourceUrl: 'https://x.com/builderx/status/1',
              trendId: 'trend-1',
            }),
            platform: 'twitter',
          }),
          skillSlug: 'trend-remix',
        }),
        isDeleted: false,
        organizationId: 'org-1',
        status: ContentRunStatus.PENDING,
      },
    });
    expect(result).toMatchObject({
      _id: 'run-1',
      brief: expect.objectContaining({
        evidence: expect.arrayContaining([
          'AI agents are getting embedded directly into content workflows.',
        ]),
        sourceUrl: 'https://x.com/builderx/status/1',
      }),
      organization: 'org-1',
      skillSlug: 'trend-remix',
      status: ContentRunStatus.PENDING,
    });
  });

  it('patches a run by merging lifecycle fields into existing config', async () => {
    const patch: UpdateContentRunInput = {
      analyticsSummary: {
        metadata: { window: '24h' },
        summary: 'Variant B is now winning',
        winningVariantId: 'variant-b',
      },
      creditsUsed: 8,
      status: ContentRunStatus.COMPLETED,
    };
    contentRun.findFirst.mockResolvedValue(makeRun());
    contentRun.update.mockResolvedValue(
      makeRun({
        config: { ...baseConfig, ...patch },
        status: ContentRunStatus.COMPLETED,
      }),
    );

    const result = await service.patchRun('org-1', 'run-1', patch);

    expect(contentRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'run-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(contentRun.update).toHaveBeenCalledWith({
      data: {
        config: expect.objectContaining({
          analyticsSummary: patch.analyticsSummary,
          brief: baseConfig.brief,
          creditsUsed: 8,
          skillSlug: 'content-writing',
          status: ContentRunStatus.COMPLETED,
        }),
        status: ContentRunStatus.COMPLETED,
      },
      where: { id: 'run-1' },
    });
    expect(result).toMatchObject({
      _id: 'run-1',
      analyticsSummary: patch.analyticsSummary,
      brief: baseConfig.brief,
      creditsUsed: 8,
      organization: 'org-1',
      skillSlug: 'content-writing',
      status: ContentRunStatus.COMPLETED,
    });
  });

  it('throws when patching a missing scoped run', async () => {
    contentRun.findFirst.mockResolvedValue(null);

    await expect(
      service.patchRun('org-1', 'missing-run', {
        status: ContentRunStatus.FAILED,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(contentRun.update).not.toHaveBeenCalled();
  });

  it('lists runs by brand without querying a non-existent skillSlug column', async () => {
    contentRun.findMany.mockResolvedValue([
      makeRun(),
      makeRun({
        config: { ...baseConfig, skillSlug: 'image-generation' },
        id: 'run-2',
      }),
    ]);

    const result = await service.listByBrand(
      'org-1',
      'brand-1',
      'content-writing',
      ContentRunStatus.PENDING,
    );

    expect(contentRun.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: ContentRunStatus.PENDING,
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      _id: 'run-1',
      organization: 'org-1',
      skillSlug: 'content-writing',
    });
  });

  it('hydrates a scoped run by id from its stored config', async () => {
    contentRun.findFirst.mockResolvedValue(makeRun());

    const result = await service.getRunById('org-1', 'run-1');

    expect(contentRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(result).toMatchObject({
      _id: 'run-1',
      brand: 'brand-1',
      brief: baseConfig.brief,
      organization: 'org-1',
      publish: baseConfig.publish,
      skillSlug: 'content-writing',
      status: ContentRunStatus.PENDING,
      variants: baseConfig.variants,
    });
  });
});
