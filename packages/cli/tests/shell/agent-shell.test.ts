import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentThreadEvent } from '../../src/api/threads';

const mockLiveStream = {
  bind: vi.fn(),
  close: vi.fn(),
  drain: vi.fn(() => []),
  waitForActivity: vi.fn(async () => undefined),
  waitUntilReady: vi.fn(async () => undefined),
};

vi.mock('../../src/shell/agent-live-stream', () => ({
  openAgentLiveStream: vi.fn(async () => mockLiveStream),
}));

const mockQuestion = vi.fn<[], Promise<string>>();
const mockClose = vi.fn();

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    close: mockClose,
    question: () => mockQuestion(),
  }),
}));

vi.mock('chalk', () => {
  const identity = (text: string) => text;
  return {
    default: {
      blue: identity,
      bold: identity,
      cyan: identity,
      dim: identity,
      green: identity,
      hex: () => identity,
      red: identity,
      yellow: identity,
    },
  };
});

const mockRequireAuth = vi.fn();

vi.mock('../../src/api/client', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockArchiveThread = vi.fn();
const mockGetThread = vi.fn();
const mockGetThreadEvents = vi.fn();
const mockGetThreadSnapshot = vi.fn();
const mockListThreads = vi.fn();
const mockRespondToInputRequest = vi.fn();
const mockStartAgentChatStream = vi.fn();

vi.mock('../../src/api/threads', () => ({
  archiveThread: (...args: unknown[]) => mockArchiveThread(...args),
  getThread: (...args: unknown[]) => mockGetThread(...args),
  getThreadEvents: (...args: unknown[]) => mockGetThreadEvents(...args),
  getThreadSnapshot: (...args: unknown[]) => mockGetThreadSnapshot(...args),
  listThreads: (...args: unknown[]) => mockListThreads(...args),
  respondToInputRequest: (...args: unknown[]) => mockRespondToInputRequest(...args),
  startAgentChatStream: (...args: unknown[]) => mockStartAgentChatStream(...args),
}));

const mockClearLastAgentThreadId = vi.fn();
const mockGetLastAgentThreadId = vi.fn();
const mockGetOrganizationId = vi.fn();
const mockSetLastAgentThreadId = vi.fn();

vi.mock('../../src/config/store', () => ({
  clearLastAgentThreadId: (...args: unknown[]) => mockClearLastAgentThreadId(...args),
  getLastAgentThreadId: (...args: unknown[]) => mockGetLastAgentThreadId(...args),
  getOrganizationId: (...args: unknown[]) => mockGetOrganizationId(...args),
  setLastAgentThreadId: (...args: unknown[]) => mockSetLastAgentThreadId(...args),
}));

const mockSetReplMode = vi.fn();

vi.mock('../../src/utils/errors', () => ({
  setReplMode: (...args: unknown[]) => mockSetReplMode(...args),
}));

function makeEvent(
  type: string,
  sequence: number,
  payload?: Record<string, unknown>
): AgentThreadEvent {
  return {
    commandId: `cmd-${sequence}`,
    eventId: `evt-${sequence}`,
    payload,
    sequence,
    threadId: 'thread-1',
    type,
  };
}

function queueInputs(inputs: string[]): void {
  const queue = [...inputs];
  mockQuestion.mockImplementation(() => Promise.resolve(queue.shift() ?? '/exit'));
}

describe('shell/agent-shell', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  function stdoutText(): string {
    return stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockRequireAuth.mockResolvedValue('api-key');
    mockGetOrganizationId.mockResolvedValue('org-1');
    mockGetLastAgentThreadId.mockResolvedValue(undefined);
    mockSetLastAgentThreadId.mockResolvedValue(undefined);
    mockClearLastAgentThreadId.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  describe('runAgentShell', () => {
    it('handles slash commands, resumes a thread, and streams a full agent turn', async () => {
      queueInputs([
        '/help',
        '   ',
        '/threads',
        '/unknown',
        '/new',
        '/resume',
        '/resume thread-2',
        'hello world',
        '/exit',
      ]);
      mockListThreads.mockResolvedValue([
        {
          id: 'thread-a',
          lastAssistantPreview: 'preview text',
          status: 'active',
          title: 'Thread A',
        },
        { contextVersion: 1, id: 'thread-b' },
      ]);
      mockGetThread.mockResolvedValue({ brandId: 'brand-1', contextVersion: 2, id: 'thread-2' });
      mockGetThreadSnapshot.mockResolvedValue({
        lastAssistantMessage: { content: 'previous answer' },
        lastSequence: 5,
        pendingInputRequests: [],
        threadId: 'thread-2',
        timeline: [],
        title: 'My thread',
      });
      mockStartAgentChatStream.mockResolvedValue({
        brandId: 'brand-1',
        contextVersion: 3,
        runId: 'run-1',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-2',
      });
      mockGetThreadEvents.mockResolvedValueOnce([]).mockResolvedValueOnce([
        makeEvent('assistant.delta', 6, { content: 'Hi ' }),
        makeEvent('assistant.delta', 7, { content: 'there' }),
        makeEvent('assistant.delta', 8, {}),
        makeEvent('tool.started', 9, { toolName: 'generate_image' }),
        makeEvent('tool.completed', 10, {
          error: 'quota hit',
          status: 'failed',
          toolName: 'generate_image',
        }),
        makeEvent('tool.completed', 11, {}),
        makeEvent('some.unknown.event', 12, {}),
        makeEvent('assistant.finalized', 13, {
          content: 'Hi there',
          metadata: {
            uiActions: [
              {
                description: 'Open the workflow',
                title: 'Workflow',
                type: 'workflow_card',
                workflowId: 'wf-1',
              },
              { botId: 'bot-1', type: 'bot_card' },
              { type: 'credits_balance_card' },
              { title: 42, type: 42 },
            ],
          },
        }),
        makeEvent('run.completed', 14, {}),
      ]);

      const { runAgentShell } = await import('../../src/shell/agent-shell');
      await runAgentShell();

      expect(mockRequireAuth).toHaveBeenCalled();
      expect(mockSetReplMode).toHaveBeenNthCalledWith(1, true);
      expect(mockSetReplMode).toHaveBeenLastCalledWith(false);
      expect(mockClose).toHaveBeenCalled();
      expect(mockListThreads).toHaveBeenCalled();
      expect(mockClearLastAgentThreadId).toHaveBeenCalledWith('org-1');
      expect(mockSetLastAgentThreadId).toHaveBeenCalledWith('thread-2', 'org-1');
      expect(mockStartAgentChatStream).toHaveBeenCalledWith({
        brandId: 'brand-1',
        content: 'hello world',
        expectedContextVersion: 2,
        model: undefined,
        source: 'agent',
        threadId: 'thread-2',
      });

      const output = stdoutText();
      expect(output).toContain('Agent Shell');
      expect(output).toContain('Unknown slash command: /unknown');
      expect(output).toContain('Next message will start a new thread.');
      expect(output).toContain('Usage: /resume <threadId>');
      expect(output).toContain('Resumed thread: thread-2');
      expect(output).toContain('Continuing thread thread-2');
      expect(output).toContain('Hi there');
      expect(output).toContain('[tool:start] generate_image');
      expect(output).toContain('[tool:failed] generate_image - quota hit');
      expect(output).toContain('[tool:completed] unknown_tool');
      expect(output).toContain('UI Actions');
      expect(output).toContain('Try: gf workflow show wf-1');
      expect(output).toContain('Try: gf chat --thread thread-2');
      expect(output).toContain('Try: gf credits summary');
      expect(output).toContain('Run completed.');
      expect(output).toContain('Goodbye!');
    });

    it('shows an empty threads list and starts a new thread on the first message', async () => {
      queueInputs(['/threads', 'make a post', 'another', '/quit']);
      mockListThreads.mockResolvedValue([]);
      mockStartAgentChatStream
        .mockResolvedValueOnce({
          brandId: undefined,
          contextVersion: 1,
          runId: 'run-1',
          startedAt: '2026-08-09T00:00:00.000Z',
          threadId: 'thread-new',
        })
        .mockResolvedValueOnce({
          brandId: undefined,
          contextVersion: 2,
          runId: 'run-2',
          startedAt: '2026-08-09T00:01:00.000Z',
          threadId: 'thread-new',
        });
      mockGetThreadEvents
        .mockResolvedValueOnce([
          makeEvent('assistant.finalized', 1, { content: 'Done', metadata: 'not-a-record' }),
          makeEvent('run.completed', 2, {}),
        ])
        .mockResolvedValueOnce([
          makeEvent('assistant.delta', 3, { content: 'streaming' }),
          makeEvent('run.completed', 4, {}),
        ]);

      const { runAgentShell } = await import('../../src/shell/agent-shell');
      await runAgentShell();

      const output = stdoutText();
      expect(output).toContain('No threads found.');
      expect(output).toContain('Active thread: thread-new');
      expect(output).toContain('Done');
      expect(output).toContain('streaming');
      expect(mockStartAgentChatStream).toHaveBeenNthCalledWith(1, {
        brandId: null,
        content: 'make a post',
        expectedContextVersion: undefined,
        model: undefined,
        source: 'agent',
        threadId: undefined,
      });
    });

    it('restores a pending input request and submits answers', async () => {
      queueInputs(['a', 'no', '/exit']);
      mockGetThread.mockResolvedValue({ brandId: null, contextVersion: 1, id: 'thread-9' });
      mockGetThreadSnapshot.mockResolvedValue({
        lastSequence: 2,
        pendingInputRequests: [
          {
            options: [
              { description: 'first option', id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
            ],
            prompt: 'Pick one',
            recommendedOptionId: 'a',
            requestId: 'req-1',
            title: 'Choose',
          },
        ],
        threadId: 'thread-9',
        timeline: [],
      });
      mockRespondToInputRequest.mockResolvedValue({});
      mockGetThreadEvents
        .mockResolvedValueOnce([
          makeEvent('assistant.delta', 3, { content: 'ok' }),
          makeEvent('input.requested', 4, {
            prompt: 'Need more?',
            requestId: 'req-2',
            title: 'Follow-up',
          }),
        ])
        .mockResolvedValueOnce([makeEvent('run.failed', 5, { error: 'boom' })]);

      const { runAgentShell } = await import('../../src/shell/agent-shell');
      await runAgentShell({ initialThreadId: 'thread-9', model: 'gpt-5' });

      expect(mockRespondToInputRequest).toHaveBeenNthCalledWith(1, 'thread-9', 'req-1', 'a', {
        brandId: null,
        expectedContextVersion: 1,
      });
      expect(mockRespondToInputRequest).toHaveBeenNthCalledWith(2, 'thread-9', 'req-2', 'no', {
        brandId: null,
        expectedContextVersion: 1,
      });

      const output = stdoutText();
      expect(output).toContain('Using agent model: gpt-5');
      expect(output).toContain('Choose');
      expect(output).toContain('a A (recommended)');
      expect(output).toContain('first option');
      expect(output).toContain('Follow-up');
      expect(output).toContain('Input submitted.');
      expect(output).toContain('boom');
    });

    it('recovers when the persisted thread cannot be restored', async () => {
      queueInputs(['/exit']);
      mockGetLastAgentThreadId.mockResolvedValue('stale-thread');
      mockGetThread.mockRejectedValue(new Error('gone'));
      mockGetThreadSnapshot.mockRejectedValue(new Error('gone'));

      const { runAgentShell } = await import('../../src/shell/agent-shell');
      await runAgentShell();

      const output = stdoutText();
      expect(output).toContain('Could not restore thread stale-thread');
      expect(output).toContain('Goodbye!');
    });
  });

  describe('showThreadSummary', () => {
    it('prints full thread details with pending input', async () => {
      mockGetThread.mockResolvedValue({
        id: 'thread-1',
        lastActivityAt: '2026-08-09T00:00:00.000Z',
        runStatus: 'running',
        source: 'cli',
        status: 'active',
        title: 'My thread',
      });
      mockGetThreadSnapshot.mockResolvedValue({
        lastAssistantMessage: { content: 'the answer' },
        lastSequence: 3,
        pendingInputRequests: [{ prompt: 'Pick', requestId: 'req-1', title: 'Choose' }],
        threadId: 'thread-1',
        timeline: [],
      });

      const { showThreadSummary } = await import('../../src/shell/agent-shell');
      await showThreadSummary('thread-1');

      const output = stdoutText();
      expect(output).toContain('ID: thread-1');
      expect(output).toContain('Status: active');
      expect(output).toContain('Source: cli');
      expect(output).toContain('Run status: running');
      expect(output).toContain('Title: My thread');
      expect(output).toContain('Last Assistant Message');
      expect(output).toContain('the answer');
      expect(output).toContain('Pending Input');
      expect(output).toContain('Choose');
    });

    it('falls back to defaults for a minimal thread', async () => {
      mockGetThread.mockResolvedValue({ id: 'thread-2' });
      mockGetThreadSnapshot.mockResolvedValue({
        lastSequence: 0,
        pendingInputRequests: [],
        threadId: 'thread-2',
        timeline: [],
      });

      const { showThreadSummary } = await import('../../src/shell/agent-shell');
      await showThreadSummary('thread-2');

      const output = stdoutText();
      expect(output).toContain('Status: unknown');
      expect(output).toContain('Source: unknown');
      expect(output).toContain('Run status: idle');
      expect(output).not.toContain('Pending Input');
    });
  });

  describe('archiveThreadAndPrint', () => {
    it('archives and clears the persisted thread when it matches', async () => {
      mockArchiveThread.mockResolvedValue({ id: 'thread-1' });
      mockGetLastAgentThreadId.mockResolvedValue('thread-1');

      const { archiveThreadAndPrint } = await import('../../src/shell/agent-shell');
      await archiveThreadAndPrint('thread-1');

      expect(mockArchiveThread).toHaveBeenCalledWith('thread-1');
      expect(mockClearLastAgentThreadId).toHaveBeenCalledWith('org-1');
      expect(stdoutText()).toContain('Archived thread thread-1');
    });

    it('keeps the persisted thread when a different thread is archived', async () => {
      mockArchiveThread.mockResolvedValue({ id: 'thread-2' });
      mockGetLastAgentThreadId.mockResolvedValue('thread-1');

      const { archiveThreadAndPrint } = await import('../../src/shell/agent-shell');
      await archiveThreadAndPrint('thread-2');

      expect(mockClearLastAgentThreadId).not.toHaveBeenCalled();
      expect(stdoutText()).toContain('Archived thread thread-2');
    });
  });
});
