import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentOutputLayout from '@ui/layout/agent-output-layout/AgentOutputLayout';
import { AGENT_OUTPUT_SPLIT_STORAGE_KEY } from '@ui/layout/agent-output-layout/agent-pane.constant';
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
  resizePanes: 'Resize panes',
};

function Harness({
  activeTabId = 'board',
  hasAgentHeader = true,
  hasPageActions = true,
  isOutputExpandable,
}: {
  activeTabId?: string;
  hasAgentHeader?: boolean;
  hasPageActions?: boolean;
  isOutputExpandable?: boolean;
}) {
  return (
    <AgentOutputLayout
      activeTabId={activeTabId}
      agent={<p>Agent transcript</p>}
      agentHeader={hasAgentHeader ? <span>Run thread</span> : undefined}
      headerActions={hasPageActions ? <span>Page action</span> : undefined}
      isOutputExpandable={isOutputExpandable}
      labels={labels}
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

    // The switch sits in each pane's header, in place of the pane title; the
    // agent pane's is the one showing.
    await user.click(
      within(screen.getByTestId('agent-output-agent-pane')).getByRole(
        'button',
        { name: 'View: Agent' },
      ),
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

  it('puts the Agent / Output switch in the pane headers, not in a row above them', () => {
    render(<Harness />);
    const layout = screen.getByTestId('agent-output-layout');

    expect(
      within(screen.getByTestId('agent-output-agent-pane')).getByRole(
        'button',
        { name: 'View: Agent' },
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('agent-output-output-pane')).getByRole(
        'button',
        { name: 'View: Agent' },
      ),
    ).toBeInTheDocument();
  });

  it('keeps the Agent / Output switch for a layout with no pane headers', async () => {
    const user = userEvent.setup();
    render(
      <AgentOutputLayout
        agent={<p>Agent transcript</p>}
        labels={labels}
        tabs={[{ content: <p>Board content</p>, id: 'board', label: 'Board' }]}
        activeTabId="board"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View: Agent' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Output' }),
    );

    expect(screen.getByTestId('agent-output-layout')).toHaveAttribute(
      'data-mobile-view',
      'output',
    );
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

  describe('draggable divider', () => {
    const STORAGE_KEY = 'test:agent-split';

    function renderResizable() {
      return render(
        <AgentOutputLayout
          activeTabId="threads"
          agent={<p>Agent transcript</p>}
          labels={labels}
          resizeStorageKey={STORAGE_KEY}
          tabs={[
            {
              content: <p>Threads content</p>,
              id: 'threads',
              label: 'Threads',
            },
          ]}
        />,
      );
    }

    it('has a divider on every page, under the shared key', () => {
      window.localStorage.removeItem(AGENT_OUTPUT_SPLIT_STORAGE_KEY);
      render(<Harness />);
      const divider = screen.getByRole('separator', { name: 'Resize panes' });

      fireEvent.keyDown(divider, { key: 'ArrowLeft' });

      expect(divider).toHaveAttribute('aria-valuenow', '48');
      expect(window.localStorage.getItem(AGENT_OUTPUT_SPLIT_STORAGE_KEY)).toBe(
        '0.480',
      );
      window.localStorage.removeItem(AGENT_OUTPUT_SPLIT_STORAGE_KEY);
    });

    it('has no divider while the agent is hidden', () => {
      render(<Harness isOutputExpandable />);
      fireEvent.click(screen.getByRole('button', { name: 'Full size' }));
      expect(
        screen.queryByRole('separator', { name: 'Resize panes' }),
      ).not.toBeInTheDocument();
    });

    it('moves the split with the arrow keys, remembers it, and resets on double-click', () => {
      window.localStorage.removeItem(STORAGE_KEY);
      renderResizable();
      const divider = screen.getByRole('separator', { name: 'Resize panes' });

      expect(divider).toHaveAttribute('aria-valuenow', '50');

      fireEvent.keyDown(divider, { key: 'ArrowRight', shiftKey: true });
      expect(divider).toHaveAttribute('aria-valuenow', '55');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0.550');

      fireEvent.doubleClick(divider);
      expect(divider).toHaveAttribute('aria-valuenow', '50');
    });

    it('keeps each pane at least 30% wide', () => {
      window.localStorage.setItem(STORAGE_KEY, '0.95');
      renderResizable();

      expect(
        screen.getByRole('separator', { name: 'Resize panes' }),
      ).toHaveAttribute('aria-valuenow', '70');
    });
  });
});
