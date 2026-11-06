import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { ReviewablePostsService } from '@api/collections/posts/services/reviewable-posts.service';
import type { SkillsService } from '@api/collections/skills/services/skills.service';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import type { SkillWorkflowService } from '@api/services/skill-executor/skill-executor.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';

interface BrandRow {
  agentConfig?: Record<string, unknown>;
  id: string;
  organizationId: string;
}

interface SkillRun {
  context: Record<string, unknown>;
  params: unknown;
  skillSlug: string;
  userId: unknown;
}

describe('ContentGatewayService', () => {
  const organizationId = testId('org');
  const brandId = testId('brand');

  let brands: BrandRow[];
  let enabledSkills: string[];
  let skillRuns: SkillRun[];
  let savedPosts: Array<Record<string, unknown>>;
  let service: ContentGatewayService;

  beforeEach(() => {
    brands = [{ id: brandId, organizationId }];
    enabledSkills = ['content-writing'];
    skillRuns = [];
    savedPosts = [];

    const brandsService = {
      findOne: async (where: { id: string; organizationId: string }) =>
        brands.find(
          (row) =>
            row.id === where.id && row.organizationId === where.organizationId,
        ) ?? null,
    };
    const skillsService = {
      getEnabledSkillSlugs: async (
        _organizationId: string,
        _brandId: string,
        requested?: string[],
      ) =>
        requested
          ? enabledSkills.filter((slug) => requested.includes(slug))
          : enabledSkills,
    };
    const skillWorkflowService = {
      execute: async (
        skillSlug: string,
        context: Record<string, unknown>,
        params: unknown,
        userId: unknown,
      ) => {
        skillRuns.push({ context, params, skillSlug, userId });
        const executionId = `execution-${skillRuns.length}`;
        return {
          draft: {
            content: `draft from ${skillSlug}`,
            metadata: {},
            platforms: [],
            skillSlug,
            type: 'text',
          },
          executionId,
        };
      },
    };
    const reviewablePostsService = {
      createFromSkillExecution: async (input: {
        drafts: Array<{ content: string }>;
        executionId: string;
      }) => {
        savedPosts.push(input as unknown as Record<string, unknown>);
        return input.drafts.map((draft) => ({
          description: draft.content,
          id: `post-for-${input.executionId}`,
        }));
      },
    };
    const logger = { debug: () => {}, error: () => {}, log: () => {} };

    service = new ContentGatewayService(
      brandsService as unknown as BrandsService,
      skillsService as unknown as SkillsService,
      skillWorkflowService as unknown as SkillWorkflowService,
      reviewablePostsService as unknown as ReviewablePostsService,
      logger as unknown as LoggerService,
    );
  });

  it('routes a signal through each enabled skill and saves its draft as a reviewable post', async () => {
    enabledSkills = ['content-writing', 'thread-expansion'];

    const result = await service.routeSignal({
      brandId,
      organizationId,
      payload: { campaignId: 'ccampaign0001', skillSlugs: ['content-writing'] },
      type: 'cron',
      userId: 'user-1',
    });

    expect(result).toEqual({
      executions: ['execution-1'],
      posts: [
        { description: 'draft from content-writing', id: 'post-for-execution-1' },
      ],
    });
    expect(savedPosts).toEqual([
      expect.objectContaining({
        brandId,
        campaignId: 'ccampaign0001',
        executionId: 'execution-1',
        organizationId,
        skillSlug: 'content-writing',
        userId: 'user-1',
      }),
    ]);
  });

  it('runs every enabled skill when the signal names none', async () => {
    enabledSkills = ['content-writing', 'thread-expansion'];

    const result = await service.routeSignal({
      brandId,
      organizationId,
      payload: { campaignId: '   ' },
      type: 'cron',
    });

    expect(result.executions).toEqual(['execution-1', 'execution-2']);
    expect(skillRuns.map((run) => run.skillSlug)).toEqual([
      'content-writing',
      'thread-expansion',
    ]);
    expect(savedPosts.map((post) => post.campaignId)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('processes a manual request inside the requested brand and organization', async () => {
    const result = await service.processManualRequest(
      organizationId,
      brandId,
      'content-writing',
      { prompt: 'hello' },
      'user-1',
    );

    expect(result).toEqual({
      executions: ['execution-1'],
      posts: [
        { description: 'draft from content-writing', id: 'post-for-execution-1' },
      ],
    });
    expect(skillRuns).toEqual([
      {
        context: {
          brandId,
          brandVoice: '',
          organizationId,
          platforms: [],
        },
        params: { prompt: 'hello' },
        skillSlug: 'content-writing',
        userId: 'user-1',
      },
    ]);
  });

  it('passes the brand voice to the skill instead of an empty one', async () => {
    brands = [
      {
        agentConfig: {
          voice: { audience: ['founders'], style: 'punchy', tone: 'direct' },
        },
        id: brandId,
        organizationId,
      },
    ];

    await service.processManualRequest(
      organizationId,
      brandId,
      'content-writing',
      { platform: 'twitter', topic: 'hooks' },
      'user-1',
    );

    expect(skillRuns[0]?.context.brandVoice).toBe(
      'tone: direct; style: punchy; audience: founders',
    );
  });

  it('rejects a brand from another organization before any skill runs', async () => {
    await expect(
      service.processManualRequest(
        testId('org', 2),
        brandId,
        'content-writing',
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(skillRuns).toEqual([]);
    expect(savedPosts).toEqual([]);
  });

  it('returns no executions when no skills are enabled', async () => {
    enabledSkills = [];

    await expect(
      service.routeSignal({
        brandId,
        organizationId,
        payload: {},
        type: 'cron',
      }),
    ).resolves.toEqual({ executions: [], posts: [] });
    expect(skillRuns).toEqual([]);
  });
});
