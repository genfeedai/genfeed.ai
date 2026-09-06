import type { DiscordWorkflowExecutionClient } from '@discord/services/discord-workflow-execution.client';
import { monitorDiscordWorkflowExecution } from '@discord/services/discord-workflow-monitor';
import type { Mock } from 'vitest';

interface MonitorMocks {
  deleteSession: Mock<() => void>;
  logger: { error: Mock<(...args: unknown[]) => void> };
  send: Mock<(message: string) => Promise<unknown>>;
  waitForTerminal: ReturnType<typeof vi.fn>;
}

function createMocks(): MonitorMocks {
  return {
    deleteSession: vi.fn<() => void>(),
    logger: { error: vi.fn<(...args: unknown[]) => void>() },
    send: vi
      .fn<(message: string) => Promise<unknown>>()
      .mockResolvedValue(undefined),
    waitForTerminal: vi.fn(),
  };
}

function runMonitor(mocks: MonitorMocks): Promise<void> {
  const executionClient = {
    waitForTerminal: mocks.waitForTerminal,
  } as unknown as DiscordWorkflowExecutionClient;

  return monitorDiscordWorkflowExecution({
    deleteSession: mocks.deleteSession,
    executionClient,
    executionId: 'exec-1',
    logger: mocks.logger,
    orgId: 'org-1',
    send: mocks.send,
  });
}

describe('monitorDiscordWorkflowExecution', () => {
  it('should delete the session silently when execution is cancelled', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockResolvedValue({
      nodeResults: [],
      status: 'cancelled',
    });

    await runMonitor(mocks);

    expect(mocks.deleteSession).toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('should send the execution error when execution failed', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockResolvedValue({
      error: 'HTTP 429 Bearer private-token',
      nodeResults: [],
      status: 'failed',
    });

    await runMonitor(mocks);

    expect(mocks.send).toHaveBeenCalledWith(
      'Provider rate limited\nThe model provider asked us to slow down.\nWait a moment, then retry the message.',
    );
    expect(mocks.send.mock.calls[0][0]).not.toContain('private-token');
    expect(mocks.deleteSession).toHaveBeenCalled();
  });

  it('should send a fallback message when execution failed without error', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockResolvedValue({
      nodeResults: [],
      status: 'failed',
    });

    await runMonitor(mocks);

    expect(mocks.send).toHaveBeenCalledWith(
      expect.stringContaining('Run failed'),
    );
    expect(mocks.deleteSession).toHaveBeenCalled();
  });

  it('should send media outputs with caption and url', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockResolvedValue({
      nodeResults: [
        {
          output: { caption: 'A panda', imageUrl: 'https://cdn/img.png' },
        },
      ],
      status: 'completed',
    });

    await runMonitor(mocks);

    expect(mocks.send).toHaveBeenCalledWith('A panda\nhttps://cdn/img.png');
    expect(mocks.deleteSession).toHaveBeenCalled();
  });

  it('should send a generated-type caption when the output has none', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockResolvedValue({
      nodeResults: [{ output: { imageUrl: 'https://cdn/img.png' } }],
      status: 'completed',
    });

    await runMonitor(mocks);

    expect(mocks.send).toHaveBeenCalledWith(
      'Generated image\nhttps://cdn/img.png',
    );
  });

  it('should send text outputs directly', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockResolvedValue({
      nodeResults: [{ output: { text: 'Here is your copy' } }],
      status: 'completed',
    });

    await runMonitor(mocks);

    expect(mocks.send).toHaveBeenCalledWith('Here is your copy');
    expect(mocks.deleteSession).toHaveBeenCalled();
  });

  it('should send a completion message when there are no outputs', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockResolvedValue({
      nodeResults: [],
      status: 'completed',
    });

    await runMonitor(mocks);

    expect(mocks.send).toHaveBeenCalledWith('Workflow completed successfully.');
    expect(mocks.deleteSession).toHaveBeenCalled();
  });

  it('should keep the session alive on polling timeout', async () => {
    const mocks = createMocks();
    mocks.waitForTerminal.mockRejectedValue(
      new Error('Workflow execution polling timed out'),
    );

    await runMonitor(mocks);

    expect(mocks.send).toHaveBeenCalledWith(
      'Workflow is still running. Use /status to check progress.',
    );
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('should log and clean up on unexpected errors', async () => {
    const mocks = createMocks();
    const error = new Error('boom');
    mocks.waitForTerminal.mockRejectedValue(error);

    await runMonitor(mocks);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed while monitoring workflow execution:',
      error,
    );
    expect(mocks.send).toHaveBeenCalledWith(
      expect.stringContaining('Run failed'),
    );
    expect(mocks.deleteSession).toHaveBeenCalled();
  });
});
