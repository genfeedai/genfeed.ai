import { AgentFullPage } from '@genfeedai/agent/components/AgentFullPage';
import type { AgentChatContainerProps } from '@genfeedai/agent/components/agent-chat-container.types';
import { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { conversationHydrationFlights } from '@genfeedai/agent/utils/conversation-hydration-flight';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import messages from '../../../../apps/web/messages/en/agent.json';
import '../../tests/fixtures/thread-recovery.browser.css';

// Keep the real page, hydration hook, store, API client and not-found view.
// The transcript/composer and workspace panels are outside this read fixture.
vi.mock('@contexts/ui/context-sidebar-context', () => ({
  ContextSidebarPanel: () => null,
  useContextSidebar: () => null,
}));
vi.mock('@genfeedai/agent/components/AgentChatContainer', () => ({
  AgentChatContainer: ({ emptyStateTitle }: AgentChatContainerProps) => (
    <div>{emptyStateTitle}</div>
  ),
}));
vi.mock('@genfeedai/agent/components/AgentSidebarContent', () => ({
  AgentSidebarContent: () => null,
}));
vi.mock('@genfeedai/agent/components/AgentOutputsPanel', () => ({
  AgentOutputsPanel: () => null,
}));
vi.mock('@genfeedai/agent/components/AgentFullPageMobileDrawers', () => ({
  AgentFullPageMobileDrawers: () => null,
}));
vi.mock('@genfeedai/agent/components/useAgentSetupStatus', () => ({
  useAgentSetupStatus: () => ({ showSetupPanel: false }),
}));
vi.mock('@genfeedai/helpers', async () => {
  const { cn } = await import('@genfeedai/helpers/formatting/cn/cn.util');
  return { cn };
});

beforeEach(() => {
  document.documentElement.dataset.theme = 'dark';
  useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
});
afterEach(() => {
  conversationHydrationFlights.clear();
  vi.unstubAllGlobals();
});

it.each([
  { scope: 'org', threadId: 'does-not-exist-qa', snapshotStatus: 400 },
  { scope: 'brand', threadId: 'does-not-exist-qa', snapshotStatus: 400 },
  {
    scope: 'org',
    threadId: '00000000-0000-4000-8000-000000000807',
    snapshotStatus: 404,
  },
  {
    scope: 'brand',
    threadId: '00000000-0000-4000-8000-000000000807',
    snapshotStatus: 404,
  },
  {
    scope: 'deleted',
    threadId: '00000000-0000-4000-8000-000000000808',
    snapshotStatus: 404,
  },
  {
    scope: 'inaccessible',
    threadId: '00000000-0000-4000-8000-000000000809',
    snapshotStatus: 404,
  },
])(
  'shows a missing $scope chat after snapshot $snapshotStatus, with working back navigation',
  async ({ scope, threadId, snapshotStatus }) => {
    const threadResponse = Promise.withResolvers<Response>();
    const snapshotDelivered = Promise.withResolvers<void>();
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method ?? 'GET').toBe('GET');
        const url = String(input);
        if (url.endsWith(`/threads/${threadId}`)) return threadResponse.promise;
        if (url.endsWith(`/threads/${threadId}/snapshot`)) {
          snapshotDelivered.resolve();
          return Response.json(
            {
              message:
                snapshotStatus === 400
                  ? 'Invalid threadId'
                  : 'Thread not found',
            },
            { status: snapshotStatus },
          );
        }
        if (url.includes('/messages?') || url.includes('/transfers'))
          return Response.json({ data: [] });
        if (url.includes('/credits'))
          return Response.json({ balance: 50, modelCosts: {} });
        throw new Error(`Unexpected fixture request: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetch);
    const apiService = new AgentApiService({
      baseUrl: 'http://api.test',
      getToken: async () => 'fixture-token',
    });
    const newChatHref = '/test-org/~/agent/new';
    const screen = await render(
      <NextIntlClientProvider locale="en" messages={{ agent: messages }}>
        <div style={{ display: 'flex', height: '80vh', minHeight: 320 }}>
          <AgentFullPage
            apiService={apiService}
            newChatHref={newChatHref}
            showThreadSidebar={false}
            threadId={threadId}
          />
        </div>
      </NextIntlClientProvider>,
    );
    await snapshotDelivered.promise;
    await expect.poll(() => useAgentChatStore.getState().error).toBeNull();
    threadResponse.resolve(
      Response.json({ message: 'Thread not found' }, { status: 404 }),
    );
    await expect
      .element(page.getByRole('heading', { name: 'Chat not found' }))
      .toBeVisible();
    await expect
      .element(page.getByText('Start a chat', { exact: true }))
      .not.toBeInTheDocument();
    expect(useAgentChatStore.getState().error).toBeNull();
    const back = page.getByRole('link', { name: 'Start a new chat' });
    await expect.element(back).toHaveAttribute('href', newChatHref);
    await page.screenshot({
      path: `../../dist/vitest/screenshots/8070-${scope}-${snapshotStatus}.png`,
    });
    const navigated = vi.fn();
    back.element().addEventListener('click', (event) => {
      event.preventDefault();
      navigated();
    });
    await back.click();
    expect(navigated).toHaveBeenCalledOnce();
    await screen.rerender(
      <NextIntlClientProvider locale="en" messages={{ agent: messages }}>
        <div style={{ display: 'flex', height: '80vh', minHeight: 320 }}>
          <AgentFullPage
            apiService={apiService}
            newChatHref={newChatHref}
            showThreadSidebar={false}
          />
        </div>
      </NextIntlClientProvider>,
    );
    await expect
      .element(page.getByText('Start a chat', { exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole('heading', { name: 'Chat not found' }))
      .not.toBeInTheDocument();
    expect(useAgentChatStore.getState().activeThreadId).toBeNull();
  },
);
