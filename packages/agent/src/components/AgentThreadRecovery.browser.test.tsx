import { AgentThreadList } from '@genfeedai/agent/components/AgentThreadList';
import { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import messages from '../../../../apps/app/messages/en/agent.json';
import '../../tests/fixtures/thread-recovery.browser.css';

vi.mock('@genfeedai/helpers', async () => {
  const { cn } = await import('@genfeedai/helpers/formatting/cn/cn.util');
  return { cn };
});
vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: 'connected',
    isReady: false,
    subscribe: () => () => {},
  }),
}));

afterEach(() => vi.unstubAllGlobals());

it('retains an unsent rename after a real PATCH 404 and waits for a user retry', async () => {
  document.documentElement.dataset.theme = 'dark';
  useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  const thread = {
    contextVersion: 1,
    createdAt: '2026-10-21T10:00:00Z',
    id: 'deleted-thread',
    status: AgentThreadStatus.ACTIVE,
    title: 'Launch planning',
    updatedAt: '2026-10-21T10:00:00Z',
  };
  useAgentChatStore.setState({ activeThreadId: thread.id });
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/agent/threads?limit=50&status=ACTIVE')) {
      return new Response(
        JSON.stringify({
          data: [{ id: thread.id, type: 'agent-thread', attributes: thread }],
        }),
      );
    }
    if (!init?.method && url.includes('/agent/threads?')) {
      return new Response(
        JSON.stringify({
          data: [{ id: thread.id, type: 'agent-thread', attributes: thread }],
        }),
      );
    }
    return new Response(JSON.stringify({ message: 'Thread not found' }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetch);
  const apiService = new AgentApiService({
    baseUrl: 'http://api.test',
    getToken: async () => 'test-token',
  });
  await render(
    <NextIntlClientProvider locale="en" messages={{ agent: messages }}>
      <AgentThreadList apiService={apiService} />
    </NextIntlClientProvider>,
  );
  await expect
    .element(
      page.getByRole('button', { name: 'Thread actions for Launch planning' }),
    )
    .toBeVisible();
  page
    .getByRole('button', { name: 'Thread actions for Launch planning' })
    .element()
    .focus();
  await userEvent.keyboard('{Enter}');
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = page.getByRole('textbox', { name: 'Rename Launch planning' });
  await input.fill('My unsent launch title');
  await userEvent.keyboard('{Enter}');
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent(messages.threadRecovery.unavailable);
  await expect.element(input).toHaveValue('My unsent launch title');
  expect(useAgentChatStore.getState().activeThreadId).toBe('deleted-thread');
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
  ).toHaveLength(1);
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
  await page.screenshot({
    path: '../../dist/vitest/screenshots/thread-update-missing.png',
  });
});
