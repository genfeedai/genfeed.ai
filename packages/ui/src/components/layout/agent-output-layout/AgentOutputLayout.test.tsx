import { fireEvent, render, screen, within } from '@testing-library/react';
import AgentOutputLayout from '@ui/layout/agent-output-layout/AgentOutputLayout';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const labels = {
  agent: 'Agent',
  collapseAgent: 'Collapse agent',
  expandAgent: 'Expand agent',
  output: 'Output',
  views: 'Agent or output',
};

function Harness({ mode }: { mode?: 'rail' | 'split' }) {
  const [activeTabId, setActiveTabId] = useState('board');
  return (
    <AgentOutputLayout
      activeTabId={activeTabId}
      agent={<p>Agent transcript</p>}
      agentHeader={<span>Run thread</span>}
      headerActions={<span>Page action</span>}
      labels={labels}
      mode={mode}
      onTabChange={setActiveTabId}
      tabs={[
        { content: <p>Board content</p>, id: 'board', label: 'Board' },
        { content: <p>Threads content</p>, id: 'threads', label: 'Threads' },
      ]}
    />
  );
}

describe('AgentOutputLayout', () => {
  it('puts the agent on the left and the output on the right', () => {
    render(<Harness />);

    const layout = screen.getByTestId('agent-output-layout');
    const agentPane = within(layout).getByTestId('agent-output-agent-pane');
    const outputPane = within(layout).getByTestId('agent-output-output-pane');
    expect(
      agentPane.compareDocumentPosition(outputPane) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(agentPane).getByText('Agent transcript')).toBeVisible();
    expect(within(agentPane).getByText('Run thread')).toBeVisible();
    expect(within(outputPane).getByText('Board content')).toBeVisible();
    expect(within(outputPane).getByText('Page action')).toBeVisible();
    expect(layout).toHaveAttribute('data-mode', 'split');
  });

  it('switches tabs while keeping every tab mounted', () => {
    render(<Harness />);
    const outputPane = screen.getByTestId('agent-output-output-pane');

    fireEvent.mouseDown(
      within(outputPane).getByRole('tab', { name: 'Threads' }),
    );

    expect(within(outputPane).getByText('Threads content')).toBeVisible();
    // The board stays in the tree, hidden, so its scroll and edits survive.
    const board = within(outputPane).getByText('Board content');
    expect(board).toBeInTheDocument();
    expect(board.parentElement).toHaveAttribute('data-state', 'inactive');
    expect(board.parentElement).toHaveAttribute('hidden');
  });

  it('shows one pane at a time on narrow screens without unmounting the other', () => {
    render(<Harness />);
    const layout = screen.getByTestId('agent-output-layout');
    expect(layout).toHaveAttribute('data-mobile-view', 'agent');

    fireEvent.mouseDown(within(layout).getByRole('tab', { name: 'Output' }));

    expect(layout).toHaveAttribute('data-mobile-view', 'output');
    expect(screen.getByTestId('agent-output-agent-pane')).toHaveClass(
      'max-xl:hidden',
    );
    expect(screen.getByText('Agent transcript')).toBeInTheDocument();
  });

  it('keeps the agent a rail until it is expanded', () => {
    render(<Harness mode="rail" />);
    const layout = screen.getByTestId('agent-output-layout');
    expect(layout).toHaveAttribute('data-mode', 'rail');

    fireEvent.click(screen.getByRole('button', { name: 'Expand agent' }));
    expect(layout).toHaveAttribute('data-mode', 'split');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse agent' }));
    expect(layout).toHaveAttribute('data-mode', 'rail');
  });

  it('has no rail toggle in split mode', () => {
    render(<Harness />);
    expect(screen.queryByTestId('agent-output-rail-toggle')).toBeNull();
  });
});
