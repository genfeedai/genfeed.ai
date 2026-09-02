import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { scopedWhere } from '@api/index';
import type { GeneratedContentInput } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type CredentialPlatform,
  PostCategory,
  PostVisibility,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

const LABEL_LENGTH = 80;

export interface ReviewablePostInput extends GeneratedContentInput {
  brandId: string;
  campaignId?: string;
  generatedBy: string;
  idempotencyKey?: string;
  organizationId: string;
  skillSlug: string;
  userId?: string;
  workflowExecutionId?: string;
}

@Injectable()
export class ReviewablePostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
  ) {}

  async create(input: ReviewablePostInput): Promise<PostDocument> {
    if (input.content.trim().length === 0) {
      throw new BadRequestException('Generated content cannot be empty');
    }
    const userId = await this.resolveOwnedUser(input);

    let post: PostDocument | undefined;
    if (input.idempotencyKey) {
      const existing = await this.prisma.post.findFirst({
        where: scopedWhere(input.organizationId, {
          brandId: input.brandId,
          targetIdempotencyKey: input.idempotencyKey,
        }),
      });
      if (existing) {
        post = existing as PostDocument;
      }
    }

    if (!post) {
      const campaignId = this.readCampaignId(input);
      const platform = this.resolvePlatform(input.platforms);
      post = await this.postsService.create({
        brandId: input.brandId,
        ...(campaignId ? { campaignId } : {}),
        category: this.resolveCategory(input.type, input.mediaUrls),
        description: input.content,
        ingredients: [],
        label: this.labelFromContent(input.content),
        organizationId: input.organizationId,
        platform,
        promptUsed: input.content,
        source: input.generatedBy,
        targetAttachments: (input.mediaUrls ?? []) as Prisma.InputJsonValue,
        targetExecutionState: TargetExecutionState.DRAFT,
        targetIdempotencyKey: input.idempotencyKey,
        targetSettings: {
          generation: {
            confidence: input.confidence,
            generatedBy: input.generatedBy,
            metadata: input.metadata ?? {},
            platforms: input.platforms ?? [],
            skillSlug: input.skillSlug,
            type: input.type,
          },
        } as Prisma.InputJsonValue,
        userId,
        visibility: PostVisibility.PUBLIC,
        workflowExecutionId: input.workflowExecutionId,
      } as PostCreateInput);
    }

    await this.trendReferenceCorpusService.recordPostRemixLineage({
      brandId: input.brandId,
      draftType: input.type,
      generatedBy: input.generatedBy,
      metadata: input.metadata,
      organizationId: input.organizationId,
      platforms: input.platforms ?? [],
      postId: String(post.id),
      prompt: input.content,
    });

    return post;
  }

  async requireOwnedPost(
    postId: string,
    organizationId: string,
    brandId: string,
  ): Promise<PostDocument> {
    const post = await this.prisma.post.findFirst({
      where: scopedWhere(organizationId, { brandId, id: postId }),
    });
    if (!post) {
      throw new BadRequestException(
        'Post does not belong to organization and brand',
      );
    }
    return post as PostDocument;
  }

  createFromSkillExecution(input: {
    brandId: string;
    campaignId?: string;
    drafts: GeneratedContentInput[];
    executionId: string;
    organizationId: string;
    skillSlug: string;
    userId?: string;
  }): Promise<PostDocument[]> {
    return Promise.all(
      input.drafts.map((draft, index) =>
        this.create({
          ...draft,
          brandId: input.brandId,
          campaignId: input.campaignId,
          generatedBy: input.skillSlug,
          idempotencyKey: `skill-execution:${input.executionId}:${input.skillSlug}:${index}`,
          organizationId: input.organizationId,
          skillSlug: input.skillSlug,
          userId: input.userId,
          workflowExecutionId: input.executionId,
        }),
      ),
    );
  }

  private readCampaignId(input: ReviewablePostInput): string | undefined {
    if (input.campaignId?.trim()) {
      return input.campaignId;
    }
    const metadataCampaignId = input.metadata?.campaignId;
    return typeof metadataCampaignId === 'string' && metadataCampaignId.trim()
      ? metadataCampaignId
      : undefined;
  }

  private async resolveOwnedUser(
    input: Pick<ReviewablePostInput, 'brandId' | 'organizationId' | 'userId'>,
  ): Promise<string> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true, userId: true },
      where: scopedWhere(input.organizationId, { id: input.brandId }),
    });

    if (!brand) {
      throw new BadRequestException('Brand does not belong to organization');
    }

    const userId = input.userId ?? brand.userId ?? undefined;
    if (!userId) {
      throw new BadRequestException('Brand has no canonical user owner');
    }

    const member = await this.prisma.member.findFirst({
      select: { id: true },
      where: scopedWhere(input.organizationId, { userId }),
    });
    if (!member && brand.userId !== userId) {
      throw new BadRequestException('User does not belong to organization');
    }
    return userId;
  }

  private labelFromContent(content: string): string {
    const normalized = content.trim().replace(/\s+/g, ' ');
    if (normalized.length <= LABEL_LENGTH) {
      return normalized;
    }
    return `${normalized.slice(0, LABEL_LENGTH - 1).trimEnd()}…`;
  }

  private resolveCategory(
    type: string,
    mediaUrls: string[] | undefined,
  ): PostCategory {
    const normalized = type.toLowerCase();
    if (normalized.includes('video')) return PostCategory.VIDEO;
    if (normalized.includes('image') || (mediaUrls?.length ?? 0) > 0) {
      return PostCategory.IMAGE;
    }
    if (normalized.includes('article')) return PostCategory.ARTICLE;
    return PostCategory.TEXT;
  }

  private resolvePlatform(
    platforms: string[] | undefined,
  ): CredentialPlatform | undefined {
    if (platforms?.length !== 1) return undefined;
    return parsePlatform(platforms[0]);
  }
}
