import { createHash } from 'node:crypto';
import { FileInputType, toPrismaCredentialPlatform } from '@genfeedai/enums';
import type {
  AdsResearchPlatform,
  SaveAdInput,
  UnsaveSavedAdInput,
  UpdateSavedAdNoteInput,
} from '@genfeedai/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AdsResearchService } from '@server/endpoints/ads-research/ads-research.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { assertUrlNotPrivate } from '@server/helpers/utils/ssrf/ssrf.util';
import { mapAdsCredentialPlatform } from '@server/services/ads-gateway/ads-credential-platform.util';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const MAX_SNAPSHOT_MEDIA_PER_KIND = 4;
const STORAGE_TYPE = 'saved-ad-references';

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

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
      if (result.count !== 1) {
        const existing = await this.prisma.savedAd.findFirst({
          select: { id: true },
          where: {
            brandId: input.brandId,
            id: input.id,
            organizationId,
          },
        });
        if (!existing) throw new NotFoundException('Saved ad', input.id);
      }
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
    if (input.source === 'my_accounts') {
      if (!input.credentialId || !input.platform) {
        throw new BadRequestException(
          'Connected ads require a credential and platform',
        );
      }
      await this.assertConnectedCredential(
        organizationId,
        input.brandId,
        input.credentialId,
        input.platform,
      );
    }
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

    const sourceImageUrls = detail.imageUrls?.length
      ? detail.imageUrls
      : detail.creative?.imageUrls?.length
        ? detail.creative.imageUrls
        : detail.previewUrl
          ? [detail.previewUrl]
          : [];
    const sourceVideoUrls = detail.videoUrls?.length
      ? detail.videoUrls
      : (detail.creative?.videoUrls ?? []);
    const body = detail.body ?? detail.creative?.body;
    const headline = detail.headline ?? detail.creative?.headline;
    const imageUrls = await this.copyMedia(
      organizationId,
      input.brandId,
      detail.platform,
      sourceAdId,
      'image',
      sourceImageUrls,
      MAX_SNAPSHOT_MEDIA_PER_KIND,
    );
    const videoUrls = await this.copyMedia(
      organizationId,
      input.brandId,
      detail.platform,
      sourceAdId,
      'video',
      sourceVideoUrls,
      MAX_SNAPSHOT_MEDIA_PER_KIND,
    );
    if (!imageUrls.length && !videoUrls.length && !body && !headline) {
      throw new BadRequestException(
        'The selected ad has no available creative',
      );
    }

    const data = {
      adAccountId: input.adAccountId,
      advertiserId: detail.accountId,
      advertiserName: detail.accountName,
      body,
      brandId: input.brandId,
      capturedAt: new Date(),
      channel: detail.channel,
      credentialId: input.credentialId,
      cta: detail.cta ?? detail.creative?.cta,
      explanation: detail.explanation,
      firstSeenAt: optionalDate(detail.firstSeenAt),
      headline,
      imageUrls,
      isDeleted: false,
      landingPageUrl: detail.landingPageUrl ?? detail.creative?.landingPageUrl,
      lastSeenAt: optionalDate(detail.lastSeenAt),
      loginCustomerId: input.loginCustomerId,
      metrics: toPrismaJson(detail.metrics),
      organizationId,
      patternSummary: toPrismaJson(detail.patternSummary ?? []),
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
            organizationId,
            platform: detail.platform,
            sourceAdId,
          },
        });
        if (winner && !winner.isDeleted) return winner;
        if (winner) {
          return this.prisma.savedAd.update({
            data,
            where: {
              brandId: input.brandId,
              id: winner.id,
              organizationId,
            },
          });
        }
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

  private async assertConnectedCredential(
    organizationId: string,
    brandId: string,
    credentialId: string,
    platform: AdsResearchPlatform,
  ) {
    const platformValue = toPrismaCredentialPlatform(
      mapAdsCredentialPlatform(platform),
    );
    if (!platformValue) {
      throw new BadRequestException('Unsupported ads credential platform');
    }
    const credential = await this.prisma.credential.findFirst({
      select: { id: true },
      where: {
        brandId,
        id: credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId,
        platform: platformValue,
      },
    });
    if (!credential) {
      throw new BadRequestException(
        'The selected ads credential is unavailable for this brand',
      );
    }
  }

  private async copyMedia(
    organizationId: string,
    brandId: string,
    platform: string,
    sourceAdId: string,
    kind: 'image' | 'video',
    urls: string[],
    maxItems: number,
  ): Promise<string[]> {
    const uniqueUrls = [...new Set(urls)].filter(isHttpUrl).slice(0, maxItems);
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
