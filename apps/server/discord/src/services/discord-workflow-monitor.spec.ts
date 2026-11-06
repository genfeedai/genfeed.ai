import type { DiscordWorkflowExecutionClient } from '@discord/services/discord-workflow-execution.client';
import { monitorDiscordWorkflowExecution } from '@discord/services/discord-workflow-monitor';

type Execution = Awaited<
  ReturnType<DiscordWorkflowExecutionClient['waitForTerminal']>
>;

describe('monitorDiscordWorkflowExecution', () => {
  // What the Discord channel saw, whether the chat session survived, and
  // what was logged as an error.
  let sent: string[];
  let isSessionOpen: boolean;
  let errors: unknown[][];
  let polls: Array<[string, string]>;

  beforeEach(() => {
    sent = [];
    isSessionOpen = true;
    errors = [];
    polls = [];
  });

  function run(outcome: Execution | Error): Promise<void> {
    return monitorDiscordWorkflowExecution({
      deleteSession: () => {
        isSessionOpen = false;
      },
      executionClient: {
        waitForTerminal: async (orgId: string, executionId: string) => {
          polls.push([orgId, executionId]);
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      } as unknown as DiscordWorkflowExecutionClient,
      executionId: 'exec-1',
      logger: {
        error: (...args: unknown[]) => {
          errors.push(args);
        },
      },
      orgId: 'org-1',
      send: async (message: string) => {
        sent.push(message);
      },
    });
  }

  const execution = (fields: Record<string, unknown>) =>
    ({ nodeResults: [], ...fields }) as unknown as Execution;

  it('closes the session silently when the execution was cancelled', async () => {
    await run(execution({ status: 'cancelled' }));

    expect(polls).toEqual([['org-1', 'exec-1']]);
    expect(sent).toEqual([]);
    expect(isSessionOpen).toBe(false);
  });

  it('sends a classified failure without leaking the provider error', async () => {
    await run(
      execution({ error: 'HTTP 429 Bearer private-token', status: 'failed' }),
    );

    expect(sent).toEqual([
      'Provider rate limited\nThe model provider asked us to slow down.\nWait a moment, then retry the message.',
    ]);
    expect(isSessionOpen).toBe(false);
  });

  it('sends a generic failure when the execution failed without an error', async () => {
    await run(execution({ status: 'failed' }));

    expect(sent).toEqual([expect.stringContaining('Run failed')]);
    expect(isSessionOpen).toBe(false);
  });

  it.each([
    [
      'media with its caption',
      { caption: 'A panda', imageUrl: 'https://cdn/img.png' },
      'A panda\nhttps://cdn/img.png',
    ],
    [
      'media under a generated-type caption',
      { imageUrl: 'https://cdn/img.png' },
      'Generated image\nhttps://cdn/img.png',
    ],
    ['text as is', { text: 'Here is your copy' }, 'Here is your copy'],
  ])('sends %s and closes the session', async (_label, output, message) => {
    await run(execution({ nodeResults: [{ output }], status: 'completed' }));

    expect(sent).toEqual([message]);
    expect(isSessionOpen).toBe(false);
  });

  it('confirms completion when there are no outputs', async () => {
    await run(execution({ status: 'completed' }));

    expect(sent).toEqual(['Workflow completed successfully.']);
    expect(isSessionOpen).toBe(false);
  });

  it('keeps the session alive when polling times out', async () => {
    await run(new Error('Workflow execution polling timed out'));

    expect(sent).toEqual([
      'Workflow is still running. Use /status to check progress.',
    ]);
    expect(isSessionOpen).toBe(true);
    expect(errors).toEqual([]);
  });

  it('logs, reports and closes the session on an unexpected error', async () => {
    const boom = new Error('boom');

    await run(boom);

    expect(errors).toEqual([
      ['Failed while monitoring workflow execution:', boom],
    ]);
    expect(sent).toEqual([expect.stringContaining('Run failed')]);
    expect(isSessionOpen).toBe(false);
  });
});
