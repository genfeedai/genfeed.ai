import {
  remixCredentialPlatform,
  remixIsVideoMedia,
  remixNumericRecord,
  remixPatternFromText,
  remixPublicUrl,
  remixRecord,
  remixSourcePlatform,
  remixStringArray,
  remixText,
  remixTruncate,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import type { ResolvedSource } from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  BRAND_REMIX_RUNTIME,
  type BrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { BrandRemixSourceSelector } from '@api-types/contracts/brand-remix-run.contract';
import { IngredientCategory } from '@genfeedai/enums';
import type { AdsResearchDetail } from '@genfeedai/interfaces';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSourceResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adsResearchService: AdsResearchService,
    @Inject(BRAND_REMIX_RUNTIME)
    private readonly runtime: BrandRemixRuntime,
  ) {}

  async resolveSource(
    organizationId: string,
    brandId: string,
    selector: BrandRemixSourceSelector,
  ): Promise<ResolvedSource> {
    switch (selector.kind) {
      case 'source_post':
        return this.resolveSourcePost(organizationId, brandId, selector);
      case 'owned_post':
        return this.resolveOwnedPost(organizationId, brandId, selector);
      case 'trend_reference':
        return this.resolveTrendReference(organizationId, brandId, selector);
      case 'public_ad':
        return this.resolvePublicAd(organizationId, brandId, selector);
      case 'saved_ad':
        return this.resolveSavedAd(organizationId, brandId, selector);
      case 'connected_ad':
        return this.resolveConnectedAd(organizationId, brandId, selector);
    }
  }

  async assertConnectedCredential(
    organizationId: string,
    brandId: string,
    credentialId: string,
    platform: 'google' | 'meta' | 'tiktok' | 'x',
  ) {
    const credential = await this.prisma.credential.findFirst({
      select: {
        grantedScopes: true,
        grantedScopesCapturedAt: true,
        id: true,
      },
      where: {
        brandId,
        id: credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId,
        platform: remixCredentialPlatform(platform),
      },
    });
    if (!credential) {
      throw new BadRequestException({
        detail:
          'The selected ads credential is disconnected or does not belong to this brand.',
        message: 'Ads credential is unavailable',
        title: 'Ads credential is unavailable',
      });
    }
    return credential;
  }

  private async resolveSourcePost(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'source_post' }>,
  ): Promise<ResolvedSource> {
    const post = await this.prisma.sourcePost.findFirst({
      select: {
        authorHandle: true,
        collectedAt: true,
        contentType: true,
        id: true,
        mediaUrls: true,
        metrics: true,
        platform: true,
        sourceUrl: true,
        text: true,
        thumbnailUrl: true,
      },
      where: scopedWhere(organizationId, {
        brandId,
        id: selector.sourcePostId,
      }),
    });
    if (!post || !remixText(post.text)) {
      throw new NotFoundException('Source post', selector.sourcePostId);
    }
    const platform = remixSourcePlatform(post.platform);
    const title = remixTruncate(remixText(post.text) ?? 'Source post');
    const hasVideo = remixIsVideoMedia(post.contentType, post.mediaUrls);
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        authorHandle: remixText(post.authorHandle),
        canonicalUrl: remixPublicUrl(post.sourceUrl),
        capturedAt: this.runtime.now().toISOString(),
        evidence: [title],
        metrics: remixNumericRecord(post.metrics),
        pattern: remixPatternFromText(title, hasVideo ? 'video' : 'image'),
        platform,
        selector,
        sourceId: post.id,
        title,
      },
    };
  }

  private async resolveOwnedPost(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'owned_post' }>,
  ): Promise<ResolvedSource> {
    const post = await this.prisma.post.findFirst({
      select: {
        createdAt: true,
        description: true,
        id: true,
        ingredients: {
          select: { category: true },
          where: { isDeleted: false },
        },
        platform: true,
        url: true,
      },
      where: scopedWhere(organizationId, { brandId, id: selector.postId }),
    });
    if (!post || !remixText(post.description)) {
      throw new NotFoundException('Post', selector.postId);
    }
    const title = remixTruncate(remixText(post.description) ?? 'Owned post');
    const hasVideo = post.ingredients.some(
      (ingredient) =>
        ingredient.category === IngredientCategory.VIDEO ||
        ingredient.category === IngredientCategory.AVATAR,
    );
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        canonicalUrl: remixPublicUrl(post.url),
        capturedAt: this.runtime.now().toISOString(),
        evidence: [title],
        metrics: {},
        pattern: remixPatternFromText(title, hasVideo ? 'video' : 'image'),
        platform: remixSourcePlatform(post.platform),
        selector,
        sourceId: post.id,
        title,
      },
    };
  }

  private async resolveTrendReference(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'trend_reference' }>,
  ): Promise<ResolvedSource> {
    const reference = await this.prisma.trendSourceReference.findFirst({
      select: {
        authorHandle: true,
        canonicalUrl: true,
        currentEngagementTotal: true,
        data: true,
        id: true,
        latestTrendViralityScore: true,
        platform: true,
      },
      where: {
        id: selector.sourceReferenceId,
        isDeleted: false,
        links: {
          some: {
            isDeleted: false,
            trendId: selector.trendId,
            trend: scopedWhere(organizationId, {
              OR: [{ brandId }, { brandId: null }],
              id: selector.trendId,
            }),
          },
        },
      },
    });
    if (!reference) {
      throw new NotFoundException(
        'Trend reference',
        selector.sourceReferenceId,
      );
    }
    const data = remixRecord(reference.data);
    const title = remixTruncate(
      remixText(data.title) ??
        remixText(data.text) ??
        remixText(data.caption) ??
        'Trend reference',
    );
    const contentType = remixText(data.contentType);
    const hasVideo = remixIsVideoMedia(contentType, [
      ...remixStringArray(data.videoUrls),
      ...remixStringArray(data.mediaUrls),
    ]);
    const sourcePatternText = [
      title,
      remixText(data.hook),
      remixText(data.structure),
      remixText(data.pacing),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
    const metrics = {
      ...remixNumericRecord(data.currentMetrics ?? data.metrics),
      engagementTotal: reference.currentEngagementTotal,
      viralityScore: reference.latestTrendViralityScore,
    };
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        authorHandle: remixText(reference.authorHandle),
        canonicalUrl: remixPublicUrl(reference.canonicalUrl),
        capturedAt: this.runtime.now().toISOString(),
        evidence: remixStringArray(data.matchedTrends).length
          ? remixStringArray(data.matchedTrends)
          : [title],
        metrics,
        pattern: remixPatternFromText(
          sourcePatternText,
          hasVideo ? 'video' : 'image',
        ),
        platform: remixSourcePlatform(reference.platform),
        selector,
        sourceId: reference.id,
        title,
      },
    };
  }

  private async resolvePublicAd(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'public_ad' }>,
  ): Promise<ResolvedSource> {
    const detail = await this.adsResearchService.getAdDetail(organizationId, {
      brandId,
      id: selector.adPerformanceId,
      source: 'public',
    });
    return this.resolvedAd(selector, detail);
  }

  private async resolveConnectedAd(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'connected_ad' }>,
  ): Promise<ResolvedSource> {
    await this.assertConnectedCredential(
      organizationId,
      brandId,
      selector.credentialId,
      selector.platform,
    );
    const detail = await this.adsResearchService.getAdDetail(organizationId, {
      adAccountId: selector.adAccountId,
      brandId,
      channel: selector.channel,
      credentialId: selector.credentialId,
      id: selector.adId,
      loginCustomerId: selector.loginCustomerId,
      platform: selector.platform,
      source: 'my_accounts',
    });
    return this.resolvedAd(selector, detail);
  }

  private async resolveSavedAd(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'saved_ad' }>,
  ): Promise<ResolvedSource> {
    const saved = await this.prisma.savedAd.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        id: selector.savedAdId,
      }),
    });
    if (!saved) throw new NotFoundException('Saved ad', selector.savedAdId);

    const patterns = Array.isArray(saved.patternSummary)
      ? saved.patternSummary.flatMap((value) => {
          const record = remixRecord(value);
          const label = remixText(record.label);
          const summary = remixText(record.summary);
          return label && summary ? [{ label, summary }] : [];
        })
      : [];
    return this.resolvedAd(selector, {
      body: saved.body ?? undefined,
      channel: saved.channel as AdsResearchDetail['channel'],
      creative: {
        body: saved.body ?? undefined,
        cta: saved.cta ?? undefined,
        headline: saved.headline ?? undefined,
        imageUrls: saved.imageUrls,
        landingPageUrl: saved.landingPageUrl ?? undefined,
        videoUrls: saved.videoUrls,
      },
      cta: saved.cta ?? undefined,
      explanation: saved.explanation,
      headline: saved.headline ?? undefined,
      id: saved.id,
      imageUrls: saved.imageUrls,
      landingPageUrl: saved.landingPageUrl ?? undefined,
      metrics: remixNumericRecord(saved.metrics),
      patternSummary: patterns,
      platform: saved.platform as AdsResearchDetail['platform'],
      previewUrl: saved.previewUrl ?? saved.imageUrls[0] ?? saved.videoUrls[0],
      source: saved.source as AdsResearchDetail['source'],
      sourceId: saved.sourceAdId,
      title: saved.title,
      usagePolicy: saved.usagePolicy as AdsResearchDetail['usagePolicy'],
      videoUrls: saved.videoUrls,
    });
  }

  private resolvedAd(
    selector: Extract<
      BrandRemixSourceSelector,
      { kind: 'connected_ad' | 'public_ad' | 'saved_ad' }
    >,
    detail: AdsResearchDetail,
  ): ResolvedSource {
    if (detail.usagePolicy === 'disclosure_only') {
      throw new BadRequestException(
        'Disclosure-only ads cannot be used as Brand Remix generation sources',
      );
    }

    const platform = remixSourcePlatform(detail.platform);
    const title = remixTruncate(
      remixText(detail.title) ?? `Performance ${platform} ad`,
    );
    const sourceId =
      remixText(detail.sourceId) ??
      (selector.kind === 'public_ad'
        ? selector.adPerformanceId
        : selector.kind === 'saved_ad'
          ? selector.savedAdId
          : selector.adId);
    const patternLabels =
      detail.patternSummary?.flatMap((pattern) =>
        remixText(pattern.label) ? [remixTruncate(pattern.label)] : [],
      ) ?? [];
    const explanation =
      remixText(detail.explanation) ??
      'Performance evidence is available for this ad.';
    const evidence = [
      explanation,
      ...patternLabels.map((label) => `Pattern: ${label}`),
    ]
      .map((value) => remixTruncate(value))
      .slice(0, 50);
    const hasVideo = Boolean(
      detail.videoUrls?.length || detail.creative?.videoUrls?.length,
    );
    const sourcePattern = [
      remixText(detail.headline ?? detail.creative?.headline),
      remixText(detail.body ?? detail.creative?.body),
      title,
      ...patternLabels,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        canonicalUrl: remixPublicUrl(
          detail.previewUrl ?? detail.landingPageUrl,
        ),
        capturedAt: this.runtime.now().toISOString(),
        ...(remixPublicUrl(detail.landingPageUrl)
          ? { destinationUrl: remixPublicUrl(detail.landingPageUrl) }
          : {}),
        evidence,
        metrics: remixNumericRecord(detail.metrics),
        pattern: {
          ...remixPatternFromText(sourcePattern, hasVideo ? 'video' : 'image'),
          callToAction: remixText(detail.cta ?? detail.creative?.cta)
            ? 'Close with a clear brand-specific action.'
            : undefined,
          offer: detail.campaignObjective
            ? 'Present a clear brand-specific offer.'
            : undefined,
        },
        platform,
        selector,
        sourceId,
        title,
      },
    };
  }
}
