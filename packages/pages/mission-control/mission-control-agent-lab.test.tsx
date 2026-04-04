import MissionControlAgentLabPage from '@pages/mission-control/mission-control-agent-lab';
import type { TableProps } from '@props/ui/display/table.props';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/banners/low-credits/LowCreditsBanner', () => ({
  default: () => <div data-testid="low-credits-banner" />,
}));

vi.mock('next/link', () => ({
  default: function MockLink(props: { children: ReactNode; href: string }) {
    return <a href={props.href}>{props.children}</a>;
  },
}));

vi.mock('@cloud/agent/components/AgentChatInput', () => ({
  AgentChatInput: function MockAgentChatInput() {
    return <div data-testid="agent-chat-input-shell">agent-chat-input</div>;
  },
}));

vi.mock('@cloud/agent/components/AgentChatMessage', () => ({
  AgentChatMessage: function MockAgentChatMessage(props: {
    message: { content: string; role: string };
  }) {
    return (
      <div>
        {props.message.role}: {props.message.content}
      </div>
    );
  },
}));

vi.mock('@ui/display/table/Table', () => ({
  default: function MockTable<T>({
    columns,
    getItemId,
    items,
    onRowClick,
    onSelectionChange,
    selectable = false,
    selectedIds = [],
  }: TableProps<T>) {
    return (
      <div>
        {items.map((item, index) => {
          const itemId = getItemId ? getItemId(item) : String(index);
          const isSelected = selectedIds.includes(itemId);

          return (
            <div key={itemId} data-testid={`table-row-${itemId}`}>
              {selectable ? (
                <button
                  type="button"
                  aria-label={`select-${itemId}`}
                  onClick={() => {
                    if (!onSelectionChange) {
                      return;
                    }

                    onSelectionChange(
                      isSelected
                        ? selectedIds.filter((id) => id !== itemId)
                        : [...selectedIds, itemId],
                    );
                  }}
                >
                  {isSelected ? 'selected' : 'select'}
                </button>
              ) : null}

              <button
                type="button"
                aria-label={`row-open-${itemId}`}
                onClick={() => onRowClick?.(item)}
              >
                open row
              </button>

              {columns.map((column) => (
                <div key={`${itemId}-${String(column.key)}`}>
                  {column.render
                    ? column.render(item)
                    : String(item[column.key as keyof T])}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  },
}));

describe('MissionControlAgentLabPage', () => {
  it('keeps the composer anchored inside the active agent surface', () => {
    render(<MissionControlAgentLabPage />);

    fireEvent.click(screen.getAllByText('Ask Agent')[0]);

    const surface = screen.getByTestId('agent-lab-surface');
    const promptShell = within(surface).getByTestId('agent-chat-input-shell');
    const promptContainer = promptShell.closest('[data-layout-mode]');

    expect(surface).toHaveAttribute('data-mode', 'rail');
    expect(
      within(surface).getByTestId('low-credits-banner'),
    ).toBeInTheDocument();
    expect(promptContainer).toHaveAttribute(
      'data-layout-mode',
      'surface-fixed',
    );
    expect(promptContainer).toHaveAttribute('data-max-width', 'full');
  });

  it('preserves selection and conversation context when switching modes', () => {
    render(<MissionControlAgentLabPage />);

    fireEvent.click(screen.getByLabelText('select-lab-row-1'));
    fireEvent.click(screen.getAllByText('Ask Agent')[0]);

    expect(
      screen.getByText('1 rows selected for comparison'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('agent-lab-surface')).getByText(
        'Founder clip 1',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Overlay Sheet'));

    const surface = screen.getByTestId('agent-lab-surface');

    expect(surface).toHaveAttribute('data-mode', 'overlay');
    expect(
      screen.getByText('1 rows selected for comparison'),
    ).toBeInTheDocument();
    expect(within(surface).getByText('Founder clip 1')).toBeInTheDocument();
  });

  it('keeps filters stable while opening and closing the comparison surface', () => {
    render(<MissionControlAgentLabPage />);

    const search = screen.getByPlaceholderText(
      'Search assets, channels, owners, or status',
    );

    fireEvent.change(search, { target: { value: 'Founder clip 1' } });
    fireEvent.click(screen.getAllByText('Ask Agent')[0]);
    fireEvent.click(screen.getByLabelText('Close agent lab surface'));

    expect(search).toHaveValue('Founder clip 1');
    expect(screen.getByDisplayValue('Founder clip 1')).toBeInTheDocument();
  });
});
