import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  TASK_DECOMPOSITION_MODEL,
  TASK_DECOMPOSITION_SYSTEM_PROMPT,
} from '@api/services/task-orchestration/constants/decomposition-prompt.constant';
import type {
  TaskDecompositionInput,
  TaskDecompositionResult,
} from '@api/services/task-orchestration/interfaces/task-decomposition.interface';
import {
  TASK_DECOMPOSITION_SCHEMA_NAME,
  taskDecompositionSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskDecompositionService {
  constructor(private readonly llmDispatcher: LlmDispatcherService) {}

  /** Decompose a workspace task into agent-typed subtasks via a cheap LLM call. */
  async decompose(
    input: TaskDecompositionInput,
    organizationId?: string,
  ): Promise<TaskDecompositionResult> {
    const decomposition = await this.llmDispatcher.completeStructured(
      {
        max_tokens: 1024,
        messages: [
          { content: TASK_DECOMPOSITION_SYSTEM_PROMPT, role: 'system' },
          { content: this.buildUserMessage(input), role: 'user' },
        ],
        model: TASK_DECOMPOSITION_MODEL,
        schema: taskDecompositionSchema,
        schemaName: TASK_DECOMPOSITION_SCHEMA_NAME,
        temperature: 0.1,
      },
      organizationId,
    );

    const subtasks = [...decomposition.subtasks].sort(
      (left, right) => left.order - right.order,
    );

    // `isSingleAgent` is derived, never read from the model: the routing
    // summary and the subtask list are the model's job, and a flag that
    // disagrees with the list it describes would route work nowhere.
    return {
      isSingleAgent: subtasks.length === 1,
      routingSummary: decomposition.routingSummary,
      subtasks,
    };
  }

  private buildUserMessage(input: TaskDecompositionInput): string {
    const parts: string[] = [`Request: ${input.request}`];

    if (input.outputType) {
      parts.push(`Preferred output type: ${input.outputType}`);
    }
    if (input.platforms?.length) {
      parts.push(`Target platforms: ${input.platforms.join(', ')}`);
    }
    if (input.brandName) {
      parts.push(`Brand: ${input.brandName}`);
    }

    return parts.join('\n');
  }
}
