import type { PreparedAgentTurnState } from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { persistComposerGenerationSource } from '@api/services/agent-orchestrator/persist-composer-generation-source';
import { describe, expect, it, vi } from 'vitest';

describe('persistComposerGenerationSource', () => {
  const state: PreparedAgentTurnState = {
    executionId: 'execution',
    organizationId: 'org',
    userId: 'user',
    threadId: 'thread',
    request: {
      content: 'A coast',
      threadId: 'thread',
      requestedSkillSlugs: ['cinema'],
    },
  };
  it('checks the owned active thread and retries with the same idempotent message id', async () => {
    const findOne = vi
      .fn()
      .mockResolvedValue({ brandId: 'brand', contextVersion: 2 });
    const addMessage = vi.fn().mockResolvedValue({});
    await persistComposerGenerationSource(
      state,
      'video',
      { findOne } as never,
      { addMessage } as never,
    );
    await persistComposerGenerationSource(
      state,
      'video',
      { findOne } as never,
      { addMessage } as never,
    );
    expect(findOne).toHaveBeenCalledWith({
      id: 'thread',
      organizationId: 'org',
      userId: 'user',
      isDeleted: false,
      status: 'active',
    });
    expect(addMessage.mock.calls[0][0].id).toBe(addMessage.mock.calls[1][0].id);
    expect(addMessage.mock.calls[0][0].id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(addMessage.mock.calls[0][0].metadata.uiActions[0]).toMatchObject({
      generationType: 'video',
      generationParams: { prompt: 'A coast', requestedSkillSlugs: ['cinema'] },
      data: { decision: 'pending', brandId: 'brand', scopeVersion: 2 },
    });
  });
  it('blocks absent/foreign/inactive thread sources', async () => {
    const addMessage = vi.fn();
    await expect(
      persistComposerGenerationSource(
        state,
        'image',
        { findOne: vi.fn().mockResolvedValue(null) } as never,
        { addMessage } as never,
      ),
    ).rejects.toThrow();
    expect(addMessage).not.toHaveBeenCalled();
  });
  it('propagates source persistence failure before returning a dispatch identity', async () => {
    await expect(
      persistComposerGenerationSource(
        state,
        'image',
        { findOne: vi.fn().mockResolvedValue({ contextVersion: 1 }) } as never,
        {
          addMessage: vi.fn().mockRejectedValue(new Error('storage failed')),
        } as never,
      ),
    ).rejects.toThrow('storage failed');
  });
});
