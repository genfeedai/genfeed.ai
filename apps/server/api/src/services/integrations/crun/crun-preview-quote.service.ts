import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CrunImageQuoteIntent } from '@api/collections/images/dto/create-crun-image-quote.dto';
import { CrunImageInputService } from '@api/collections/images/services/crun-image-input.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { CacheService } from '@api/services/cache/cache.service';
import {
  type CrunConsumedQuoteOf,
  CrunPreviewQuoteLifecycle,
} from '@api/services/integrations/crun/crun-preview-quote-lifecycle';
import { CrunQuoteService } from '@api/services/integrations/crun/crun-quote.service';
import type { CrunFrozenImageQuote } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

export type CrunConsumedQuote = CrunConsumedQuoteOf<CrunFrozenImageQuote>;

@Injectable()
export class CrunPreviewQuoteService extends CrunPreviewQuoteLifecycle<
  CrunImageQuoteIntent,
  CrunFrozenImageQuote
> {
  constructor(
    private readonly input: CrunImageInputService,
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

  protected readonly ingredientCategory = undefined;

  protected normalizeIntent(
    raw: unknown,
    user: AuthenticatedUser,
  ): CrunImageQuoteIntent {
    return this.input.normalize(raw, user);
  }

  protected prepareIntent(raw: unknown, user: AuthenticatedUser) {
    return this.input.prepare(raw, user);
  }

  protected isTaskRowForeign(): boolean {
    return false;
  }

  protected isModelStale(): boolean {
    return false;
  }

  protected cacheKey(user: AuthenticatedUser, quoteId: string): string {
    return `crun:quote:${user.organizationId}:${user.userId}:${quoteId}`;
  }

  protected async admitFrozenCharacters(
    captured: CrunFrozenImageQuote,
  ): Promise<void> {
    // Access to a character can be revoked after the quote was taken (#6040).
    await this.personas.resolveCharacterReferences({
      brandId: captured.brandId,
      ingredientIds: captured.intent.references ?? [],
      organizationId: captured.organizationId,
      path: 'image',
    });
  }
}
