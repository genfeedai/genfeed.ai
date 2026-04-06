import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ThreadContextState } from '@api/services/agent-threading/schemas/thread-context-state.schema';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { ThreadContextCompressorService } from './thread-context-compressor.service';

const makeObjectId = () => new Types.ObjectId();
const threadId = makeObjectId().toString();
const orgId = makeObjectId().toString();

const makeMessage = (role: string, content: string, id?: Types.ObjectId) =>
  ({
    _id: id ?? makeObjectId(),
    content,
    isDeleted: false,
    role,
    room: new Types.ObjectId(threadId),
  }) as never;

const makeLlmResponse = (text: string) => ({
  choices: [{ message: { content: text } }],
});

const MOCK_COMPRESSION_RESPONSE = `## CURRENT_ARTIFACT
Draft blog post about AI trends

## ACCUMULATED_REQUIREMENTS
- Must include 2025 predictions
- Keep it under 500 words

## KEY_DECISIONS
- Chose informal tone over academic

## ITERATION_HISTORY
- Round 1: Initial draft created
- Round 2: Added predictions section`;

describe('ThreadContextCompressorService', () => {
  let service: ThreadContextCompressorService;
  let model: Record<string, ReturnType<typeof vi.fn>>;
  let messagesService: Record<string, ReturnType<typeof vi.fn>>;
  let llmDispatcher: Record<string, ReturnType<typeof vi.fn>>;
  let cacheService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    model = {
      findOne: vi
        .fn()
        .mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    };

    messagesService = {
      countMessages: vi.fn().mockResolvedValue(0),
      countMessagesAfter: vi.fn().mockResolvedValue(0),
      getMessagesAfter: vi.fn().mockResolvedValue([]),
      getRecentMessages: vi.fn().mockResolvedValue([]),
    };

    llmDispatcher = {
      chatCompletion: vi
        .fn()
        .mockResolvedValue(makeLlmResponse(MOCK_COMPRESSION_RESPONSE)),
    };

    cacheService = {
      del: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
      withLock: vi.fn().mockImplementation(async (_key, fn) => fn()),
    };

    configService = {
      get: vi.fn().mockImplementation((key: string) => {
        const defaults: Record<string, string> = {
          AGENT_CONTEXT_COMPRESSION_ENABLED: 'true',
          AGENT_CONTEXT_COMPRESSION_MODEL: 'deepseek/deepseek-chat',
          AGENT_CONTEXT_WINDOW_SIZE: '5',
        };
        return defaults[key];
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ThreadContextCompressorService,
        {
          provide: getModelToken(ThreadContextState.name, DB_CONNECTIONS.AGENT),
          useValue: model,
        },
        { provide: AgentMessagesService, useValue: messagesService },
        { provide: LlmDispatcherService, useValue: llmDispatcher },
        { provide: CacheService, useValue: cacheService },
        { provide: ConfigService, useValue: configService },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ThreadContextCompressorService);
  });

  // -----------------------------------------------------------
  // getStateOrCompact
  // -----------------------------------------------------------
  describe('getStateOrCompact', () => {
    it('returns null when feature is disabled', async () => {
      configService.get.mockReturnValue('false');
      const result = await service.getStateOrCompact(threadId, orgId);
      expect(result).toBeNull();
    });

    it('returns null when thread has fewer messages than window', async () => {
      messagesService.countMessages.mockResolvedValue(3);
      const result = await service.getStateOrCompact(threadId, orgId);
      expect(result).toBeNull();
      expect(cacheService.withLock).not.toHaveBeenCalled();
    });

    it('triggers compression when thread exceeds window and no state exists', async () => {
      messagesService.countMessages.mockResolvedValue(10);
      const messages = Array.from({ length: 10 }, (_, i) =>
        makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`),
      );
      messagesService.getRecentMessages.mockResolvedValue(messages);
      model.findOneAndUpdate.mockResolvedValue({
        toObject: () => ({ _id: makeObjectId(), version: 1 }),
      });

      await service.getStateOrCompact(threadId, orgId);

      expect(cacheService.withLock).toHaveBeenCalled();
      expect(llmDispatcher.chatCompletion).toHaveBeenCalled();
    });

    it('skips compression when uncompacted messages fit in window', async () => {
      const stateId = makeObjectId();
      const existingState = {
        _id: stateId,
        lastIncorporatedMessageId: makeObjectId(),
        messageCount: 10,
        version: 1,
      };
      cacheService.get.mockResolvedValue(existingState);
      messagesService.countMessagesAfter.mockResolvedValue(3); // fits in window of 5

      const result = await service.getStateOrCompact(threadId, orgId);

      expect(result).toEqual(existingState);
      expect(cacheService.withLock).not.toHaveBeenCalled();
    });

    it('triggers sync compression when uncompacted messages exceed window', async () => {
      const existingState = {
        _id: makeObjectId(),
        lastIncorporatedMessageId: makeObjectId(),
        messageCount: 10,
        version: 1,
      };
      cacheService.get.mockResolvedValue(existingState);
      messagesService.countMessagesAfter.mockResolvedValue(8); // exceeds window of 5

      const messages = Array.from({ length: 13 }, (_, i) =>
        makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`),
      );
      messagesService.getRecentMessages.mockResolvedValue(messages);
      model.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(existingState),
      });
      model.findOneAndUpdate.mockResolvedValue({
        toObject: () => ({ ...existingState, version: 2 }),
      });

      await service.getStateOrCompact(threadId, orgId);

      expect(cacheService.withLock).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------
  // compressIfNeeded
  // -----------------------------------------------------------
  describe('compressIfNeeded', () => {
    it('does nothing when disabled', async () => {
      configService.get.mockReturnValue('false');
      await service.compressIfNeeded(threadId, orgId);
      expect(cacheService.withLock).not.toHaveBeenCalled();
    });

    it('does nothing when total messages <= window', async () => {
      messagesService.countMessages.mockResolvedValue(4);
      await service.compressIfNeeded(threadId, orgId);
      expect(cacheService.withLock).not.toHaveBeenCalled();
    });

    it('does nothing when uncompacted messages fit in window', async () => {
      messagesService.countMessages.mockResolvedValue(15);
      const existingState = {
        _id: makeObjectId(),
        lastIncorporatedMessageId: makeObjectId(),
        version: 1,
      };
      cacheService.get.mockResolvedValue(existingState);
      messagesService.countMessagesAfter.mockResolvedValue(3);

      await service.compressIfNeeded(threadId, orgId);
      expect(cacheService.withLock).not.toHaveBeenCalled();
    });

    it('compresses when no state and messages exceed window', async () => {
      messagesService.countMessages.mockResolvedValue(10);
      const messages = Array.from({ length: 10 }, (_, i) =>
        makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`),
      );
      messagesService.getRecentMessages.mockResolvedValue(messages);
      model.findOneAndUpdate.mockResolvedValue({
        toObject: () => ({ _id: makeObjectId(), version: 1 }),
      });

      await service.compressIfNeeded(threadId, orgId);
      expect(cacheService.withLock).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------
  // renderStateAsUserMessage
  // -----------------------------------------------------------
  describe('renderStateAsUserMessage', () => {
    it('renders all sections', () => {
      const state = {
        accumulatedRequirements: '- req 1\n- req 2',
        currentArtifact: 'The full draft text here that is long enough',
        iterationHistory: '- Round 1: initial',
        keyDecisions: '- Decision A',
      } as never;

      const result = service.renderStateAsUserMessage(state, []);

      expect(result).toContain('[Thread Context Summary]');
      expect(result).toContain('## Current Artifact');
      expect(result).toContain('The full draft text here');
      expect(result).toContain('## Accumulated Requirements');
      expect(result).toContain('## Key Decisions');
      expect(result).toContain('## Iteration History');
    });

    it('omits empty sections', () => {
      const state = {
        accumulatedRequirements: '- req 1',
      } as never;

      const result = service.renderStateAsUserMessage(state, []);

      expect(result).toContain('## Accumulated Requirements');
      expect(result).not.toContain('## Current Artifact');
      expect(result).not.toContain('## Key Decisions');
      expect(result).not.toContain('## Iteration History');
    });

    it('deduplicates artifact when it appears in last assistant message', () => {
      const longArtifact =
        'This is a very long artifact content that should be deduplicated when found in window messages. It contains enough text to exceed the 50 char threshold and the 200 char prefix check.';
      const state = {
        accumulatedRequirements: '- req 1',
        currentArtifact: longArtifact,
      } as never;

      const windowMessages = [
        makeMessage('user', 'please refine this'),
        makeMessage('assistant', longArtifact),
      ];

      const result = service.renderStateAsUserMessage(state, windowMessages);

      expect(result).not.toContain('## Current Artifact');
    });

    it('keeps artifact when it does NOT appear in window messages', () => {
      const longArtifact =
        'This is a very long artifact content that should be kept because it is not in any window message. It contains enough text to exceed thresholds.';
      const state = {
        currentArtifact: longArtifact,
      } as never;

      const windowMessages = [
        makeMessage('user', 'make it better'),
        makeMessage('assistant', 'Here is a completely different response'),
      ];

      const result = service.renderStateAsUserMessage(state, windowMessages);

      expect(result).toContain('## Current Artifact');
      expect(result).toContain(longArtifact);
    });

    it('keeps short artifacts without dedup check', () => {
      const state = {
        currentArtifact: 'Short',
      } as never;

      const windowMessages = [makeMessage('assistant', 'Short')];

      const result = service.renderStateAsUserMessage(state, windowMessages);

      // Short artifacts (<=50 chars) skip dedup
      expect(result).toContain('## Current Artifact');
    });
  });

  // -----------------------------------------------------------
  // Lock behavior
  // -----------------------------------------------------------
  describe('lock behavior', () => {
    it('uses withLock for atomic locking', async () => {
      messagesService.countMessages.mockResolvedValue(10);
      const messages = Array.from({ length: 10 }, (_, i) =>
        makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`),
      );
      messagesService.getRecentMessages.mockResolvedValue(messages);
      model.findOneAndUpdate.mockResolvedValue({
        toObject: () => ({ _id: makeObjectId(), version: 1 }),
      });

      await service.compressIfNeeded(threadId, orgId);

      expect(cacheService.withLock).toHaveBeenCalledWith(
        expect.stringContaining('thread-compact:'),
        expect.any(Function),
        30,
      );
    });

    it('skips compression when lock is not acquired', async () => {
      cacheService.withLock.mockResolvedValue(null); // lock not acquired
      messagesService.countMessages.mockResolvedValue(10);

      await service.compressIfNeeded(threadId, orgId);

      expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------
  // Cache behavior
  // -----------------------------------------------------------
  describe('cache behavior', () => {
    it('returns cached state without hitting MongoDB', async () => {
      const cachedState = {
        _id: makeObjectId(),
        lastIncorporatedMessageId: makeObjectId(),
        messageCount: 10,
        version: 1,
      };
      cacheService.get.mockResolvedValue(cachedState);
      messagesService.countMessagesAfter.mockResolvedValue(2);

      const result = await service.getStateOrCompact(threadId, orgId);

      expect(result).toEqual(cachedState);
      expect(model.findOne).not.toHaveBeenCalled();
    });

    it('writes state to cache after compression (write-through)', async () => {
      messagesService.countMessages.mockResolvedValue(10);
      const messages = Array.from({ length: 10 }, (_, i) =>
        makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`),
      );
      messagesService.getRecentMessages.mockResolvedValue(messages);

      const updatedDoc = {
        _id: makeObjectId(),
        version: 1,
        toObject() {
          return { _id: this._id, version: this.version };
        },
      };
      model.findOneAndUpdate.mockResolvedValue(updatedDoc);

      await service.compressIfNeeded(threadId, orgId);

      // Should set cache with the new state
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('thread-compact:state:'),
        expect.objectContaining({ version: 1 }),
        { ttl: 300 },
      );
    });
  });

  // -----------------------------------------------------------
  // getWindowMessages
  // -----------------------------------------------------------
  describe('getWindowMessages', () => {
    it('delegates to agentMessagesService.getMessagesAfter', async () => {
      const afterId = makeObjectId();
      const windowMsgs = [makeMessage('user', 'hello')];
      messagesService.getMessagesAfter.mockResolvedValue(windowMsgs);

      const result = await service.getWindowMessages(threadId, afterId);

      expect(result).toEqual(windowMsgs);
      expect(messagesService.getMessagesAfter).toHaveBeenCalledWith(
        threadId,
        afterId,
        5,
      );
    });
  });
});
