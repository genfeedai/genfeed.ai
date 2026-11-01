import '@testing-library/jest-dom/vitest';
import { ViewType } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (key === 'label' ? 'View' : key),
}));

const OPTIONS = [
  {
    icon: <span data-testid="grid-icon" />,
    label: 'Grid',
    type: ViewType.GRID,
  },
  {
    icon: <span data-testid="list-icon" />,
    label: 'List',
    type: ViewType.LIST,
  },
  {
    icon: <span data-testid="table-icon" />,
    label: 'Table',
    type: ViewType.TABLE,
  },
];

describe('ViewMenu', () => {
  it('shows only the active view on the trigger and lists every layout in the menu', async () => {
    const user = userEvent.setup();
    render(
      <ViewMenu
        activeView={ViewType.LIST}
        onChange={vi.fn()}
        options={OPTIONS}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'View: List' });
    expect(screen.getByTestId('list-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('grid-icon')).not.toBeInTheDocument();

    await user.click(trigger);

    expect(
      await screen.findByRole('menuitemradio', { name: 'List' }),
    ).toBeChecked();
    expect(
      screen.getByRole('menuitemradio', { name: 'Grid' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('menuitemradio', { name: 'Table' }),
    ).not.toBeChecked();
  });

  it('reports the chosen layout and closes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ViewMenu
        activeView={ViewType.GRID}
        onChange={onChange}
        options={OPTIONS}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View: Grid' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Table' }),
    );

    expect(onChange).toHaveBeenCalledExactlyOnceWith(ViewType.TABLE);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders nothing when a page offers a single layout', () => {
    const { container } = render(
      <ViewMenu
        activeView={ViewType.GRID}
        onChange={vi.fn()}
        options={OPTIONS.slice(0, 1)}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the active view on a label trigger', async () => {
    const user = userEvent.setup();
    render(
      <ViewMenu
        activeView="week"
        onChange={vi.fn()}
        options={[
          { icon: null, label: 'Day', type: 'day' },
          { icon: null, label: 'Week', type: 'week' },
          { icon: null, label: 'Month', type: 'month' },
        ]}
        trigger="label"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'View: Week' });
    expect(trigger).toHaveTextContent('Week');

    await user.click(trigger);

    expect(
      await screen.findByRole('menuitemradio', { name: 'Week' }),
    ).toBeChecked();
  });
});
