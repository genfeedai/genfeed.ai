import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorPlanModeService } from '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { AgentOrchestratorRecurringTaskService } from '@api/services/agent-orchestrator/agent-orchestrator-recurring-task.service';
import { AgentOrchestratorStreamLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-stream-loop.service';
import { AgentOrchestratorSyncLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import { AgentOrchestratorUiActionService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { AgentTurnRoundRunnerService } from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  getAgentChatModelRoundCredits,
} from '@genfeedai/constants';
import {
  AgentAutonomyMode,
  AgentType,
  ApiKeyScope,
  GenerationPriority,
  RouterPriority,
} from '@genfeedai/enums';
import {
  type AgentArtifactReference,
  AgentToolName,
} from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Effect } from 'effect';

const ORG_ID = 'c7a123456789012345678901';
const USER_ID = 'c7a123456789012345678902';
const LLM_CALL_CONTEXT = { organizationId: ORG_ID, userId: USER_ID };
const CONVERSATION_ID = 'c7a123456789012345678903';
const RUN_ID = 'c7a123456789012345678904';

describe('AgentOrchestratorService', () => {
  let service: AgentOrchestratorService;
  let configService: vi.Mocked<ConfigService>;
  let llmDispatcher: vi.Mocked<LlmDispatcherService>;
  let agentMessagesService: vi.Mocked<AgentMessagesService>;
  let agentThreadsService: vi.Mocked<AgentThreadsService>;
  let agentScopeContextService: vi.Mocked<AgentScopeContextService>;
  let organizationsService: vi.Mocked<OrganizationsService>;
  let organizationSettingsService: vi.Mocked<OrganizationSettingsService>;
  let settingsService: vi.Mocked<SettingsService>;
  let threadEventRecorder: vi.Mocked<AgentThreadEventRecorderService>;
  let agentStrategiesService: vi.Mocked<AgentStrategiesService>;
  let agentRunsService: vi.Mocked<AgentRunsService>;
  let agentMemoriesService: vi.Mocked<AgentMemoriesService>;
  let creditsUtilsService: vi.Mocked<CreditsUtilsService>;
  let toolExecutorService: vi.Mocked<AgentToolExecutorService>;
  let streamPublisher: vi.Mocked<AgentStreamPublisherService>;
  let agentThreadEngineService: vi.Mocked<AgentThreadEngineService>;
  let agentRuntimeSessionService: vi.Mocked<AgentRuntimeSessionService>;
  let contextAssemblyService: vi.Mocked<AgentContextAssemblyService>;

  beforeEach(async () => {
    const loggerMock = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const llmDispatcherMock = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Hello there',
            },
          },
        ],
        usage: {
          completion_tokens: 20,
          prompt_tokens: 20,
          total_tokens: 40,
        },
      }),
      // Emits real deltas through onToken, mirroring the aggregating streamer.
      streamChatCompletionAggregated: vi.fn(
        async (
          _params: unknown,
          _organizationId: unknown,
          onToken?: (delta: string) => Promise<void>,
        ) => {
          if (onToken) {
            await onToken('Hello ');
            await onToken('streamed');
          }
          return {
            choices: [{ message: { content: 'Hello streamed' } }],
            id: 'stream-completion-1',
            usage: {
              completion_tokens: 20,
              prompt_tokens: 20,
              total_tokens: 40,
            },
          };
        },
      ),
    };
    // Defaults to '' so the streaming flag reads false — existing tests keep the
    // legacy simulated word-split path. Individual tests opt in per-key.
    const configServiceMock = {
      get: vi.fn().mockReturnValue(''),
    };
    const agentChatModelRegistryMock = {
      getCheapestSelectableKey: vi
        .fn()
        .mockResolvedValue(DEFAULT_AGENT_CHAT_MODEL_KEY),
      getDefaultModelKey: vi
        .fn()
        .mockResolvedValue(DEFAULT_AGENT_CHAT_MODEL_KEY),
      getLocalDefaultModelKey: vi
        .fn()
        .mockResolvedValue(DEFAULT_AGENT_CHAT_MODEL_KEY),
      getRoundCostsMap: vi.fn().mockResolvedValue({}),
      getRoundCredits: vi
        .fn()
        .mockImplementation(async (key?: string | null) =>
          getAgentChatModelRoundCredits(key),
        ),
      isTrustedSelectableKey: vi.fn().mockResolvedValue(true),
      listSelectable: vi.fn().mockResolvedValue([]),
      refresh: vi.fn().mockResolvedValue(undefined),
      resolveModelKey: vi
        .fn()
        .mockImplementation(async (key?: string | null) =>
          key?.trim() ? key.trim() : DEFAULT_AGENT_CHAT_MODEL_KEY,
        ),
    };

    const agentMessagesServiceMock = {
      addMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      getMessagesByRoom: vi.fn().mockResolvedValue([]),
      getRecentMessages: vi.fn().mockResolvedValue([]),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const agentMemoriesServiceMock = {
      getFeedbackMemoriesForGeneration: vi.fn().mockResolvedValue([]),
      getMemoriesForPrompt: vi.fn().mockResolvedValue([]),
      listForUser: vi.fn().mockResolvedValue([]),
    };
    const contextAssemblyServiceMock = {
      assembleContext: vi.fn().mockResolvedValue({ tools: [] }),
      buildSystemPrompt: vi.fn((basePrompt: string) => basePrompt),
    };
    const agentThreadsServiceMock = {
      addMessage: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      findOne: vi.fn().mockResolvedValue({
        brandId: null,
        contextVersion: 1,
        id: CONVERSATION_ID,
        messages: [],
        planModeEnabled: false,
      }),
      updateThreadMetadata: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
    };
    const agentScopeContextServiceMock = {
      assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
      mutateBrandScope: vi
        .fn()
        .mockImplementation(
          async (params: {
            brandId?: string;
            expectedContextVersion: number;
          }) => ({
            brandId: params.brandId ?? null,
            contextVersion: params.expectedContextVersion + 1,
          }),
        ),
      prepareForTurn: vi.fn(
        async (params: {
          expectedContextVersion?: number;
          organizationId: string;
          policyBrandId?: string;
          requestedBrandId?: string | null;
          threadId?: string;
          userId: string;
        }) => {
          const brandId = params.requestedBrandId ?? params.policyBrandId;
          return params.threadId
            ? {
                existingScope: {
                  brandId: brandId ?? undefined,
                  contextVersion: params.expectedContextVersion ?? 1,
                  isLegacyFallback: false,
                  isVersionExplicit: true,
                  organizationId: params.organizationId,
                  source: 'explicit',
                  threadId: params.threadId,
                  userId: params.userId,
                },
                initialScopeFields: {},
              }
            : {
                initialBrandId: brandId ?? undefined,
                initialScopeFields: {
                  brandId: brandId ?? undefined,
                  contextVersion: 1,
                  isLegacyBrandFallbackEligible: false,
                  scopeChangeProvenance: [],
                },
              };
        },
      ),
      resolveCreatedThreadScope: vi.fn(
        async (params: {
          brandId?: string;
          organizationId: string;
          threadId: string;
          userId: string;
        }) => ({
          brandId: params.brandId,
          contextVersion: 1,
          isLegacyFallback: false,
          isVersionExplicit: true,
          organizationId: params.organizationId,
          source: 'thread_created',
          threadId: params.threadId,
          userId: params.userId,
        }),
      ),
    };
    const brandsServiceMock = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const creditsUtilsServiceMock = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue({}),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(50),
    };
    const toolExecutorServiceMock = {
      executeTool: vi.fn(),
    };
    const cacheValues = new Map<string, unknown>();
    const cacheLocks = new Set<string>();
    const cacheServiceMock = {
      acquireLock: vi.fn(async (key: string) => {
        if (cacheLocks.has(key)) {
          return false;
        }
        cacheLocks.add(key);
        return true;
      }),
      get: vi.fn(async (key: string) => cacheValues.get(key) ?? null),
      releaseLock: vi.fn(async (key: string) => {
        cacheLocks.delete(key);
      }),
      set: vi.fn(async (key: string, value: unknown) => {
        cacheValues.set(key, value);
      }),
    };
    const organizationsServiceMock = {
      findOne: vi.fn(),
    };
    const threadEventRecorderMock = {
      recordAssistantFinalized: vi.fn().mockResolvedValue(undefined),
      recordPlanUpserted: vi.fn().mockResolvedValue(undefined),
      recordRunCompleted: vi.fn().mockResolvedValue(undefined),
      recordRunFailed: vi.fn().mockResolvedValue(undefined),
      recordThreadTurnRequested: vi.fn().mockResolvedValue(undefined),
      recordThreadTurnStarted: vi.fn().mockResolvedValue(undefined),
      recordToolCompleted: vi.fn().mockResolvedValue(undefined),
      recordToolStarted: vi.fn().mockResolvedValue(undefined),
      recordUiBlocksUpdated: vi.fn().mockResolvedValue(undefined),
    };
    const settingsServiceMock = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const organizationSettingsServiceMock = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const agentStrategiesServiceMock = {
      findOneById: vi.fn().mockResolvedValue(null),
    };
    const streamPublisherMock = {
      publishDone: vi.fn().mockResolvedValue({}),
      publishDoneEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() => streamPublisherMock.publishDone(...args)).pipe(
          Effect.asVoid,
        ),
      ),
      publishError: vi.fn().mockResolvedValue({}),
      publishErrorEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() => streamPublisherMock.publishError(...args)).pipe(
          Effect.asVoid,
        ),
      ),
      publishInputRequest: vi.fn().mockResolvedValue({}),
      publishInputRequestEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisherMock.publishInputRequest(...args),
        ).pipe(Effect.asVoid),
      ),
      publishReasoning: vi.fn().mockResolvedValue({}),
      publishReasoningEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisherMock.publishReasoning(...args),
        ).pipe(Effect.asVoid),
      ),
      publishRunComplete: vi.fn().mockResolvedValue({}),
      publishRunStart: vi.fn().mockResolvedValue({}),
      publishStreamStart: vi.fn().mockResolvedValue({}),
      publishStreamStartEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisherMock.publishStreamStart(...args),
        ).pipe(Effect.asVoid),
      ),
      publishToken: vi.fn().mockResolvedValue({}),
      publishTokenEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() => streamPublisherMock.publishToken(...args)).pipe(
          Effect.asVoid,
        ),
      ),
      publishToolComplete: vi.fn().mockResolvedValue({}),
      publishToolCompleteEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisherMock.publishToolComplete(...args),
        ).pipe(Effect.asVoid),
      ),
      publishToolStart: vi.fn().mockResolvedValue({}),
      publishToolStartEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisherMock.publishToolStart(...args),
        ).pipe(Effect.asVoid),
      ),
      publishUIBlocks: vi.fn().mockResolvedValue({}),
      publishUIBlocksEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisherMock.publishUIBlocks(...args),
        ).pipe(Effect.asVoid),
      ),
      publishWorkEvent: vi.fn().mockResolvedValue({}),
      publishWorkEventEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          streamPublisherMock.publishWorkEvent(...args),
        ).pipe(Effect.asVoid),
      ),
    };
    const agentRunsServiceMock = {
      complete: vi.fn().mockResolvedValue({ durationMs: 100 }),
      create: vi.fn().mockResolvedValue({ id: RUN_ID }),
      fail: vi.fn().mockResolvedValue({}),
      isCancelled: vi.fn().mockResolvedValue(false),
      mergeMetadata: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn().mockResolvedValue({}),
      recordFailedAttempt: vi.fn().mockResolvedValue({ id: RUN_ID }),
      recordToolCall: vi.fn().mockResolvedValue(undefined),
      start: vi
        .fn()
        .mockResolvedValue({ startedAt: new Date('2026-03-09T12:00:00.000Z') }),
    };
    // Real service wired to the mocked publisher/runs deps so the moved
    // publishStream* composite effects behave identically to pre-extraction.
    const streamEffectsMock = new AgentStreamEffectsService(
      streamPublisherMock as unknown as AgentStreamPublisherService,
      agentRunsServiceMock as unknown as AgentRunsService,
    );
    const agentRuntimeSessionServiceMock = {
      getBinding: vi.fn().mockResolvedValue(null),
      getBindingEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          agentRuntimeSessionServiceMock.getBinding(...args),
        ),
      ),
      upsertBinding: vi.fn().mockResolvedValue({}),
      upsertBindingEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          agentRuntimeSessionServiceMock.upsertBinding(...args),
        ).pipe(Effect.asVoid),
      ),
    };
    const agentThreadEngineServiceMock = {
      appendEvent: vi.fn().mockResolvedValue({}),
      appendEventEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          agentThreadEngineServiceMock.appendEvent(...args),
        ).pipe(Effect.asVoid),
      ),
      getSnapshot: vi.fn().mockResolvedValue({
        latestProposedPlan: null,
        pendingInputRequests: [],
      }),
      getSnapshotEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          agentThreadEngineServiceMock.getSnapshot(...args),
        ),
      ),
      recordMemoryFlush: vi.fn().mockResolvedValue(undefined),
      recordMemoryFlushEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          agentThreadEngineServiceMock.recordMemoryFlush(...args),
        ),
      ),
      recordProfileSnapshot: vi.fn().mockResolvedValue(undefined),
      recordProfileSnapshotEffect: vi.fn((...args: unknown[]) =>
        Effect.tryPromise(() =>
          agentThreadEngineServiceMock.recordProfileSnapshot(...args),
        ).pipe(Effect.asVoid),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AgentChatModelRegistryService,
          useValue: agentChatModelRegistryMock,
        },
        {
          inject: [
            LoggerService,
            AgentChatModelRegistryService,
            AgentThreadsService,
            AgentScopeContextService,
            AgentMessagesService,
            CreditsUtilsService,
            AgentOrchestratorUiActionService,
            AgentOrchestratorRecurringTaskService,
            AgentOrchestratorPlanModeService,
            AgentOrchestratorBatchService,
            AgentOrchestratorContextService,
            AgentThreadEventRecorderService,
            SettingsService,
            AgentStreamEffectsService,
            AgentOrchestratorStreamLoopService,
            AgentOrchestratorSyncLoopService,
            AgentRunsService,
            AgentThreadEngineService,
            AgentRuntimeSessionService,
          ],
          provide: AgentOrchestratorService,
          useFactory: (
            loggerService: LoggerService,
            agentChatModelRegistry: AgentChatModelRegistryService,
            agentConversationsSvc: AgentThreadsService,
            agentScopeContextSvc: AgentScopeContextService,
            agentMessagesSvc: AgentMessagesService,
            creditsUtilsSvc: CreditsUtilsService,
            uiActionSvc: AgentOrchestratorUiActionService,
            recurringTaskSvc: AgentOrchestratorRecurringTaskService,
            planModeSvc: AgentOrchestratorPlanModeService,
            batchSvc: AgentOrchestratorBatchService,
            contextSvc: AgentOrchestratorContextService,
            threadEventRecorderSvc: AgentThreadEventRecorderService,
            settingsSvc: SettingsService,
            streamEffectsSvc: AgentStreamEffectsService,
            streamLoopSvc: AgentOrchestratorStreamLoopService,
            syncLoopSvc: AgentOrchestratorSyncLoopService,
            agentRunsSvc: AgentRunsService,
            threadEngineSvc: AgentThreadEngineService,
            runtimeSessionSvc: AgentRuntimeSessionService,
          ) =>
            new AgentOrchestratorService(
              loggerService,
              agentChatModelRegistry,
              agentConversationsSvc,
              agentScopeContextSvc,
              agentMessagesSvc,
              creditsUtilsSvc,
              uiActionSvc,
              recurringTaskSvc,
              planModeSvc,
              batchSvc,
              contextSvc,
              threadEventRecorderSvc,
              settingsSvc,
              streamEffectsSvc,
              streamLoopSvc,
              syncLoopSvc,
              agentRunsSvc,
              threadEngineSvc,
              runtimeSessionSvc,
            ),
        },
        {
          inject: [
            LoggerService,
            AgentChatModelRegistryService,
            LlmDispatcherService,
            AgentThreadsService,
            AgentMessagesService,
            CreditsUtilsService,
            AgentTurnRoundRunnerService,
            AgentOrchestratorBatchService,
            AgentOrchestratorContextService,
            AgentCompletionCardBuilderService,
            AgentStreamEffectsService,
            AgentRunsService,
            ConfigService,
          ],
          provide: AgentOrchestratorStreamLoopService,
          useFactory: (
            loggerService: LoggerService,
            agentChatModelRegistry: AgentChatModelRegistryService,
            llmDispatcherService: LlmDispatcherService,
            agentThreadsSvc: AgentThreadsService,
            agentMessagesSvc: AgentMessagesService,
            creditsUtilsSvc: CreditsUtilsService,
            turnRoundRunnerSvc: AgentTurnRoundRunnerService,
            batchSvc: AgentOrchestratorBatchService,
            contextSvc: AgentOrchestratorContextService,
            completionCardBuilderSvc: AgentCompletionCardBuilderService,
            streamEffectsSvc: AgentStreamEffectsService,
            agentRunsSvc: AgentRunsService,
            configServiceSvc: ConfigService,
          ) =>
            new AgentOrchestratorStreamLoopService(
              loggerService,
              agentChatModelRegistry,
              llmDispatcherService,
              agentThreadsSvc,
              agentMessagesSvc,
              creditsUtilsSvc,
              turnRoundRunnerSvc,
              batchSvc,
              contextSvc,
              completionCardBuilderSvc,
              streamEffectsSvc,
              agentRunsSvc,
              undefined,
              configServiceSvc,
            ),
        },
        {
          inject: [
            LlmDispatcherService,
            AgentChatModelRegistryService,
            AgentThreadsService,
            AgentMessagesService,
            CreditsUtilsService,
            AgentTurnRoundRunnerService,
            AgentOrchestratorBatchService,
            AgentOrchestratorContextService,
            AgentCompletionCardBuilderService,
            AgentThreadEventRecorderService,
            AgentRunsService,
          ],
          provide: AgentOrchestratorSyncLoopService,
          useFactory: (
            llmDispatcherService: LlmDispatcherService,
            agentChatModelRegistry: AgentChatModelRegistryService,
            agentThreadsSvc: AgentThreadsService,
            agentMessagesSvc: AgentMessagesService,
            creditsUtilsSvc: CreditsUtilsService,
            turnRoundRunnerSvc: AgentTurnRoundRunnerService,
            batchSvc: AgentOrchestratorBatchService,
            contextSvc: AgentOrchestratorContextService,
            completionCardBuilderSvc: AgentCompletionCardBuilderService,
            threadEventRecorderSvc: AgentThreadEventRecorderService,
            agentRunsSvc: AgentRunsService,
          ) =>
            new AgentOrchestratorSyncLoopService(
              llmDispatcherService,
              agentChatModelRegistry,
              agentThreadsSvc,
              agentMessagesSvc,
              creditsUtilsSvc,
              turnRoundRunnerSvc,
              batchSvc,
              contextSvc,
              completionCardBuilderSvc,
              threadEventRecorderSvc,
              agentRunsSvc,
            ),
        },
        {
          provide: LoggerService,
          useValue: loggerMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
        {
          inject: [
            LoggerService,
            CreditsUtilsService,
            AgentToolExecutorService,
            AgentRunsService,
          ],
          provide: AgentTurnRoundRunnerService,
          useFactory: (
            loggerService: LoggerService,
            creditsUtilsSvc: CreditsUtilsService,
            toolExecutorSvc: AgentToolExecutorService,
            agentRunsSvc: AgentRunsService,
          ) =>
            new AgentTurnRoundRunnerService(
              loggerService,
              creditsUtilsSvc,
              toolExecutorSvc,
              agentRunsSvc,
            ),
        },
        {
          inject: [
            AgentChatModelRegistryService,
            AgentThreadsService,
            AgentScopeContextService,
            AgentMessagesService,
            CreditsUtilsService,
            AgentToolExecutorService,
            AgentCompletionCardBuilderService,
            AgentThreadEventRecorderService,
            OrganizationSettingsService,
            AgentRunsService,
            CacheService,
            AgentRuntimeSessionService,
            AgentThreadEngineService,
          ],
          provide: AgentOrchestratorUiActionService,
          useFactory: (
            agentChatModelRegistry: AgentChatModelRegistryService,
            agentThreadsSvc: AgentThreadsService,
            agentScopeContextSvc: AgentScopeContextService,
            agentMessagesSvc: AgentMessagesService,
            creditsUtilsSvc: CreditsUtilsService,
            toolExecutorSvc: AgentToolExecutorService,
            completionCardBuilderSvc: AgentCompletionCardBuilderService,
            threadEventRecorderSvc: AgentThreadEventRecorderService,
            organizationSettingsSvc: OrganizationSettingsService,
            agentRunsSvc: AgentRunsService,
            cacheSvc: CacheService,
            runtimeSessionSvc: AgentRuntimeSessionService,
            threadEngineSvc: AgentThreadEngineService,
          ) =>
            new AgentOrchestratorUiActionService(
              agentChatModelRegistry,
              agentThreadsSvc,
              agentScopeContextSvc,
              agentMessagesSvc,
              creditsUtilsSvc,
              toolExecutorSvc,
              completionCardBuilderSvc,
              threadEventRecorderSvc,
              organizationSettingsSvc,
              agentRunsSvc,
              cacheSvc,
              runtimeSessionSvc,
              threadEngineSvc,
            ),
        },
        {
          inject: [
            AgentChatModelRegistryService,
            AgentThreadsService,
            AgentMessagesService,
            CreditsUtilsService,
            AgentToolExecutorService,
            AgentCompletionCardBuilderService,
            AgentThreadEventRecorderService,
            OrganizationSettingsService,
            AgentStreamPublisherService,
            AgentStreamEffectsService,
            AgentRunsService,
            AgentRuntimeSessionService,
          ],
          provide: AgentOrchestratorRecurringTaskService,
          useFactory: (
            agentChatModelRegistry: AgentChatModelRegistryService,
            agentThreadsSvc: AgentThreadsService,
            agentMessagesSvc: AgentMessagesService,
            creditsUtilsSvc: CreditsUtilsService,
            toolExecutorSvc: AgentToolExecutorService,
            completionCardBuilderSvc: AgentCompletionCardBuilderService,
            threadEventRecorderSvc: AgentThreadEventRecorderService,
            organizationSettingsSvc: OrganizationSettingsService,
            streamPublisherSvc: AgentStreamPublisherService,
            streamEffectsSvc: AgentStreamEffectsService,
            agentRunsSvc: AgentRunsService,
            runtimeSessionSvc: AgentRuntimeSessionService,
          ) =>
            new AgentOrchestratorRecurringTaskService(
              agentChatModelRegistry,
              agentThreadsSvc,
              agentMessagesSvc,
              creditsUtilsSvc,
              toolExecutorSvc,
              completionCardBuilderSvc,
              threadEventRecorderSvc,
              organizationSettingsSvc,
              streamPublisherSvc,
              streamEffectsSvc,
              agentRunsSvc,
              runtimeSessionSvc,
            ),
        },
        {
          inject: [
            AgentChatModelRegistryService,
            LoggerService,
            AgentThreadsService,
            AgentScopeContextService,
            AgentMemoriesService,
            AgentMessagesService,
            AgentContextAssemblyService,
            OrganizationSettingsService,
            AgentStrategiesService,
          ],
          provide: AgentOrchestratorContextService,
          useFactory: (
            agentChatModelRegistry: AgentChatModelRegistryService,
            loggerService: LoggerService,
            agentThreadsSvc: AgentThreadsService,
            agentScopeContextSvc: AgentScopeContextService,
            agentMemoriesSvc: AgentMemoriesService,
            agentMessagesSvc: AgentMessagesService,
            contextAssemblySvc: AgentContextAssemblyService,
            organizationSettingsSvc: OrganizationSettingsService,
            agentStrategiesSvc: AgentStrategiesService,
          ) =>
            new AgentOrchestratorContextService(
              agentChatModelRegistry,
              loggerService,
              agentThreadsSvc,
              agentScopeContextSvc,
              agentMemoriesSvc,
              agentMessagesSvc,
              contextAssemblySvc,
              organizationSettingsSvc,
              agentStrategiesSvc,
            ),
        },
        {
          inject: [
            AgentThreadsService,
            LlmDispatcherService,
            AgentMessagesService,
            CreditsUtilsService,
            AgentThreadEventRecorderService,
            AgentStreamEffectsService,
            AgentOrchestratorContextService,
            AgentChatModelRegistryService,
          ],
          provide: AgentOrchestratorPlanModeService,
          useFactory: (
            agentThreadsSvc: AgentThreadsService,
            llmDispatcherSvc: LlmDispatcherService,
            agentMessagesSvc: AgentMessagesService,
            creditsUtilsSvc: CreditsUtilsService,
            threadEventRecorderSvc: AgentThreadEventRecorderService,
            streamEffectsSvc: AgentStreamEffectsService,
            contextSvc: AgentOrchestratorContextService,
            agentChatModelRegistry: AgentChatModelRegistryService,
          ) =>
            new AgentOrchestratorPlanModeService(
              agentThreadsSvc,
              llmDispatcherSvc,
              agentMessagesSvc,
              creditsUtilsSvc,
              threadEventRecorderSvc,
              streamEffectsSvc,
              contextSvc,
              agentChatModelRegistry,
            ),
        },
        {
          inject: [
            AgentMessagesService,
            CreditsUtilsService,
            AgentToolExecutorService,
            AgentCompletionCardBuilderService,
            AgentThreadEventRecorderService,
            AgentStreamEffectsService,
            AgentRunsService,
          ],
          provide: AgentOrchestratorBatchService,
          useFactory: (
            agentMessagesSvc: AgentMessagesService,
            creditsUtilsSvc: CreditsUtilsService,
            toolExecutorSvc: AgentToolExecutorService,
            completionCardBuilderSvc: AgentCompletionCardBuilderService,
            threadEventRecorderSvc: AgentThreadEventRecorderService,
            streamEffectsSvc: AgentStreamEffectsService,
            agentRunsSvc: AgentRunsService,
          ) =>
            new AgentOrchestratorBatchService(
              agentMessagesSvc,
              creditsUtilsSvc,
              toolExecutorSvc,
              completionCardBuilderSvc,
              threadEventRecorderSvc,
              streamEffectsSvc,
              agentRunsSvc,
            ),
        },
        {
          provide: AgentThreadEventRecorderService,
          useValue: threadEventRecorderMock,
        },
        {
          provide: LlmDispatcherService,
          useValue: llmDispatcherMock,
        },
        {
          provide: AgentMessagesService,
          useValue: agentMessagesServiceMock,
        },
        {
          provide: AgentMemoriesService,
          useValue: agentMemoriesServiceMock,
        },
        {
          provide: AgentContextAssemblyService,
          useValue: contextAssemblyServiceMock,
        },
        {
          provide: AgentThreadsService,
          useValue: agentThreadsServiceMock,
        },
        {
          provide: AgentScopeContextService,
          useValue: agentScopeContextServiceMock,
        },
        {
          provide: BrandsService,
          useValue: brandsServiceMock,
        },
        {
          provide: CreditsUtilsService,
          useValue: creditsUtilsServiceMock,
        },
        {
          provide: AgentToolExecutorService,
          useValue: toolExecutorServiceMock,
        },
        AgentCompletionCardBuilderService,
        {
          provide: OrganizationsService,
          useValue: organizationsServiceMock,
        },
        {
          provide: SettingsService,
          useValue: settingsServiceMock,
        },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsServiceMock,
        },
        {
          provide: AgentStrategiesService,
          useValue: agentStrategiesServiceMock,
        },
        {
          provide: AgentStreamPublisherService,
          useValue: streamPublisherMock,
        },
        {
          provide: AgentStreamEffectsService,
          useValue: streamEffectsMock,
        },
        {
          provide: AgentRunsService,
          useValue: agentRunsServiceMock,
        },
        {
          provide: AgentThreadEngineService,
          useValue: agentThreadEngineServiceMock,
        },
        {
          provide: AgentRuntimeSessionService,
          useValue: agentRuntimeSessionServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get(AgentOrchestratorService);
    configService = module.get(ConfigService);
    agentMessagesService = module.get(AgentMessagesService);
    agentThreadsService = module.get(AgentThreadsService);
    agentScopeContextService = module.get(AgentScopeContextService);
    agentMemoriesService = module.get(AgentMemoriesService);
    llmDispatcher = module.get(LlmDispatcherService);
    creditsUtilsService = module.get(CreditsUtilsService);
    organizationsService = module.get(OrganizationsService);
    organizationSettingsService = module.get(OrganizationSettingsService);
    settingsService = module.get(SettingsService);
    threadEventRecorder = module.get(AgentThreadEventRecorderService);
    agentStrategiesService = module.get(AgentStrategiesService);
    agentRunsService = module.get(AgentRunsService);
    toolExecutorService = module.get(AgentToolExecutorService);
    streamPublisher = module.get(AgentStreamPublisherService);
    agentThreadEngineService = module.get(AgentThreadEngineService);
    agentRuntimeSessionService = module.get(AgentRuntimeSessionService);
    contextAssemblyService = module.get(AgentContextAssemblyService);
  });

  it('defaults normal agent chat to the catalogue default when no higher-precedence override is set', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Auto routed reply' } }],
      model: 'google/gemini-2.5-flash',
      usage: {
        completion_tokens: 10,
        prompt_tokens: 10,
        total_tokens: 20,
      },
    } as never);

    const result = await service.chat(
      { content: 'Help me plan next week of content' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(contextAssemblyService.buildSystemPrompt).toHaveBeenCalledWith(
      expect.stringContaining(
        AGENT_ORCHESTRATOR_SYSTEM_PROMPT.split('\n')[0] ?? '',
      ),
      expect.any(Object),
      expect.any(Object),
    );
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ model: DEFAULT_AGENT_CHAT_MODEL_KEY }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
    expect(result.message.metadata).toEqual(
      expect.objectContaining({
        actualModel: 'google/gemini-2.5-flash',
        model: 'google/gemini-2.5-flash',
        requestedModel: DEFAULT_AGENT_CHAT_MODEL_KEY,
      }),
    );
  });

  it('authorizes, persists, and exposes selected canonical records to the model', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    const artifactReference = {
      brandId: 'c7a123456789012345678905',
      kind: 'ingredient' as const,
      organizationId: ORG_ID,
      recordId: 'c7a123456789012345678906',
      serializer: 'ingredient' as const,
    };

    await service.chat(
      {
        artifactReferences: [artifactReference],
        brandId: artifactReference.brandId,
        content: 'Discuss the selected Studio asset',
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactReferences: [artifactReference],
        organizationId: ORG_ID,
        role: 'user',
      }),
    );
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining(
              `ingredient:${artifactReference.recordId}`,
            ),
            role: 'system',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
  });

  it('persists selected artifact references on the scoped user message', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    const reference = {
      brandId: 'brand-1',
      kind: 'post',
      organizationId: ORG_ID,
      recordId: 'post-1',
      serializer: 'post',
    } satisfies AgentArtifactReference;

    await service.chat(
      {
        artifactReferences: [reference],
        brandId: 'brand-1',
        content: 'Review the selected post',
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactReferences: [reference],
        brandId: 'brand-1',
        organizationId: ORG_ID,
        role: 'user',
      }),
    );
  });

  it('generates a concise title for a new thread within the same LLM response', async () => {
    const prompt = 'Help me plan next week of content';

    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentThreadsService.findOne.mockResolvedValue({
      id: CONVERSATION_ID,
      title: prompt,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: 'Here is your weekly content plan.',
              title: 'Weekly Content Plan',
            }),
          },
        },
      ],
      usage: {
        completion_tokens: 10,
        prompt_tokens: 10,
        total_tokens: 20,
      },
    } as never);

    const result = await service.chat(
      { content: prompt },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(agentThreadsService.updateThreadMetadata).toHaveBeenCalledWith(
      CONVERSATION_ID,
      ORG_ID,
      { title: 'Weekly Content Plan' },
    );
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledTimes(1);
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('respond with valid JSON only'),
            role: 'system',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledTimes(1);
    expect(result.creditsUsed).toBe(
      getAgentChatModelRoundCredits(DEFAULT_AGENT_CHAT_MODEL_KEY),
    );
  });

  it('does not overwrite a manually renamed thread title', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentThreadsService.findOne.mockResolvedValueOnce({
      id: CONVERSATION_ID,
      title: 'Custom Thread Name',
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Here is your plan.' } }],
      usage: {
        completion_tokens: 10,
        prompt_tokens: 10,
        total_tokens: 20,
      },
    } as never);

    const result = await service.chat(
      { content: 'Help me plan next week of content' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(agentThreadsService.updateThreadMetadata).not.toHaveBeenCalled();
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledTimes(1);
    expect(result.creditsUsed).toBe(
      getAgentChatModelRoundCredits(DEFAULT_AGENT_CHAT_MODEL_KEY),
    );
  });

  it('proposes a plan and pauses execution when plan mode is enabled on the thread', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentThreadsService.findOne.mockResolvedValue({
      id: CONVERSATION_ID,
      messages: [],
      planModeEnabled: true,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content:
                '1. Add a thread-level toggle\n2. Persist the flag\n3. Pause for approval',
              explanation: 'Plan mode should stop before tool execution.',
              steps: [
                {
                  status: 'pending',
                  step: 'Add the plan mode toggle to the agent UI',
                },
              ],
            }),
          },
        },
      ],
      usage: {
        completion_tokens: 10,
        prompt_tokens: 20,
        total_tokens: 30,
      },
    } as never);

    const response = await service.chat(
      {
        content: 'Add plan mode to the agent UI',
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
    expect(response.message.metadata).toMatchObject({
      proposedPlan: {
        awaitingApproval: true,
        status: 'awaiting_approval',
      },
      reviewRequired: true,
    });
    expect(threadEventRecorder.recordPlanUpserted).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          awaitingApproval: true,
          status: 'awaiting_approval',
        }),
      }),
    );
  });

  it('adds the web plugin when auto-routed chat explicitly asks for web search', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Here are the latest results.' } }],
      model: 'openai/gpt-5.6-luna-search-preview',
      usage: {
        completion_tokens: 10,
        prompt_tokens: 10,
        total_tokens: 20,
      },
    } as never);

    await service.chat(
      { content: 'Search the web for the latest creator economy news' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_AGENT_CHAT_MODEL_KEY,
        plugins: [{ id: 'web' }],
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
  });

  it('adds the web plugin for fresh live-data prompts on the default model', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Here are the latest trend shifts.' } }],
      model: 'google/gemini-2.5-flash',
      usage: {
        completion_tokens: 10,
        prompt_tokens: 10,
        total_tokens: 20,
      },
    } as never);

    const result = await service.chat(
      { content: 'What are the latest creator economy trends today?' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_AGENT_CHAT_MODEL_KEY,
        plugins: [{ id: 'web' }],
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
    expect(result.message.metadata).toEqual(
      expect.objectContaining({
        routingPolicy: 'fresh-live-data',
        webSearchEnabled: true,
      }),
    );
  });

  it('injects ranked feedback memory and exposes generation influence metadata', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentMemoriesService.getFeedbackMemoriesForGeneration.mockResolvedValueOnce(
      [
        {
          confidence: 0.91,
          content:
            'Launch posts perform best when the first line names the customer pain.',
          contentType: 'post',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          generationInfluence: {
            matchedPromptTerms: ['launch', 'post'],
            rankingFactors: {
              confidence: 3.64,
              contentType: 7,
              performance: 5,
              platform: 8,
            },
            reasons: [
              'Matches the requested platform linkedin',
              'Prior winning pattern',
            ],
            score: 30.5,
          },
          id: 'memory-1',
          importance: 0.8,
          kind: 'winner',
          organizationId: ORG_ID,
          platform: 'linkedin',
          scope: 'brand',
          summary: 'Lead with customer pain before product claims.',
          tags: ['launch'],
          updatedAt: new Date('2026-03-02T00:00:00.000Z'),
          userId: USER_ID,
        },
      ] as never,
    );

    const result = await service.chat(
      { content: 'Write a LinkedIn launch post' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(
      agentMemoriesService.getFeedbackMemoriesForGeneration,
    ).toHaveBeenCalledWith(
      USER_ID,
      ORG_ID,
      expect.objectContaining({
        contentType: 'post',
        limit: 8,
        query: 'Write a LinkedIn launch post',
      }),
    );
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Saved memory to consider'),
            role: 'system',
          }),
          expect.objectContaining({
            content: expect.stringContaining(
              'score 30.5; Matches the requested platform linkedin',
            ),
            role: 'system',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
    expect(result.message.metadata).toMatchObject({
      memoryInfluence: {
        mode: 'prior_winning_patterns',
        summary: 'Using 1 prior feedback memory before generation.',
      },
    });
    expect(result.message.metadata.memoryEntries).toEqual([
      expect.objectContaining({
        generationInfluence: expect.objectContaining({
          reasons: expect.arrayContaining(['Prior winning pattern']),
          score: 30.5,
        }),
        id: 'memory-1',
      }),
    ]);
  });

  it('records requested and actual models into agent run metadata when a run id is present', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Tracked reply' } }],
      model: 'anthropic/claude-sonnet-5',
      usage: {
        completion_tokens: 10,
        prompt_tokens: 10,
        total_tokens: 20,
      },
    } as never);

    await service.chat(
      { content: 'Draft a launch note' },
      {
        organizationId: ORG_ID,
        runId: RUN_ID,
        userId: USER_ID,
      },
    );

    expect(agentRunsService.mergeMetadata).toHaveBeenCalledWith(
      RUN_ID,
      ORG_ID,
      expect.objectContaining({
        actualModel: 'anthropic/claude-sonnet-5',
        requestedModel: DEFAULT_AGENT_CHAT_MODEL_KEY,
      }),
    );
    expect(agentRunsService.mergeMetadata).toHaveBeenCalledWith(
      RUN_ID,
      ORG_ID,
      expect.objectContaining({
        agentScope: expect.objectContaining({
          contextVersion: 1,
          organizationId: ORG_ID,
          source: 'thread_created',
        }),
      }),
    );
  });

  it('settles completed rounds and stops before an unaffordable next round', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    const roundCost = getAgentChatModelRoundCredits(
      DEFAULT_AGENT_CHAT_MODEL_KEY,
    );
    creditsUtilsService.checkOrganizationCreditsAvailable
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                function: {
                  arguments: '{}',
                  name: 'nonexistent_tool',
                },
                id: 'call-unknown-credit-gate',
              },
            ],
          },
        },
      ],
      model: DEFAULT_AGENT_CHAT_MODEL_KEY,
      usage: {
        completion_tokens: 10,
        prompt_tokens: 10,
        total_tokens: 20,
      },
    } as never);

    await expect(
      service.chat(
        { content: 'Keep trying tools' },
        { organizationId: ORG_ID, userId: USER_ID },
      ),
    ).rejects.toThrow(
      `Insufficient credits. You need at least ${roundCost * 2} credits to continue this agent turn.`,
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledTimes(1);
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenLastCalledWith(ORG_ID, roundCost * 2);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      roundCost,
      `Agent chat turn (${DEFAULT_AGENT_CHAT_MODEL_KEY})`,
      expect.anything(),
    );
  });

  it('should use onboarding prompt when source is onboarding', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    await service.chat(
      {
        content: 'Help me get started',
        source: 'onboarding',
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('GenFeed onboarding agent'),
            role: 'system',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
  });

  it('should not use onboarding prompt for first-run organizations on the standard agent surface', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: false,
    } as never);

    await service.chat(
      {
        content: 'Hello',
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.not.stringContaining('GenFeed onboarding agent'),
            role: 'system',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
  });

  it('should pass generationPriority from user settings to tool executor', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    settingsService.findOne.mockResolvedValue({
      generationPriority: GenerationPriority.SPEED,
    } as never);

    // Make LLM return a tool call, then a final response
    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"a cat"}',
                    name: 'generate_image',
                  },
                  id: 'call-1',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'img-1' },
      success: true,
    });

    await service.chat(
      { content: 'Generate a cat image' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.objectContaining({
        generationType: 'image',
        prompt: 'a cat',
      }),
      expect.objectContaining({
        generationPriority: RouterPriority.SPEED,
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
    );
  });

  it('should default generationPriority to balanced when user has no settings', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    settingsService.findOne.mockResolvedValue(null);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"a dog"}',
                    name: 'generate_image',
                  },
                  id: 'call-2',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'img-2' },
      success: true,
    });

    await service.chat(
      { content: 'Generate a dog image' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.objectContaining({
        generationType: 'image',
        prompt: 'a dog',
      }),
      expect.objectContaining({
        generationPriority: RouterPriority.BALANCED,
      }),
    );
  });

  it('should block a generation tool call when the org cannot afford its flat credit cost', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    creditsUtilsService.checkOrganizationCreditsAvailable
      .mockResolvedValueOnce(true) // turn-cost pre-check
      .mockResolvedValueOnce(false); // generate_music flat-cost gate

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"lofi beat"}',
                    name: 'generate_music',
                  },
                  id: 'call-music-1',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    await service.chat(
      { content: 'Make me a song' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(ORG_ID, 10);
    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
    expect(llmDispatcher.chatCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining(
              'Insufficient credits. This tool requires 10 credits.',
            ),
            role: 'tool',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
  });

  it('should gate on the requested tool cost when the call is remapped to prepare_generation', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    creditsUtilsService.checkOrganizationCreditsAvailable
      .mockResolvedValueOnce(true) // turn-cost pre-check
      .mockResolvedValueOnce(false); // generate_image pre-remap flat-cost gate

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"a red fox"}',
                    name: 'generate_image',
                  },
                  id: 'call-image-1',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    await service.chat(
      { content: 'Make me an image' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    // generate_image is remapped to prepare_generation (cost 0); the gate
    // must still use the requested tool's cost of 50.
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(ORG_ID, 50);
    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
    expect(llmDispatcher.chatCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining(
              'Insufficient credits. This tool requires 50 credits.',
            ),
            role: 'tool',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
  });

  it('should not deduct the flat credit cost when the tool delegates billing to its endpoint', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"lofi beat"}',
                    name: 'generate_music',
                  },
                  id: 'call-music-2',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'music-1' },
      isBillingDelegated: true,
      success: true,
    });

    const result = await service.chat(
      { content: 'Make me a song' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    // Only the base turn cost is deducted; the endpoint bills the generation.
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledTimes(1);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      expect.anything(),
      'Agent tool: generate_music',
      expect.anything(),
    );
    // Two LLM rounds, priced per round against the model that answered.
    expect(result.creditsUsed).toBe(
      2 * getAgentChatModelRoundCredits(DEFAULT_AGENT_CHAT_MODEL_KEY),
    );
  });

  it('should deduct the flat credit cost exactly once when billing is not delegated', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"lofi beat"}',
                    name: 'generate_music',
                  },
                  id: 'call-music-3',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'music-1' },
      success: true,
    });

    const result = await service.chat(
      { content: 'Make me a song' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      10,
      'Agent tool: generate_music',
      expect.anything(),
    );
    // Base turn cost + the generate_music flat cost.
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledTimes(2);
    expect(result.creditsUsed).toBe(
      2 * getAgentChatModelRoundCredits(DEFAULT_AGENT_CHAT_MODEL_KEY) + 10,
    );
  });

  it('should apply org agent policy defaults for strategy-driven runs', async () => {
    const strategyBrandId = 'b07f191e810c19729de860ee';
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    organizationSettingsService.findOne.mockResolvedValue({
      agentPolicy: {
        creditGovernance: {
          agentDailyCreditCap: 120,
          brandDailyCreditCap: 480,
          useOrganizationPool: true,
        },
        generationModelOverride: 'openai/gpt-5.6-terra',
        qualityTierDefault: 'high_quality',
        reviewModelOverride: 'openai/gpt-5.6-luna',
        thinkingModelOverride: 'anthropic/claude-opus-5',
      },
    } as never);
    agentStrategiesService.findOneById.mockResolvedValue({
      id: 's07f191e810c19729de860ee',
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brandId: strategyBrandId,
      platforms: ['linkedin'],
    } as never);
    contextAssemblyService.assembleContext.mockResolvedValue({
      assembledAt: new Date(),
      brandId: String(strategyBrandId),
      brandName: 'Brand',
      defaultModel: 'x-ai/grok-4.5',
      layersUsed: ['brandIdentity'],
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"launch teaser"}',
                    name: 'generate_image',
                  },
                  id: 'call-policy-1',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'img-policy-1' },
      success: true,
    });

    await service.chat(
      { content: 'Create a launch teaser' },
      {
        organizationId: ORG_ID,
        strategyId: 'strategy-1',
        userId: USER_ID,
      },
    );

    expect(contextAssemblyService.assembleContext).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: String(strategyBrandId),
        organizationId: ORG_ID,
        platform: 'linkedin',
      }),
    );
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-opus-5',
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.any(Object),
      expect.objectContaining({
        brandId: String(strategyBrandId),
        creditGovernance: {
          agentDailyCreditCap: 120,
          brandDailyCreditCap: 480,
          useOrganizationPool: true,
        },
        generationModelOverride: 'openai/gpt-5.6-terra',
        generationPriority: RouterPriority.QUALITY,
        platform: 'linkedin',
        qualityTier: 'high_quality',
        reviewModelOverride: 'openai/gpt-5.6-luna',
        thinkingModel: 'anthropic/claude-opus-5',
      }),
    );
  });

  it('should let strategy overrides win over inherited org policy', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    organizationSettingsService.findOne.mockResolvedValue({
      agentPolicy: {
        qualityTierDefault: 'high_quality',
        thinkingModelOverride: 'anthropic/claude-opus-5',
      },
    } as never);
    agentStrategiesService.findOneById.mockResolvedValue({
      id: 'strategy-1',
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      model: 'deepseek/deepseek-v4-flash-0731',
      platforms: ['twitter'],
      qualityTier: 'budget',
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"budget asset"}',
                    name: 'generate_image',
                  },
                  id: 'call-policy-2',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Done!' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { id: 'img-policy-2' },
      success: true,
    });

    await service.chat(
      { content: 'Create a budget asset' },
      {
        organizationId: ORG_ID,
        strategyId: 'strategy-2',
        userId: USER_ID,
      },
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek/deepseek-v4-flash-0731',
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.any(Object),
      expect.objectContaining({
        generationPriority: RouterPriority.COST,
        qualityTier: 'budget',
      }),
    );
  });

  it('should continue when model requests an unknown tool in chat()', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{}',
                    name: 'nonexistent_tool',
                  },
                  id: 'call-unknown',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Recovered response' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    const response = await service.chat(
      { content: 'Do the thing' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
    expect(response.message.content).toBe('Recovered response');
    expect(response.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error: expect.stringContaining(
            'Unknown tool requested by model: nonexistent_tool',
          ),
          status: 'failed',
          toolName: 'nonexistent_tool',
        }),
      ]),
    );
  });

  it('records one failed attempt when a provider-auth error aborts before run creation', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentRunsService.create.mockRejectedValueOnce(
      new Error('Request failed with status code 401'),
    );

    await expect(
      service.chatStream(
        {
          content: 'Authenticate this turn',
          threadId: CONVERSATION_ID,
        },
        { organizationId: ORG_ID, userId: USER_ID },
      ),
    ).rejects.toThrow('Request failed with status code 401');

    expect(agentRunsService.recordFailedAttempt).toHaveBeenCalledOnce();
    expect(agentRunsService.recordFailedAttempt).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
      'Provider authentication failed: The model provider rejected the credentials for this request.',
    );
    expect(agentRunsService.fail).not.toHaveBeenCalled();
  });

  it('classifies a provider-auth rejection before the first token without duplicating the run', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    configService.get.mockImplementation((key) =>
      key === 'AGENT_TOKEN_STREAMING_ENABLED' ? 'true' : '',
    );
    llmDispatcher.streamChatCompletionAggregated.mockRejectedValueOnce(
      new Error('Request failed with status code 401'),
    );

    await service.chatStream(
      {
        content: 'Reject before streaming',
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (agentRunsService.fail.mock.calls.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(streamPublisher.publishToken).not.toHaveBeenCalled();
    expect(agentRunsService.fail).toHaveBeenCalledOnce();
    expect(agentRunsService.fail).toHaveBeenCalledWith(
      RUN_ID,
      ORG_ID,
      'Provider authentication failed: The model provider rejected the credentials for this request.',
    );
    expect(agentRunsService.recordFailedAttempt).not.toHaveBeenCalled();
    expect(streamPublisher.publishError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Request failed with status code 401',
        runId: RUN_ID,
        threadId: CONVERSATION_ID,
      }),
    );
  });

  it('streams real LLM deltas via agent:token when AGENT_TOKEN_STREAMING_ENABLED is on', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    configService.get.mockImplementation((key) =>
      key === 'AGENT_TOKEN_STREAMING_ENABLED' ? 'true' : '',
    );

    // Existing thread → empty seedTitle → live streaming path is eligible.
    await service.chatStream(
      { content: 'Stream this for real', threadId: CONVERSATION_ID },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (streamPublisher.publishDone.mock.calls.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    // Real streaming call is used instead of the blocking chatCompletion.
    expect(llmDispatcher.streamChatCompletionAggregated).toHaveBeenCalled();
    expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();

    // Real provider deltas are published as agent:token events, in order.
    const streamedTokens = streamPublisher.publishToken.mock.calls.map(
      (call) => (call[0] as { token: string }).token,
    );
    expect(streamedTokens).toEqual(['Hello ', 'streamed']);

    expect(streamPublisher.publishDone).toHaveBeenCalledWith(
      expect.objectContaining({ fullContent: 'Hello streamed' }),
    );
  });

  it('cancels mid-stream and tears down the round when the run is cancelled during streaming', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    configService.get.mockImplementation((key) =>
      key === 'AGENT_TOKEN_STREAMING_ENABLED' ? 'true' : '',
    );

    // Not cancelled at the round boundary, but cancelled once the first delta
    // arrives — flag flips only after streaming has begun, so it's robust to
    // however many cancellation checks run before the stream starts.
    let streamingStarted = false;
    llmDispatcher.streamChatCompletionAggregated.mockImplementation(
      async (
        _params: unknown,
        _organizationId: unknown,
        onToken?: (delta: string) => Promise<void>,
      ) => {
        streamingStarted = true;
        if (onToken) {
          await onToken('Hello ');
          await onToken('streamed');
        }
        return {
          choices: [{ message: { content: 'Hello streamed' } }],
          usage: {
            completion_tokens: 20,
            prompt_tokens: 20,
            total_tokens: 40,
          },
        };
      },
    );
    agentRunsService.isCancelled.mockImplementation(
      async () => streamingStarted,
    );

    await service.chatStream(
      { content: 'Stop me mid-stream', threadId: CONVERSATION_ID },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (
        streamPublisher.publishWorkEvent.mock.calls.some(
          (call) => (call[0] as { event?: string }).event === 'cancelled',
        )
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    // Cancelled-stream handler ran...
    expect(streamPublisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'cancelled', status: 'cancelled' }),
    );
    // ...the round short-circuited before emitting a final response...
    expect(streamPublisher.publishDone).not.toHaveBeenCalled();
    // ...and the cancel check fired before the first token was published.
    expect(streamPublisher.publishToken).not.toHaveBeenCalled();
  });

  it('settles a completed provider round before publishing cancellation', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentRunsService.isCancelled
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Completed before cancellation' } }],
      model: DEFAULT_AGENT_CHAT_MODEL_KEY,
      usage: {
        completion_tokens: 20,
        prompt_tokens: 20,
        total_tokens: 40,
      },
    } as never);

    await service.chatStream(
      { content: 'Cancel after the provider responds' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (
        streamPublisher.publishWorkEvent.mock.calls.some(
          (call) => (call[0] as { event?: string }).event === 'cancelled',
        )
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(streamPublisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'cancelled', status: 'cancelled' }),
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      getAgentChatModelRoundCredits(DEFAULT_AGENT_CHAT_MODEL_KEY),
      `Agent chat turn (${DEFAULT_AGENT_CHAT_MODEL_KEY})`,
      expect.anything(),
    );
    expect(streamPublisher.publishDone).not.toHaveBeenCalled();
  });

  it('logs but swallows token-publish failures so a live stream still completes', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    configService.get.mockImplementation((key) =>
      key === 'AGENT_TOKEN_STREAMING_ENABLED' ? 'true' : '',
    );
    // Simulate a Redis publish outage for the duration of the stream.
    streamPublisher.publishToken.mockRejectedValue(
      new Error('redis unavailable'),
    );

    // loggerMock is injected as the service's logger; reach it to assert the
    // throttled diagnostic without exposing a new outer binding.
    const { loggerService } = service as unknown as {
      loggerService: { warn: ReturnType<typeof vi.fn> };
    };

    await service.chatStream(
      { content: 'Stream through a publish outage', threadId: CONVERSATION_ID },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (streamPublisher.publishDone.mock.calls.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    // Publish failures were swallowed — the stream still completed...
    expect(streamPublisher.publishDone).toHaveBeenCalled();
    // ...but surfaced a throttled diagnostic instead of dropping silently.
    // The error value is whatever the publish Effect surfaces (an Effect-wrapped
    // failure, not the raw cause), so assert the stable signal — the message +
    // thread context — rather than pinning the wrapped error string.
    expect(loggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('stream token publish failed'),
      expect.objectContaining({
        error: expect.any(String),
        threadId: expect.any(String),
      }),
    );
  });

  it('keeps the simulated word-split path when the streaming flag is off', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    // configService.get already returns '' by default → flag off.

    await service.chatStream(
      { content: 'Stream this simulated', threadId: CONVERSATION_ID },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (streamPublisher.publishDone.mock.calls.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(llmDispatcher.chatCompletion).toHaveBeenCalled();
    expect(llmDispatcher.streamChatCompletionAggregated).not.toHaveBeenCalled();
    // Legacy path word-splits the final content into tokens.
    expect(streamPublisher.publishToken).toHaveBeenCalled();
  });

  it('should publish failed tool completion for unknown tool in chatStream()', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{}',
                    name: 'nonexistent_tool',
                  },
                  id: 'call-stream-unknown',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Recovered streamed response' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    await service.chatStream(
      { content: 'Do the thing in stream' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (streamPublisher.publishToolComplete.mock.calls.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
    expect(streamPublisher.publishToolComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(
          'Unknown tool requested by model: nonexistent_tool',
        ),
        status: 'failed',
        toolCallId: 'call-stream-unknown',
        toolName: 'nonexistent_tool',
      }),
    );
  });

  it('should recover generate_image to prepare_generation for x_content in chat()', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"a political podcast host"}',
                    name: 'generate_image',
                  },
                  id: 'call-recover-chat',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Recovered response' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { generationType: 'image' },
      success: true,
    });

    const response = await service.chat(
      {
        agentType: AgentType.X_CONTENT,
        content: 'Generate an avatar image',
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.objectContaining({
        generationType: 'image',
        prompt: 'a political podcast host',
      }),
      expect.any(Object),
    );

    expect(response.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'completed',
          toolName: 'prepare_generation',
        }),
      ]),
    );
  });

  it('should recover generate_image to prepare_generation for x_content in chatStream()', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"a political podcast host"}',
                    name: 'generate_image',
                  },
                  id: 'call-recover-stream',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Recovered streamed response' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { generationType: 'image' },
      success: true,
    });

    await service.chatStream(
      {
        agentType: AgentType.X_CONTENT,
        content: 'Generate an avatar image',
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (streamPublisher.publishToolComplete.mock.calls.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.objectContaining({
        generationType: 'image',
        prompt: 'a political podcast host',
      }),
      expect.any(Object),
    );

    expect(streamPublisher.publishToolComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        toolCallId: 'call-recover-stream',
        toolName: 'prepare_generation',
      }),
    );
  });

  it('should recover generate_as_identity to prepare_generation for x_content in chat()', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"avatar style talking head"}',
                    name: 'generate_as_identity',
                  },
                  id: 'call-recover-identity-chat',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Recovered response' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { generationType: 'video' },
      success: true,
    });

    const response = await service.chat(
      {
        agentType: AgentType.X_CONTENT,
        content: 'Generate avatar identity content',
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.objectContaining({
        generationType: 'video',
        prompt: 'avatar style talking head',
      }),
      expect.any(Object),
    );

    expect(response.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'completed',
          toolName: 'prepare_generation',
        }),
      ]),
    );
  });

  it('should recover generate_as_identity to prepare_generation for x_content in chatStream()', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"prompt":"avatar style talking head"}',
                    name: 'generate_as_identity',
                  },
                  id: 'call-recover-identity-stream',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Recovered streamed response' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: { generationType: 'video' },
      success: true,
    });

    await service.chatStream(
      {
        agentType: AgentType.X_CONTENT,
        content: 'Generate avatar identity content',
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    for (let i = 0; i < 20; i++) {
      if (streamPublisher.publishToolComplete.mock.calls.length > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.objectContaining({
        generationType: 'video',
        prompt: 'avatar style talking head',
      }),
      expect.any(Object),
    );

    expect(streamPublisher.publishToolComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        toolCallId: 'call-recover-identity-stream',
        toolName: 'prepare_generation',
      }),
    );
  });

  it('should synthesize fallback content for tool-only prepare_voice_clone chat()', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{}',
                    name: 'prepare_voice_clone',
                  },
                  id: 'call-voice-clone-chat',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      nextActions: [
        {
          id: 'voice-clone-1',
          title: 'Set Up Voice Clone',
          type: 'voice_clone_card',
        },
      ],
      success: true,
    } as never);

    const response = await service.chat(
      { content: 'Set up voice clone' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(response.message.content).toBe(
      'I opened voice clone setup below. Upload a sample or pick an existing voice.',
    );
    expect(response.message.metadata.isFallbackContent).toBe(true);
  });

  it('fails the run and publishes failure effects when deterministic batch generation rejects', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    toolExecutorService.executeTool.mockRejectedValueOnce(
      new Error('Batch publishing scope denied'),
    );

    await expect(
      service.chatStream(
        {
          brandId: 'c7a123456789012345678905',
          content: 'Generate 3 posts for LinkedIn',
        },
        {
          organizationId: ORG_ID,
          userId: USER_ID,
        },
      ),
    ).rejects.toThrow('Batch publishing scope denied');

    expect(agentRunsService.fail).toHaveBeenCalledWith(
      RUN_ID,
      ORG_ID,
      'Run failed: The agent hit an error while running. Batch publishing scope denied',
    );
    expect(streamPublisher.publishError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Batch publishing scope denied',
        runId: RUN_ID,
      }),
    );
    expect(streamPublisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'Batch publishing scope denied',
        event: 'failed',
        runId: RUN_ID,
        status: 'failed',
      }),
    );
  });

  it('asks for missing recurring workflow fields before creation', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    const response = await service.chat(
      {
        content: 'Create 5 Instagram images every weekday at 5pm',
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
    expect(streamPublisher.publishInputRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: 'prompt',
        threadId: CONVERSATION_ID,
      }),
    );
    expect(agentRuntimeSessionService.upsertBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeCursor: expect.objectContaining({
          awaitingField: 'prompt',
          draft: expect.objectContaining({
            count: 5,
            platform: 'instagram',
            schedule: '0 17 * * 1-5',
          }),
        }),
        status: 'waiting_input',
      }),
    );
    expect(response.message.content).toContain('core generation brief');
    expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();
  });

  it('fails the run and publishes failure effects when recurring workflow creation rejects', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
      settings: { timezone: 'Europe/Malta' },
    } as never);
    toolExecutorService.executeTool.mockRejectedValueOnce(
      new Error('Recurring publishing scope denied'),
    );

    await expect(
      service.chatStream(
        {
          content:
            'Create 5 Instagram images for our skincare launch in a minimal beige luxury style every weekday at 5pm Malta time',
        },
        {
          organizationId: ORG_ID,
          userId: USER_ID,
        },
      ),
    ).rejects.toThrow('Recurring publishing scope denied');

    expect(agentRunsService.fail).toHaveBeenCalledWith(
      RUN_ID,
      ORG_ID,
      'Run failed: The agent hit an error while running. Recurring publishing scope denied',
    );
    expect(streamPublisher.publishError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Recurring publishing scope denied',
        runId: RUN_ID,
      }),
    );
    expect(streamPublisher.publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'Recurring publishing scope denied',
        event: 'failed',
        runId: RUN_ID,
        status: 'failed',
      }),
    );
  });

  it('creates recurring automation immediately when the request is complete', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
      settings: { timezone: 'Europe/Malta' },
    } as never);
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 1,
      nextActions: [
        { id: 'workflow-created-1', type: 'workflow_created_card' },
      ] as never,
      requiresConfirmation: false,
      riskLevel: 'low',
      success: true,
    });

    const response = await service.chat(
      {
        content:
          'Create 5 Instagram images for our skincare launch in a minimal beige luxury style every weekday at 5pm Malta time',
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(response.message.metadata).toMatchObject({
      suggestedActions: [
        {
          label: 'Tune this workflow',
          prompt:
            'Show me how to customize this automation for my brand and goals',
        },
        {
          label: 'Add another channel',
          prompt:
            'Create a second automation for another channel using this workflow as the base',
        },
        {
          label: 'Review schedule',
          prompt:
            'Review the schedule for this automation and suggest the best posting windows',
        },
      ],
      uiActions: [
        expect.objectContaining({
          outcomeBullets: expect.arrayContaining([
            expect.stringContaining('Automation ready'),
          ]),
          primaryCta: expect.objectContaining({
            href: '/automate/workflows',
            label: 'Use in Workflow',
          }),
          secondaryCtas: expect.arrayContaining([
            expect.objectContaining({ label: 'Tune this workflow' }),
            expect.objectContaining({ label: 'Add another channel' }),
          ]),
          summaryText: 'Created a recurring automation for this request.',
          title: 'Done',
          type: 'completion_summary_card',
        }),
        expect.objectContaining({
          id: 'workflow-created-1',
          type: 'workflow_created_card',
        }),
      ],
    });

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.CREATE_WORKFLOW,
      expect.objectContaining({
        count: 5,
        prompt: expect.stringContaining('our skincare launch'),
        schedule: '0 17 * * 1-5',
        styleNotes: 'minimal beige luxury',
        timezone: 'Europe/Malta',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(response.message.content).toBe('Recurring automation created.');
    expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();
  });

  it('adds a completion summary card for thread UI action content outputs with inline previews', async () => {
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      nextActions: [
        {
          ctas: [{ href: '/publish/drafts', label: 'View all drafts' }],
          id: 'content-preview-1',
          images: ['https://cdn.example.com/generated-1.png'],
          title: 'Generated drafts',
          tweets: ['Hook one', 'Hook two'],
          type: 'content_preview_card',
        },
      ] as never,
      requiresConfirmation: false,
      riskLevel: 'low',
      success: true,
    });

    const response = await service.handleThreadUiAction(
      {
        action: 'confirm_publish_post',
        payload: {
          caption: 'Generate two LinkedIn hooks for our launch',
          contentId: 'ingredient-1',
          platforms: ['linkedin'],
        },
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(response.message.metadata?.uiActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outputVariants: expect.arrayContaining([
            expect.objectContaining({
              kind: 'image',
              url: 'https://cdn.example.com/generated-1.png',
            }),
            expect.objectContaining({
              kind: 'text',
              textContent: 'Hook one',
            }),
          ]),
          // `/publish/drafts` is a dead path the card builder normalizes.
          primaryCta: expect.objectContaining({
            href: '/publish/review',
            label: 'Review Draft',
          }),
          summaryText: 'Generated content for this request.',
          type: 'completion_summary_card',
        }),
      ]),
    );
  });

  it('adds a generic completion summary card for successful tool-only thread UI action results', async () => {
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        count: 0,
        trends: [],
      },
      nextActions: [],
      requiresConfirmation: false,
      riskLevel: 'low',
      success: true,
    } as never);

    const response = await service.handleThreadUiAction(
      {
        action: 'confirm_publish_post',
        payload: {
          caption: 'Find TikTok trends for our brand',
          contentId: 'ingredient-1',
          platforms: ['linkedin'],
        },
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(response.message.metadata?.uiActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcomeBullets: ['1 tool action completed', 'Tool: Create Post'],
          summaryText: 'Completed this request successfully.',
          title: 'Done',
          type: 'completion_summary_card',
        }),
      ]),
    );
  });

  it('resumes recurring draft from input and creates exactly one workflow', async () => {
    agentRuntimeSessionService.getBinding.mockResolvedValue({
      model: 'deepseek/deepseek-v4-flash-0731',
      resumeCursor: {
        awaitingField: 'variationBrief',
        draft: {
          contentType: 'image',
          count: 5,
          prompt: 'our skincare launch',
          schedule: '0 17 * * *',
          timezone: 'Europe/Malta',
        },
        kind: 'recurring_workflow_setup',
        updatedAt: '2026-03-10T10:00:00.000Z',
      },
      runId: RUN_ID,
    } as never);
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 1,
      nextActions: [
        { id: 'workflow-created-1', type: 'workflow_created_card' },
      ] as never,
      requiresConfirmation: false,
      riskLevel: 'low',
      success: true,
    });

    await service.resumeRecurringTaskDraftFromInput({
      answer: 'Keep the campaign consistent but vary composition and concept.',
      fieldId: 'variationBrief',
      organizationId: ORG_ID,
      threadId: CONVERSATION_ID,
      userId: USER_ID,
    });

    expect(toolExecutorService.executeTool).toHaveBeenCalledTimes(1);
    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.CREATE_WORKFLOW,
      expect.objectContaining({
        diversityMode: 'high',
        prompt: 'our skincare launch',
        styleNotes:
          'Keep the campaign consistent but vary composition and concept.',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        runId: RUN_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(streamPublisher.publishDone).toHaveBeenCalledWith(
      expect.objectContaining({
        fullContent: 'Recurring automation created.',
        threadId: CONVERSATION_ID,
      }),
    );
  });

  it('rejects unsupported thread UI actions', async () => {
    await expect(
      service.handleThreadUiAction(
        {
          action: 'unsupported_action',
          threadId: CONVERSATION_ID,
        },
        {
          organizationId: ORG_ID,
          userId: USER_ID,
        },
      ),
    ).rejects.toThrow('Unsupported thread UI action: unsupported_action');
  });

  it('executes confirmed workflow install thread UI actions', async () => {
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      nextActions: [
        {
          ctas: [
            {
              href: '/automate/workflows/wf-1',
              label: 'Open workflow',
            },
          ],
          id: 'workflow-created-1',
          title: 'Automation installed',
          type: 'workflow_created_card',
        },
      ] as never,
      requiresConfirmation: false,
      riskLevel: 'low',
      success: true,
    });

    const response = await service.handleThreadUiAction(
      {
        action: 'confirm_install_official_workflow',
        payload: {
          prompt: 'Install the official LinkedIn workflow',
          sourceId: 'seeded-template-1',
          sourceName: 'Official LinkedIn Workflow',
          sourceType: 'seeded-template',
        },
        threadId: CONVERSATION_ID,
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'install_official_workflow',
      expect.objectContaining({
        confirmed: true,
        prompt: 'Install the official LinkedIn workflow',
        sourceId: 'seeded-template-1',
        sourceType: 'seeded-template',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(response.message.content).toBe('Official workflow installed.');
    expect(response.message.metadata).toMatchObject({
      reviewRequired: false,
      uiActions: expect.arrayContaining([
        expect.objectContaining({
          title: 'Done',
          type: 'completion_summary_card',
        }),
        expect.objectContaining({
          title: 'Automation installed',
          type: 'workflow_created_card',
        }),
      ]),
    });
  });

  it('dispatches confirmed brand creation and binds the thread to the new scope', async () => {
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'proposal-message-1',
        metadata: {
          agentScope: { contextVersion: 1 },
          uiActions: [
            {
              ctas: [
                {
                  action: 'confirm_create_brand',
                  payload: {
                    sourceActionId:
                      'brand-identity-11111111-1111-4111-8111-111111111111',
                  },
                },
              ],
              data: {
                operation: 'create',
                proposalScope: { brandId: null, contextVersion: 1 },
                sourceActionId:
                  'brand-identity-11111111-1111-4111-8111-111111111111',
              },
              id: 'brand-identity-11111111-1111-4111-8111-111111111111',
              type: 'brand_identity_confirmation_card',
            },
          ],
        },
        role: 'assistant',
      },
    ] as never);
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        brandId: 'brand-created-1',
        id: 'brand-created-1',
        label: 'Created Brand',
        slug: 'created-brand',
      },
      success: true,
    });

    const request = {
      action: 'confirm_create_brand',
      expectedContextVersion: 1,
      payload: {
        description: 'Confirmed description',
        label: 'Created Brand',
        slug: 'created-brand',
        sourceActionId: 'brand-identity-11111111-1111-4111-8111-111111111111',
      },
      threadId: CONVERSATION_ID,
    };
    const response = await service.handleThreadUiAction(request, {
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.CREATE_BRAND,
      expect.objectContaining({
        label: 'Created Brand',
        sourceActionId: 'brand-identity-11111111-1111-4111-8111-111111111111',
      }),
      expect.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(agentScopeContextService.mutateBrandScope).toHaveBeenCalledWith({
      brandId: 'brand-created-1',
      expectedContextVersion: 1,
      organizationId: ORG_ID,
      threadId: CONVERSATION_ID,
      userId: USER_ID,
    });
    expect(response).toMatchObject({
      brandId: 'brand-created-1',
      contextVersion: 2,
    });
    expect(response.message.content).toBe(
      'Created Brand created and selected for this conversation.',
    );
    expect(agentMessagesService.patchAll).toHaveBeenCalledWith(
      {
        id: 'proposal-message-1',
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
      },
      {
        metadata: expect.objectContaining({
          consumedBrandIdentityActions: expect.objectContaining({
            'brand-identity-11111111-1111-4111-8111-111111111111':
              expect.objectContaining({ operation: 'create' }),
          }),
        }),
      },
    );

    const replay = await service.handleThreadUiAction(request, {
      organizationId: ORG_ID,
      userId: USER_ID,
    });
    expect(replay).toEqual(response);
    expect(toolExecutorService.executeTool).toHaveBeenCalledTimes(1);
    expect(agentScopeContextService.mutateBrandScope).toHaveBeenCalledTimes(1);
  });

  it('finds a persisted brand proposal beyond the newest message page', async () => {
    const sourceActionId =
      'brand-identity-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const newestPage = Array.from({ length: 100 }, (_, index) => ({
      id: `newer-message-${index}`,
      metadata: {},
      role: 'user',
    }));
    const proposal = {
      id: 'proposal-message-paginated',
      metadata: {
        agentScope: { contextVersion: 1 },
        uiActions: [
          {
            ctas: [
              {
                action: 'confirm_create_brand',
                payload: { sourceActionId },
              },
            ],
            data: {
              operation: 'create',
              proposalScope: { brandId: null, contextVersion: 1 },
              sourceActionId,
            },
            id: sourceActionId,
            type: 'brand_identity_confirmation_card',
          },
        ],
      },
      role: 'assistant',
    };
    agentMessagesService.getMessagesByRoom.mockImplementation(
      async (_threadId, _organizationId, options) => {
        if (options?.page === 1) {
          return newestPage as never;
        }
        return options?.page === 2 ? ([proposal] as never) : [];
      },
    );
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        brandId: 'brand-paginated',
        id: 'brand-paginated',
        label: 'Paginated Brand',
      },
      success: true,
    });

    await service.handleThreadUiAction(
      {
        action: 'confirm_create_brand',
        payload: { label: 'Paginated Brand', sourceActionId },
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(agentMessagesService.getMessagesByRoom).toHaveBeenCalledWith(
      CONVERSATION_ID,
      ORG_ID,
      { limit: 100, page: 2 },
    );
    expect(toolExecutorService.executeTool).toHaveBeenCalledTimes(1);
  });

  it('reuses a durable completion turn after addMessage succeeds but finalization fails', async () => {
    const sourceActionId =
      'brand-identity-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const proposal = {
      id: 'proposal-message-finalization-retry',
      metadata: {
        agentScope: { contextVersion: 1 },
        uiActions: [
          {
            ctas: [
              {
                action: 'confirm_create_brand',
                payload: { sourceActionId },
              },
            ],
            data: {
              operation: 'create',
              proposalScope: { brandId: null, contextVersion: 1 },
              sourceActionId,
            },
            id: sourceActionId,
            type: 'brand_identity_confirmation_card',
          },
        ],
      },
      role: 'assistant',
    };
    let completionMessage: Record<string, unknown> | null = null;
    const delayedRetryPage = Array.from({ length: 100 }, (_, index) => ({
      id: `delayed-retry-message-${index}`,
      metadata: {},
      role: 'user',
    }));
    agentMessagesService.getMessagesByRoom.mockImplementation(
      async (_threadId, _organizationId, options) => {
        if (!completionMessage) {
          return [proposal] as never;
        }
        return options?.page === 1
          ? (delayedRetryPage as never)
          : ([completionMessage, proposal] as never);
      },
    );
    agentMessagesService.addMessage.mockImplementation(async (message) => {
      completionMessage = {
        content: message.content,
        id: 'completion-message-finalization-retry',
        metadata: message.metadata,
        role: 'assistant',
      };
      return { id: 'completion-message-finalization-retry' } as never;
    });
    threadEventRecorder.recordAssistantFinalized
      .mockRejectedValueOnce(new Error('event finalization failed'))
      .mockResolvedValue(undefined);
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        brandId: 'brand-finalized-once',
        id: 'brand-finalized-once',
        label: 'Finalized Once',
      },
      success: true,
    });
    const request = {
      action: 'confirm_create_brand',
      payload: { label: 'Finalized Once', sourceActionId },
      threadId: CONVERSATION_ID,
    };

    await expect(
      service.handleThreadUiAction(request, {
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
    ).rejects.toThrow('event finalization failed');
    agentThreadsService.findOne.mockResolvedValue({
      brandId: 'brand-finalized-once',
      contextVersion: 2,
      id: CONVERSATION_ID,
      messages: [],
      planModeEnabled: false,
    } as never);

    const retry = await service.handleThreadUiAction(request, {
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(retry.message.content).toBe(
      'Finalized Once created and selected for this conversation.',
    );
    expect(agentMessagesService.addMessage).toHaveBeenCalledTimes(1);
    expect(agentMessagesService.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          brandIdentityConfirmationResult: {
            operation: 'create',
            sourceActionId,
          },
        }),
      }),
    );
    expect(toolExecutorService.executeTool).toHaveBeenCalledTimes(1);
    expect(agentScopeContextService.mutateBrandScope).toHaveBeenCalledTimes(1);
    expect(agentMessagesService.patchAll).toHaveBeenCalledTimes(1);
    expect(threadEventRecorder.recordAssistantFinalized).toHaveBeenCalledTimes(
      2,
    );
    expect(
      threadEventRecorder.recordAssistantFinalized,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ idempotencyKey: sourceActionId }),
    );
    expect(threadEventRecorder.recordRunCompleted).toHaveBeenCalledTimes(1);
    expect(threadEventRecorder.recordRunCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: sourceActionId }),
    );
    expect(agentMessagesService.getMessagesByRoom).toHaveBeenCalledWith(
      CONVERSATION_ID,
      ORG_ID,
      { limit: 100, page: 2 },
    );
  });

  it('dispatches confirmed rename against the validated active thread brand', async () => {
    agentThreadsService.findOne.mockResolvedValue({
      brandId: 'brand-active-1',
      contextVersion: 1,
      id: CONVERSATION_ID,
      messages: [],
      planModeEnabled: false,
    } as never);
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'proposal-message-2',
        metadata: {
          agentScope: { brandId: 'brand-active-1', contextVersion: 1 },
          uiActions: [
            {
              ctas: [
                {
                  action: 'confirm_rename_brand',
                  payload: {
                    sourceActionId:
                      'brand-identity-22222222-2222-4222-8222-222222222222',
                  },
                },
              ],
              data: {
                operation: 'rename',
                proposalScope: {
                  brandId: 'brand-active-1',
                  contextVersion: 1,
                },
                sourceActionId:
                  'brand-identity-22222222-2222-4222-8222-222222222222',
              },
              id: 'brand-identity-22222222-2222-4222-8222-222222222222',
              type: 'brand_identity_confirmation_card',
            },
          ],
        },
        role: 'assistant',
      },
    ] as never);
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        brandId: 'brand-active-1',
        label: 'Renamed Brand',
        renamed: true,
        slug: 'renamed-brand',
      },
      success: true,
    });

    const response = await service.handleThreadUiAction(
      {
        action: 'confirm_rename_brand',
        brandId: 'brand-active-1',
        expectedContextVersion: 1,
        payload: {
          brandId: 'spoofed-brand',
          label: 'Renamed Brand',
          slug: 'renamed-brand',
          sourceActionId: 'brand-identity-22222222-2222-4222-8222-222222222222',
        },
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.RENAME_BRAND,
      expect.objectContaining({
        brandId: 'spoofed-brand',
        label: 'Renamed Brand',
      }),
      expect.objectContaining({
        brandId: 'brand-active-1',
        confirmationOrigin: 'thread-ui-action',
        validatedScope: expect.objectContaining({
          brandId: 'brand-active-1',
        }),
      }),
    );
    expect(agentScopeContextService.mutateBrandScope).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      brandId: 'brand-active-1',
      contextVersion: 1,
    });
    expect(response.message.content).toBe('Renamed Brand renamed.');
  });

  it('rejects malformed brand confirmation source ids before proposal lookup', async () => {
    await expect(
      service.handleThreadUiAction(
        {
          action: 'confirm_create_brand',
          payload: {
            label: 'Forged Brand',
            sourceActionId: '../untrusted-cache-key',
          },
          threadId: CONVERSATION_ID,
        },
        { organizationId: ORG_ID, userId: USER_ID },
      ),
    ).rejects.toThrow(
      'Brand identity confirmation requires a valid source action.',
    );
    expect(agentMessagesService.getMessagesByRoom).not.toHaveBeenCalled();
    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
  });

  it('rejects a forged brand confirmation that mismatches the persisted proposal operation', async () => {
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'proposal-message-forged',
        metadata: {
          agentScope: { contextVersion: 1 },
          uiActions: [
            {
              ctas: [
                {
                  action: 'confirm_create_brand',
                  payload: {
                    sourceActionId:
                      'brand-identity-33333333-3333-4333-8333-333333333333',
                  },
                },
              ],
              data: {
                operation: 'create',
                proposalScope: { brandId: null, contextVersion: 1 },
                sourceActionId:
                  'brand-identity-33333333-3333-4333-8333-333333333333',
              },
              id: 'brand-identity-33333333-3333-4333-8333-333333333333',
              type: 'brand_identity_confirmation_card',
            },
          ],
        },
        role: 'assistant',
      },
    ] as never);

    await expect(
      service.handleThreadUiAction(
        {
          action: 'confirm_rename_brand',
          payload: {
            label: 'Forged Rename',
            sourceActionId:
              'brand-identity-33333333-3333-4333-8333-333333333333',
          },
          threadId: CONVERSATION_ID,
        },
        { organizationId: ORG_ID, userId: USER_ID },
      ),
    ).rejects.toThrow(
      'Brand identity proposal does not match this confirmation.',
    );
    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
  });

  it('rejects a stale rename card after the authoritative thread brand changes', async () => {
    agentThreadsService.findOne.mockResolvedValue({
      brandId: 'brand-new-scope',
      contextVersion: 2,
      id: CONVERSATION_ID,
      messages: [],
      planModeEnabled: false,
    } as never);
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'proposal-message-stale',
        metadata: {
          agentScope: { brandId: 'brand-old-scope', contextVersion: 1 },
          uiActions: [
            {
              ctas: [
                {
                  action: 'confirm_rename_brand',
                  payload: {
                    sourceActionId:
                      'brand-identity-44444444-4444-4444-8444-444444444444',
                  },
                },
              ],
              data: {
                operation: 'rename',
                proposalScope: {
                  brandId: 'brand-old-scope',
                  contextVersion: 1,
                },
                sourceActionId:
                  'brand-identity-44444444-4444-4444-8444-444444444444',
              },
              id: 'brand-identity-44444444-4444-4444-8444-444444444444',
              type: 'brand_identity_confirmation_card',
            },
          ],
        },
        role: 'assistant',
      },
    ] as never);

    await expect(
      service.handleThreadUiAction(
        {
          action: 'confirm_rename_brand',
          payload: {
            label: 'Must Not Apply',
            sourceActionId:
              'brand-identity-44444444-4444-4444-8444-444444444444',
          },
          threadId: CONVERSATION_ID,
        },
        { organizationId: ORG_ID, userId: USER_ID },
      ),
    ).rejects.toThrow(
      'Brand identity proposal is stale for the current thread scope.',
    );
    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
  });

  it('rejects a consumed proposal after the idempotency result is unavailable', async () => {
    const sourceActionId =
      'brand-identity-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'proposal-message-consumed',
        metadata: {
          agentScope: { contextVersion: 1 },
          consumedBrandIdentityActions: {
            [sourceActionId]: {
              contextVersion: 2,
              operation: 'create',
            },
          },
          uiActions: [],
        },
        role: 'assistant',
      },
    ] as never);

    await expect(
      service.handleThreadUiAction(
        {
          action: 'confirm_create_brand',
          payload: { label: 'Already Created', sourceActionId },
          threadId: CONVERSATION_ID,
        },
        { organizationId: ORG_ID, userId: USER_ID },
      ),
    ).rejects.toThrow(
      'This brand identity confirmation has already been consumed.',
    );
    expect(toolExecutorService.executeTool).not.toHaveBeenCalled();
  });

  it('serializes concurrent confirmation attempts for the same proposal', async () => {
    agentMessagesService.getMessagesByRoom.mockResolvedValue([
      {
        id: 'proposal-message-concurrent',
        metadata: {
          agentScope: { contextVersion: 1 },
          uiActions: [
            {
              ctas: [
                {
                  action: 'confirm_create_brand',
                  payload: {
                    sourceActionId:
                      'brand-identity-55555555-5555-4555-8555-555555555555',
                  },
                },
              ],
              data: {
                operation: 'create',
                proposalScope: { brandId: null, contextVersion: 1 },
                sourceActionId:
                  'brand-identity-55555555-5555-4555-8555-555555555555',
              },
              id: 'brand-identity-55555555-5555-4555-8555-555555555555',
              type: 'brand_identity_confirmation_card',
            },
          ],
        },
        role: 'assistant',
      },
    ] as never);
    let releaseTool: ((result: Record<string, unknown>) => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    toolExecutorService.executeTool.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseTool = resolve;
          markStarted?.();
        }) as never,
    );
    const request = {
      action: 'confirm_create_brand',
      payload: {
        label: 'Concurrent Brand',
        sourceActionId: 'brand-identity-55555555-5555-4555-8555-555555555555',
      },
      threadId: CONVERSATION_ID,
    };

    const first = service.handleThreadUiAction(request, {
      organizationId: ORG_ID,
      userId: USER_ID,
    });
    await started;
    const second = service.handleThreadUiAction(request, {
      organizationId: ORG_ID,
      userId: USER_ID,
    });
    releaseTool?.({
      creditsUsed: 0,
      data: {
        brandId: 'brand-concurrent',
        id: 'brand-concurrent',
        label: 'Concurrent Brand',
      },
      success: true,
    });

    const outcomes = await Promise.allSettled([first, second]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    expect(toolExecutorService.executeTool).toHaveBeenCalledTimes(1);
  });

  it('returns a publish confirmation card through the chat loop for selected content', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments:
                      '{"contentId":"ingredient-1","caption":"Publish this to LinkedIn"}',
                    name: AgentToolName.CREATE_POST,
                  },
                  id: 'call-publish-card',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Review the publish card.' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      nextActions: [
        {
          contentId: 'ingredient-1',
          id: 'publish-card-1',
          platforms: ['linkedin'],
          textContent: 'Publish this to LinkedIn',
          title: 'Publish selected content',
          type: 'publish_post_card',
        },
      ] as never,
      success: true,
    });

    const response = await service.chat(
      { content: 'Publish this content' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.CREATE_POST,
      expect.objectContaining({
        caption: 'Publish this to LinkedIn',
        contentId: 'ingredient-1',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
    );
    expect(response.toolCalls).toEqual([
      expect.objectContaining({
        creditsUsed: 0,
        status: 'completed',
        toolName: AgentToolName.CREATE_POST,
      }),
    ]);
    expect(response.message.metadata).toMatchObject({
      uiActions: [
        expect.objectContaining({
          contentId: 'ingredient-1',
          type: 'publish_post_card',
        }),
      ],
    });
  });

  it('drafts and approves a brand voice profile through the onboarding conversation flow', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: false,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: JSON.stringify({
                      examplesToAvoid: ['corporate jargon'],
                      examplesToEmulate: ['April Dunford'],
                      offering: 'AI workflow software for operators',
                      targetAudience: 'startup operators',
                    }),
                    name: 'draft_brand_voice_profile',
                  },
                  id: 'call-brand-voice-draft',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [
          {
            message: { content: 'Review the draft and approve it if it fits.' },
          },
        ],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool
      .mockResolvedValueOnce({
        creditsUsed: 0,
        nextActions: [
          {
            brandId: 'brand-voice-1',
            ctas: [
              {
                action: 'confirm_save_brand_voice_profile',
                label: 'Approve and save',
              },
            ],
            data: {
              brandId: 'brand-voice-1',
              voiceProfile: {
                audience: ['startup operators'],
                doNotSoundLike: ['corporate jargon'],
                messagingPillars: ['clarity', 'proof'],
                sampleOutput: 'Clear systems create compounding output.',
                style: 'direct',
                tone: 'confident',
                values: ['clarity'],
              },
            },
            id: 'brand-voice-card-1',
            title: 'Brand Voice Draft',
            type: 'brand_voice_profile_card',
          },
        ] as never,
        success: true,
      })
      .mockResolvedValueOnce({
        creditsUsed: 0,
        data: {
          brandId: 'brand-voice-1',
        },
        requiresConfirmation: false,
        riskLevel: 'low',
        success: true,
      });

    const draftResponse = await service.chat(
      {
        content:
          'We help startup operators build AI workflows without noisy guru language.',
        source: 'onboarding',
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenNthCalledWith(
      1,
      'draft_brand_voice_profile',
      expect.objectContaining({
        examplesToAvoid: ['corporate jargon'],
        examplesToEmulate: ['April Dunford'],
        offering: 'AI workflow software for operators',
        targetAudience: 'startup operators',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
    );
    expect(draftResponse.message.metadata).toMatchObject({
      uiActions: [
        expect.objectContaining({
          brandId: 'brand-voice-1',
          type: 'brand_voice_profile_card',
        }),
      ],
    });

    const uiActions = draftResponse.message.metadata?.uiActions as
      | Array<Record<string, unknown>>
      | undefined;
    const approvalPayload = uiActions?.[0]?.data as Record<string, unknown>;

    const saveResponse = await service.handleThreadUiAction(
      {
        action: 'confirm_save_brand_voice_profile',
        payload: approvalPayload,
        threadId: CONVERSATION_ID,
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(toolExecutorService.executeTool).toHaveBeenNthCalledWith(
      2,
      'save_brand_voice_profile',
      expect.objectContaining({
        brandId: 'brand-voice-1',
        voiceProfile: expect.objectContaining({
          doNotSoundLike: ['corporate jargon'],
          messagingPillars: ['clarity', 'proof'],
          sampleOutput: 'Clear systems create compounding output.',
        }),
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(saveResponse.message.content).toBe(
      'Brand voice saved to the selected brand.',
    );
  });

  it('returns a post analytics snapshot through the chat loop for selected content', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"contentId":"ingredient-2"}',
                    name: AgentToolName.GET_ANALYTICS,
                  },
                  id: 'call-content-analytics',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Here is the latest performance.' } }],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      nextActions: [
        {
          id: 'analytics-card-1',
          metrics: {
            items: [{ label: 'Views', value: 1200 }],
          },
          title: 'Content analytics snapshot',
          type: 'analytics_snapshot_card',
        },
      ] as never,
      success: true,
    });

    const response = await service.chat(
      { content: 'Show me the analytics for this content' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.GET_ANALYTICS,
      expect.objectContaining({
        contentId: 'ingredient-2',
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
      }),
    );
    expect(response.message.metadata).toMatchObject({
      uiActions: [
        expect.objectContaining({
          title: 'Content analytics snapshot',
          type: 'analytics_snapshot_card',
        }),
      ],
    });
  });

  it('returns a no-analytics-yet publish prompt through the chat loop for unpublished content', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    llmDispatcher.chatCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    arguments: '{"contentId":"ingredient-3"}',
                    name: AgentToolName.GET_ANALYTICS,
                  },
                  id: 'call-no-analytics',
                },
              ],
            },
          },
        ],
        usage: {
          completion_tokens: 10,
          prompt_tokens: 10,
          total_tokens: 20,
        },
      } as never)
      .mockResolvedValueOnce({
        choices: [
          { message: { content: 'This content has not been published yet.' } },
        ],
        usage: {
          completion_tokens: 5,
          prompt_tokens: 15,
          total_tokens: 20,
        },
      } as never);

    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        contentId: 'ingredient-3',
        message:
          'This content does not have a published post yet, so analytics are not available.',
      },
      nextActions: [
        {
          contentId: 'ingredient-3',
          id: 'publish-card-2',
          title: 'Publish selected content',
          type: 'publish_post_card',
        },
      ] as never,
      success: true,
    });

    const response = await service.chat(
      { content: 'Show analytics for this content' },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(response.message.metadata).toMatchObject({
      uiActions: [
        expect.objectContaining({
          contentId: 'ingredient-3',
          type: 'publish_post_card',
        }),
      ],
    });
  });

  it('executes confirmed publish thread UI actions', async () => {
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        createdPlatforms: ['linkedin'],
        postIds: ['post-1'],
        totalCreated: 1,
      },
      nextActions: [
        {
          ctas: [{ href: '/content/posts', label: 'Open posts' }],
          id: 'publish-preview-1',
          title: 'Posts queued',
          type: 'content_preview_card',
        },
      ] as never,
      requiresConfirmation: false,
      riskLevel: 'low',
      success: true,
    });

    const response = await service.handleThreadUiAction(
      {
        action: 'confirm_publish_post',
        payload: {
          caption: 'Publish this',
          contentId: 'ingredient-1',
          platforms: ['linkedin'],
        },
        threadId: CONVERSATION_ID,
      },
      {
        apiKeyContext: {
          isApiKey: true,
          scopes: [ApiKeyScope.POSTS_PUBLISH],
        },
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.CREATE_POST,
      expect.objectContaining({
        caption: 'Publish this',
        confirmed: true,
        contentId: 'ingredient-1',
        platforms: ['linkedin'],
      }),
      expect.objectContaining({
        apiKeyContext: {
          isApiKey: true,
          scopes: [ApiKeyScope.POSTS_PUBLISH],
        },
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(response.message.content).toBe(
      'Queued 1 post on linkedin for publishing.',
    );
    expect(response.toolCalls).toEqual([
      expect.objectContaining({
        creditsUsed: 0,
        status: 'completed',
        toolName: AgentToolName.CREATE_POST,
      }),
    ]);
    expect(response.message.metadata).toMatchObject({
      artifactReferences: [
        expect.objectContaining({
          kind: 'post',
          organizationId: ORG_ID,
          recordId: 'post-1',
          serializer: 'post',
        }),
      ],
      reviewRequired: false,
      uiActions: [
        expect.objectContaining({
          title: 'Posts queued',
          type: 'content_preview_card',
        }),
      ],
    });
  });

  it('executes composer-anchored media generation and links the persisted output', async () => {
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        id: 'image-1',
        url: 'https://cdn.example.com/image-1.png',
      },
      nextActions: [
        {
          id: 'image-output-1',
          images: ['https://cdn.example.com/image-1.png'],
          title: 'Image generated',
          type: 'content_preview_card',
        },
      ] as never,
      success: true,
    });

    const response = await service.handleThreadUiAction(
      {
        action: 'confirm_generate_media',
        payload: {
          aspectRatio: '4:5',
          generationType: 'image',
          prioritize: 'quality',
          prompt: 'Editorial product photo on a dark neutral set',
          sourceActionId: 'generation-card-1',
        },
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );
    const retryResponse = await service.handleThreadUiAction(
      {
        action: 'confirm_generate_media',
        payload: {
          aspectRatio: '4:5',
          generationType: 'image',
          prioritize: 'quality',
          prompt: 'Editorial product photo on a dark neutral set',
          sourceActionId: 'generation-card-1',
        },
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      AgentToolName.GENERATE_IMAGE,
      expect.objectContaining({
        aspectRatio: '4:5',
        prompt: 'Editorial product photo on a dark neutral set',
      }),
      expect.objectContaining({
        generationPriority: RouterPriority.QUALITY,
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(response.message.metadata?.uiActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: {
            sourceGenerationActionId: 'generation-card-1',
          },
          type: 'content_preview_card',
        }),
      ]),
    );
    expect(retryResponse).toEqual(response);
    expect(toolExecutorService.executeTool).toHaveBeenCalledTimes(1);
    expect(threadEventRecorder.recordToolStarted).toHaveBeenCalledTimes(1);
  });

  it('executes confirmed save brand voice thread UI actions', async () => {
    toolExecutorService.executeTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        brandId: 'brand-1',
      },
      requiresConfirmation: false,
      riskLevel: 'low',
      success: true,
    });

    const response = await service.handleThreadUiAction(
      {
        action: 'confirm_save_brand_voice_profile',
        payload: {
          brandId: 'brand-1',
          voiceProfile: {
            audience: ['founders'],
            doNotSoundLike: ['clickbait'],
            messagingPillars: ['clarity', 'proof'],
            sampleOutput: 'A practical, direct founder post.',
            style: 'concise',
            tone: 'confident',
            values: ['clarity'],
          },
        },
        threadId: CONVERSATION_ID,
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'save_brand_voice_profile',
      expect.objectContaining({
        brandId: 'brand-1',
        voiceProfile: expect.objectContaining({
          doNotSoundLike: ['clickbait'],
          messagingPillars: ['clarity', 'proof'],
          sampleOutput: 'A practical, direct founder post.',
          tone: 'confident',
        }),
      }),
      expect.objectContaining({
        organizationId: ORG_ID,
        threadId: CONVERSATION_ID,
        userId: USER_ID,
      }),
    );
    expect(response.message.content).toBe(
      'Brand voice saved to the selected brand.',
    );
    expect(response.toolCalls).toEqual([
      expect.objectContaining({
        creditsUsed: 0,
        status: 'completed',
        toolName: 'save_brand_voice_profile',
      }),
    ]);
  });

  it('resumes execution from the stored plan when the user approves it', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentThreadEngineService.getSnapshot.mockResolvedValue({
      latestProposedPlan: {
        awaitingApproval: true,
        content:
          '1. Add a thread-level toggle\n2. Persist the flag\n3. Pause for approval',
        id: 'plan-1',
        status: 'awaiting_approval',
      },
      pendingInputRequests: [],
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'Approved plan executed.',
          },
        },
      ],
      usage: {
        completion_tokens: 12,
        prompt_tokens: 24,
        total_tokens: 36,
      },
    } as never);

    const response = await service.handleThreadUiAction(
      {
        action: 'approve_plan',
        payload: { planId: 'plan-1' },
        threadId: CONVERSATION_ID,
      },
      { organizationId: ORG_ID, userId: USER_ID },
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalled();
    expect(threadEventRecorder.recordPlanUpserted).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          id: 'plan-1',
          lastReviewAction: 'approve',
          status: 'approved',
        }),
      }),
    );
    expect(response.message.content).toBe('Approved plan executed.');
  });

  // ──────────────────────────────────────────────
  // BRAND CONTEXT INTERVIEW — agent-type routing
  // ──────────────────────────────────────────────

  it('uses BRAND_INTERVIEW_SYSTEM_PROMPT when agentType is BRAND_INTERVIEW', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    await service.chat(
      {
        agentType: AgentType.BRAND_INTERVIEW,
        content: 'Start my brand interview',
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('brand context facilitator'),
            role: 'system',
          }),
        ]),
      }),
      ORG_ID,
      LLM_CALL_CONTEXT,
    );
  });

  it('does not charge per-turn credits for BRAND_INTERVIEW agentType', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);

    await service.chat(
      {
        agentType: AgentType.BRAND_INTERVIEW,
        content: 'Start my brand interview',
      },
      {
        organizationId: ORG_ID,
        userId: USER_ID,
      },
    );

    // With turnCost = 0 the service checks credits with 0 (so it never blocks).
    // settleAgentTurnCredits skips the deduct call entirely when the billed
    // turn cost is 0 rather than issuing a zero-amount write — the net effect
    // is still no credits billed for the turn.
    expect(
      creditsUtilsService.checkOrganizationCreditsAvailable,
    ).toHaveBeenCalledWith(ORG_ID, 0);
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).not.toHaveBeenCalled();
  });
});
