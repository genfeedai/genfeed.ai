import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { AgentTurnRoundRunnerService } from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('AgentTurnRoundRunnerService.recordAgentResponseModel', () => {
  const loggerService = {
    log: vi.fn(),
  } as unknown as LoggerService;
  const creditsUtilsService = {} as CreditsUtilsService;
  const toolExecutorService = {} as AgentToolExecutorService;
  const agentRunsService = {
    mergeMetadata: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentRunsService;

  const service = new AgentTurnRoundRunnerService(
    loggerService,
    creditsUtilsService,
    toolExecutorService,
    agentRunsService,
  );

  const context: AgentChatContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes bare response models, logs, and merges run metadata', async () => {
    const actualModel = await service.recordAgentResponseModel({
      actualModels: ['openai/gpt-5.6-luna'],
      context,
      requestedModel: 'openai/gpt-5.6-terra',
      responseModel: 'gpt-4o',
      runId: 'run-1',
      source: 'agent',
      threadId: 'thread-1',
    });

    expect(actualModel).toBe('openai/gpt-4o');
    expect(loggerService.log).toHaveBeenCalledWith(
      'AgentTurnRoundRunnerService resolved agent response',
      expect.objectContaining({
        actualModel: 'openai/gpt-4o',
        organizationId: 'org-1',
        requestedModel: 'openai/gpt-5.6-terra',
        runId: 'run-1',
        threadId: 'thread-1',
      }),
    );
    expect(agentRunsService.mergeMetadata).toHaveBeenCalledWith(
      'run-1',
      'org-1',
      expect.objectContaining({
        actualModel: 'openai/gpt-4o',
        actualModels: ['openai/gpt-5.6-luna', 'openai/gpt-4o'],
        model: 'openai/gpt-4o',
        requestedModel: 'openai/gpt-5.6-terra',
      }),
    );
  });

  it('skips metadata merge when runId is absent', async () => {
    const actualModel = await service.recordAgentResponseModel({
      context: { organizationId: 'org-1', userId: 'user-1' },
      requestedModel: 'openai/gpt-5.6-terra',
      threadId: 'thread-1',
    });

    expect(actualModel).toBe('openai/gpt-5.6-terra');
    expect(agentRunsService.mergeMetadata).not.toHaveBeenCalled();
  });
});
