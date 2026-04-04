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
import { AgentType } from '@genfeedai/enums';
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

  /**
   * Decompose a workspace task into agent-typed subtasks via a cheap LLM call.
   * Falls back to a single GENERAL agent subtask if the LLM fails or returns garbage.
   */
  async decompose(
    input: TaskDecompositionInput,
    organizationId?: string,
  ): Promise<TaskDecompositionResult> {
    const userMessage = this.buildUserMessage(input);

    try {
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
        return this.fallback(input);
      }

      return this.parseResponse(raw, input);
    } catch (error: unknown) {
      this.logger.error(
        `${this.logContext}: Decomposition LLM call failed, using fallback`,
        error,
      );
      return this.fallback(input);
    }
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
    } catch {
      this.logger.warn(
        `${this.logContext}: Failed to parse decomposition JSON, using fallback`,
      );
      return this.fallback(input);
    }

    const rawSubtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks : [];

    if (rawSubtasks.length === 0) {
      return this.fallback(input);
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
      return this.fallback(input);
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
    if (VALID_AGENT_TYPES.has(normalized)) {
      return normalized as AgentType;
    }
    return AgentType.GENERAL;
  }

  /**
   * Deterministic fallback: single GENERAL agent subtask.
   */
  private fallback(input: TaskDecompositionInput): TaskDecompositionResult {
    const agentType = this.inferAgentTypeFromOutputType(input.outputType);

    return {
      isSingleAgent: true,
      routingSummary: `Routed to ${agentType} agent for execution.`,
      subtasks: [
        {
          agentType,
          brief: input.request,
          label: 'Content task',
          order: 0,
        },
      ],
    };
  }

  private inferAgentTypeFromOutputType(outputType?: string): AgentType {
    switch (outputType) {
      case 'image':
        return AgentType.IMAGE_CREATOR;
      case 'video':
        return AgentType.VIDEO_CREATOR;
      case 'caption':
        return AgentType.ARTICLE_WRITER;
      default:
        return AgentType.GENERAL;
    }
  }
}
