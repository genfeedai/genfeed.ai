import { randomUUID } from 'node:crypto';
import {
  type GenerationResult,
  PersonaContentService,
} from '@api/services/persona-content/persona-content.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface PersonaVideoProcessorInput {
  personaId: string;
  organizationId: string;
  userId: string;
  script: string;
  aspectRatio?: string;
  /** Workflow execution ID for closed-loop attribution */
  executionId?: string;
  /** Workflow node ID for closed-loop attribution */
  nodeId?: string;
}

export interface PersonaVideoProcessorOutput {
  result: GenerationResult;
  /** Generation ID for closed-loop attribution */
  generationId?: string;
  /** Workflow execution ID passed through for downstream use */
  workflowExecutionId?: string;
  /** The prompt/script that was used for generation */
  promptUsed?: string;
}

@Injectable()
export class PersonaVideoProcessor {
  constructor(
    private readonly personaContentService: PersonaContentService,
    private readonly logger: LoggerService,
  ) {}

  async process(
    input: PersonaVideoProcessorInput,
  ): Promise<PersonaVideoProcessorOutput> {
    this.logger.log('Processing PersonaVideoContent', {
      personaId: input.personaId,
    });

    if (!input.personaId) {
      throw new Error('Persona ID is required');
    }

    if (!input.script) {
      throw new Error('Script is required');
    }

    if (!input.organizationId) {
      throw new Error('Organization ID is required');
    }

    const result = await this.personaContentService.generateVideo({
      aspectRatio: input.aspectRatio,
      organization: new Types.ObjectId(input.organizationId),
      personaId: new Types.ObjectId(input.personaId),
      script: input.script,
      user: new Types.ObjectId(input.userId),
    });

    // Generate a unique generationId for closed-loop attribution
    const generationId =
      input.executionId && input.nodeId
        ? `wf-${input.executionId}-${input.nodeId}-${randomUUID().slice(0, 8)}`
        : undefined;

    return {
      generationId,
      promptUsed: input.script,
      result,
      workflowExecutionId: input.executionId,
    };
  }
}
