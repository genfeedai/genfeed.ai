import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentInputRequestOverlay } from '@genfeedai/agent/components/AgentInputRequestOverlay';
import { AgentThreadListRow } from '@genfeedai/agent/components/AgentThreadListRow';
import { TimelineStreamingRow } from '@genfeedai/agent/components/TimelineStreamingRow';
import { resetAgentStreamRuntime } from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { useAgentChatStream } from '@genfeedai/agent/hooks/use-agent-chat-stream';
import { useComposerFollowUpQueue } from '@genfeedai/agent/hooks/use-composer-follow-up-queue';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadMode, AgentThreadStatus } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import agentMessages from '../../../../apps/app/messages/en/agent.json';
import uiMessages from '../../../../apps/app/messages/en/ui.json';

vi.mock('@hooks/data/generation/use-generation-harness-settings', () => ({
  useGenerationHarnessSettings: vi.fn(),
}));

vi.mock('@genfeedai/helpers', async () => {
  const { cn } = await import('@genfeedai/helpers/formatting/cn/cn.util');
  return { cn };
});

const transport = vi.hoisted(() => {
  const handlers = new Map<string, (data: unknown) => void>();
  const manager = {};
  return {
    handlers,
    manager,
    subscribe: (event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
      return () => {
        handlers.delete(event);
      };
    },
  };
});
vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: 'connected',
    isReady: true,
    subscribe: transport.subscribe,
    getSocketManager: () => transport.manager,
  }),
}));
vi.mock('@ui/navigation/prefetch/useNavigationPrefetch', () => ({
  useNavigationPrefetch: () => () => {},
}));
const noop = () => {};
const dispatches: string[] = [];
const apiService = {
  chatStream: vi.fn(async (input: { threadId: string; content: string }) => {
    dispatches.push(`${input.threadId}:${input.content}`);
    return {
      threadId: input.threadId,
      executionId: `${input.threadId}-${dispatches.length}`,
      queuedAt: new Date().toISOString(),
      contextVersion: 1,
    };
  }),
} as unknown as AgentApiService;
function LayoutConsumer() {
  useAgentChatStream({ apiService });
  return null;
}
function Fixture() {
  const stream = useAgentChatStream({ apiService });
  const threadId = useAgentChatStore((state) => state.activeThreadId);
  const state = useAgentChatStore();
  const queue = useComposerFollowUpQueue({
    threadId,
    isBusy: stream.isStreaming,
    canAutoDispatch:
      !stream.isStreaming && state.activeRunStatus === 'completed',
    onDispatch: async (item) => {
      await stream.sendMessage(item.content);
      return true;
    },
    onInterrupt: () => true,
  });
  return (
    <main>
      <LayoutConsumer />
      <h1>Concurrent conversations</h1>
      <Button onClick={() => useAgentChatStore.getState().setActiveThread('a')}>
        Open A
      </Button>
      <Button onClick={() => useAgentChatStore.getState().setActiveThread('b')}>
        Open B
      </Button>
      <p data-testid="thread">{threadId}</p>
      <AgentChatInputToolbar
        agentMode={AgentThreadMode.MANUAL}
        generationMode="auto"
        promptText=""
        hasEditor
        canSendMessage
        disabled={false}
        isListening={false}
        isTranscribing={false}
        isUploading={false}
        onAgentModeChange={noop}
        onGenerationModeChange={noop}
        onInsertReference={noop}
        onSend={() => {
          if (stream.isStreaming) queue.enqueue('Follow-up');
          else void stream.sendMessage('Start');
        }}
        onStartListening={noop}
        onStop={noop}
        onStopListening={noop}
        shouldShowSendButton
        shouldShowVoiceInput={false}
        showStop={stream.isStreaming}
        willQueueFollowUp={stream.isStreaming}
      />
      <p data-testid="progress">{state.stream.streamingContent}</p>
      <p data-testid="run-status">
        {stream.isStreaming ? 'WORKING' : state.activeRunStatus}
      </p>
      <TimelineStreamingRow
        entry={{
          kind: 'streaming',
          id: 'stream',
          createdAt: '',
          runDurationLabel: null,
          streamState: state.stream,
          workEvents: state.workEvents,
        }}
      />
      {state.pendingInputRequest && (
        <AgentInputRequestOverlay
          request={state.pendingInputRequest}
          onSubmit={async () => {
            const request = state.pendingInputRequest;
            if (!request) return;
            state.clearPendingInputRequest(request.inputRequestId);
            const handoff = stream.beginRunHandoff(request.threadId);
            await Promise.resolve();
            stream.adoptRun(
              handoff,
              'continued-input',
              new Date().toISOString(),
            );
          }}
        />
      )}
      <div data-testid="messages">
        {state.messages.map((message) => (
          <p key={message.id}>{message.content}</p>
        ))}
      </div>
      {state.threads.map((thread) => (
        <div key={thread.id} data-testid={`sidebar-${thread.id}`}>
          <AgentThreadListRow
            conv={thread}
            activeThreadId={threadId}
            activeRunStatus={state.activeRunStatus}
            isStreaming={stream.isStreaming}
            threadUiBusyById={{}}
            openMenuThreadId={null}
            renamingThreadId={null}
            renameDraft=""
            renameInputRef={{ current: null }}
            isArchivedView={false}
            usesProgrammaticNavigation
            getThreadHref={() => '#'}
            onContextMenu={noop}
            onSelect={(selected) => state.setActiveThread(selected.id)}
            onMenuOpenChange={noop}
            onMenuButtonRef={noop}
            onRenameDraftChange={noop}
            onSubmitRename={noop}
            onCancelRename={noop}
            onTogglePinned={noop}
            onForkThread={noop}
            onStartRename={noop}
            onArchive={noop}
            onUnarchive={noop}
            onPrefetch={noop}
            onCancelPrefetch={noop}
          />
        </div>
      ))}
    </main>
  );
}
function emit(
  event: string,
  threadId: string,
  runId: string,
  data: Record<string, unknown>,
) {
  transport.handlers.get(event)?.({ threadId, runId, ...data });
}
afterEach(() => resetAgentStreamRuntime());
it('keeps A and B live through navigation and drains B once after completion in Chromium', async () => {
  resetAgentStreamRuntime();
  dispatches.length = 0;
  useAgentChatStore.getState().resetActiveConversationState();
  useAgentChatStore.setState({
    activeThreadId: 'a',
    threads: ['a', 'b'].map((id) => ({
      id,
      title: id,
      status: AgentThreadStatus.ACTIVE,
      contextVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  });
  await render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agent: agentMessages, ui: uiMessages }}
    >
      <Fixture />
    </NextIntlClientProvider>,
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  emit('agent:token', 'a', 'a-1', { token: 'Alpha progress' });
  await expect
    .element(page.getByTestId('progress'))
    .toHaveTextContent('Alpha progress');
  await page.getByRole('button', { name: 'Open B' }).click();
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Queue follow-up' }).click();
  emit('agent:token', 'a', 'a-1', { token: ' continues' });
  emit('agent:token', 'b', 'b-2', { token: 'Beta progress' });
  await expect
    .element(page.getByTestId('progress'))
    .toHaveTextContent('Beta progress');
  await page.getByRole('button', { name: 'Open A' }).click();
  await expect
    .element(page.getByTestId('progress'))
    .toHaveTextContent('Alpha progress continues');
  await page.getByRole('button', { name: 'Open B' }).click();
  await expect
    .element(page.getByRole('button', { name: 'Stop agent' }))
    .toBeVisible();
  await expect
    .element(page.getByText('Working…', { exact: true }))
    .toBeVisible();
  await page.screenshot({ path: 'multistream-b-progress.png' });
  emit('agent:done', 'b', 'b-2', {
    fullContent: 'Beta complete',
    toolCalls: [],
    creditsRemaining: 10,
  });
  await expect
    .poll(() => dispatches.filter((item) => item === 'b:Follow-up').length)
    .toBe(1);
  emit('agent:done', 'b', 'b-3', {
    fullContent: 'Follow-up complete',
    toolCalls: [],
    creditsRemaining: 9,
  });
  await expect
    .element(page.getByTestId('run-status'))
    .toHaveTextContent('completed');
  await expect
    .element(page.getByRole('button', { name: 'Stop agent', exact: true }))
    .not.toBeInTheDocument();
  emit('agent:done', 'a', 'a-1', {
    fullContent: 'Alpha complete',
    toolCalls: [],
    creditsRemaining: 8,
  });
  await expect
    .element(page.getByTestId('sidebar-a'))
    .toMatchTextContent(/Alpha complete/);
  await expect
    .element(
      page.getByTestId('sidebar-a').getByRole('status', { name: 'Running' }),
    )
    .not.toBeInTheDocument();
  await expect
    .element(page.getByTestId('messages'))
    .toMatchTextContent(/Follow-up complete/);
  await expect
    .element(page.getByTestId('messages'))
    .not.toMatchTextContent(/Alpha complete/);
  expect(dispatches.filter((item) => item === 'b:Follow-up')).toHaveLength(1);
  await expect
    .element(page.getByText('Working…', { exact: true }))
    .not.toBeInTheDocument();
  await page.screenshot({ path: 'multistream-b-completed.png' });
  await page.getByRole('button', { name: 'Send message' }).click();
  emit('agent:input_request', 'b', 'b-4', {
    inputRequestId: 'choice',
    title: 'Choose direction',
    prompt: 'Choose a direction',
    options: [{ id: 'yes', label: 'Continue', value: 'yes' }],
    allowFreeText: true,
    timestamp: new Date().toISOString(),
  });
  await expect
    .element(
      page.getByRole('heading', { name: 'Choose direction', exact: true }),
    )
    .toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();
  emit('agent:done', 'b', 'continued-input', {
    fullContent: 'Input continuation complete',
    toolCalls: [],
    creditsRemaining: 7,
  });
  await expect
    .element(page.getByTestId('messages'))
    .toMatchTextContent(/Input continuation complete/);
  await expect
    .element(
      page.getByRole('heading', { name: 'Choose direction', exact: true }),
    )
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Stop agent' }))
    .not.toBeInTheDocument();
  await page.screenshot({ path: 'multistream-input-completed.png' });
});
