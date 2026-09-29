import { AgentThreadListRow } from '@genfeedai/agent/components/AgentThreadListRow';
import { resetAgentStreamRuntime } from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { useAgentThreadStatusPush } from '@genfeedai/agent/hooks/use-agent-thread-status-push';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { AGENT_THREAD_STATUS_EVENT_TYPE } from '@genfeedai/contracts/constants';
import type { AgentThreadStatusEvent } from '@genfeedai/contracts/interfaces';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import agentMessages from '../../../../apps/app/messages/en/agent.json';
import uiMessages from '../../../../apps/app/messages/en/ui.json';

vi.mock('@genfeedai/helpers', async () => {
  const { cn } = await import('@genfeedai/helpers/formatting/cn/cn.util');
  return { cn };
});

const transport = vi.hoisted(() => {
  const handlers = new Map<string, (data: unknown) => void>();
  return {
    handlers,
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
  }),
}));
vi.mock('@ui/navigation/prefetch/useNavigationPrefetch', () => ({
  useNavigationPrefetch: () => () => {},
}));

const noop = () => {};

function Sidebar() {
  useAgentThreadStatusPush({
    isActive: true,
    reloadThreads: () => Promise.resolve(true),
  });
  const threads = useAgentChatStore((state) => state.threads);
  return (
    <main>
      <h1>Sidebar</h1>
      {threads.map((thread) => (
        <div key={thread.id} data-testid={`sidebar-${thread.id}`}>
          <AgentThreadListRow
            conv={thread}
            activeThreadId={null}
            threadUiBusyById={{}}
            openMenuThreadId={null}
            renamingThreadId={null}
            renameDraft=""
            renameInputRef={{ current: null }}
            isArchivedView={false}
            usesProgrammaticNavigation
            getThreadHref={() => '#'}
            onContextMenu={noop}
            onSelect={noop}
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

function pushStatus(overrides: Partial<AgentThreadStatusEvent>) {
  transport.handlers.get(AGENT_THREAD_STATUS_EVENT_TYPE)?.({
    organizationId: 'org-1',
    pendingInputCount: 0,
    runStatus: 'running',
    runtimeState: 'running',
    sequence: 1,
    threadId: 'a',
    timestamp: new Date().toISOString(),
    userId: 'user-1',
    ...overrides,
  });
}

afterEach(() => resetAgentStreamRuntime());

it('shows a run started by a second client under Working and clears it, within 2 seconds, in Chromium', async () => {
  resetAgentStreamRuntime();
  useAgentChatStore.getState().resetActiveConversationState();
  useAgentChatStore.setState({
    activeThreadId: null,
    threads: ['a', 'b'].map((id) => ({
      contextVersion: 1,
      createdAt: new Date().toISOString(),
      id,
      status: AgentThreadStatus.ACTIVE,
      title: `Thread ${id}`,
      updatedAt: new Date().toISOString(),
    })),
  });
  await render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agent: agentMessages, ui: uiMessages }}
    >
      <Sidebar />
    </NextIntlClientProvider>,
  );
  const running = () =>
    page.getByTestId('sidebar-a').getByRole('status', { name: 'Running' });
  await expect.element(running()).not.toBeInTheDocument();

  // The second client's run starts: the server pushes one status event.
  const startedAt = performance.now();
  pushStatus({ sequence: 4 });
  await expect.element(running()).toBeVisible();
  expect(performance.now() - startedAt).toBeLessThan(2_000);
  await expect
    .element(
      page.getByTestId('sidebar-b').getByRole('status', { name: 'Running' }),
    )
    .not.toBeInTheDocument();

  // A late duplicate of an older event changes nothing.
  pushStatus({ runStatus: 'idle', runtimeState: 'ready', sequence: 3 });
  await expect.element(running()).toBeVisible();

  const finishedAt = performance.now();
  pushStatus({
    runStatus: 'completed',
    runtimeState: 'completed',
    sequence: 7,
  });
  await expect.element(running()).not.toBeInTheDocument();
  expect(performance.now() - finishedAt).toBeLessThan(2_000);
  expect(
    useAgentChatStore.getState().threads.map((thread) => thread.id),
  ).toEqual(['a', 'b']);
  await page.screenshot({ path: 'thread-status-push.png' });
});
