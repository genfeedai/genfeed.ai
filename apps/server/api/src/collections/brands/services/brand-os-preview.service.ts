import { randomBytes, randomUUID } from 'node:crypto';
import { hashToken, toBase64Url } from '@api/auth/shared/pkce.util';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { BrandKitSourceBrand } from '@genfeedai/helpers';
import {
  buildBrandKitDraftFromBrand,
  buildBrandKitDraftFromManualInput,
  buildBrandKitDraftFromWebsiteScrape,
} from '@genfeedai/helpers';
import type {
  BrandKitFieldKey,
  IBrandKitDraft,
  IBrandOsDraftHandoff,
  IBrandOsPreview,
  IBrandOsPreviewRequest,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import {
  BadRequestException,
  GoneException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Redis from 'ioredis';

const PREVIEW_TTL_SECONDS = 30 * 60;
const CLAIMED_DRAFT_TTL_SECONDS = 60 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PREVIEW_KEY_PREFIX = 'brand-os:preview:';
const CLAIMED_KEY_PREFIX = 'brand-os:claimed:';
const MAX_TOKEN_GENERATION_ATTEMPTS = 3;
const MAX_URL_LENGTH = 2048;
const MAX_GUIDANCE_LENGTH = 12_000;

const CLAIM_PREVIEW_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then
  return nil
end
redis.call('SET', KEYS[2], value, 'EX', ARGV[1])
redis.call('DEL', KEYS[1])
return value
`;

interface StoredBrandOsPreview {
  draft: IBrandKitDraft;
}

@Injectable()
export class BrandOsPreviewService {
  constructor(
    private readonly brandScraperService: BrandScraperService,
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async createPreview(input: IBrandOsPreviewRequest): Promise<IBrandOsPreview> {
    const url = input.url?.trim();
    const guidance = input.guidance?.trim();

    if (Boolean(url) === Boolean(guidance)) {
      throw new BadRequestException({
        code: 'brand_os_preview_input_required',
        detail: 'Provide exactly one public website URL or manual guidance.',
        title: 'Bad Request',
      });
    }
    if (
      (url && url.length > MAX_URL_LENGTH) ||
      (guidance && guidance.length > MAX_GUIDANCE_LENGTH)
    ) {
      throw new BadRequestException({
        code: 'brand_os_preview_input_too_long',
        detail: 'The Brand OS preview input exceeds the supported length.',
        title: 'Bad Request',
      });
    }

    const syntheticId = `brand-os-preview-${randomUUID()}`;
    const syntheticBrand: BrandKitSourceBrand = { id: syntheticId };
    let draft: IBrandKitDraft;

    if (url) {
      const validation = this.brandScraperService.validateUrl(url);
      if (!validation.isValid) {
        throw new BadRequestException({
          code: 'brand_os_preview_url_rejected',
          detail: validation.error ?? 'The public website URL was rejected.',
          title: 'Bad Request',
        });
      }

      try {
        const scraped = await this.brandScraperService.scrapeWebsite(url);
        draft = buildBrandKitDraftFromWebsiteScrape(syntheticBrand, scraped, {
          draftId: syntheticId,
        });
      } catch (error) {
        this.logger.warn('Brand OS public source rejected', {
          code: 'brand_os_preview_source_rejected',
          error: error instanceof Error ? error.message : 'unknown',
        });
        throw new BadRequestException({
          code: 'brand_os_preview_source_rejected',
          detail: 'The public website could not be read safely.',
          title: 'Bad Request',
        });
      }
    } else {
      draft = buildBrandKitDraftFromManualInput(
        syntheticBrand,
        { guidanceText: guidance },
        { draftId: syntheticId },
      );
    }

    const previewToken = await this.storePreview({ draft });
    return {
      draft,
      expiresAt: this.expiresAt(PREVIEW_TTL_SECONDS),
      id: syntheticId,
      previewToken,
    };
  }

  async claimPreview(
    previewToken: string,
    organizationId: string,
    brand: BrandDocument,
  ): Promise<IBrandOsDraftHandoff> {
    this.assertToken(previewToken);
    const client = this.requireRedis();
    const brandId = String(brand.id);
    const previewKey = this.previewKey(previewToken);
    const claimedKey = this.claimedKey(organizationId, brandId);
    let serialized: unknown;

    try {
      serialized = await client.eval(
        CLAIM_PREVIEW_SCRIPT,
        2,
        previewKey,
        claimedKey,
        String(CLAIMED_DRAFT_TTL_SECONDS),
      );
    } catch (error) {
      this.logger.error('Brand OS preview claim unavailable', {
        code: 'brand_os_preview_claim_unavailable',
        error,
      });
      throw this.unavailable();
    }

    if (typeof serialized !== 'string') {
      throw new GoneException({
        code: 'brand_os_preview_expired_or_claimed',
        detail: 'This Brand OS preview has expired or was already claimed.',
        title: 'Gone',
      });
    }

    return this.toClaimedHandoff(
      this.parseStoredPreview(serialized),
      organizationId,
      brand,
    );
  }

  async readClaimedPreview(
    organizationId: string,
    brand: BrandDocument,
  ): Promise<IBrandOsDraftHandoff> {
    const client = this.requireRedis();
    const brandId = String(brand.id);
    let serialized: string | null;

    try {
      serialized = await client.get(this.claimedKey(organizationId, brandId));
    } catch (error) {
      this.logger.error('Brand OS claimed draft unavailable', {
        code: 'brand_os_claimed_draft_unavailable',
        error,
      });
      throw this.unavailable();
    }

    if (!serialized) {
      throw new NotFoundException({
        message: 'No claimed Brand OS draft is available for this brand.',
      });
    }

    return this.toClaimedHandoff(
      this.parseStoredPreview(serialized),
      organizationId,
      brand,
    );
  }

  private async storePreview(value: StoredBrandOsPreview): Promise<string> {
    const client = this.requireRedis();
    const serialized = JSON.stringify(value);

    for (
      let attempt = 0;
      attempt < MAX_TOKEN_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const token = toBase64Url(randomBytes(32));
      try {
        const result = await client.set(
          this.previewKey(token),
          serialized,
          'EX',
          PREVIEW_TTL_SECONDS,
          'NX',
        );
        if (result === 'OK') {
          return token;
        }
      } catch (error) {
        this.logger.error('Brand OS preview storage unavailable', {
          code: 'brand_os_preview_storage_unavailable',
          error,
        });
        throw this.unavailable();
      }
    }

    throw this.unavailable();
  }

  private toClaimedHandoff(
    stored: StoredBrandOsPreview,
    organizationId: string,
    brand: BrandDocument,
  ): IBrandOsDraftHandoff {
    const proposedValues: Partial<Record<BrandKitFieldKey, unknown>> = {};
    const fieldDiagnostics: Partial<
      Record<BrandKitFieldKey, IBrandKitDraft['diagnostics']>
    > = {};
    const fieldConfidence: Partial<Record<BrandKitFieldKey, number>> = {};

    for (const [key, field] of Object.entries(stored.draft.fields)) {
      const fieldKey = key as BrandKitFieldKey;
      if (!field) {
        continue;
      }
      if (field.proposedValue !== undefined) {
        proposedValues[fieldKey] = field.proposedValue;
      }
      if (field.diagnostics.length > 0) {
        fieldDiagnostics[fieldKey] = field.diagnostics;
      }
      if (field.confidence !== undefined) {
        fieldConfidence[fieldKey] = field.confidence;
      }
    }

    const draft = buildBrandKitDraftFromBrand(
      brand as unknown as BrandKitSourceBrand,
      {
        assetCandidates: stored.draft.assetCandidates,
        createdAt: stored.draft.createdAt,
        diagnostics: stored.draft.diagnostics.filter(
          (diagnostic) => diagnostic.fieldKey === undefined,
        ),
        draftId: String(brand.id),
        evidence: stored.draft.evidence,
        fieldConfidence,
        fieldDiagnostics,
        proposedValues,
        sourceType: stored.draft.sourceType,
        updatedAt: new Date().toISOString(),
      },
    );
    draft.organizationId = organizationId;

    return {
      draft,
      expiresAt: this.expiresAt(CLAIMED_DRAFT_TTL_SECONDS),
      id: String(brand.id),
      status: 'claimed',
    };
  }

  private parseStoredPreview(serialized: string): StoredBrandOsPreview {
    try {
      const parsed = JSON.parse(serialized) as StoredBrandOsPreview;
      if (!parsed?.draft || typeof parsed.draft !== 'object') {
        throw new Error('Missing draft');
      }
      return parsed;
    } catch {
      throw new GoneException({
        code: 'brand_os_preview_invalid',
        detail: 'This Brand OS preview is no longer available.',
        title: 'Gone',
      });
    }
  }

  private assertToken(token: string): void {
    if (!TOKEN_PATTERN.test(token)) {
      throw new BadRequestException({
        code: 'brand_os_preview_token_invalid',
        detail: 'The Brand OS preview token is invalid.',
        title: 'Bad Request',
      });
    }
  }

  private requireRedis(): Redis {
    const client = this.redisService.getPublisher();
    if (!client) {
      throw this.unavailable();
    }
    return client;
  }

  private previewKey(token: string): string {
    return `${PREVIEW_KEY_PREFIX}${hashToken(token)}`;
  }

  private claimedKey(organizationId: string, brandId: string): string {
    return `${CLAIMED_KEY_PREFIX}${hashToken(`${organizationId}:${brandId}`)}`;
  }

  private expiresAt(ttlSeconds: number): string {
    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'brand_os_preview_unavailable',
      detail:
        'Brand OS preview storage is temporarily unavailable. Retry safely.',
      title: 'Service Unavailable',
    });
  }
}
