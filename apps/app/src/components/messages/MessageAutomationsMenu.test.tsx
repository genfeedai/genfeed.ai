import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessageAutomationsMenu from './MessageAutomationsMenu';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const scope = vi.hoisted(() => ({ brandSlug: 'brand' }));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: scope.brandSlug,
    href: (path: string) => `/org/${scope.brandSlug}${path}`,
  }),
}));

describe('message automations menu', () => {
  beforeEach(() => {
    scope.brandSlug = 'brand';
  });
  it('keeps the send-side destinations reachable behind one control', async () => {
    render(<MessageAutomationsMenu />);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Message automations' }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'Outreach sequences' }),
    ).toHaveAttribute('href', '/org/brand/messages/outreach');
    expect(screen.getByRole('menuitem', { name: 'Replies' })).toHaveAttribute(
      'href',
      '/org/brand/messages/replies',
    );
    expect(
      screen.getByRole('menuitem', { name: 'Reply drip' }),
    ).toHaveAttribute('href', '/org/brand/messages/reply-drip');
  });
  it('does not expose brand-only destinations from the organization inbox', () => {
    scope.brandSlug = '~';
    render(<MessageAutomationsMenu />);
    expect(
      screen.queryByRole('button', { name: 'Message automations' }),
    ).not.toBeInTheDocument();
  });
});
