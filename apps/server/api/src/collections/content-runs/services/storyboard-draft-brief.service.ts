import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export const STORYBOARD_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context is unavailable for this storyboard. Nothing was changed; try again.';

/** Topic used to pull related content memory; a long idea dump is cut short. */
const TOPIC_CHARACTERS = 280;

export type StoryboardDraftActor = Omit<BrandAccessActor, 'organizationId'>;

/**
 * Storyboard scripts carry the words the presenter speaks and the shots the
 * viewer sees, so they are written against the composed harness brief like
 * other copy. Without it the draft fails instead of going out off-brand.
 */
@Injectable()
export class StoryboardDraftBriefService {
  private readonly context = StoryboardDraftBriefService.name;

  constructor(
    private readonly harness: HarnessGenerationService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(
    organizationId: string,
    brandId: string,
    actor: StoryboardDraftActor,
    videoBrief: string,
  ): Promise<string> {
    const topic = videoBrief.trim().slice(0, TOPIC_CHARACTERS);
    const brief = await this.harness.resolveBrief({
      apiKeyId: actor.apiKeyId,
      brandId,
      contentType: 'video',
      includeContentMemory: Boolean(topic),
      isApiKey: actor.isApiKey,
      objective: 'engagement',
      organizationId,
      scopes: actor.scopes,
      topic: topic || undefined,
      userId: actor.userId,
    });
    const formatted = this.harness.formatBrief(brief).trim();
    if (!formatted || formatted.length > BRAND_CONTEXT_CHARACTER_BUDGET) {
      this.logger.warn(`${this.context} harness brief unavailable`, {
        brandId,
        organizationId,
      });
      throw new ServiceUnavailableException(
        STORYBOARD_BRAND_CONTEXT_UNAVAILABLE,
      );
    }
    return formatted;
  }
}
