import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CrunImageInputService } from '@api/collections/images/services/crun-image-input.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { CacheService } from '@api/services/cache/cache.service';
import { CrunQuoteService } from '@api/services/integrations/crun/crun-quote.service';
import type { CrunFrozenImageQuote } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  CrunGenerationQuoteResponse,
  CrunQuoteReasonCode,
} from '@genfeedai/contracts/interfaces/billing';
import { getRuntimeMarginMultiplier } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

export type CrunConsumedQuote =
  | { kind: 'fresh'; quote: CrunFrozenImageQuote }
  | { kind: 'replay'; ingredientIds: string[] };

@Injectable()
export class CrunPreviewQuoteService {
  constructor(
    private readonly input: CrunImageInputService,
    private readonly quoteService: CrunQuoteService,
    private readonly cache: CacheService,
    private readonly tasks: CrunTaskService,
    private readonly models: ModelsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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
    const intent = this.input.normalize(raw, user);
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
    const prepared = await this.input.prepare(raw, user);
    if (!prepared.isAvailable) return unavailable(prepared.reasonCode);
    const quoted = await this.quoteService.quote(
      prepared.data.preparation,
      now,
    );
    if (!quoted.isAvailable) return unavailable(quoted.reasonCode);
    const quoteId = randomUUID();
    const expiresAt = new Date(now.getTime() + 60000).toISOString();
    const captured: CrunFrozenImageQuote = {
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
    if (!(await this.cache.set(this.key(user, quoteId), captured, { ttl: 60 })))
      return unavailable('CRUN_PROVIDER_UNAVAILABLE');
    return {
      isAvailable: true,
      quoteId,
      expiresAt,
      modelKey: intent.model,
      contractVersion: prepared.data.preparation.contract.version,
      credits:
        prepared.data.preparation.credential.credentialSource === 'byok'
          ? 0
          : quoted.snapshot.credits,
      billingMode:
        prepared.data.preparation.credential.credentialSource === 'byok'
          ? 'byok'
          : 'credits',
      reasonCode: null,
    };
  }

  async consume(
    raw: unknown,
    quoteId: string,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<CrunConsumedQuote> {
    const intent = this.input.normalize(raw, user);
    const key = this.key(user, quoteId);
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
      select: { ingredientId: true, outputIndex: true, inputMetadata: true },
    });
    if (rows.length) {
      if (
        rows.some(
          (row) =>
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
    const captured = await this.cache.get<CrunFrozenImageQuote>(key);
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
    const consumed = await this.cache.getdel<CrunFrozenImageQuote>(key);
    if (!consumed)
      throw new ConflictException({ code: 'CRUN_QUOTE_IN_PROGRESS' });
    return { kind: 'fresh', quote: consumed };
  }

  async assertCurrent(captured: CrunFrozenImageQuote): Promise<void> {
    if (!this.tasks.isAdmissionEnabled()) throw this.stale();
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

  private key(user: AuthenticatedUser, quoteId: string): string {
    return `crun:quote:${user.organizationId}:${user.userId}:${quoteId}`;
  }
  private stale(): ConflictException {
    return new ConflictException({ code: 'CRUN_QUOTE_STALE' });
  }
}
