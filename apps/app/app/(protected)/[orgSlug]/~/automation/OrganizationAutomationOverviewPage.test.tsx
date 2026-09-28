// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('next/link', () => ({
  default: ({ children, href }: ComponentProps<'a'>) => (
    <a href={href}>{children}</a>
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

// Radix menus only open on pointer events jsdom does not synthesize; render
// the overflow items inline so their labels and handlers are assertable.
vi.mock('@ui/primitives/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="overflow-menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children?: ReactNode;
    onSelect?: () => void;
  }) => (
    <div
      data-testid="overflow-item"
      onClick={onSelect}
      onKeyDown={onSelect}
      role="menuitem"
      tabIndex={-1}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <div data-testid="overflow-separator" />,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

const { default: OrganizationAutomationOverviewPage } = await import(
  './OrganizationAutomationOverviewPage'
);

function getBrandGridItems(): HTMLElement[] {
  const grid = screen.getByTestId('organization-automation-brands')
    .firstElementChild as HTMLElement;
  return Array.from(grid.children) as HTMLElement[];
}

describe('OrganizationAutomationOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandState.isReady = true;
    mocks.brandState.brands = [];
  });

  it('renders a card per brand under a Brands section', () => {
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand_2', label: 'Solar', slug: 'solar' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    expect(getBrandGridItems()).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Brands' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Moonrise' })).toBeVisible();
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

  it('moves the automation surfaces into the overflow menu', () => {
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand_2', label: 'Solar', slug: 'solar' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    const [moonrise, solar] = screen.getAllByTestId(
      'organization-automation-brand-card',
    );
    expect(
      within(moonrise)
        .getAllByTestId('overflow-item')
        .map((item) => item.textContent),
    ).toEqual(['Workflows', 'Runs', 'Agents', 'Analytics']);
    expect(
      within(solar).getByRole('button', {
        name: 'More automation for Solar',
      }),
    ).toBeInTheDocument();

    fireEvent.click(within(solar).getByText('Runs'));
    expect(mocks.push).toHaveBeenCalledWith('/acme/solar/automation/runs');

    fireEvent.click(within(moonrise).getByText('Workflows'));
    expect(mocks.push).toHaveBeenCalledWith(
      '/acme/moonrise/automation/workflows',
    );
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

  it('waits for the brand context before deciding the empty state', () => {
    mocks.brandState.isReady = false;

    render(<OrganizationAutomationOverviewPage />);

    expect(screen.queryByTestId('organization-automation-brands')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Go to brands' })).toBeNull();
  });
});
