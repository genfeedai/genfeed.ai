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
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { AgentToolName } from '@genfeedai/interfaces';
import { AgentAutonomyMode, AgentType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Effect } from 'effect';
import { Types } from 'mongoose';

const ORG_ID = '67a123456789012345678901';
const USER_ID = '67a123456789012345678902';
const CONVERSATION_ID = '67a123456789012345678903';
const RUN_ID = '67a123456789012345678904';

describe('AgentOrchestratorService', () => {
  let service: AgentOrchestratorService;
  let llmDispatcher: vi.Mocked<LlmDispatcherService>;
  let agentThreadsService: vi.Mocked<AgentThreadsService>;
  let organizationsService: vi.Mocked<OrganizationsService>;
  let organizationSettingsService: vi.Mocked<OrganizationSettingsService>;
  let settingsService: vi.Mocked<SettingsService>;
  let agentStrategiesService: vi.Mocked<AgentStrategiesService>;
  let agentRunsService: vi.Mocked<AgentRunsService>;
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
    };
    const agentMessagesServiceMock = {
      addMessage: vi.fn().mockResolvedValue({ _id: 'msg-1' }),
      create: vi.fn().mockResolvedValue({ _id: 'msg-1' }),
      getMessagesByRoom: vi.fn().mockResolvedValue([]),
      getRecentMessages: vi.fn().mockResolvedValue([]),
    };
    const agentMemoriesServiceMock = {
      getMemoriesForPrompt: vi.fn().mockResolvedValue([]),
      listForUser: vi.fn().mockResolvedValue([]),
    };
    const contextAssemblyServiceMock = {
      assembleContext: vi.fn().mockResolvedValue({ tools: [] }),
      buildSystemPrompt: vi
        .fn()
        .mockReturnValue('You are a helpful assistant.'),
    };
    const agentThreadsServiceMock = {
      addMessage: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ _id: CONVERSATION_ID }),
      findOne: vi.fn().mockResolvedValue({
        _id: CONVERSATION_ID,
        messages: [],
        planModeEnabled: false,
      }),
      updateThreadMetadata: vi.fn().mockResolvedValue({ _id: CONVERSATION_ID }),
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
    const organizationsServiceMock = {
      findOne: vi.fn(),
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
      create: vi.fn().mockResolvedValue({ _id: RUN_ID }),
      isCancelled: vi.fn().mockResolvedValue(false),
      mergeMetadata: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn().mockResolvedValue({}),
      recordToolCall: vi.fn().mockResolvedValue(undefined),
      start: vi
        .fn()
        .mockResolvedValue({ startedAt: new Date('2026-03-09T12:00:00.000Z') }),
    };
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
          inject: [
            LoggerService,
            LlmDispatcherService,
            AgentThreadsService,
            AgentMemoriesService,
            AgentMessagesService,
            AgentContextAssemblyService,
            CreditsUtilsService,
            AgentToolExecutorService,
            OrganizationsService,
            OrganizationSettingsService,
            SettingsService,
            AgentStrategiesService,
            AgentStreamPublisherService,
            AgentRunsService,
            AgentThreadEngineService,
            AgentRuntimeSessionService,
          ],
          provide: AgentOrchestratorService,
          useFactory: (
            loggerService: LoggerService,
            llmDispatcherService: LlmDispatcherService,
            agentConversationsSvc: AgentThreadsService,
            agentMemoriesSvc: AgentMemoriesService,
            agentMessagesSvc: AgentMessagesService,
            contextAssemblySvc: AgentContextAssemblyService,
            creditsUtilsSvc: CreditsUtilsService,
            toolExecutorSvc: AgentToolExecutorService,
            organizationsSvc: OrganizationsService,
            organizationSettingsSvc: OrganizationSettingsService,
            settingsSvc: SettingsService,
            agentStrategiesSvc: AgentStrategiesService,
            streamPublisherSvc: AgentStreamPublisherService,
            agentRunsSvc: AgentRunsService,
            threadEngineSvc: AgentThreadEngineService,
            runtimeSessionSvc: AgentRuntimeSessionService,
          ) =>
            new AgentOrchestratorService(
              loggerService,
              llmDispatcherService,
              agentConversationsSvc,
              agentMemoriesSvc,
              agentMessagesSvc,
              contextAssemblySvc,
              creditsUtilsSvc,
              toolExecutorSvc,
              organizationsSvc,
              organizationSettingsSvc,
              settingsSvc,
              agentStrategiesSvc,
              streamPublisherSvc,
              agentRunsSvc,
              undefined,
              undefined,
              threadEngineSvc,
              runtimeSessionSvc,
              undefined,
              undefined,
            ),
        },
        {
          provide: LoggerService,
          useValue: loggerMock,
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
      ],
    }).compile();

    service = module.get(AgentOrchestratorService);
    agentThreadsService = module.get(AgentThreadsService);
    llmDispatcher = module.get(LlmDispatcherService);
    creditsUtilsService = module.get(CreditsUtilsService);
    organizationsService = module.get(OrganizationsService);
    organizationSettingsService = module.get(OrganizationSettingsService);
    settingsService = module.get(SettingsService);
    agentStrategiesService = module.get(AgentStrategiesService);
    agentRunsService = module.get(AgentRunsService);
    toolExecutorService = module.get(AgentToolExecutorService);
    streamPublisher = module.get(AgentStreamPublisherService);
    agentThreadEngineService = module.get(AgentThreadEngineService);
    agentRuntimeSessionService = module.get(AgentRuntimeSessionService);
    contextAssemblyService = module.get(AgentContextAssemblyService);
  });

  it('defaults normal agent chat to openrouter/auto when no higher-precedence override is set', async () => {
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

    expect(llmDispatcher.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openrouter/auto',
      }),
      ORG_ID,
    );
    expect(result.message.metadata).toEqual(
      expect.objectContaining({
        actualModel: 'google/gemini-2.5-flash',
        model: 'google/gemini-2.5-flash',
        requestedModel: 'openrouter/auto',
      }),
    );
  });

  it('generates a concise title for a new thread within the same LLM response', async () => {
    const prompt = 'Help me plan next week of content';

    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentThreadsService.findOne.mockResolvedValue({
      _id: CONVERSATION_ID,
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
    );
    expect(
      creditsUtilsService.deductCreditsFromOrganization,
    ).toHaveBeenCalledTimes(1);
    expect(result.creditsUsed).toBe(1);
  });

  it('does not overwrite a manually renamed thread title', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentThreadsService.findOne.mockResolvedValueOnce({
      _id: CONVERSATION_ID,
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
    expect(result.creditsUsed).toBe(1);
  });

  it('proposes a plan and pauses execution when plan mode is enabled on the thread', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    agentThreadsService.findOne.mockResolvedValue({
      _id: CONVERSATION_ID,
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
    expect(agentThreadEngineService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          awaitingApproval: true,
          status: 'awaiting_approval',
        }),
        type: 'plan.upserted',
      }),
    );
  });

  it('adds the web plugin when auto-routed chat explicitly asks for web search', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Here are the latest results.' } }],
      model: 'openai/gpt-4o-mini-search-preview',
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
        model: 'openrouter/auto',
        plugins: [{ id: 'web' }],
      }),
      ORG_ID,
    );
  });

  it('adds the web plugin for fresh live-data prompts on the auto router', async () => {
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
        model: 'openrouter/auto',
        plugins: [{ id: 'web' }],
      }),
      ORG_ID,
    );
    expect(result.message.metadata).toEqual(
      expect.objectContaining({
        routingPolicy: 'fresh-live-data',
        webSearchEnabled: true,
      }),
    );
  });

  it('records requested and actual models into agent run metadata when a run id is present', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    llmDispatcher.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: 'Tracked reply' } }],
      model: 'anthropic/claude-sonnet-4-5-20250929',
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
        actualModel: 'anthropic/claude-sonnet-4-5-20250929',
        requestedModel: 'openrouter/auto',
      }),
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
    );
  });

  it('should pass generationPriority from user settings to tool executor', async () => {
    organizationsService.findOne.mockResolvedValue({
      onboardingCompleted: true,
    } as never);
    settingsService.findOne.mockResolvedValue({
      generationPriority: 'speed',
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
        generationPriority: 'speed',
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
        generationPriority: 'balanced',
      }),
    );
  });

  it('should apply org agent policy defaults for strategy-driven runs', async () => {
    const strategyBrandId = new Types.ObjectId();
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
        generationModelOverride: 'openai/gpt-4o',
        qualityTierDefault: 'high_quality',
        reviewModelOverride: 'openai/o4-mini',
        thinkingModelOverride: 'anthropic/claude-opus-4-6',
      },
    } as never);
    agentStrategiesService.findOneById.mockResolvedValue({
      _id: new Types.ObjectId(),
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brand: strategyBrandId,
      platforms: ['linkedin'],
    } as never);
    contextAssemblyService.assembleContext.mockResolvedValue({
      assembledAt: new Date(),
      brandId: String(strategyBrandId),
      brandName: 'Brand',
      defaultModel: 'x-ai/grok-4-fast',
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
        model: 'anthropic/claude-opus-4-6',
      }),
      ORG_ID,
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
        generationModelOverride: 'openai/gpt-4o',
        generationPriority: 'quality',
        platform: 'linkedin',
        qualityTier: 'high_quality',
        reviewModelOverride: 'openai/o4-mini',
        thinkingModel: 'anthropic/claude-opus-4-6',
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
        thinkingModelOverride: 'anthropic/claude-opus-4-6',
      },
    } as never);
    agentStrategiesService.findOneById.mockResolvedValue({
      _id: new Types.ObjectId(),
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      model: 'deepseek/deepseek-chat',
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
        model: 'deepseek/deepseek-chat',
      }),
      ORG_ID,
    );
    expect(toolExecutorService.executeTool).toHaveBeenCalledWith(
      'prepare_generation',
      expect.any(Object),
      expect.objectContaining({
        generationPriority: 'cost',
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
            href: '/automations/editor/',
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
          ctas: [{ href: '/posts/drafts', label: 'View all drafts' }],
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
          primaryCta: expect.objectContaining({
            href: '/posts/drafts',
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
      model: 'deepseek/deepseek-chat',
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
              href: '/automations/editor/wf-1',
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

    const approvalPayload = (
      draftResponse.message.metadata?.uiActions as Array<
        Record<string, unknown>
      >
    )[0]?.data as Record<string, unknown>;

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
      reviewRequired: false,
      uiActions: expect.arrayContaining([
        expect.objectContaining({
          title: 'Done',
          type: 'completion_summary_card',
        }),
        expect.objectContaining({
          title: 'Posts queued',
          type: 'content_preview_card',
        }),
      ]),
    });
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
    expect(agentThreadEngineService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          id: 'plan-1',
          lastReviewAction: 'approve',
          status: 'approved',
        }),
        type: 'plan.upserted',
      }),
    );
    expect(response.message.content).toBe('Approved plan executed.');
  });
});
