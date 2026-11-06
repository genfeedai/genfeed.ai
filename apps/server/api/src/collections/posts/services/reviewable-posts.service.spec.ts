import type { PostsService } from '@api/collections/posts/services/posts.service';
import { ReviewablePostsService } from '@api/collections/posts/services/reviewable-posts.service';
import type { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

describe('ReviewablePostsService', () => {
  let brands: Row[];
  let members: Row[];
  let posts: Row[];
  let lineage: Row[];
  let service: ReviewablePostsService;

  const baseInput = {
    brandId: 'brand-1',
    content: 'Generated launch post',
    generatedBy: 'content-writing',
    organizationId: 'org-1',
    skillSlug: 'content-writing',
    type: 'text',
  };

  beforeEach(() => {
    brands = [
      {
        id: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'owner-1',
      },
    ];
    members = [
      {
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ];
    posts = [];
    lineage = [];

    const table = (rows: () => Row[]) => ({
      findFirst: async ({ where }: { where: Row }) =>
        rows().find((row) => matches(row, where)) ?? null,
    });

    service = new ReviewablePostsService(
      {
        brand: table(() => brands),
        member: table(() => members),
        post: table(() => posts),
      } as unknown as PrismaService,
      {
        create: async (input: Row) => {
          const post = {
            ...input,
            id: `post-${posts.length + 1}`,
            isDeleted: false,
          };
          posts.push(post);
          return post;
        },
      } as unknown as PostsService,
      {
        recordPostRemixLineage: async (record: Row) => {
          lineage.push(record);
        },
      } as unknown as TrendReferenceCorpusService,
    );
  });

  it('stamps an explicit campaign id onto generated reviewable posts', async () => {
    await service.create({
      ...baseInput,
      campaignId: 'ccampaign0001',
      userId: 'user-1',
    });

    expect(posts).toEqual([
      expect.objectContaining({ campaignId: 'ccampaign0001' }),
    ]);
  });

  it('persists generated content as an untargeted canonical Post', async () => {
    await service.create({
      ...baseInput,
      confidence: 0.91,
      idempotencyKey: 'skill-execution:execution-1:content-writing:0',
      mediaUrls: ['https://cdn.example.com/launch.jpg'],
      metadata: { trendId: 'trend-1' },
      platforms: ['twitter'],
      type: 'image-post',
      userId: 'user-1',
      workflowExecutionId: 'execution-1',
    });

    expect(posts).toEqual([
      expect.objectContaining({
        brandId: 'brand-1',
        category: PostCategory.IMAGE,
        description: 'Generated launch post',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
        targetAttachments: ['https://cdn.example.com/launch.jpg'],
        targetExecutionState: TargetExecutionState.DRAFT,
        targetIdempotencyKey: 'skill-execution:execution-1:content-writing:0',
        userId: 'user-1',
        visibility: PostVisibility.PUBLIC,
        workflowExecutionId: 'execution-1',
      }),
    ]);
    expect(lineage).toEqual([
      expect.objectContaining({
        postId: 'post-1',
        prompt: 'Generated launch post',
      }),
    ]);
  });

  it('falls back to the brand owner when no user is given', async () => {
    await service.create(baseInput);

    expect(posts[0]?.userId).toBe('owner-1');
  });

  it('reuses an idempotent Post and retries lineage recording', async () => {
    const first = await service.create({
      ...baseInput,
      idempotencyKey: 'same-run',
    });
    const second = await service.create({
      ...baseInput,
      idempotencyKey: 'same-run',
    });

    expect(second).toEqual(first);
    expect(posts).toHaveLength(1);
    expect(lineage).toEqual([
      expect.objectContaining({ postId: 'post-1' }),
      expect.objectContaining({ postId: 'post-1' }),
    ]);
  });

  it('fails closed when an explicit user is outside the organization', async () => {
    await expect(
      service.create({ ...baseInput, userId: 'other-user' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(posts).toEqual([]);
  });

  it('refuses a brand from another organization', async () => {
    await expect(
      service.create({ ...baseInput, organizationId: 'org-2' }),
    ).rejects.toThrow('Brand does not belong to organization');
    expect(posts).toEqual([]);
  });

  it('rejects empty generated content before writing a Post', async () => {
    await expect(
      service.create({ ...baseInput, content: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(posts).toEqual([]);
  });

  describe('requireOwnedPost', () => {
    beforeEach(async () => {
      await service.create(baseInput);
    });

    it('returns a post inside the tenant and brand', async () => {
      await expect(
        service.requireOwnedPost('post-1', 'org-1', 'brand-1'),
      ).resolves.toEqual(expect.objectContaining({ id: 'post-1' }));
    });

    it.each([
      ['another organization', 'post-1', 'org-2', 'brand-1'],
      ['another brand', 'post-1', 'org-1', 'brand-2'],
      ['an unknown post', 'post-elsewhere', 'org-1', 'brand-1'],
    ])('rejects reuse from %s', async (_case, postId, orgId, brandId) => {
      await expect(
        service.requireOwnedPost(postId, orgId, brandId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
