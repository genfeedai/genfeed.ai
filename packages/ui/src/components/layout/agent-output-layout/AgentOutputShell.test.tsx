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
    '../../../../../../apps/web/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function buildHost(
  overrides: Partial<AgentOutputHostValue> = {},
): AgentOutputHostValue {
  return {
    agent: <p>Shell conversation</p>,
    contextPanel: <p>Shell context</p>,
    isContextOpen: false,
    onCloseContext: vi.fn(),
    onNewThread: vi.fn(),
    onOpenContext: vi.fn(),
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

  it('hosts the shell conversation beside the output, with no tab strip', () => {
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
    expect(screen.getByText('Board')).toBeVisible();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(
      within(screen.getByTestId('agent-output-output-pane')).queryByRole('tab'),
    ).toBeNull();

    fireEvent.click(screen.getByTestId('agent-output-new-thread'));
    expect(host.onNewThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('agent-output-full-page'));
    expect(host.onOpenFullPage).toHaveBeenCalledTimes(1);
  });

  it('shows Context in the output pane when the topbar opens it', () => {
    render(
      <AgentOutputHostContext value={buildHost({ isContextOpen: true })}>
        <AgentOutputShell>
          <p>Board</p>
        </AgentOutputShell>
      </AgentOutputHostContext>,
    );

    expect(screen.getByText('Shell context')).toBeVisible();
    expect(screen.getByText('Board')).not.toBeVisible();
  });

  it('opens Threads from the agent header and back to the output', () => {
    render(
      <AgentOutputHostContext value={buildHost()}>
        <AgentOutputShell>
          <p>Board</p>
        </AgentOutputShell>
      </AgentOutputHostContext>,
    );

    expect(screen.getByText('Shell threads')).not.toBeVisible();
    fireEvent.click(screen.getByTestId('agent-output-threads-toggle'));
    expect(screen.getByText('Shell threads')).toBeVisible();
    expect(screen.getByText('Board')).not.toBeVisible();
    fireEvent.click(screen.getByTestId('agent-output-threads-toggle'));
    expect(screen.getByText('Board')).toBeVisible();
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
    expect(screen.queryByTestId('agent-output-threads-toggle')).toBeNull();
    expect(screen.queryByText('Shell threads')).toBeNull();
  });

  it('leaves the output showing when the page selects a record on its own', () => {
    const host = buildHost();
    render(
      <ContextSidebarProvider>
        <AgentOutputHostContext value={host}>
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

    expect(host.onOpenContext).not.toHaveBeenCalled();
  });

  it('asks the host for Context when the operator picks a record', () => {
    const host = buildHost();
    render(
      <ContextSidebarProvider>
        <AgentOutputHostContext value={host}>
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

    expect(host.onOpenContext).toHaveBeenCalled();
  });

  it('ignores a selection carried over from the page the operator left', () => {
    const host = buildHost();
    const view = render(
      <ContextSidebarProvider>
        <AgentOutputHostContext value={host}>
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
        <AgentOutputHostContext value={host}>
          <AgentOutputShell>
            <p>Board</p>
          </AgentOutputShell>
        </AgentOutputHostContext>
      </ContextSidebarProvider>,
    );

    expect(host.onOpenContext).not.toHaveBeenCalled();
  });
});
