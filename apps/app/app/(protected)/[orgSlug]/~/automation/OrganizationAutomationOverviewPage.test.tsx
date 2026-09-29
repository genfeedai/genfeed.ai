// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UserEventInstance = ReturnType<typeof userEvent.setup>;

const mocks = vi.hoisted(() => ({
  brandState: {
    brands: [] as Array<{
      id: string;
      label: string;
      slug?: string;
      totalCredentials?: number;
    }>,
    isReady: true,
  },
  navigate: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandState,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/acme/~${path}`,
    orgSlug: 'acme',
  }),
}));

// jsdom cannot navigate, so this Link records every activation that would
// reach the router. It spreads every prop so the real Radix menu can make the
// anchor a menu item.
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
          mocks.navigate(href);
        }
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/~/automation',
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { default: OrganizationAutomationOverviewPage } = await import(
  './OrganizationAutomationOverviewPage'
);

function getBrandGridItems(): HTMLElement[] {
  const grid = screen.getByTestId('organization-automation-brands')
    .firstElementChild as HTMLElement;
  return Array.from(grid.children) as HTMLElement[];
}

// Tabs through the page like a keyboard user until the target has focus, so
// the trigger's tooltip state updates happen inside userEvent's act().
async function tabTo(
  user: UserEventInstance,
  target: HTMLElement,
): Promise<void> {
  for (let step = 0; step < 25 && document.activeElement !== target; step++) {
    await user.tab();
  }
  expect(target).toHaveFocus();
}

describe('OrganizationAutomationOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandState.isReady = true;
    mocks.brandState.brands = [];
  });

  it('shows one visible action per card and no nested link grid', () => {
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand_2', label: 'Solar', slug: 'solar' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    const cards = screen.getAllByTestId('organization-automation-brand-card');
    expect(cards).toHaveLength(2);

    for (const card of cards) {
      const links = within(card).getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveTextContent('Open Automation');
      expect(card.querySelector('ul')).toBeNull();
    }

    expect(
      within(cards[0]).getByRole('link', { name: 'Open Automation' }),
    ).toHaveAttribute('href', '/acme/moonrise/automation');
    expect(screen.queryByRole('link', { name: 'Workflows' })).toBeNull();
  });

  it('keeps the automation surfaces in a closed overflow menu', () => {
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand_2', label: 'Solar', slug: 'solar' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    const [moonrise, solar] = screen.getAllByTestId(
      'organization-automation-brand-card',
    );
    expect(
      within(moonrise).getByRole('button', {
        name: 'More automation for Moonrise',
      }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(solar).getByRole('button', { name: 'More automation for Solar' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('opens the overflow from the keyboard with brand-scoped surface links', async () => {
    const user = userEvent.setup();
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand_2', label: 'Solar', slug: 'solar' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    const trigger = screen.getByRole('button', {
      name: 'More automation for Solar',
    });
    await tabTo(user, trigger);
    await user.keyboard('{Enter}');

    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Workflows',
      'Runs',
      'Agents',
      'Analytics',
    ]);
    for (const item of items) {
      expect(item.tagName).toBe('A');
      expect(item).not.toHaveAttribute('target');
    }
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/acme/solar/automation/workflows',
      '/acme/solar/automation/runs',
      '/acme/solar/automation/agents',
      '/acme/solar/analytics/overview',
    ]);

    await waitFor(() =>
      expect(menu).toContainElement(document.activeElement as HTMLElement),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('activates a surface link from the keyboard and closes the overflow', async () => {
    const user = userEvent.setup();
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand_2', label: 'Solar', slug: 'solar' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    await tabTo(
      user,
      screen.getByRole('button', { name: 'More automation for Solar' }),
    );
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Workflows' })).toHaveFocus(),
    );

    // Items: Workflows, Runs, Agents, Analytics — step from the first to Runs.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Runs' })).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/acme/solar/automation/runs');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('renders one fact line and omits empty facts', () => {
    mocks.brandState.brands = [
      {
        id: 'brand_1',
        label: 'Moonrise',
        slug: 'moonrise',
        totalCredentials: 2,
      },
      { id: 'brand_2', label: 'Solar', slug: 'solar', totalCredentials: 0 },
    ];

    render(<OrganizationAutomationOverviewPage />);

    const [moonrise, solar] = screen.getAllByTestId(
      'organization-automation-brand-card',
    );
    expect(within(moonrise).getByText('@moonrise · 2 platforms')).toBeVisible();
    expect(within(solar).getByText('@solar')).toBeVisible();
  });

  it('keeps the card on the shared surface without off-contract classes', () => {
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    const card = screen.getByTestId('organization-automation-brand-card');
    expect(card).toHaveClass('rounded-card', 'shadow-border');
    expect(card).not.toHaveClass('shadow-none');
    expect(card.innerHTML).not.toMatch(/indigo|grid-cols-2/);

    const grid = screen.getByTestId('organization-automation-brands')
      .firstElementChild as HTMLElement;
    expect(grid).toHaveClass('gap-4');
    expect(grid.className).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):grid-cols/);
  });

  it('points at brand creation when the organization has no brands', () => {
    render(<OrganizationAutomationOverviewPage />);

    expect(screen.queryByTestId('organization-automation-brands')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Brands' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to brands' })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
  });

  it('omits brands without a navigable slug', () => {
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Incomplete' },
      { id: 'brand_2', label: 'Moonrise', slug: 'moonrise' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    expect(getBrandGridItems()).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Incomplete' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Moonrise' })).toBeVisible();
  });

  it('shows card skeletons in the Brands section while the brand context loads', () => {
    mocks.brandState.isReady = false;
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    const section = screen.getByRole('region', { name: 'Brands' });
    expect(section).toHaveAttribute('aria-busy', 'true');

    const skeletons = within(section).getAllByTestId('skeleton-card');
    expect(skeletons).toHaveLength(3);
    for (const skeleton of skeletons) {
      expect(skeleton).toHaveAttribute('aria-label', 'Loading brand');
      expect(skeleton).toHaveClass('rounded-card');
    }
    expect(getBrandGridItems()).toHaveLength(3);
    expect(
      screen.queryByTestId('organization-automation-brand-card'),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: 'Go to brands' })).toBeNull();
  });
});
