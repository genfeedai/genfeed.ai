import { randomUUID } from 'node:crypto';
import {
  type GenerationResult,
  PersonaContentService,
} from '@api/services/persona-content/persona-content.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

export interface PersonaPhotoProcessorInput {
  personaId: string;
  organizationId: string;
  userId: string;
  prompt?: string;
  count: number;
  /** Workflow execution ID for closed-loop attribution */
  executionId?: string;
  /** Workflow node ID for closed-loop attribution */
  nodeId?: string;
}

export interface PersonaPhotoProcessorOutput {
  results: GenerationResult[];
  totalGenerated: number;
  totalFailed: number;
  /** Generation IDs for closed-loop attribution (one per result) */
  generationIds: string[];
  /** Workflow execution ID passed through for downstream use */
  workflowExecutionId?: string;
  /** The prompt that was used for generation */
  promptUsed?: string;
}

@Injectable()
export class PersonaPhotoProcessor {
  constructor(
    private readonly personaContentService: PersonaContentService,
    private readonly logger: LoggerService,
  ) {}

  async process(
    input: PersonaPhotoProcessorInput,
  ): Promise<PersonaPhotoProcessorOutput> {
    this.logger.log('Processing PersonaPhotoSession', {
      count: input.count,
      personaId: input.personaId,
    });

    if (!input.personaId) {
      throw new Error('Persona ID is required');
    }

    if (!input.organizationId) {
      throw new Error('Organization ID is required');
    }

    if (!input.userId) {
      throw new Error('User ID is required');
    }

    // Clamp count to safe range [1, 50]
    const count = Math.max(
      1,
      Math.min(50, Math.floor(Number(input.count) || 1)),
    );

    const results: GenerationResult[] = [];
    const generationIds: string[] = [];
    let totalFailed = 0;

    for (let i = 0; i < count; i++) {
      const result = await this.personaContentService.generatePhoto({
        organization: new Types.ObjectId(input.organizationId),
        personaId: new Types.ObjectId(input.personaId),
        prompt: input.prompt,
        user: new Types.ObjectId(input.userId),
      });

      // Generate a unique generationId for closed-loop attribution
      const generationId =
        input.executionId && input.nodeId
          ? `wf-${input.executionId}-${input.nodeId}-${randomUUID().slice(0, 8)}-${i}`
          : undefined;

      if (generationId) {
        generationIds.push(generationId);
      }

      results.push(result);

      if (result.status === 'failed') {
        totalFailed++;
      }
    }

    return {
      generationIds,
      promptUsed: input.prompt,
      results,
      totalFailed,
      totalGenerated: results.length - totalFailed,
      workflowExecutionId: input.executionId,
    };
  }
}
