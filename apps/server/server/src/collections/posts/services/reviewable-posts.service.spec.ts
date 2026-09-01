import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { ReviewablePostsService } from '@server/collections/posts/services/reviewable-posts.service';

describe('ReviewablePostsService', () => {
  const brand = { id: 'brand-1', userId: 'owner-1' };
  const post = {
    brandId: 'brand-1',
    description: 'Generated launch post',
    id: 'post-1',
    organizationId: 'org-1',
    targetSettings: {},
  };
  const prisma = {
    brand: { findFirst: vi.fn() },
    member: { findFirst: vi.fn() },
    post: { findFirst: vi.fn() },
  };
  const postsService = { create: vi.fn() };
  const trendReferenceCorpusService = { recordPostRemixLineage: vi.fn() };
  const service = new ReviewablePostsService(
    prisma as never,
    postsService as never,
    trendReferenceCorpusService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.brand.findFirst.mockResolvedValue(brand);
    prisma.member.findFirst.mockResolvedValue({ id: 'member-1' });
    prisma.post.findFirst.mockResolvedValue(null);
    postsService.create.mockResolvedValue(post);
    trendReferenceCorpusService.recordPostRemixLineage.mockResolvedValue(
      undefined,
    );
  });

  it('persists generated content as an untargeted canonical Post', async () => {
    await service.create({
      brandId: 'brand-1',
      confidence: 0.91,
      content: 'Generated launch post',
      workflowExecutionId: 'execution-1',
      generatedBy: 'content-writing',
      idempotencyKey: 'skill-execution:execution-1:content-writing:0',
      mediaUrls: ['https://cdn.example.com/launch.jpg'],
      metadata: { trendId: 'trend-1' },
      organizationId: 'org-1',
      platforms: ['twitter'],
      skillSlug: 'content-writing',
      type: 'image-post',
      userId: 'user-1',
    });

    expect(postsService.create).toHaveBeenCalledWith(
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
    );
    expect(
      trendReferenceCorpusService.recordPostRemixLineage,
    ).toHaveBeenCalledWith(expect.objectContaining({ postId: 'post-1' }));
  });

  it('reuses an idempotent Post and retries lineage recording', async () => {
    prisma.post.findFirst.mockResolvedValue(post);

    const result = await service.create({
      brandId: 'brand-1',
      content: 'Generated launch post',
      generatedBy: 'content-writing',
      idempotencyKey: 'same-run',
      organizationId: 'org-1',
      skillSlug: 'content-writing',
      type: 'text',
    });

    expect(result).toBe(post);
    expect(postsService.create).not.toHaveBeenCalled();
    expect(
      trendReferenceCorpusService.recordPostRemixLineage,
    ).toHaveBeenCalledWith(expect.objectContaining({ postId: 'post-1' }));
  });

  it('fails closed when an explicit user is outside the organization', async () => {
    prisma.member.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        brandId: 'brand-1',
        content: 'Generated launch post',
        generatedBy: 'content-writing',
        organizationId: 'org-1',
        skillSlug: 'content-writing',
        type: 'text',
        userId: 'other-user',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('rejects empty generated content before writing a Post', async () => {
    await expect(
      service.create({
        brandId: 'brand-1',
        content: '   ',
        generatedBy: 'content-writing',
        organizationId: 'org-1',
        skillSlug: 'content-writing',
        type: 'text',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('rejects reuse outside the requested tenant and brand', async () => {
    prisma.post.findFirst.mockResolvedValue(null);

    await expect(
      service.requireOwnedPost('post-elsewhere', 'org-1', 'brand-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
