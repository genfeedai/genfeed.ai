import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import type { ApiKeyPublishingContext } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ReleaseStatus } from '@genfeedai/contracts';
import {
  type IScheduledReleaseBatchItemError,
  type IScheduledReleaseBatchMedia,
  type IScheduledReleaseBatchPost,
  type IScheduledReleaseBatchResult,
  SCHEDULED_RELEASE_BATCH_MAX,
} from '@genfeedai/contracts/interfaces';
import {
  isRecord,
  readNonBlankStringOrNull as readString,
} from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';

const FALLBACK_ERROR = 'This release could not be scheduled.';

function readIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function readRecords(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).filter(isRecord);
}

/** What a reviewer reads for a batch: its posts, and the brands they belong to. */
export interface BatchDescription {
  /** Brands the releases or their channels belong to. */
  brandIds: string[];
  brandLabel: string | null;
  posts: IScheduledReleaseBatchPost[];
}

/** The client-safe text of a failure: only HTTP exceptions carry any. */
function describeFailure(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const response = error.getResponse();
  if (isRecord(response)) {
    if (typeof response.detail === 'string' && response.detail) {
      return response.detail;
    }
    if (typeof response.message === 'string' && response.message) {
      return response.message;
    }
  }
  return error.message || FALLBACK_ERROR;
}

/**
 * Many releases in one request (#10134): the week an MCP client schedules
 * with one approval. Each release goes through the single-release rules, so a
 * bad one is named and the rest still go.
 */
@Traced()
@Injectable()
export class PostGroupBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly contractService: PostGroupContractService,
    private readonly persistenceService: PostGroupPersistenceService,
    private readonly readinessService: PostGroupReadinessService,
    private readonly postGroupsService: PostGroupsService,
  ) {}

  /** Throws when the batch itself cannot be accepted (size, shape). */
  assertBatchShape(releases: unknown): asserts releases is unknown[] {
    if (!Array.isArray(releases) || releases.length === 0) {
      throw new BadRequestException('releases must be a non-empty array.');
    }
    if (releases.length > SCHEDULED_RELEASE_BATCH_MAX) {
      throw new BadRequestException(
        `A batch holds at most ${SCHEDULED_RELEASE_BATCH_MAX} releases.`,
      );
    }
  }

  /**
   * Checks every release without creating anything: its shape, channel rules,
   * connected credential, readiness and (when it schedules) a future time. One
   * entry per release that would be refused.
   */
  async validate(
    organizationId: string,
    releases: readonly unknown[],
    now: Date = new Date(),
  ): Promise<IScheduledReleaseBatchItemError[]> {
    const errors: IScheduledReleaseBatchItemError[] = [];
    for (const [index, release] of releases.entries()) {
      try {
        await this.validateOne(organizationId, release, now);
      } catch (error) {
        errors.push({
          index,
          message: this.failureMessage(error, `validating release ${index}`),
        });
      }
    }
    return errors;
  }

  /**
   * Creates the releases at `indexes` (all of them when omitted). The key of
   * release N is `<keyBase>:N`, so running the same batch twice returns the
   * releases already created instead of making duplicates.
   */
  async create(
    organizationId: string,
    userId: string,
    releases: readonly unknown[],
    options: {
      apiKeyContext?: ApiKeyPublishingContext;
      indexes?: readonly number[];
      keyBase: string;
    },
  ): Promise<IScheduledReleaseBatchResult> {
    const result: IScheduledReleaseBatchResult = { created: [], errors: [] };
    const indexes = options.indexes ?? releases.map((_, index) => index);
    for (const index of indexes) {
      const release = releases[index];
      try {
        if (!isRecord(release)) {
          throw new BadRequestException('Each release must be an object.');
        }
        const created = await this.postGroupsService.create(
          organizationId,
          userId,
          { ...release, idempotencyKey: `${options.keyBase}:${index}` },
          undefined,
          undefined,
          options.apiKeyContext,
        );
        result.created.push({ index, releaseId: created.id });
      } catch (error) {
        result.errors.push({
          index,
          message: this.failureMessage(error, `creating release ${index}`),
        });
      }
    }
    return result;
  }

  /**
   * Every release as a reviewer reads it: the text a channel publishes, its
   * time, the channel account and the media in slide order, with media and
   * account names resolved inside the organization.
   */
  async describe(
    organizationId: string,
    releases: readonly unknown[],
  ): Promise<BatchDescription> {
    const records = releases.map((release) =>
      isRecord(release) ? release : {},
    );
    const credentialIds = [
      ...new Set(
        records.flatMap((release) =>
          readRecords(release.targets).flatMap((target) => {
            const id = readString(target.credentialId);
            return id ? [id] : [];
          }),
        ),
      ),
    ];
    const assetIds = [
      ...new Set(
        records.flatMap((release) =>
          readRecords(release.media).flatMap((item) => {
            const id = readString(item.assetId);
            return id ? [id] : [];
          }),
        ),
      ),
    ];
    const [credentials, ingredients] = await Promise.all([
      credentialIds.length
        ? this.prisma.credential.findMany({
            select: {
              brandId: true,
              externalHandle: true,
              externalName: true,
              id: true,
            },
            where: scopedWhere(organizationId, { id: { in: credentialIds } }),
          })
        : [],
      assetIds.length
        ? this.prisma.ingredient.findMany({
            select: { category: true, cdnUrl: true, id: true },
            where: scopedWhere(organizationId, { id: { in: assetIds } }),
          })
        : [],
    ]);
    const credentialsById = new Map(credentials.map((c) => [c.id, c]));
    const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));
    const brandIds = [
      ...new Set([
        ...records.flatMap((release) => readString(release.brandId) ?? []),
        ...credentials.flatMap((credential) => credential.brandId ?? []),
      ]),
    ];
    const brands = brandIds.length
      ? await this.prisma.brand.findMany({
          select: { id: true, label: true },
          where: scopedWhere(organizationId, { id: { in: brandIds } }),
        })
      : [];
    const leadBrandId = readString(records[0]?.brandId) ?? brandIds[0];
    const posts = records.map((release, index): IScheduledReleaseBatchPost => {
      const target = readRecords(release.targets)[0] ?? {};
      const credential = credentialsById.get(
        readString(target.credentialId) ?? '',
      );
      const media = readRecords(release.media)
        .flatMap((item, position): IScheduledReleaseBatchMedia[] => {
          const ingredient = ingredientsById.get(
            readString(item.assetId) ?? '',
          );
          if (!ingredient) return [];
          return [
            {
              kind: String(ingredient.category).toLowerCase().includes('video')
                ? 'video'
                : 'image',
              order: readIndex(item.order) ?? position,
              url: ingredient.cdnUrl ?? null,
            },
          ];
        })
        .sort((a, b) => a.order - b.order);
      return {
        accountHandle: credential?.externalHandle ?? null,
        accountLabel: credential?.externalName ?? null,
        error: null,
        index,
        isRemoved: false,
        media,
        platform: readString(target.platform) ?? '',
        releaseId: null,
        scheduledAt:
          readString(target.scheduledDate) ?? readString(release.scheduledDate),
        text:
          readString(target.caption) ?? readString(release.baseContent) ?? '',
        timezone: readString(target.timezone) ?? readString(release.timezone),
        title: readString(release.title) ?? '',
      };
    });
    return {
      brandIds,
      brandLabel:
        brands.find((brand) => brand.id === leadBrandId)?.label ??
        brands[0]?.label ??
        null,
      posts,
    };
  }

  private async validateOne(
    organizationId: string,
    release: unknown,
    now: Date,
  ): Promise<void> {
    const input = this.contractService.parseCreateInput(release);
    const status = this.contractService.resolveCreateStatus(input);
    const isDraft = status === ReleaseStatus.DRAFT;
    const credentials = await this.persistenceService.resolveCredentials(
      this.prisma,
      organizationId,
      input.targets,
    );
    await this.persistenceService.resolveBrandId(
      this.prisma,
      organizationId,
      input.brandId,
      credentials,
    );
    const readiness = await this.readinessService.resolveForCredentials(
      this.prisma,
      organizationId,
      input.targets.map((target) => target.credentialId),
    );
    for (const target of input.targets) {
      const validation = this.contractService.validateTarget(
        input,
        target,
        isDraft ? 'draft' : 'scheduled',
      );
      if (!validation.valid && !isDraft) {
        throw this.contractService.invalidTargetException(target, validation);
      }
      if (!isDraft) {
        this.readinessService.assertSchedulable(
          target,
          readiness.get(target.credentialId),
        );
      }
    }
    if (!isDraft) {
      const times = [
        input.scheduledDate,
        ...input.targets.map((target) => target.scheduledDate),
      ].filter((value): value is string => Boolean(value));
      if (times.length === 0) {
        throw new BadRequestException(
          'A scheduled release needs a scheduledDate.',
        );
      }
      if (times.some((value) => new Date(value) <= now)) {
        throw new BadRequestException('The scheduled time has passed.');
      }
    }
  }

  private failureMessage(error: unknown, action: string): string {
    const message = describeFailure(error);
    if (message !== null) return message;
    this.logger.error(`Batch release failed while ${action}`, {
      error: error instanceof Error ? error.stack : String(error),
    });
    return FALLBACK_ERROR;
  }
}
