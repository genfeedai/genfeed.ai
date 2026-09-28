import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'moreActions' ? 'More actions' : key,
}));

// Drives the real Radix menu: the mocked suite proves ordering and styling,
// this one proves the menu a keyboard user actually gets.
describe('CollectionItemActions with the real menu', () => {
  function renderActions(onRename = vi.fn()) {
    render(
      <CollectionItemActions
        overflow={[
          { id: 'rename', label: 'Rename', onSelect: onRename },
          { href: '/org/brand/automation/runs', id: 'runs', label: 'Runs' },
          {
            href: 'https://example.com/post',
            id: 'source',
            isExternal: true,
            label: 'Open source',
          },
        ]}
        primary={<span>Open</span>}
      />,
    );
  }

  it('keeps the overflow closed until the trigger is used', () => {
    renderActions();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('opens from the keyboard, runs a command and restores focus', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderActions(onRename);

    const trigger = screen.getByRole('button', { name: 'More actions' });
    trigger.focus();
    await user.keyboard('{Enter}');

    const menu = await screen.findByRole('menu');
    expect(menu).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderActions();

    const trigger = screen.getByRole('button', { name: 'More actions' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it('renders destinations as real links inside the menu', async () => {
    const user = userEvent.setup();
    renderActions();

    screen.getByRole('button', { name: 'More actions' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    const runs = screen.getByRole('menuitem', { name: 'Runs' });
    expect(runs.tagName).toBe('A');
    expect(runs).toHaveAttribute('href', '/org/brand/automation/runs');
    expect(runs).not.toHaveAttribute('target');

    const source = screen.getByRole('menuitem', { name: 'Open source' });
    expect(source).toHaveAttribute('href', 'https://example.com/post');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
