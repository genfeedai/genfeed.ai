import { AgentOrchestratorUiActionConfirmedToolService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-confirmed-tool.service';
import { AgentToolName } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';

describe('AgentOrchestratorUiActionConfirmedToolService', () => {
  it('passes only image-supported parameters into the generate_image action', async () => {
    const executeTool = vi.fn().mockResolvedValue({
      creditsUsed: 0,
      nextActions: [],
      success: true,
    });
    const finalizeStructuredAssistantTurn = vi
      .fn()
      .mockResolvedValue({ threadId: 'thread-1' });
    const service = new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      {
        recordToolCompleted: vi.fn(),
        recordToolStarted: vi.fn(),
      } as never,
      { finalizeStructuredAssistantTurn } as never,
      {
        acquireLock: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue(null),
        releaseLock: vi.fn(),
        set: vi.fn(),
      } as never,
    );

    await service.execute('confirm_generate_media', {
      context: {
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      model: 'test/model',
      payload: {
        aspectRatio: '1:1',
        duration: 8,
        endFrame: 'end-frame-1',
        generationType: 'image',
        outputs: 1,
        prompt: 'A red apple on a white background',
        references: ['reference-1'],
        resolution: '1080p',
        sourceActionId: 'generation-action-1',
        videoReferences: ['video-1'],
      },
      threadId: 'thread-1',
    });

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.GENERATE_IMAGE,
      {
        aspectRatio: '1:1',
        outputs: 1,
        prompt: 'A red apple on a white background',
        references: ['reference-1'],
      },
      expect.objectContaining({
        organizationId: 'organization-1',
        sourceActionId: 'generation-action-1',
        userId: 'user-1',
      }),
    );
  });

  it('passes the server-set confirmation origin into install_official_workflow (#4306)', async () => {
    const executeTool = vi.fn().mockResolvedValue({
      creditsUsed: 0,
      nextActions: [],
      success: true,
    });
    const finalizeStructuredAssistantTurn = vi
      .fn()
      .mockResolvedValue({ threadId: 'thread-1' });
    const service = new AgentOrchestratorUiActionConfirmedToolService(
      { executeTool } as never,
      {
        recordToolCompleted: vi.fn(),
        recordToolStarted: vi.fn(),
      } as never,
      { finalizeStructuredAssistantTurn } as never,
      {
        acquireLock: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue(null),
        releaseLock: vi.fn(),
        set: vi.fn(),
      } as never,
    );

    await service.execute('confirm_install_official_workflow', {
      context: {
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      model: 'test/model',
      payload: {
        sourceActionId: 'install-action-1',
        workflowId: 'workflow-1',
      },
      threadId: 'thread-1',
    });

    expect(executeTool).toHaveBeenCalledWith(
      AgentToolName.INSTALL_OFFICIAL_WORKFLOW,
      expect.objectContaining({ workflowId: 'workflow-1' }),
      expect.objectContaining({
        confirmationOrigin: 'thread-ui-action',
        sourceActionId: 'install-action-1',
      }),
    );
  });
});
