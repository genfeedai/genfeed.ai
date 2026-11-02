import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubbarOverflowMenu from '@ui/layout/subbar-overflow-menu/SubbarOverflowMenu';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'moreActions' ? 'More actions' : key,
}));

describe('SubbarOverflowMenu', () => {
  it('renders nothing when the page has no secondary actions', () => {
    const { container } = render(<SubbarOverflowMenu actions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the secondary actions and runs the one the user picks', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(
      <SubbarOverflowMenu
        actions={[
          { id: 'download', label: 'Download CSV', onSelect: onDownload },
          { id: 'import', label: 'Import', onSelect: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Import' }),
    ).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Download CSV' }));

    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('puts destructive actions last, below the others', async () => {
    const user = userEvent.setup();
    render(
      <SubbarOverflowMenu
        actions={[
          {
            id: 'delete',
            isDestructive: true,
            label: 'Delete all',
            onSelect: vi.fn(),
          },
          { id: 'export', label: 'Export', onSelect: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const items = await screen.findAllByRole('menuitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Export',
      'Delete all',
    ]);
  });
});
