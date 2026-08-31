// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandState: {
    brands: [] as Array<{ id: string; label: string; slug?: string }>,
    isReady: true,
  },
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

const { default: OrganizationAutomationOverviewPage } = await import(
  './OrganizationAutomationOverviewPage'
);

describe('OrganizationAutomationOverviewPage', () => {
  beforeEach(() => {
    mocks.brandState.isReady = true;
    mocks.brandState.brands = [];
  });

  it('renders a card per brand with automation deep links', () => {
    mocks.brandState.brands = [
      { id: 'brand_1', label: 'Moonrise', slug: 'moonrise' },
      { id: 'brand_2', label: 'Solar', slug: 'solar' },
    ];

    render(<OrganizationAutomationOverviewPage />);

    expect(
      screen.getByTestId('organization-automation-brands').children,
    ).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Moonrise' })).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Open Automation' })[0],
    ).toHaveAttribute('href', '/acme/moonrise/automation');
    expect(
      screen.getAllByRole('link', { name: 'Workflows' })[0],
    ).toHaveAttribute('href', '/acme/moonrise/automation/workflows');
    expect(screen.getAllByRole('link', { name: 'Runs' })[1]).toHaveAttribute(
      'href',
      '/acme/solar/automation/runs',
    );
  });

  it('points at brand creation when the organization has no brands', () => {
    render(<OrganizationAutomationOverviewPage />);

    expect(screen.queryByTestId('organization-automation-brands')).toBeNull();
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

    expect(
      screen.getByTestId('organization-automation-brands').children,
    ).toHaveLength(1);
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
