import {
  type AcceptedConflict,
  acceptConflictJudgment,
  buildConflictJudgeMessages,
  CONFLICT_JUDGE_MAX_TOKENS,
  CONFLICT_JUDGE_SCHEMA_NAME,
  type ConflictJudgePassage,
  conflictJudgmentSchema,
} from '@api/collections/contexts/utils/knowledge-conflict-judge-prompt.util';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

export type KnowledgeConflictVerdict =
  | { kind: 'conflict'; conflict: AcceptedConflict }
  | { kind: 'consistent' }
  | { kind: 'unavailable' };

/**
 * The LLM judge of two Brand Truth passages (#5145): one small call on the
 * background model per pair. It fails closed in the quiet direction: an
 * unavailable model or answer is `unavailable`, never a conflict, so the pair
 * is judged again on a later scan instead of being shown or cleared.
 */
@Injectable()
export class KnowledgeConflictJudgeService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly llm: LlmDispatcherService,
    private readonly logger: LoggerService,
  ) {}

  get modelId(): string {
    return LLM_DEFAULTS.background;
  }

  async judge(
    organizationId: string,
    passageA: ConflictJudgePassage,
    passageB: ConflictJudgePassage,
  ): Promise<KnowledgeConflictVerdict> {
    try {
      const judgment = await this.llm.completeStructured(
        {
          max_tokens: CONFLICT_JUDGE_MAX_TOKENS,
          messages: buildConflictJudgeMessages(passageA, passageB),
          model: LLM_DEFAULTS.background,
          schema: conflictJudgmentSchema,
          schemaName: CONFLICT_JUDGE_SCHEMA_NAME,
          temperature: 0,
        },
        organizationId,
      );
      const conflict = acceptConflictJudgment(judgment, passageA, passageB);
      return conflict ? { conflict, kind: 'conflict' } : { kind: 'consistent' };
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} conflict judge unavailable: ${getErrorMessage(error)}`,
        { organizationId },
      );
      return { kind: 'unavailable' };
    }
  }
}
