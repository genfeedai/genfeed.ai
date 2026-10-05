import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { CacheService } from '@api/services/cache/cache.service';
import type { CrunQuoteService } from '@api/services/integrations/crun/crun-quote.service';
import type {
  CrunPreparedResult,
  CrunQuoteIntentBase,
} from '@api/services/integrations/crun/crun-quote-input.util';
import type { CrunFrozenImageQuote } from '@api/services/integrations/crun/crun-task.schema';
import type { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  CrunGenerationQuoteResponse,
  CrunQuoteReasonCode,
} from '@genfeedai/contracts/interfaces/billing';
import { getRuntimeMarginMultiplier } from '@genfeedai/pricing';
import type { ConfigService } from '@libs/config/config.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

export type CrunConsumedQuoteOf<TFrozen> =
  | { kind: 'fresh'; quote: TFrozen }
  | { kind: 'replay'; ingredientIds: string[] };

/** Fields of a persisted task row the consume replay check can compare. */
export interface CrunQuoteTaskRow {
  endpoint: string;
  inputMetadata: unknown;
  modelKey: string;
}

type ReviewedModel = NonNullable<Awaited<ReturnType<ModelsService['findOne']>>>;

interface CrunFrozenQuoteShape extends Omit<CrunFrozenImageQuote, 'intent'> {
  intent: { model: string };
}

/**
 * Shared Crun quote preview/consume lifecycle (image and video). The media
 * subclasses supply their input service, cache key, ingredient category and
 * character admission (which stays in their own files), everything else, the
 * quote freeze, replay detection, single-use consumption and staleness checks,
 * is identical and lives here.
 */
export abstract class CrunPreviewQuoteLifecycle<
  TIntent extends CrunQuoteIntentBase,
  TFrozen extends CrunFrozenQuoteShape,
> {
  protected abstract readonly quoteService: CrunQuoteService;
  protected abstract readonly cache: CacheService;
  protected abstract readonly tasks: CrunTaskService;
  protected abstract readonly models: ModelsService;
  protected abstract readonly prisma: PrismaService;
  protected abstract readonly config: ConfigService;

  protected abstract normalizeIntent(
    raw: unknown,
    user: AuthenticatedUser,
  ): TIntent;
  protected abstract prepareIntent(
    raw: unknown,
    user: AuthenticatedUser,
  ): Promise<CrunPreparedResult<TIntent>>;
  protected abstract cacheKey(user: AuthenticatedUser, quoteId: string): string;
  /** Re-admit the frozen quote's characters (access can be revoked, #6040). */
  protected abstract admitFrozenCharacters(captured: TFrozen): Promise<void>;
  /** True when the model no longer fits this media kind. */
  protected abstract isModelStale(model: ReviewedModel): boolean;
  /** True when a persisted task row does not belong to this intent. */
  protected abstract isTaskRowForeign(
    row: CrunQuoteTaskRow,
    intent: TIntent,
  ): boolean;
  /** Ingredient category constraint for replay ownership, when the media has one. */
  protected abstract readonly ingredientCategory: 'VIDEO' | undefined;

  async quote(
    dto: unknown,
    request: import('@api/common/middleware/request-context.middleware').RequestWithContext,
  ): Promise<CrunGenerationQuoteResponse & { id: string }> {
    if (!request.user) throw new UnauthorizedException();
    const attributes = await this.preview(dto, request.user);
    return { id: randomUUID(), ...attributes };
  }

  async preview(
    raw: unknown,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<CrunGenerationQuoteResponse> {
    const intent = this.normalizeIntent(raw, user);
    const unavailable = (
      reasonCode: CrunQuoteReasonCode,
    ): CrunGenerationQuoteResponse => ({
      isAvailable: false,
      quoteId: null,
      expiresAt: null,
      modelKey: intent.model,
      contractVersion: null,
      credits: null,
      billingMode: null,
      reasonCode,
    });
    const prepared = await this.prepareIntent(raw, user);
    if (!prepared.isAvailable) return unavailable(prepared.reasonCode);
    const quoted = await this.quoteService.quote(
      prepared.data.preparation,
      now,
    );
    if (!quoted.isAvailable) return unavailable(quoted.reasonCode);
    const quoteId = randomUUID();
    const expiresAt = new Date(now.getTime() + 60000).toISOString();
    const captured = {
      quoteId,
      expiresAt,
      organizationId: user.organizationId,
      userId: user.userId,
      brandId: prepared.data.brandId,
      intent: prepared.data.intent,
      intentHash: prepared.data.intentHash,
      request: prepared.data.preparation.request,
      snapshot: quoted.snapshot,
      templateUsed: prepared.data.templateUsed,
      templateVersion: prepared.data.templateVersion,
    };
    if (
      !(await this.cache.set(this.cacheKey(user, quoteId), captured, {
        ttl: 60,
      }))
    )
      return unavailable('CRUN_PROVIDER_UNAVAILABLE');
    const isByok =
      prepared.data.preparation.credential.credentialSource === 'byok';
    return {
      isAvailable: true,
      quoteId,
      expiresAt,
      modelKey: intent.model,
      contractVersion: prepared.data.preparation.contract.version,
      credits: isByok ? 0 : quoted.snapshot.credits,
      billingMode: isByok ? 'byok' : 'credits',
      reasonCode: null,
    };
  }

  async consume(
    raw: unknown,
    quoteId: string,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<CrunConsumedQuoteOf<TFrozen>> {
    const intent = this.normalizeIntent(raw, user);
    const key = this.cacheKey(user, quoteId);
    const intentHash = quoteSnapshotHash(intent);
    const rows = await this.prisma.crunGenerationTask.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
        brandId: intent.brandId,
        quoteId,
        isDeleted: false,
      },
      orderBy: { outputIndex: 'asc' },
      select: {
        ingredientId: true,
        outputIndex: true,
        inputMetadata: true,
        modelKey: true,
        endpoint: true,
      },
    });
    if (rows.length) {
      if (
        rows.some(
          (row) =>
            this.isTaskRowForeign(row, intent) ||
            !row.inputMetadata ||
            typeof row.inputMetadata !== 'object' ||
            Array.isArray(row.inputMetadata) ||
            row.inputMetadata.intentHash !== intentHash,
        )
      )
        throw this.stale();
      if (
        rows.length !== intent.outputs ||
        rows.some((row, index) => row.outputIndex !== index)
      )
        throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
      const owned = await this.prisma.ingredient.count({
        where: {
          id: { in: rows.map((row) => row.ingredientId) },
          ...(this.ingredientCategory
            ? { category: this.ingredientCategory }
            : {}),
          organizationId: user.organizationId,
          userId: user.userId,
          brandId: intent.brandId,
          isDeleted: false,
        },
      });
      if (owned !== rows.length) throw this.stale();
      return {
        kind: 'replay',
        ingredientIds: rows.map((row) => row.ingredientId),
      };
    }
    const captured = await this.cache.get<TFrozen>(key);
    if (!captured) {
      if (await this.cache.get(`${key}:consumed`))
        throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
      throw this.stale();
    }
    if (
      captured.organizationId !== user.organizationId ||
      captured.userId !== user.userId ||
      captured.brandId !== intent.brandId ||
      captured.intentHash !== quoteSnapshotHash(intent) ||
      Date.parse(captured.expiresAt) <= now.getTime()
    )
      throw this.stale();
    await this.assertCurrent(captured);
    // Marker precedes GETDEL: a crash in this interval may require a new quote, never a second paid task.
    if (
      !(await this.cache.set(
        `${key}:consumed`,
        { intentHash: captured.intentHash },
        { ttl: 60 },
      ))
    )
      throw this.stale();
    const consumed = await this.cache.getdel<TFrozen>(key);
    if (!consumed)
      throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
    return { kind: 'fresh', quote: consumed };
  }

  async assertCurrent(captured: TFrozen): Promise<void> {
    if (!this.tasks.isAdmissionEnabled()) throw this.stale();
    await this.admitFrozenCharacters(captured);
    const frozen = captured.snapshot.providerQuote;
    if (!frozen) throw this.stale();
    const model = await this.models.findOne({
      key: captured.intent.model,
      organizationId: captured.organizationId,
    });
    if (
      !model?.isActive ||
      model.isDeleted ||
      model.provider !== 'crun' ||
      this.isModelStale(model) ||
      model.pendingProviderContractVersion ||
      model.reviewedProviderContractVersion !== frozen.contractVersion
    )
      throw this.stale();
    const credential = await this.tasks
      .resolveCredential(captured.organizationId)
      .catch(() => {
        throw this.stale();
      });
    if (
      credential.credentialSource !== frozen.credentialSource ||
      credential.credentialId !== frozen.credentialId ||
      credential.credentialFingerprint !== frozen.credentialFingerprint
    )
      throw this.stale();
    if (getRuntimeMarginMultiplier() !== captured.snapshot.marginMultiplier)
      throw this.stale();
    if (
      frozen.credentialSource === 'hosted' &&
      (this.config.get('CRUN_CREDITS_PER_USD') !== frozen.creditsPerUsd ||
        this.config.get('CRUN_RATE_VERSION') !== frozen.acquisitionRateVersion)
    )
      throw this.stale();
  }

  protected stale(): ConflictException {
    return new ConflictException({ code: 'CRUN_QUOTE_STALE' });
  }
}
