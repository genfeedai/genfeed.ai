import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentOutputLayout from '@ui/layout/agent-output-layout/AgentOutputLayout';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const labels = {
  agent: 'Agent',
  collapseOutput: 'Show agent',
  expandOutput: 'Full size',
  output: 'Output',
};

function Harness({
  activeTabId = 'board',
  hasAgentHeader = true,
  hasPageActions = true,
  isOutputExpandable,
  isOutputHidden,
}: {
  activeTabId?: string;
  hasAgentHeader?: boolean;
  hasPageActions?: boolean;
  isOutputExpandable?: boolean;
  isOutputHidden?: boolean;
}) {
  return (
    <AgentOutputLayout
      activeTabId={activeTabId}
      agent={<p>Agent transcript</p>}
      agentHeader={hasAgentHeader ? <span>Run thread</span> : undefined}
      headerActions={hasPageActions ? <span>Page action</span> : undefined}
      isOutputExpandable={isOutputExpandable}
      isOutputHidden={isOutputHidden}
      labels={labels}
      tabs={[
        { content: <p>Board content</p>, id: 'board', label: 'Board' },
        { content: <p>Threads content</p>, id: 'threads', label: 'Threads' },
      ]}
    />
  );
}

describe('AgentOutputLayout', () => {
  it('gives the agent the whole page while the output is hidden', () => {
    render(<Harness isOutputHidden />);

    expect(screen.getByTestId('agent-output-agent-pane')).toBeVisible();
    expect(screen.getByTestId('agent-output-output-pane')).not.toBeVisible();
    expect(
      screen.queryByRole('button', { name: /View: / }),
    ).not.toBeInTheDocument();
  });

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
  });

  it('has no tab strip in the output pane and shows the chosen view', () => {
    render(<Harness activeTabId="threads" />);
    const outputPane = screen.getByTestId('agent-output-output-pane');

    expect(within(outputPane).queryByRole('tab')).toBeNull();
    expect(within(outputPane).getByText('Threads content')).toBeVisible();
    // The board stays in the tree, hidden, so its scroll and edits survive.
    const board = within(outputPane).getByText('Board content');
    expect(board).toBeInTheDocument();
    expect(board.parentElement).toHaveAttribute('data-state', 'inactive');
    expect(board.parentElement).toHaveAttribute('hidden');
  });

  it('renders no headers when neither pane has one', () => {
    render(<Harness hasAgentHeader={false} hasPageActions={false} />);
    const layout = screen.getByTestId('agent-output-layout');

    expect(layout.querySelectorAll('header')).toHaveLength(0);
    expect(screen.getByText('Agent transcript')).toBeVisible();
  });

  it('gives both panes a header of the same fixed height so the divider lines meet', () => {
    render(<Harness hasAgentHeader={false} />);
    const agentPane = screen.getByTestId('agent-output-agent-pane');
    const outputPane = screen.getByTestId('agent-output-output-pane');

    const agentHeader = agentPane.querySelector('header');
    const outputHeader = outputPane.querySelector('header');
    expect(agentHeader).toHaveClass('h-12');
    expect(outputHeader).toHaveClass('h-12');
    expect(agentHeader).not.toHaveClass('min-h-12');
  });

  it('shows one pane at a time on narrow screens without unmounting the other', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const layout = screen.getByTestId('agent-output-layout');
    expect(layout).toHaveAttribute('data-mobile-view', 'agent');

    await user.click(
      within(layout).getByRole('button', { name: 'View: Agent' }),
    );
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Output' }),
    );

    expect(layout).toHaveAttribute('data-mobile-view', 'output');
    expect(screen.getByTestId('agent-output-agent-pane')).toHaveClass(
      'max-xl:hidden',
    );
    expect(screen.getByText('Agent transcript')).toBeInTheDocument();
  });

  it('hides the agent for a full-size output without unmounting it', () => {
    render(<Harness isOutputExpandable />);
    const agentPane = screen.getByTestId('agent-output-agent-pane');
    expect(agentPane).not.toHaveClass('xl:hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Full size' }));
    expect(agentPane).toHaveClass('xl:hidden');
    expect(screen.getByText('Agent transcript')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show agent' }));
    expect(agentPane).not.toHaveClass('xl:hidden');
  });

  it('has no full-size button unless the page opts in', () => {
    render(<Harness />);
    expect(screen.queryByTestId('agent-output-expand-output')).toBeNull();
  });
});
