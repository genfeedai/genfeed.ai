import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import type { ContentKind } from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SkillExecutionContext } from './interfaces/skill-executor.interfaces';

const SKILL_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context could not be loaded for this skill, so nothing was generated. Try again.';

interface SkillBriefRequest {
  contentType: ContentKind;
  platform?: string;
  topic?: string;
}

/**
 * The composed harness brief (org directive, brand voice, guardrails,
 * criteria, examples) for a skill run. Skill handlers write brand copy, so
 * none of them writes without it: a missing, empty or over-budget brief
 * fails the run with a retryable 503 instead of a generic prompt.
 */
@Injectable()
export class SkillBrandBriefService {
  constructor(
    private readonly harnessGenerationService: HarnessGenerationService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(
    context: SkillExecutionContext,
    { contentType, platform, topic }: SkillBriefRequest,
  ): Promise<string> {
    const brief = await this.harnessGenerationService.resolveBrief({
      brandId: context.brandId,
      contentType,
      includeContentMemory: true,
      organizationId: context.organizationId,
      platform,
      topic,
      userId: context.userId,
    });
    const formatted = this.harnessGenerationService.formatBrief(brief).trim();
    if (
      !brief ||
      !formatted ||
      formatted.length > BRAND_CONTEXT_CHARACTER_BUDGET
    ) {
      this.logger.warn(`${this.constructor.name} harness brief unavailable`, {
        brandId: context.brandId,
        contentType,
        organizationId: context.organizationId,
      });
      throw new ServiceUnavailableException(SKILL_BRAND_CONTEXT_UNAVAILABLE);
    }
    return formatted;
  }
}
