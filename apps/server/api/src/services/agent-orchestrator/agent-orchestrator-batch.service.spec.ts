import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { describe, expect, it, vi } from 'vitest';

describe('batch approval turn', () => {
  it('persists and returns the approval card without claiming generation completed', async () => {
    const card = {
      id: 'mutation-approval:apr-1',
      type: 'mutation_approval_card',
    };
    const messages = { addMessage: vi.fn() };
    const executor = {
      executeTool: vi
        .fn()
        .mockResolvedValue({
          success: true,
          creditsUsed: 0,
          requiresConfirmation: true,
          nextActions: [card],
          data: { status: 'pending' },
        }),
    };
    const recorder = {
      recordToolStarted: vi.fn(),
      recordToolCompleted: vi.fn(),
      recordAssistantFinalized: vi.fn(),
      recordRunCompleted: vi.fn(),
    };
    const stream = {
      publishStreamingToolStarted: vi.fn(),
      publishStreamingToolCompleted: vi.fn(),
      publishStreamDoneOnly: vi.fn(),
    };
    const service = new AgentOrchestratorBatchService(
      messages as never,
      {
        getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
      } as never,
      executor as never,
      {
        buildAssistantUiActions: vi.fn((input) => ({
          uiActions: input.uiActions,
          suggestedActions: [],
        })),
      } as never,
      recorder as never,
      stream as never,
    );
    await service.tryHandleBatchGenerationTurnStream(
      {
        context: { organizationId: 'org-1', userId: 'user-1' },
        model: 'test',
        policy: { brandId: 'brand-1' },
        requestContent: 'Generate 3 posts for twitter about launch',
        seedTitle: 'Batch',
        startedAt: new Date().toISOString(),
        threadId: 'thread-1',
      } as never,
      { maybeUpdateThreadTitle: vi.fn().mockResolvedValue(null) },
    );
    expect(executor.executeTool).toHaveBeenCalledWith(
      'generate_content_batch',
      expect.objectContaining({ count: 3 }),
      expect.objectContaining({ hostSupportsApproval: true }),
    );
    expect(messages.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Review the batch details and approve to start generation.',
        metadata: expect.objectContaining({
          uiActions: [card],
          reviewRequired: true,
        }),
      }),
    );
    expect(stream.publishStreamDoneOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Review the batch details and approve to start generation.',
        metadata: expect.objectContaining({ uiActions: [card] }),
      }),
    );
    expect(recorder.recordRunCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'Waiting for your approval' }),
    );
  });
});
