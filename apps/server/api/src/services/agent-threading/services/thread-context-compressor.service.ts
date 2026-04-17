import { AgentMessageDocument } from '@api/collections/agent-messages/schemas/agent-message.schema';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ConfigService } from '@api/config/config.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { CacheService } from '@api/services/cache/services/cache.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { OpenRouterMessage } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { ThreadContextState } from '@prisma/client';

const LOCK_TTL_SECONDS = 30;
const CACHE_TTL_SECONDS = 300; // 5 minutes

const COMPRESSION_PROMPT = `You are a thread context compressor. Given a conversation history between a user and an AI assistant, extract the following structured sections. Be concise but preserve all important information.

Respond in EXACTLY this format with these 4 sections:

## CURRENT_ARTIFACT
The latest version of the content/artifact being worked on. Include the full text.

## ACCUMULATED_REQUIREMENTS
All requirements the user has stated across the conversation, as bullet points.

## KEY_DECISIONS
Important choices made during the iteration, as bullet points.

## ITERATION_HISTORY
One-line summary of what changed in each round of iteration, as bullet points.

If a section has no content, write "None" for that section.`;

type ThreadContextStateData = {
  currentArtifact?: string;
  accumulatedRequirements?: string;
  keyDecisions?: string;
  iterationHistory?: string;
  lastIncorporatedMessageId?: string;
  messageCount?: number;
  version?: number;
};

type ThreadContextStateWithData = ThreadContextState & {
  data: ThreadContextStateData;
};

@Injectable()
export class ThreadContextCompressorService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  private get isEnabled(): boolean {
    return (
      this.configService.get('AGENT_CONTEXT_COMPRESSION_ENABLED') === 'true'
    );
  }

  private get windowSize(): number {
    return Number(this.configService.get('AGENT_CONTEXT_WINDOW_SIZE')) || 5;
  }

  private get compressionModel(): string {
    return (
      (this.configService.get('AGENT_CONTEXT_COMPRESSION_MODEL') as string) ||
      'deepseek/deepseek-chat'
    );
  }

  private lockKey(threadId: string): string {
    return `thread-compact:${threadId}`;
  }

  private cacheKey(threadId: string): string {
    return `thread-compact:state:${threadId}`;
  }

  /**
   * Get the current thread context state, running sync compression if needed.
   * This is the primary entry point called before building message history.
   */
  async getStateOrCompact(
    threadId: string,
    organizationId: string,
  ): Promise<ThreadContextStateWithData | null> {
    if (!this.isEnabled) {
      return null;
    }

    const state = await this.getState(threadId);
    if (!state) {
      // Check if thread has enough messages to warrant compression
      const totalMessages =
        await this.agentMessagesService.countMessages(threadId);
      if (totalMessages > this.windowSize) {
        await this.compress(threadId, organizationId);
        return this.getState(threadId);
      }
      return null;
    }

    // Check if there are uncompacted messages beyond the window
    const uncompactedCount = await this.agentMessagesService.countMessagesAfter(
      threadId,
      state.data.lastIncorporatedMessageId,
    );
    if (uncompactedCount > this.windowSize) {
      await this.compress(threadId, organizationId);
      return this.getState(threadId);
    }

    return state;
  }

  /**
   * Async compression trigger — called after assistant.finalized.
   * Acquires an atomic Redis lock to prevent concurrent compression.
   */
  async compressIfNeeded(
    threadId: string,
    organizationId: string,
  ): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const state = await this.getState(threadId);
    const totalMessages =
      await this.agentMessagesService.countMessages(threadId);

    if (totalMessages <= this.windowSize) {
      return;
    }

    if (state) {
      const uncompacted = await this.agentMessagesService.countMessagesAfter(
        threadId,
        state.data.lastIncorporatedMessageId,
      );
      if (uncompacted <= this.windowSize) {
        return;
      }
    }

    await this.compress(threadId, organizationId);
  }

  /**
   * Render the compressed state as a user message for injection into history.
   * Deduplicates currentArtifact if it appears in the window messages.
   */
  renderStateAsUserMessage(
    state: ThreadContextStateWithData,
    windowMessages: AgentMessageDocument[],
  ): string {
    const sections: string[] = ['[Thread Context Summary]'];
    const stateData = state.data;

    // Deduplicate artifact against the last assistant message specifically
    let artifactSection = stateData.currentArtifact;
    if (artifactSection && windowMessages.length > 0) {
      const lastAssistantMsg = [...windowMessages]
        .reverse()
        .find((m) => m.role === 'assistant');
      if (
        lastAssistantMsg?.content &&
        artifactSection.length > 50 &&
        lastAssistantMsg.content.includes(artifactSection.slice(0, 200))
      ) {
        artifactSection = undefined;
      }
    }

    if (artifactSection) {
      sections.push(`## Current Artifact\n${artifactSection}`);
    }

    if (stateData.accumulatedRequirements) {
      sections.push(
        `## Accumulated Requirements\n${stateData.accumulatedRequirements}`,
      );
    }

    if (stateData.keyDecisions) {
      sections.push(`## Key Decisions\n${stateData.keyDecisions}`);
    }

    if (stateData.iterationHistory) {
      sections.push(`## Iteration History\n${stateData.iterationHistory}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Get messages after the compaction boundary for the sliding window.
   */
  async getWindowMessages(
    threadId: string,
    afterMessageId: string,
  ): Promise<AgentMessageDocument[]> {
    return this.agentMessagesService.getMessagesAfter(
      threadId,
      afterMessageId,
      this.windowSize,
    );
  }

  // --- Private methods ---

  private async getState(
    threadId: string,
  ): Promise<ThreadContextStateWithData | null> {
    const cached = await this.cacheService.get<ThreadContextStateWithData>(
      this.cacheKey(threadId),
    );
    if (cached) {
      return cached;
    }

    const state = await this.prisma.threadContextState.findFirst({
      where: {
        isDeleted: false,
        threadId,
      },
    });

    if (state) {
      const stateWithData = state as ThreadContextStateWithData;
      await this.cacheService.set(this.cacheKey(threadId), stateWithData, {
        ttl: CACHE_TTL_SECONDS,
      });
      return stateWithData;
    }

    return null;
  }

  private async compress(
    threadId: string,
    organizationId: string,
  ): Promise<void> {
    // Atomic distributed lock via CacheService.withLock (SET NX EX)
    await this.cacheService.withLock(
      this.lockKey(threadId),
      async () => {
        await this.performCompression(threadId, organizationId);
      },
      LOCK_TTL_SECONDS,
    );
  }

  private async performCompression(
    threadId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const existingRecord = await this.prisma.threadContextState.findFirst({
        where: {
          isDeleted: false,
          threadId,
        },
      });
      const existingState = existingRecord
        ? ((existingRecord.data ?? {}) as ThreadContextStateData)
        : null;

      // Fetch all messages that need compression.
      const allMessages = existingState?.lastIncorporatedMessageId
        ? await this.agentMessagesService.getAllMessagesAfter(
            threadId,
            existingState.lastIncorporatedMessageId,
          )
        : await this.agentMessagesService.getAllMessages(threadId);

      if (allMessages.length <= this.windowSize) {
        return;
      }

      // Messages to compress = everything except the last windowSize
      const compressBoundary = allMessages.length - this.windowSize;
      const messagesToCompress = allMessages.slice(0, compressBoundary);
      const lastCompressedMessage =
        messagesToCompress[messagesToCompress.length - 1];

      if (!lastCompressedMessage?._id) {
        return;
      }

      // Build conversation text for compression
      const conversationText = messagesToCompress
        .map((msg) => {
          const role = msg.role === 'user' ? 'User' : 'Assistant';
          return `${role}: ${msg.content || '[no content]'}`;
        })
        .join('\n\n');

      // Include existing compressed state for incremental compression
      let contextPrefix = '';
      if (
        existingState?.accumulatedRequirements ||
        existingState?.keyDecisions
      ) {
        contextPrefix =
          'Previous compressed state:\n' +
          (existingState.accumulatedRequirements
            ? `Requirements: ${existingState.accumulatedRequirements}\n`
            : '') +
          (existingState.keyDecisions
            ? `Decisions: ${existingState.keyDecisions}\n`
            : '') +
          (existingState.iterationHistory
            ? `History: ${existingState.iterationHistory}\n`
            : '') +
          '\nNew messages to incorporate:\n';
      }

      const messages: OpenRouterMessage[] = [
        { content: COMPRESSION_PROMPT, role: 'system' },
        {
          content: `${contextPrefix}${conversationText}`,
          role: 'user',
        },
      ];

      const response = await this.llmDispatcherService.chatCompletion(
        {
          max_tokens: 2048,
          messages,
          model: this.compressionModel,
          temperature: 0.1,
        },
        organizationId,
      );

      const responseText = response.choices?.[0]?.message?.content || '';
      const parsed = this.parseCompressionResponse(responseText);

      // Validate parse result has at least one meaningful section before advancing state
      const hasValidContent =
        parsed.accumulatedRequirements ||
        parsed.currentArtifact ||
        parsed.keyDecisions ||
        parsed.iterationHistory;

      if (!hasValidContent) {
        this.logger.warn(
          `${this.constructorName}: Compression parse returned no valid sections for thread ${threadId}, skipping state update to prevent data loss`,
        );
        return;
      }

      const currentVersion = existingState?.version ?? 0;
      const previousCount = existingState?.messageCount ?? 0;

      const newData: ThreadContextStateData = {
        accumulatedRequirements: parsed.accumulatedRequirements,
        currentArtifact: parsed.currentArtifact,
        iterationHistory: parsed.iterationHistory,
        keyDecisions: parsed.keyDecisions,
        lastIncorporatedMessageId: String(lastCompressedMessage._id),
        messageCount: previousCount + compressBoundary,
        version: currentVersion + 1,
      };

      // Upsert pattern: try update first, then create if not found
      let updatedRecord: ThreadContextStateWithData;

      if (existingRecord) {
        updatedRecord = (await this.prisma.threadContextState.update({
          data: {
            data: newData as never,
            isDeleted: false,
          },
          where: { id: existingRecord.id },
        })) as ThreadContextStateWithData;
      } else {
        updatedRecord = (await this.prisma.threadContextState.create({
          data: {
            data: newData as never,
            isDeleted: false,
            organizationId,
            threadId,
          },
        })) as ThreadContextStateWithData;
      }

      // Write-through cache: set the new state immediately
      await this.cacheService.set(this.cacheKey(threadId), updatedRecord, {
        ttl: CACHE_TTL_SECONDS,
      });

      this.logger.debug(
        `${this.constructorName}: Compressed ${compressBoundary} messages for thread ${threadId}`,
      );
    } catch (error) {
      this.logger.warn(
        `${this.constructorName}: Compression failed for thread ${threadId}`,
        { error },
      );
    }
  }

  private parseCompressionResponse(text: string): {
    currentArtifact?: string;
    accumulatedRequirements?: string;
    keyDecisions?: string;
    iterationHistory?: string;
  } {
    const sections: Record<string, string> = {};
    const sectionNames = [
      'CURRENT_ARTIFACT',
      'ACCUMULATED_REQUIREMENTS',
      'KEY_DECISIONS',
      'ITERATION_HISTORY',
    ];

    for (const name of sectionNames) {
      const regex = new RegExp(`## ${name}\\s*\\n([\\s\\S]*?)(?=## [A-Z_]+|$)`);
      const match = text.match(regex);
      if (match?.[1]) {
        const content = match[1].trim();
        if (content && content !== 'None') {
          sections[name] = content;
        }
      }
    }

    return {
      accumulatedRequirements: sections.ACCUMULATED_REQUIREMENTS,
      currentArtifact: sections.CURRENT_ARTIFACT,
      iterationHistory: sections.ITERATION_HISTORY,
      keyDecisions: sections.KEY_DECISIONS,
    };
  }
}
