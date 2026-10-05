import type {
  BrandOsScanApprovedBaseline,
  BrandOsScanCollection,
  BrandOsScanFailureCode,
  BrandOsScanInput,
  BrandOsScanMarker,
  BrandOsScanPreparation,
} from '@api/collections/brands/interfaces/brand-os-scan.interface';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { normalizeBrandScanUrl } from '@api/collections/brands/utils/normalize-brand-scan-url.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { WebsiteBrandScrapeEvidence } from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandGenerationRulesV1Schema } from '@genfeedai/contracts/api-types';
import type {
  IBrandKitDraft,
  IBrandOnboardingScan,
  IScrapedBrandData,
} from '@genfeedai/contracts/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromWebsiteScrape,
} from '@genfeedai/helpers';
import {
  type Brand,
  BrandOsRevisionStatus,
  Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

const SCAN_TIMEOUT_MS = 60_000;
const FAILURE_CODES: BrandOsScanFailureCode[] = [
  'brand_scan.timed_out',
  'brand_scan.failed',
  'brand_scan.no_evidence',
  'brand_scan.invalid_baseline',
  'brand_scan.invalid_content',
  'brand_scan.content_too_large',
  'brand_scan.revision_conflict',
];

class BrandOsScanDeadlineError extends Error {}
class BrandOsScanContentError extends Error {
  constructor(readonly code: BrandOsScanFailureCode) {
    super(code);
  }
}

@Injectable()
export class BrandOsScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: BrandScraperService,
    private readonly revisions: BrandOsRevisionsService,
    private readonly logger: LoggerService,
  ) {}

  async start(input: BrandOsScanInput): Promise<IBrandOnboardingScan> {
    return (await this.startAndCollect(input)).scan;
  }

  async startAndCollect(
    input: BrandOsScanInput,
  ): Promise<BrandOsScanCollection> {
    const normalized = this.normalizeInput(input);
    const preparation = await this.prepareScan(normalized);
    if (!preparation.shouldScrape) {
      if (preparation.scan.id !== normalized.requestId)
        throw new ConflictException('Another scan is in progress');
      if (preparation.scan.url !== normalized.url)
        throw new ConflictException('Scan request URL does not match');
      return { scan: preparation.scan, scrapedData: null };
    }
    const rules = preparation.baseline?.content.generationRules;
    if (
      rules !== undefined &&
      !brandGenerationRulesV1Schema.safeParse(rules).success
    )
      return {
        scan: await this.failScan(normalized, 'brand_scan.invalid_baseline'),
        scrapedData: null,
      };
    try {
      this.assertDeadline(preparation.scan.startedAt);
      const remaining =
        Date.parse(preparation.scan.startedAt) + SCAN_TIMEOUT_MS - Date.now();
      const evidence = await this.scraper.scrapeWebsiteWithEvidence(
        normalized.url,
        { deadlineAt: performance.now() + remaining },
      );
      if (!this.hasUsableEvidence(evidence.data))
        return {
          scan: await this.failScan(normalized, 'brand_scan.no_evidence'),
          scrapedData: null,
        };
      return {
        scan: await this.completeScan(
          normalized,
          evidence,
          preparation.baseline,
        ),
        scrapedData: evidence.data,
      };
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      )
        throw error;
      const code =
        error instanceof BrandOsScanDeadlineError
          ? 'brand_scan.timed_out'
          : error instanceof BrandOsScanContentError
            ? error.code
            : error instanceof BadRequestException
              ? 'brand_scan.invalid_content'
              : 'brand_scan.failed';
      return {
        scan: await this.failScan(normalized, code, error),
        scrapedData: null,
      };
    }
  }

  async get(
    organizationId: string,
    brandId: string,
  ): Promise<IBrandOnboardingScan | null> {
    return this.prisma.$transaction(async (tx) => {
      const brand = await this.lockBrand(tx, organizationId, brandId);
      const marker = this.readMarker(
        this.config(brand.agentConfig).brandOsScan,
        brandId,
      );
      if (!marker) return null;
      if (this.isActive(marker) && this.isExpired(marker.startedAt)) {
        const failed = this.failedMarker(marker, 'brand_scan.timed_out');
        await this.writeMarker(tx, brand, failed);
        return this.toScan(failed);
      }
      return this.toScan(marker);
    });
  }

  private normalizeInput(input: BrandOsScanInput): BrandOsScanInput {
    if (
      !input ||
      typeof input.organizationId !== 'string' ||
      !input.organizationId.trim() ||
      typeof input.brandId !== 'string' ||
      !input.brandId.trim() ||
      typeof input.requestId !== 'string' ||
      !isUUID(input.requestId) ||
      typeof input.url !== 'string' ||
      !input.url.trim() ||
      input.url.length > 2048
    )
      throw new BadRequestException('Invalid scan input');
    return { ...input, url: normalizeBrandScanUrl(input.url) };
  }

  private async prepareScan(
    input: BrandOsScanInput,
  ): Promise<BrandOsScanPreparation> {
    return this.prisma.$transaction(async (tx) => {
      const brand = await this.lockBrand(
        tx,
        input.organizationId,
        input.brandId,
      );
      let previous = this.readMarker(
        this.config(brand.agentConfig).brandOsScan,
        input.brandId,
      );
      if (
        previous &&
        this.isActive(previous) &&
        this.isExpired(previous.startedAt)
      ) {
        previous = this.failedMarker(previous, 'brand_scan.timed_out');
        await this.writeMarker(tx, brand, previous);
      }
      if (previous?.id === input.requestId) {
        return {
          scan: this.toScan(previous),
          shouldScrape: false,
          baseline: null,
        };
      }
      if (previous && this.isActive(previous))
        return {
          scan: this.toScan(previous),
          shouldScrape: false,
          baseline: null,
        };
      const baseline = await this.readApproved(
        tx,
        input.organizationId,
        input.brandId,
      );
      const marker: BrandOsScanMarker = {
        schemaVersion: 1,
        id: input.requestId,
        brandId: input.brandId,
        status: 'running',
        url: input.url,
        startedAt: new Date().toISOString(),
        baseline: baseline
          ? { revisionId: baseline.revisionId, updatedAt: baseline.updatedAt }
          : null,
      };
      await this.writeMarker(tx, brand, marker);
      return { scan: this.toScan(marker), shouldScrape: true, baseline };
    });
  }

  private async completeScan(
    input: BrandOsScanInput,
    evidence: WebsiteBrandScrapeEvidence,
    baseline: BrandOsScanApprovedBaseline | null,
  ): Promise<IBrandOnboardingScan> {
    const brandSnapshot = await this.prisma.brand.findFirst({
      where: {
        id: input.brandId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
    });
    if (!brandSnapshot) return this.readTerminalScan(input);
    let marker: BrandOsScanMarker | null;
    try {
      marker = this.readMarker(
        this.config(brandSnapshot.agentConfig).brandOsScan,
        input.brandId,
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException)
        return this.readTerminalScan(input);
      throw error;
    }
    if (!marker || marker.id !== input.requestId || !this.isActive(marker))
      return this.readTerminalScan(input);
    const remaining =
      Date.parse(marker.startedAt) + SCAN_TIMEOUT_MS - Date.now();
    if (remaining <= 0) return this.failScan(input, 'brand_scan.timed_out');
    const limit = Math.max(1, Math.floor(Math.min(5000, remaining)));
    return this.prisma.$transaction(
      async (tx) => {
        const brand = await this.lockBrand(
          tx,
          input.organizationId,
          input.brandId,
        );
        const current = this.readMarker(
          this.config(brand.agentConfig).brandOsScan,
          input.brandId,
        );
        if (!current || current.id !== input.requestId)
          throw new ConflictException('Scan state changed');
        if (!this.isActive(current)) return this.toScan(current);
        this.assertDeadline(current.startedAt);
        const approved = await this.readApproved(
          tx,
          input.organizationId,
          input.brandId,
        );
        if (
          approved?.revisionId !== current.baseline?.revisionId ||
          approved?.updatedAt !== current.baseline?.updatedAt
        ) {
          const failed = this.failedMarker(
            current,
            'brand_scan.revision_conflict',
          );
          await this.writeMarker(tx, brand, failed);
          return this.toScan(failed);
        }
        const draft = this.buildDraft(
          this.projectSourceBrand(brand),
          evidence,
          baseline,
          this.toScan(current),
          new Date().toISOString(),
        );
        this.assertDeadline(current.startedAt);
        const revision = await this.revisions.create(
          input.organizationId,
          input.brandId,
          draft,
          tx,
        );
        this.assertDeadline(current.startedAt);
        const completedAt = new Date().toISOString();
        const terminal: BrandOsScanMarker = {
          ...current,
          status: this.classifyScanStatus(draft),
          completedAt,
          revisionId: revision.id,
        };
        await this.writeMarker(tx, brand, terminal);
        this.assertDeadline(current.startedAt);
        return this.toScan(terminal);
      },
      { maxWait: limit, timeout: limit },
    );
  }

  private async readTerminalScan(
    input: BrandOsScanInput,
  ): Promise<IBrandOnboardingScan> {
    return this.prisma.$transaction(
      async (tx) => {
        const brand = await this.lockBrand(
          tx,
          input.organizationId,
          input.brandId,
        );
        const current = this.readMarker(
          this.config(brand.agentConfig).brandOsScan,
          input.brandId,
        );
        if (
          !current ||
          current.id !== input.requestId ||
          this.isActive(current)
        )
          throw new ConflictException('Scan state changed');
        return this.toScan(current);
      },
      { maxWait: 5000, timeout: 5000 },
    );
  }

  private async failScan(
    input: BrandOsScanInput,
    code: BrandOsScanFailureCode,
    error?: unknown,
  ): Promise<IBrandOnboardingScan> {
    return this.prisma.$transaction(async (tx) => {
      const brand = await this.lockBrand(
        tx,
        input.organizationId,
        input.brandId,
      );
      const current = this.readMarker(
        this.config(brand.agentConfig).brandOsScan,
        input.brandId,
      );
      if (!current || current.id !== input.requestId)
        throw new ConflictException('Scan state changed');
      if (!this.isActive(current)) return this.toScan(current);
      const failed = this.failedMarker(
        current,
        this.isExpired(current.startedAt) ? 'brand_scan.timed_out' : code,
      );
      await this.writeMarker(tx, brand, failed, error);
      return this.toScan(failed);
    });
  }

  private async lockBrand(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
  ): Promise<Brand> {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "brands" WHERE "id" = ${brandId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    const brand = await tx.brand.findFirst({
      where: { id: brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Brand');
    return brand;
  }

  private readMarker(
    value: unknown,
    brandId: string,
  ): BrandOsScanMarker | null {
    if (value === undefined) return null;
    const record = this.config(value);
    const validDate = (input: unknown): input is string =>
      typeof input === 'string' && Number.isFinite(Date.parse(input));
    const active = record.status === 'pending' || record.status === 'running';
    const success = record.status === 'ready' || record.status === 'partial';
    const failed = record.status === 'failed';
    const baseline = this.config(record.baseline);
    const baselineValid =
      record.baseline === null ||
      (typeof baseline.revisionId === 'string' &&
        Boolean(baseline.revisionId) &&
        validDate(baseline.updatedAt) &&
        Object.keys(baseline).length === 2);
    const keys = [
      'schemaVersion',
      'baseline',
      'id',
      'brandId',
      'status',
      'url',
      'startedAt',
      'completedAt',
      'revisionId',
      'errorCode',
    ];
    let validUrl = false;
    if (typeof record.url === 'string' && typeof record.id === 'string') {
      try {
        validUrl =
          this.normalizeInput({
            organizationId: 'marker',
            brandId,
            requestId: record.id,
            url: record.url,
          }).url === record.url;
      } catch {
        /* Invalid stored state is a conflict, never a network input. */
      }
    }
    if (
      record.schemaVersion !== 1 ||
      record.brandId !== brandId ||
      !validUrl ||
      !validDate(record.startedAt) ||
      !baselineValid ||
      Object.keys(record).some((key) => !keys.includes(key)) ||
      (!active && !success && !failed) ||
      (active &&
        (record.completedAt !== undefined ||
          record.revisionId !== undefined ||
          record.errorCode !== undefined)) ||
      (success &&
        (!validDate(record.completedAt) ||
          typeof record.revisionId !== 'string' ||
          !record.revisionId ||
          record.errorCode !== undefined)) ||
      (failed &&
        (!validDate(record.completedAt) ||
          !FAILURE_CODES.includes(record.errorCode as BrandOsScanFailureCode) ||
          record.revisionId !== undefined))
    )
      throw new ConflictException('Scan state is invalid');
    return record as unknown as BrandOsScanMarker;
  }

  private toScan(marker: BrandOsScanMarker): IBrandOnboardingScan {
    const scan: IBrandOnboardingScan = {
      id: marker.id,
      brandId: marker.brandId,
      status: marker.status,
      url: marker.url,
      startedAt: marker.startedAt,
    };
    if (marker.completedAt !== undefined) scan.completedAt = marker.completedAt;
    if (marker.revisionId !== undefined) scan.revisionId = marker.revisionId;
    if (marker.errorCode !== undefined) scan.errorCode = marker.errorCode;
    return scan;
  }

  private config(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  private isActive(scan: IBrandOnboardingScan): boolean {
    return scan.status === 'pending' || scan.status === 'running';
  }
  private isExpired(startedAt: string): boolean {
    return Date.now() >= Date.parse(startedAt) + SCAN_TIMEOUT_MS;
  }
  private assertDeadline(startedAt: string): void {
    if (this.isExpired(startedAt)) throw new BrandOsScanDeadlineError();
  }
  private failedMarker(
    marker: BrandOsScanMarker,
    code: BrandOsScanFailureCode,
  ): BrandOsScanMarker {
    return {
      ...marker,
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorCode: code,
    };
  }

  private async writeMarker(
    tx: Prisma.TransactionClient,
    brand: Brand,
    marker: BrandOsScanMarker,
    error?: unknown,
  ): Promise<void> {
    await tx.brand.update({
      where: {
        id: brand.id,
        organizationId: brand.organizationId,
        isDeleted: false,
      },
      data: {
        agentConfig: toPrismaJson({
          ...this.config(brand.agentConfig),
          brandOsScan: marker,
        }),
      },
    });
    if (marker.status === 'failed') {
      const message =
        error instanceof Error
          ? error.message
          : (marker.errorCode ?? 'brand_scan.failed');
      this.logger.warn('Brand OS scan failed', {
        brandId: brand.id,
        organizationId: brand.organizationId,
        code: marker.errorCode,
        error: message
          .replace(/https?:\/\/[^\s"'<>]+/gi, '[website]')
          .slice(0, 500),
      });
    }
  }
  private async readApproved(
    tx: Prisma.TransactionClient,
    organizationId: string,
    brandId: string,
  ): Promise<BrandOsScanApprovedBaseline | null> {
    const row = await tx.brandOsRevision.findFirst({
      where: {
        organizationId,
        brandId,
        isDeleted: false,
        status: BrandOsRevisionStatus.APPROVED,
      },
    });
    return row
      ? {
          revisionId: row.id,
          updatedAt: row.updatedAt.toISOString(),
          content: structuredClone(row.content) as unknown as IBrandKitDraft,
        }
      : null;
  }

  private projectSourceBrand(brand: Brand): BrandKitSourceBrand {
    const config = this.config(brand.agentConfig);
    const voice = this.config(config.voice);
    const strategy = this.config(config.strategy);
    const text = (value: unknown): string | undefined =>
      typeof value === 'string' ? value : undefined;
    const strings = (value: unknown): string[] | undefined =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : undefined;
    return {
      id: brand.id,
      organization: { id: brand.organizationId },
      label: brand.label,
      description: brand.description,
      text: brand.text,
      fontFamily: brand.fontFamily,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      backgroundColor: brand.backgroundColor,
      agentConfig: {
        voice: {
          tone: text(voice.tone),
          style: text(voice.style),
          audience: strings(voice.audience),
          values: strings(voice.values),
          messagingPillars: strings(voice.messagingPillars),
          doNotSoundLike: strings(voice.doNotSoundLike),
          sampleOutput: text(voice.sampleOutput),
        },
        strategy: {
          contentTypes: strings(strategy.contentTypes),
          platforms: strings(strategy.platforms),
          goals: strings(strategy.goals),
          frequency: text(strategy.frequency),
        },
      },
    };
  }

  private buildDraft(
    source: BrandKitSourceBrand,
    evidence: WebsiteBrandScrapeEvidence,
    baseline: BrandOsScanApprovedBaseline | null,
    scan: IBrandOnboardingScan,
    completedAt: string,
  ): IBrandKitDraft {
    let draft: IBrandKitDraft;
    try {
      draft = buildBrandKitDraftFromWebsiteScrape(source, evidence.data, {
        baselineDraft: baseline?.content,
        draftId: scan.id,
        createdAt: scan.startedAt,
        updatedAt: completedAt,
      });
    } catch {
      throw new BrandOsScanContentError('brand_scan.invalid_content');
    }
    const fontEvidence = evidence.fontCandidates.map((candidate) => ({
      sourceType: 'website' as const,
      label: 'Discovered font candidate',
      url: candidate.sourceUrl || undefined,
      excerpt: JSON.stringify({
        family: candidate.family,
        weight: candidate.weight,
        style: candidate.style,
        availability: candidate.availability,
      }).slice(0, 4000),
    }));
    draft.evidence.push(...evidence.evidence, ...fontEvidence);
    draft.diagnostics.push(...evidence.diagnostics);
    draft.readiness.diagnostics.push(...evidence.diagnostics);
    if (draft.fields.fontFamily) {
      draft.fields.fontFamily.evidence.push(
        ...evidence.evidence.filter((entry) => entry.label.includes('font')),
        ...fontEvidence,
      );
      draft.fields.fontFamily.diagnostics.push(
        ...evidence.diagnostics.filter(
          (entry) =>
            entry.fieldKey === 'fontFamily' ||
            entry.code.startsWith('brand_scrape.font_'),
        ),
      );
    }
    const rules = draft.generationRules;
    if (
      (rules !== undefined &&
        !brandGenerationRulesV1Schema.safeParse(rules).success) ||
      JSON.stringify(rules) !==
        JSON.stringify(baseline?.content.generationRules)
    )
      throw new BrandOsScanContentError('brand_scan.invalid_content');
    const projection: IBrandKitDraft = { ...draft, id: scan.brandId };
    if (Buffer.byteLength(JSON.stringify(projection), 'utf8') > 250_000)
      throw new BrandOsScanContentError('brand_scan.content_too_large');
    return JSON.parse(JSON.stringify(draft)) as IBrandKitDraft;
  }

  private hasUsableEvidence(data: IScrapedBrandData): boolean {
    const nonblank = (value: unknown): boolean =>
      typeof value === 'string' && value.trim().length > 0;
    return (
      [
        data.companyName,
        data.description,
        data.aboutText,
        data.heroText,
        data.tagline,
        data.primaryColor,
        data.secondaryColor,
        data.fontFamily,
        data.bannerUrl,
        data.ogImage,
      ].some(nonblank) ||
      [
        data.fontCandidates,
        data.valuePropositions,
        data.referenceImageUrls,
      ].some((values) => values?.some(nonblank)) ||
      Object.values(data.socialLinks ?? {}).some(nonblank)
    );
  }
  private classifyScanStatus(draft: IBrandKitDraft): 'ready' | 'partial' {
    return draft.readiness.status !== 'complete' ||
      [...draft.diagnostics, ...draft.readiness.diagnostics].some(
        (entry) => entry.severity === 'warning' || entry.severity === 'error',
      )
      ? 'partial'
      : 'ready';
  }
}
