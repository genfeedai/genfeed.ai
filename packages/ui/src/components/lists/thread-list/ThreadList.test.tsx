import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ThreadListRow,
  ThreadListSection,
  ThreadListSubtitle,
} from './ThreadList';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ThreadListSection', () => {
  it('shows its title and count and folds its rows away on click', async () => {
    const user = userEvent.setup();
    render(
      <ThreadListSection itemCount={2} title="Today">
        <li>First thread</li>
        <li>Second thread</li>
      </ThreadListSection>,
    );

    const toggle = screen.getByRole('button', { name: /Today/ });
    expect(toggle).toHaveTextContent('· 2');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('First thread')).toBeVisible();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('First thread')).not.toBeVisible();
  });

  it('starts folded when asked and renders nothing with no rows', () => {
    const { container, rerender } = render(
      <ThreadListSection isDefaultCollapsed itemCount={1} title="Resolved">
        <li>Old thread</li>
      </ThreadListSection>,
    );

    expect(screen.getByRole('button', { name: /Resolved/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      screen.getByText('Old thread', { selector: 'li' }),
    ).not.toBeVisible();

    rerender(
      <ThreadListSection itemCount={0} title="Resolved">
        {null}
      </ThreadListSection>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ThreadListRow', () => {
  it('links the whole row, with title, subtitle, date and a named status', () => {
    render(
      <ul>
        <ThreadListRow
          href="/acme/turbo/p1"
          status="attention"
          statusLabel="Needs you"
          subtitle={<ThreadListSubtitle parts={['Ideas', '3 items']} />}
          time="Oct 21"
          title="Spring launch"
        />
      </ul>,
    );

    const link = screen.getByRole('link', { name: /Spring launch/ });
    expect(link).toHaveAttribute('href', '/acme/turbo/p1');
    expect(within(link).getByText('Ideas')).toBeVisible();
    expect(within(link).getByText('3 items')).toBeVisible();
    expect(within(link).getByText('Oct 21')).toBeVisible();
    expect(within(link).getByRole('img', { name: 'Needs you' })).toBeVisible();
  });

  it('keeps the actions menu beside the link and runs an action without opening the thread', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ul>
        <ThreadListRow
          actions={[{ id: 'delete', label: 'Delete', onSelect }]}
          actionsLabel="Actions for Spring launch"
          href="/acme/turbo/p1"
          title="Spring launch"
        />
      </ul>,
    );

    const trigger = screen.getByRole('button', {
      name: 'Actions for Spring launch',
    });
    expect(screen.getByRole('link')).not.toContainElement(trigger);

    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reaches the actions menu by keyboard after the link', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <ThreadListRow
          actions={[{ id: 'delete', label: 'Delete', onSelect: vi.fn() }]}
          actionsLabel="Actions for Spring launch"
          href="/acme/turbo/p1"
          title="Spring launch"
        />
      </ul>,
    );

    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Actions for Spring launch' }),
    ).toHaveFocus();
  });

  it('has no menu when there are no actions', () => {
    render(
      <ul>
        <ThreadListRow href="/a" title="Plain thread" />
      </ul>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});
