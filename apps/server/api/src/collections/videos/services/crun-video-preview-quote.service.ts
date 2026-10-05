import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type { CrunVideoQuoteIntent } from '@api/collections/videos/dto/create-crun-video-quote.dto';
import { CrunVideoInputService } from '@api/collections/videos/services/crun-video-input.service';
import { CacheService } from '@api/services/cache/cache.service';
import {
  type CrunConsumedQuoteOf,
  CrunPreviewQuoteLifecycle,
  type CrunQuoteTaskRow,
} from '@api/services/integrations/crun/crun-preview-quote-lifecycle';
import { CrunQuoteService } from '@api/services/integrations/crun/crun-quote.service';
import type { CrunFrozenVideoQuote } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

export type CrunConsumedVideoQuote = CrunConsumedQuoteOf<CrunFrozenVideoQuote>;

@Injectable()
export class CrunVideoPreviewQuoteService extends CrunPreviewQuoteLifecycle<
  CrunVideoQuoteIntent,
  CrunFrozenVideoQuote
> {
  constructor(
    private readonly input: CrunVideoInputService,
    protected readonly quoteService: CrunQuoteService,
    protected readonly cache: CacheService,
    protected readonly tasks: CrunTaskService,
    protected readonly models: ModelsService,
    protected readonly prisma: PrismaService,
    protected readonly config: ConfigService,
    private readonly personas: PersonasService,
  ) {
    super();
  }

  protected readonly ingredientCategory = 'VIDEO' as const;

  protected normalizeIntent(
    raw: unknown,
    user: AuthenticatedUser,
  ): CrunVideoQuoteIntent {
    return this.input.normalize(raw, user);
  }

  protected prepareIntent(raw: unknown, user: AuthenticatedUser) {
    return this.input.prepare(raw, user);
  }

  protected isTaskRowForeign(
    row: CrunQuoteTaskRow,
    intent: CrunVideoQuoteIntent,
  ): boolean {
    return (
      row.modelKey !== intent.model || row.endpoint !== intent.model.slice(5)
    );
  }

  protected isModelStale(model: { category?: unknown }): boolean {
    return model.category !== ModelCategory.VIDEO;
  }

  protected cacheKey(user: AuthenticatedUser, quoteId: string): string {
    return `crun:video:quote:${user.organizationId}:${user.userId}:${quoteId}`;
  }

  protected async admitFrozenCharacters(
    captured: CrunFrozenVideoQuote,
  ): Promise<void> {
    // Access to a character can be revoked after the quote was taken (#6040).
    await this.personas.resolveCharacterReferences({
      brandId: captured.brandId,
      ingredientIds: [
        ...(captured.intent.references ?? []),
        ...(captured.intent.endFrame ? [captured.intent.endFrame] : []),
      ],
      organizationId: captured.organizationId,
      path: 'video',
    });
  }
}
