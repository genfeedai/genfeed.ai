import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { AgentTransferToolHandler } from '@api/services/agent-orchestrator/tools/agent-transfer-tool-handler.service';
import { describe, expect, it, vi } from 'vitest';

const context: ToolExecutionContext = {
  authToken: 'session-token',
  organizationId: 'org-1',
  threadId: 'source-thread',
  userId: 'user-1',
};

function makeHandler() {
  const callInternalApi = vi.fn().mockResolvedValue({ data: { id: 'tx-1' } });
  const internalApi = {
    callInternalApi,
  } as unknown as AgentToolInternalApiService;
  return {
    callInternalApi,
    handler: new AgentTransferToolHandler(internalApi),
  };
}

describe('AgentTransferToolHandler', () => {
  it('delivers SEND without starting a run confirmation path', async () => {
    const { callInternalApi, handler } = makeHandler();
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
    expect(callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/agent/transfers',
      expect.objectContaining({
        deliveryMode: 'SEND',
        explicitUserIntent: false,
        sourceThreadId: 'source-thread',
      }),
      context,
    );
  });

  it('turns an unconfirmed SEND_AND_RUN into a review card only', async () => {
    const { callInternalApi, handler } = makeHandler();
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
    expect(callInternalApi).not.toHaveBeenCalled();
  });

  it('executes SEND_AND_RUN only with server confirmation proof', async () => {
    const { callInternalApi, handler } = makeHandler();
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

    expect(callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/agent/transfers',
      expect.objectContaining({
        explicitUserIntent: true,
        sourceActionId: 'agent-transfer:run-1',
      }),
      confirmedContext,
    );
  });
});
