import { AGENT_TYPE_VALUES } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  TASK_DECOMPOSITION_MODEL,
  TASK_DECOMPOSITION_SYSTEM_PROMPT,
} from '@api/services/task-orchestration/constants/decomposition-prompt.constant';
import type {
  DecomposedSubtask,
  TaskDecompositionInput,
  TaskDecompositionResult,
} from '@api/services/task-orchestration/interfaces/task-decomposition.interface';
import type { AgentType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const VALID_AGENT_TYPES = new Set<string>(AGENT_TYPE_VALUES);

@Injectable()
export class TaskDecompositionService {
  private readonly logContext = 'TaskDecompositionService';

  constructor(
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly logger: LoggerService,
  ) {}

  /** Decompose a workspace task into agent-typed subtasks via a cheap LLM call. */
  async decompose(
    input: TaskDecompositionInput,
    organizationId?: string,
  ): Promise<TaskDecompositionResult> {
    const userMessage = this.buildUserMessage(input);

    const response = await this.llmDispatcher.chatCompletion(
      {
        max_tokens: 1024,
        messages: [
          { content: TASK_DECOMPOSITION_SYSTEM_PROMPT, role: 'system' },
          { content: userMessage, role: 'user' },
        ],
        model: TASK_DECOMPOSITION_MODEL,
        temperature: 0.1,
      },
      organizationId,
    );

    const raw = response.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') {
      throw new Error('Task decomposition returned no content');
    }

    return this.parseResponse(raw, input);
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

  private parseResponse(
    raw: string,
    input: TaskDecompositionInput,
  ): TaskDecompositionResult {
    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext}: Failed to parse decomposition JSON`,
        error,
      );
      throw new Error('Task decomposition returned invalid JSON', {
        cause: error,
      });
    }

    const rawSubtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks : [];

    if (rawSubtasks.length === 0) {
      throw new Error('Task decomposition returned no subtasks');
    }

    const subtasks: DecomposedSubtask[] = rawSubtasks
      .filter(
        (s): s is Record<string, unknown> =>
          typeof s === 'object' && s !== null,
      )
      .map((s) => ({
        agentType: this.resolveAgentType(String(s.agentType ?? '')),
        brief: String(s.brief ?? input.request),
        label: String(s.label ?? 'Content task'),
        order: typeof s.order === 'number' ? s.order : 0,
      }))
      .sort((a, b) => a.order - b.order);

    if (subtasks.length === 0) {
      throw new Error('Task decomposition returned no valid subtasks');
    }

    return {
      isSingleAgent: subtasks.length === 1,
      routingSummary: String(
        parsed.routingSummary ?? 'Task decomposed into agent subtasks.',
      ),
      subtasks,
    };
  }

  private resolveAgentType(raw: string): AgentType {
    const normalized = raw.toLowerCase().trim();
    if (!VALID_AGENT_TYPES.has(normalized)) {
      throw new Error(`Task decomposition returned invalid agent type: ${raw}`);
    }
    return normalized as AgentType;
  }
}
