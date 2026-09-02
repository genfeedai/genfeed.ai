import { createHash } from 'node:crypto';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { scopedWhere } from '@api/index';
import { mapAdsCredentialPlatform } from '@api/services/ads-gateway/ads-credential-platform.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createConcurrencyLimit } from '@api/shared/utils/create-concurrency-limit.util';
import {
  FileInputType,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  SaveAdInput,
  UnsaveSavedAdInput,
  UpdateSavedAdNoteInput,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

const MAX_SAVE_CONCURRENCY = 4;
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
    if (inputs.length === 0) return [];
    await this.assertBrands(
      organizationId,
      inputs.map((input) => input.brandId),
    );
    await this.assertConnectedCredentials(organizationId, inputs);

    const limit = createConcurrencyLimit(MAX_SAVE_CONCURRENCY);
    return Promise.all(
      inputs.map((input) =>
        limit(() => this.saveOne(organizationId, userId, input)),
      ),
    );
  }

  async updateNotes(organizationId: string, inputs: UpdateSavedAdNoteInput[]) {
    if (inputs.length === 0) return [];
    await this.assertBrands(
      organizationId,
      inputs.map((input) => input.brandId),
    );
    await this.assertSavedAdsExist(organizationId, inputs, false);

    return this.prisma.$transaction(
      inputs.map((input) =>
        this.prisma.savedAd.update({
          data: { note: input.note?.trim() || null },
          where: {
            brandId: input.brandId,
            id: input.id,
            isDeleted: false,
            organizationId,
          },
        }),
      ),
    );
  }

  async unsaveMany(organizationId: string, inputs: UnsaveSavedAdInput[]) {
    if (inputs.length === 0) return [];
    await this.assertBrands(
      organizationId,
      inputs.map((input) => input.brandId),
    );
    await this.assertSavedAdsExist(organizationId, inputs, true);
    await this.prisma.savedAd.updateMany({
      data: { isDeleted: true },
      where: {
        isDeleted: false,
        organizationId,
        OR: inputs.map((input) => ({
          brandId: input.brandId,
          id: input.id,
        })),
      },
    });
    return inputs.map((input) => input.id);
  }

  private async saveOne(
    organizationId: string,
    userId: string,
    input: SaveAdInput,
  ) {
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
    const identityWhere = {
      brandId: input.brandId,
      platform: detail.platform,
      sourceAdId,
    };
    const existingSnapshot = await this.prisma.savedAd.findFirst({
      where: {
        ...identityWhere,
        organizationId,
        OR: [{ isDeleted: false }, { isDeleted: true }],
      },
    });
    if (existingSnapshot && !existingSnapshot.isDeleted)
      return existingSnapshot;

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

    if (existingSnapshot) {
      return this.prisma.savedAd.update({
        data: { ...data, userId: existingSnapshot.userId },
        where: scopedWhere(organizationId, {
          brandId: input.brandId,
          id: existingSnapshot.id,
          isDeleted: true,
        }),
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
            ...identityWhere,
            organizationId,
            OR: [{ isDeleted: false }, { isDeleted: true }],
          },
        });
        if (winner && !winner.isDeleted) return winner;
        if (winner) {
          return this.prisma.savedAd.update({
            data: { ...data, userId: winner.userId },
            where: scopedWhere(organizationId, {
              brandId: input.brandId,
              id: winner.id,
              isDeleted: true,
            }),
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

  private async assertBrands(
    organizationId: string,
    brandIds: string[],
  ): Promise<void> {
    const uniqueBrandIds = [...new Set(brandIds)];
    const brands = await this.prisma.brand.findMany({
      select: { id: true },
      where: {
        id: { in: uniqueBrandIds },
        isDeleted: false,
        organizationId,
      },
    });
    const found = new Set(brands.map((brand) => brand.id));
    const missing = uniqueBrandIds.find((brandId) => !found.has(brandId));
    if (missing) throw new NotFoundException('Brand', missing);
  }

  private async assertConnectedCredentials(
    organizationId: string,
    inputs: SaveAdInput[],
  ): Promise<void> {
    const expected = inputs.flatMap((input) => {
      if (input.source !== 'my_accounts') return [];
      if (!input.credentialId || !input.platform) {
        throw new BadRequestException(
          'Connected ads require a credential and platform',
        );
      }
      const platform = toPrismaCredentialPlatform(
        mapAdsCredentialPlatform(input.platform),
      );
      if (!platform) {
        throw new BadRequestException('Unsupported ads credential platform');
      }
      return [{ brandId: input.brandId, id: input.credentialId, platform }];
    });
    if (expected.length === 0) return;

    const credentials = await this.prisma.credential.findMany({
      select: { brandId: true, id: true, platform: true },
      where: {
        isConnected: true,
        isDeleted: false,
        organizationId,
        OR: expected,
      },
    });
    const found = new Set(
      credentials.map(
        (credential) =>
          `${credential.brandId}:${credential.id}:${credential.platform}`,
      ),
    );
    const missing = expected.find(
      (credential) =>
        !found.has(
          `${credential.brandId}:${credential.id}:${credential.platform}`,
        ),
    );
    if (missing) {
      throw new BadRequestException(
        'The selected ads credential is unavailable for this brand',
      );
    }
  }

  private async assertSavedAdsExist(
    organizationId: string,
    inputs: Array<{ brandId: string; id: string }>,
    includeDeleted: boolean,
  ): Promise<void> {
    const identities = inputs.map((input) => ({
      brandId: input.brandId,
      id: input.id,
    }));
    const rows = includeDeleted
      ? await this.prisma.savedAd.findMany({
          select: { brandId: true, id: true },
          where: {
            organizationId,
            AND: [
              { OR: identities },
              { OR: [{ isDeleted: false }, { isDeleted: true }] },
            ],
          },
        })
      : await this.prisma.savedAd.findMany({
          select: { brandId: true, id: true },
          where: scopedWhere(organizationId, { OR: identities }),
        });
    const found = new Set(rows.map((row) => `${row.brandId}:${row.id}`));
    const missing = inputs.find(
      (input) => !found.has(`${input.brandId}:${input.id}`),
    );
    if (missing) throw new NotFoundException('Saved ad', missing.id);
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
