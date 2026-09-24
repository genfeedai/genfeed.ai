import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { describe, expect, it, vi } from 'vitest';

type PrepareHandlerCtor = ConstructorParameters<typeof AgentPrepareToolHandler>;

const ctx = {
  organizationId: 'org-1',
  threadId: 'thread-1',
  userId: 'user-1',
} as ToolExecutionContext;

function createHandler(
  getRecentMessages?: ReturnType<typeof vi.fn>,
): AgentPrepareToolHandler {
  const messagesService = {
    getRecentMessages: getRecentMessages ?? vi.fn().mockResolvedValue([]),
  };

  return new AgentPrepareToolHandler(
    {} as PrepareHandlerCtor[0],
    {} as PrepareHandlerCtor[1],
    undefined,
    undefined,
    undefined,
    messagesService as unknown as AgentMessagesService,
  );
}

describe('AgentPrepareToolHandler.prepareGeneration', () => {
  it('preserves normalized selections and enhancement override on the review card', async () => {
    const result = await createHandler().prepareGeneration(
      {
        generationType: 'video',
        prompt: 'A coast',
        requestedSkillSlugs: ['Cinema'],
        harness: false,
      },
      ctx,
    );
    expect(result.nextActions?.[0].generationParams).toMatchObject({
      requestedSkillSlugs: ['cinema'],
      harness: false,
    });
    await expect(
      createHandler().prepareGeneration(
        {
          generationType: 'image',
          prompt: 'A coast',
          requestedSkillSlugs: ['bad_slug'],
        },
        ctx,
      ),
    ).rejects.toThrow();
  });

  it('prepares the first generate in a thread', async () => {
    const result = await createHandler().prepareGeneration(
      {
        generationType: 'image',
        prompt: 'A red apple on a table',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        generationType: 'image',
        title: 'Generate Image',
        type: 'generation_action_card',
      }),
    );
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        generationParams: expect.not.objectContaining({ useIdentity: true }),
      }),
    );
  });

  it('marks a generation card when the source used brand identity', async () => {
    const result = await createHandler().prepareGeneration(
      {
        generationType: 'video',
        prompt: 'Say this as the brand identity',
        useIdentity: true,
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        generationParams: expect.objectContaining({ useIdentity: true }),
        generationType: 'video',
        type: 'generation_action_card',
      }),
    );
  });

  it('refuses video in an image conversation', async () => {
    const getRecentMessages = vi.fn().mockResolvedValue([
      {
        metadata: {
          uiActions: [
            {
              generationType: 'image',
              id: 'generation-image',
              type: 'generation_action_card',
            },
          ],
        },
      },
    ]);

    const result = await createHandler(getRecentMessages).prepareGeneration(
      {
        generationType: 'video',
        prompt: 'A red apple on a table',
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'This conversation is for image generation. Start a new chat to generate video.',
    );
    expect(result.nextActions).toBeUndefined();
  });
});
