import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentTransferToolHandler } from '@api/services/agent-orchestrator/tools/agent-transfer-tool-handler.service';
import { describe, expect, it, vi } from 'vitest';

const context: ToolExecutionContext = {
  organizationId: 'org-1',
  threadId: 'source-thread',
  userId: 'user-1',
};

function makeHandler() {
  const create = vi.fn().mockResolvedValue({ id: 'tx-1' });
  const discoverConversations = vi.fn().mockResolvedValue([{ id: 'thread-2' }]);
  const transfersService = { create, discoverConversations };
  return {
    create,
    discoverConversations,
    handler: new AgentTransferToolHandler(transfersService),
  };
}

describe('AgentTransferToolHandler', () => {
  it('discovers destination conversations scoped to the source thread', async () => {
    const { discoverConversations, handler } = makeHandler();
    const result = await handler.listConversations(
      { query: 'growth' },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ conversations: [{ id: 'thread-2' }] });
    expect(discoverConversations).toHaveBeenCalledWith(
      { organizationId: 'org-1', userId: 'user-1' },
      'source-thread',
      'growth',
    );
  });

  it('fails discovery without a source conversation', async () => {
    const { discoverConversations, handler } = makeHandler();
    const result = await handler.listConversations(
      {},
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(result.success).toBe(false);
    expect(discoverConversations).not.toHaveBeenCalled();
  });

  it('delivers SEND without starting a run confirmation path', async () => {
    const { create, handler } = makeHandler();
    const result = await handler.transfer(
      {
        content: 'Send bounded context',
        deliveryMode: 'SEND',
        destinationThreadId: 'destination-thread',
        idempotencyKey: 'send-1',
      },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBeUndefined();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMode: 'SEND',
        explicitUserIntent: false,
        sourceThreadId: 'source-thread',
      }),
      { organizationId: 'org-1', userId: 'user-1' },
    );
  });

  it('turns an unconfirmed SEND_AND_RUN into a review card only', async () => {
    const { create, handler } = makeHandler();
    const result = await handler.transfer(
      {
        content: 'Ask the specialist to draft hooks',
        deliveryMode: 'SEND_AND_RUN',
        destinationThreadId: 'destination-thread',
        idempotencyKey: 'run-1',
      },
      context,
    );

    expect(result.requiresConfirmation).toBe(true);
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        id: 'agent-transfer:run-1',
        type: 'agent_transfer_card',
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('executes SEND_AND_RUN only with server confirmation proof', async () => {
    const { create, handler } = makeHandler();
    const confirmedContext: ToolExecutionContext = {
      ...context,
      confirmationOrigin: 'thread-ui-action',
      sourceActionId: 'agent-transfer:run-1',
    };
    await handler.transfer(
      {
        content: 'Ask the specialist to draft hooks',
        deliveryMode: 'SEND_AND_RUN',
        destinationThreadId: 'destination-thread',
        idempotencyKey: 'run-1',
      },
      confirmedContext,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        explicitUserIntent: true,
        sourceActionId: 'agent-transfer:run-1',
      }),
      { organizationId: 'org-1', userId: 'user-1' },
    );
  });

  it('fails a transfer missing required fields', async () => {
    const { create, handler } = makeHandler();
    const result = await handler.transfer({ content: '' }, context);

    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
