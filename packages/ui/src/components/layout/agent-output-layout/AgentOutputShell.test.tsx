import { AgentOutputHostContext } from '@genfeedai/contexts/ui/agent-output-host-context';
import {
  ContextSidebarPanel,
  ContextSidebarProvider,
} from '@genfeedai/contexts/ui/context-sidebar-context';
import type { AgentOutputHostValue } from '@genfeedai/props/ui/agent-output-shell.props';
import { fireEvent, render, screen, within } from '@testing-library/react';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function buildHost(
  overrides: Partial<AgentOutputHostValue> = {},
): AgentOutputHostValue {
  return {
    agent: <p>Shell conversation</p>,
    contextPanel: <p>Shell context</p>,
    onNewThread: vi.fn(),
    onOpenFullPage: vi.fn(),
    threadsPanel: <p>Shell threads</p>,
    ...overrides,
  };
}

describe('AgentOutputShell', () => {
  it('renders the output alone when no route hosts the split', () => {
    render(
      <AgentOutputShell>
        <p>Board</p>
      </AgentOutputShell>,
    );

    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-output-layout')).toBeNull();
  });

  it('hosts the shell conversation with Threads and Context beside the output', () => {
    const host = buildHost();
    render(
      <AgentOutputHostContext value={host}>
        <AgentOutputShell outputLabel="Shots">
          <p>Board</p>
        </AgentOutputShell>
      </AgentOutputHostContext>,
    );

    const agentPane = screen.getByTestId('agent-output-agent-pane');
    expect(within(agentPane).getByText('Shell conversation')).toBeVisible();
    const outputPane = screen.getByTestId('agent-output-output-pane');
    expect(
      within(outputPane)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Shots', 'Threads', 'Context']);

    fireEvent.click(screen.getByTestId('agent-output-new-thread'));
    expect(host.onNewThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('agent-output-full-page'));
    expect(host.onOpenFullPage).toHaveBeenCalledTimes(1);
  });

  it('shows the page agent instead and drops the master thread tools', () => {
    render(
      <AgentOutputHostContext value={buildHost()}>
        <AgentOutputShell
          agent={<p>Run agent</p>}
          agentTitle="Storyboard agent"
        >
          <p>Board</p>
        </AgentOutputShell>
      </AgentOutputHostContext>,
    );

    const agentPane = screen.getByTestId('agent-output-agent-pane');
    expect(within(agentPane).getByText('Run agent')).toBeVisible();
    expect(within(agentPane).getByText('Storyboard agent')).toBeVisible();
    expect(within(agentPane).queryByText('Shell conversation')).toBeNull();
    expect(screen.queryByTestId('agent-output-new-thread')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Threads' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Context' })).toBeInTheDocument();
  });

  it('leaves the output showing when the page selects a record on its own', () => {
    render(
      <ContextSidebarProvider>
        <AgentOutputHostContext value={buildHost()}>
          <AgentOutputShell>
            <p>Board</p>
          </AgentOutputShell>
          <ContextSidebarPanel
            selection={{
              id: 'run-1',
              kind: 'record',
              origin: 'automatic',
              title: 'Run 1',
            }}
          >
            <p>Run detail</p>
          </ContextSidebarPanel>
        </AgentOutputHostContext>
      </ContextSidebarProvider>,
    );

    expect(
      within(screen.getByTestId('agent-output-output-pane')).getByRole('tab', {
        name: 'Output',
      }),
    ).toHaveAttribute('data-state', 'active');
  });

  it('brings a new selection forward in the Context tab', () => {
    render(
      <ContextSidebarProvider>
        <AgentOutputHostContext value={buildHost()}>
          <AgentOutputShell>
            <p>Board</p>
          </AgentOutputShell>
          <ContextSidebarPanel
            selection={{
              id: 'asset-1',
              kind: 'asset',
              origin: 'user',
              title: 'Asset 1',
            }}
          >
            <p>Asset detail</p>
          </ContextSidebarPanel>
        </AgentOutputHostContext>
      </ContextSidebarProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Context' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('ignores a selection carried over from the page the operator left', () => {
    const view = render(
      <ContextSidebarProvider>
        <AgentOutputHostContext value={buildHost()}>
          <ContextSidebarPanel
            selection={{
              id: 'asset-1',
              kind: 'asset',
              origin: 'user',
              title: 'Asset 1',
            }}
          >
            <p>Asset detail</p>
          </ContextSidebarPanel>
        </AgentOutputHostContext>
      </ContextSidebarProvider>,
    );

    view.rerender(
      <ContextSidebarProvider>
        <AgentOutputHostContext value={buildHost()}>
          <AgentOutputShell>
            <p>Board</p>
          </AgentOutputShell>
        </AgentOutputHostContext>
      </ContextSidebarProvider>,
    );

    expect(
      within(screen.getByTestId('agent-output-output-pane')).getByRole('tab', {
        name: 'Output',
      }),
    ).toHaveAttribute('data-state', 'active');
  });
});
