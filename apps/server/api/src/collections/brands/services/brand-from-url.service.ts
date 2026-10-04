import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { AGENT_CREATED_BRAND_VISUAL_DEFAULTS } from '@api/collections/brands/constants/agent-created-brand.constant';
import type {
  BrandFromUrlContext,
  BrandFromUrlInput,
  BrandFromUrlOperation,
  BrandFromUrlResult,
} from '@api/collections/brands/interfaces/brand-from-url.interface';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandOsScanService } from '@api/collections/brands/services/brand-os-scan.service';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { normalizeBrandScanUrl } from '@api/collections/brands/utils/normalize-brand-scan-url.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import {
  DEFAULT_BRAND_VOICE_ANALYSIS,
  MasterPromptGeneratorService,
} from '@api/services/knowledge-base/master-prompt-generator.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource } from '@genfeedai/contracts';
import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import {
  buildBrandKitDraftFromBrand,
  computeBrandCompleteness,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { resolveSafeDestination } from '@libs/security/destination-guard';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';

const VOICE_FIELDS = [
  'voiceTone',
  'voiceStyle',
  'voiceAudience',
  'voiceValues',
  'voiceMessagingPillars',
  'voiceDoNotSoundLike',
  'voiceSampleOutput',
] as const;

@Injectable()
export class BrandFromUrlService {
  private readonly logger = new Logger(BrandFromUrlService.name);

  constructor(
    private readonly brands: BrandsService,
    private readonly scans: BrandOsScanService,
    private readonly revisions: BrandOsRevisionsService,
    private readonly scraper: BrandScraperService,
    private readonly voice: MasterPromptGeneratorService,
    private readonly persistence: BrandPersistenceService,
    private readonly mapper: BrandDataMapper,
    private readonly credits: CreditsUtilsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async start(
    input: BrandFromUrlInput,
    context: BrandFromUrlContext,
  ): Promise<BrandFromUrlOperation> {
    const url = await this.validateUrl(input.url);
    const requestId = randomUUID();
    const reservation = await this.credits.reserveCredits({
      actorUserId: context.userId,
      amount: 1,
      idempotencyKey: `brand-from-url:${requestId}`,
      organizationId: context.organizationId,
      workloadId: requestId,
      workloadType: 'brand-from-url',
    });
    let brand: Awaited<ReturnType<BrandsService['create']>>;
    let reviewUrl: string;
    try {
      brand = await this.brands.create({
        ...AGENT_CREATED_BRAND_VISUAL_DEFAULTS,
        userId: context.userId,
        organizationId: context.organizationId,
        label: input.label ?? new URL(url).hostname,
      });
      reviewUrl = await this.reviewUrl(context.organizationId, brand.slug);
    } catch (error: unknown) {
      await this.releaseQuietly(context.organizationId, reservation.id);
      throw error;
    }
    const createdAt = Date.now();
    return {
      createdAt,
      running: { brandId: brand.id, scanStatus: 'running', reviewUrl },
      completion: this.complete(
        input,
        context,
        brand.id,
        url,
        requestId,
        reservation.id,
      ),
    };
  }

  async get(
    organizationId: string,
    brandId: string,
  ): Promise<BrandFromUrlResult> {
    const brand = await this.requireBrand(organizationId, brandId);
    const scan = await this.scans.get(organizationId, brandId);
    const revision = scan?.revisionId
      ? await this.revisions.get(organizationId, brandId, scan.revisionId)
      : null;
    const completeness = computeBrandCompleteness({
      id: brand.id,
      slug: brand.slug,
      label: brand.label,
      description: brand.description ?? undefined,
      text: brand.text ?? undefined,
      primaryColor: brand.primaryColor ?? undefined,
      agentConfig: this.mapper.readBrandAgentConfig(brand.agentConfig),
    });
    return {
      brandId,
      ...(revision
        ? {
            revisionId: revision.id,
            revisionStatus:
              revision.status === 'APPROVED'
                ? ('approved' as const)
                : ('draft' as const),
          }
        : {}),
      completenessScore: completeness.overallScore,
      incompleteFields: completeness.incompleteFields,
      reviewUrl: await this.reviewUrl(organizationId, brand.slug),
      scanStatus:
        scan?.status === 'failed'
          ? 'failed'
          : scan?.status === 'ready' || scan?.status === 'partial'
            ? 'succeeded'
            : 'running',
      ...(scan?.errorCode ? { errorCode: scan.errorCode } : {}),
    };
  }

  /** Releases the hold; release is idempotent for settled or released reservations. */
  private async releaseQuietly(
    organizationId: string,
    reservationId: string,
  ): Promise<void> {
    try {
      await this.credits.releaseReservation({ organizationId, reservationId });
    } catch (error: unknown) {
      this.logger.error('Brand-from-URL reservation release failed', error, {
        organizationId,
        reservationId,
      });
    }
  }

  private async complete(
    input: BrandFromUrlInput,
    context: BrandFromUrlContext,
    brandId: string,
    url: string,
    requestId: string,
    reservationId: string,
  ): Promise<BrandFromUrlResult> {
    try {
      return await this.runCompletion(
        input,
        context,
        brandId,
        url,
        requestId,
        reservationId,
      );
    } catch (error: unknown) {
      await this.releaseQuietly(context.organizationId, reservationId);
      throw error;
    }
  }

  private async runCompletion(
    input: BrandFromUrlInput,
    context: BrandFromUrlContext,
    brandId: string,
    url: string,
    requestId: string,
    reservationId: string,
  ): Promise<BrandFromUrlResult> {
    const { scan, scrapedData } = await this.scans.startAndCollect({
      organizationId: context.organizationId,
      brandId,
      url,
      requestId,
    });
    if (scan.status === 'failed') {
      await this.credits.releaseReservation({
        organizationId: context.organizationId,
        reservationId,
      });
      return this.get(context.organizationId, brandId);
    }
    let isVoiceUnavailable = true;
    if (
      scan.revisionId &&
      (scan.status === 'ready' || scan.status === 'partial')
    ) {
      let revision = await this.revisions.get(
        context.organizationId,
        brandId,
        scan.revisionId,
      );
      if (scrapedData) {
        const brandVoice = await this.voice.analyzeBrandVoice(scrapedData);
        if (
          brandVoice &&
          !isDeepStrictEqual(brandVoice, DEFAULT_BRAND_VOICE_ANALYSIS)
        ) {
          await this.persistence.updateBrandGuidance(
            brandId,
            context.organizationId,
            { ...scrapedData, brandVoice },
          );
          const updatedBrand = await this.requireBrand(
            context.organizationId,
            brandId,
          );
          const voiceDraft = buildBrandKitDraftFromBrand({
            id: updatedBrand.id,
            organization: context.organizationId,
            agentConfig: this.mapper.readBrandAgentConfig(
              updatedBrand.agentConfig,
            ),
          });
          const content = structuredClone(revision.content);
          for (const key of VOICE_FIELDS)
            content.fields[key] = voiceDraft.fields[key];
          revision = await this.revisions.update(
            context.organizationId,
            brandId,
            revision.id,
            content,
            revision.updatedAt,
          );
          isVoiceUnavailable = false;
        }
      }
      if (input.approve === true) {
        await this.revisions.approve(
          context.organizationId,
          brandId,
          revision.id,
          context.userId,
          revision.updatedAt,
        );
      }
    }
    await this.credits.settleReservation({
      actualAmount: 1,
      actorUserId: context.userId,
      brandId,
      description: 'Create brand from URL',
      organizationId: context.organizationId,
      reservationId,
      source: ActivitySource.SCRIPT,
    });
    return {
      ...(await this.get(context.organizationId, brandId)),
      ...(isVoiceUnavailable ? { voiceAnalysis: 'unavailable' as const } : {}),
    };
  }

  private async validateUrl(input: string): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const url = normalizeBrandScanUrl(input);
          const validation = this.scraper.validateUrl(url);
          if (!validation.isValid) throw new Error(validation.error);
          await resolveSafeDestination(url);
          return url;
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('URL check timed out')),
            8000,
          );
        }),
      ]);
    } catch (error: unknown) {
      throw new BadRequestException(
        `Invalid or blocked URL: ${error instanceof Error ? error.message : 'Invalid URL'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async requireBrand(organizationId: string, brandId: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException({ message: 'Brand not found.' });
    return brand;
  }

  private async reviewUrl(
    organizationId: string,
    brandSlug: string,
  ): Promise<string> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { slug: true },
    });
    const appUrl = String(
      this.config.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai',
    ).replace(/\/+$/, '');
    return `${appUrl}${createBrandAppRoute(organization?.slug ?? organizationId, brandSlug, '/settings/kit')}`;
  }
}
