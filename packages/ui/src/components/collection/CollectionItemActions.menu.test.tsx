import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'moreActions' ? 'More actions' : key,
}));

// jsdom cannot navigate, so this Link records every activation that would
// reach the router. Unlike the shared setup mock it forwards all props, so
// Radix can turn the anchor into a menu item.
const navigate = vi.fn();

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          navigate(href);
        }
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

beforeEach(() => {
  navigate.mockClear();
});

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

  it('navigates when a destination is clicked and closes the menu', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Runs' }));

    expect(navigate).toHaveBeenCalledWith('/org/brand/automation/runs');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
  });

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('activates a destination with %s', async (_key, keystroke) => {
    const user = userEvent.setup();
    renderActions();

    screen.getByRole('button', { name: 'More actions' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');

    // Items: Rename, Runs, Open source — step from the first to Runs.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Runs' })).toHaveFocus();

    await user.keyboard(keystroke);

    expect(navigate).toHaveBeenCalledWith('/org/brand/automation/runs');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
  });

  it('renders a disabled destination as an inert item with no link', async () => {
    const user = userEvent.setup();
    render(
      <CollectionItemActions
        overflow={[
          {
            href: '/org/brand/automation/runs',
            id: 'runs',
            isDisabled: true,
            label: 'Runs',
          },
          { id: 'rename', label: 'Rename', onSelect: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const runs = await screen.findByRole('menuitem', { name: 'Runs' });

    expect(runs.tagName).not.toBe('A');
    expect(runs).not.toHaveAttribute('href');
    expect(runs).toHaveAttribute('aria-disabled', 'true');

    runs.click();
    expect(navigate).not.toHaveBeenCalled();
  });
});
