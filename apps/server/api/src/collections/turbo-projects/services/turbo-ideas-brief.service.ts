import type { GenerateTurboIdeasDto } from '@api/collections/turbo-projects/dto/generate-turbo-ideas.dto';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import type { ITurboProjectScope } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export const TURBO_IDEAS_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context is unavailable for these ideas. Please retry.';

/**
 * Ideas carry the hook, caption and, for avatar ideas, the words the avatar
 * speaks, so they are written against the composed harness brief like other
 * copy. Without it the request fails instead of letting generic ideas through.
 */
@Injectable()
export class TurboIdeasBriefService {
  private readonly context = TurboIdeasBriefService.name;

  constructor(
    private readonly harness: HarnessGenerationService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(
    brandId: string,
    dto: GenerateTurboIdeasDto,
    scope: ITurboProjectScope,
  ): Promise<string> {
    const topic = dto.angle?.trim();
    const brief = await this.harness.resolveBrief({
      brandId,
      contentType: 'ugc',
      includeContentMemory: Boolean(topic),
      objective: 'engagement',
      organizationId: scope.organizationId,
      topic: topic || undefined,
      userId: scope.userId,
    });
    const formatted = this.harness.formatBrief(brief).trim();
    if (!formatted || formatted.length > BRAND_CONTEXT_CHARACTER_BUDGET) {
      this.logger.warn(`${this.context} harness brief unavailable`, {
        brandId,
        organizationId: scope.organizationId,
      });
      throw new ServiceUnavailableException(
        TURBO_IDEAS_BRAND_CONTEXT_UNAVAILABLE,
      );
    }
    return formatted;
  }
}
