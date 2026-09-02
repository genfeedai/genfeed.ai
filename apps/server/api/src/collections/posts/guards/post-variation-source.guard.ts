import type {
  ResolvedPostVariationSource,
  SourcePostVariationRequest,
} from '@api/collections/posts/services/source-post-variation.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class PostVariationSourceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<SourcePostVariationRequest>();
    const user = request.user;
    if (!user) {
      throw new NotFoundException('Source post');
    }

    const metadata = user;
    const body = this.asRecord(request.body);
    const count = body.count ?? 3;
    if (
      typeof count !== 'number' ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 10
    ) {
      throw new BadRequestException(
        'Variation count must be an integer between 1 and 10.',
      );
    }

    const identifiers = [
      this.asString(body.postId),
      this.asString(body.sourcePostId),
      this.asString(body.sourceReferenceId),
    ].filter((value): value is string => Boolean(value));
    if (identifiers.length !== 1) {
      throw new BadRequestException(
        'Provide exactly one of postId, sourcePostId, or sourceReferenceId.',
      );
    }

    request.resolvedPostVariationSource = await this.resolveSource(
      body,
      metadata.organizationId,
      metadata.brandId,
    );
    request.creditsOutputCount = count;
    return true;
  }

  private async resolveSource(
    body: UnknownRecord,
    organizationId: string,
    brandId: string,
  ): Promise<ResolvedPostVariationSource> {
    const postId = this.asString(body.postId);
    if (postId) {
      const post = await this.prisma.post.findFirst({
        select: { description: true, id: true, platform: true, url: true },
        where: scopedWhere(organizationId, { brandId, id: postId }),
      });
      return this.requireContent(post, 'owned-post');
    }

    const sourcePostId = this.asString(body.sourcePostId);
    if (sourcePostId) {
      const sourcePost = await this.prisma.sourcePost.findFirst({
        select: {
          id: true,
          platform: true,
          sourceUrl: true,
          text: true,
        },
        where: scopedWhere(organizationId, { brandId, id: sourcePostId }),
      });
      return this.requireContent(
        sourcePost
          ? {
              description: sourcePost.text,
              id: sourcePost.id,
              platform: sourcePost.platform,
              url: sourcePost.sourceUrl,
            }
          : null,
        'source-post',
      );
    }

    const sourceReferenceId = this.asString(body.sourceReferenceId);
    const trendId = this.asString(body.trendId);
    if (!sourceReferenceId || !trendId) {
      throw new BadRequestException(
        'trendId is required for an imported source reference.',
      );
    }

    const reference = await this.prisma.trendSourceReference.findFirst({
      select: {
        canonicalUrl: true,
        data: true,
        id: true,
        platform: true,
      },
      where: {
        id: sourceReferenceId,
        isDeleted: false,
        links: {
          some: {
            isDeleted: false,
            trendId,
            trend: scopedWhere(organizationId, { brandId, id: trendId }),
          },
        },
      },
    });
    if (!reference) {
      throw new NotFoundException('Source post');
    }

    const data = this.asRecord(reference.data);
    const text =
      this.asString(data.text) ??
      this.asString(data.caption) ??
      this.asString(data.description) ??
      this.asString(data.title);
    return this.requireContent(
      {
        description: text,
        id: reference.id,
        platform: reference.platform,
        url: reference.canonicalUrl,
      },
      'trend-reference',
      trendId,
    );
  }

  private requireContent(
    source: {
      description?: string | null;
      id: string;
      platform?: string | null;
      url?: string | null;
    } | null,
    kind: ResolvedPostVariationSource['kind'],
    trendId?: string,
  ): ResolvedPostVariationSource {
    const text = source?.description?.trim();
    if (!source || !text) {
      throw new NotFoundException('Source post');
    }

    return {
      id: source.id,
      kind,
      ...(source.platform && { platform: source.platform }),
      ...(source.url && { sourceUrl: source.url }),
      text,
      ...(trendId && { trendId }),
    };
  }

  private asRecord(value: unknown): UnknownRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as UnknownRecord)
      : {};
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}
