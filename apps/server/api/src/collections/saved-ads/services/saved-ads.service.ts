import { createHash } from 'node:crypto';
import { FileInputType } from '@genfeedai/enums';
import type {
  SaveAdInput,
  UnsaveSavedAdInput,
  UpdateSavedAdNoteInput,
} from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AdsResearchService } from '@server/endpoints/ads-research/ads-research.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { assertUrlNotPrivate } from '@server/helpers/utils/ssrf/ssrf.util';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const MAX_SNAPSHOT_MEDIA = 12;
const STORAGE_TYPE = 'saved-ad-references';

function optionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

@Injectable()
export class SavedAdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adsResearchService: AdsResearchService,
    private readonly filesClientService: FilesClientService,
  ) {}

  async list(organizationId: string, brandId: string) {
    await this.assertBrand(organizationId, brandId);
    return this.prisma.savedAd.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: { brandId, isDeleted: false, organizationId },
    });
  }

  async saveMany(
    organizationId: string,
    userId: string,
    inputs: SaveAdInput[],
  ) {
    const saved = [];
    for (const input of inputs) {
      saved.push(await this.saveOne(organizationId, userId, input));
    }
    return saved;
  }

  async updateNotes(organizationId: string, inputs: UpdateSavedAdNoteInput[]) {
    const updated = [];
    for (const input of inputs) {
      await this.assertBrand(organizationId, input.brandId);
      const note = input.note?.trim() || null;
      const result = await this.prisma.savedAd.updateMany({
        data: { note },
        where: {
          brandId: input.brandId,
          id: input.id,
          isDeleted: false,
          organizationId,
        },
      });
      if (result.count !== 1) throw new NotFoundException('Saved ad', input.id);
      const row = await this.prisma.savedAd.findFirst({
        where: {
          brandId: input.brandId,
          id: input.id,
          isDeleted: false,
          organizationId,
        },
      });
      if (!row) throw new NotFoundException('Saved ad', input.id);
      updated.push(row);
    }
    return updated;
  }

  async unsaveMany(organizationId: string, inputs: UnsaveSavedAdInput[]) {
    const removed = [];
    for (const input of inputs) {
      await this.assertBrand(organizationId, input.brandId);
      const result = await this.prisma.savedAd.updateMany({
        data: { isDeleted: true },
        where: {
          brandId: input.brandId,
          id: input.id,
          isDeleted: false,
          organizationId,
        },
      });
      if (result.count !== 1) throw new NotFoundException('Saved ad', input.id);
      removed.push(input.id);
    }
    return removed;
  }

  private async saveOne(
    organizationId: string,
    userId: string,
    input: SaveAdInput,
  ) {
    await this.assertBrand(organizationId, input.brandId);
    const detail = await this.adsResearchService.getAdDetail(organizationId, {
      adAccountId: input.adAccountId,
      brandId: input.brandId,
      channel: input.channel,
      credentialId: input.credentialId,
      id: input.adId,
      loginCustomerId: input.loginCustomerId,
      platform: input.platform,
      source: input.source,
    });
    if (detail.usagePolicy === 'disclosure_only') {
      throw new BadRequestException(
        'Disclosure-only ads cannot be saved for remixing',
      );
    }

    const sourceAdId = detail.sourceId || detail.id;
    const existing = await this.prisma.savedAd.findFirst({
      where: {
        brandId: input.brandId,
        organizationId,
        platform: detail.platform,
        sourceAdId,
      },
    });
    if (existing && !existing.isDeleted) return existing;

    const imageUrls = await this.copyMedia(
      organizationId,
      input.brandId,
      detail.platform,
      sourceAdId,
      'image',
      detail.imageUrls ?? detail.creative?.imageUrls ?? [],
    );
    const videoUrls = await this.copyMedia(
      organizationId,
      input.brandId,
      detail.platform,
      sourceAdId,
      'video',
      detail.videoUrls ?? detail.creative?.videoUrls ?? [],
    );
    if (
      !imageUrls.length &&
      !videoUrls.length &&
      !detail.body &&
      !detail.headline
    ) {
      throw new BadRequestException(
        'The selected ad has no available creative',
      );
    }

    const data = {
      adAccountId: input.adAccountId,
      advertiserId: detail.accountId,
      advertiserName: detail.accountName,
      body: detail.body ?? detail.creative?.body,
      brandId: input.brandId,
      capturedAt: new Date(),
      channel: detail.channel,
      credentialId: input.credentialId,
      cta: detail.cta ?? detail.creative?.cta,
      explanation: detail.explanation,
      firstSeenAt: optionalDate(detail.firstSeenAt),
      headline: detail.headline ?? detail.creative?.headline,
      imageUrls,
      isDeleted: false,
      landingPageUrl: detail.landingPageUrl ?? detail.creative?.landingPageUrl,
      lastSeenAt: optionalDate(detail.lastSeenAt),
      loginCustomerId: input.loginCustomerId,
      metrics: detail.metrics,
      organizationId,
      patternSummary: detail.patternSummary ?? [],
      platform: detail.platform,
      previewUrl: imageUrls[0] ?? videoUrls[0],
      source: input.source,
      sourceAdId,
      sourceRecordId: detail.id,
      title: detail.title,
      usagePolicy: detail.usagePolicy ?? 'remix_allowed',
      userId,
      videoUrls,
    };

    if (existing) {
      return this.prisma.savedAd.update({
        data,
        where: {
          brandId: input.brandId,
          id: existing.id,
          organizationId,
        },
      });
    }
    try {
      return await this.prisma.savedAd.create({ data });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.savedAd.findFirst({
          where: {
            brandId: input.brandId,
            isDeleted: false,
            organizationId,
            platform: detail.platform,
            sourceAdId,
          },
        });
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async assertBrand(organizationId: string, brandId: string) {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
  }

  private async copyMedia(
    organizationId: string,
    brandId: string,
    platform: string,
    sourceAdId: string,
    kind: 'image' | 'video',
    urls: string[],
  ): Promise<string[]> {
    const uniqueUrls = [...new Set(urls)].slice(0, MAX_SNAPSHOT_MEDIA);
    return Promise.all(
      uniqueUrls.map(async (url, index) => {
        assertUrlNotPrivate(url);
        const digest = createHash('sha256')
          .update(`${organizationId}:${brandId}:${platform}:${sourceAdId}`)
          .digest('hex');
        const metadata = await this.filesClientService.uploadToS3(
          `${digest}/${kind}-${index}`,
          STORAGE_TYPE,
          { type: FileInputType.URL, url },
        );
        if (!metadata.publicUrl) {
          throw new BadRequestException('Creative media could not be copied');
        }
        return metadata.publicUrl;
      }),
    );
  }
}
