// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoutedOrganizationBoundary from './routed-organization-boundary';

const contextState = vi.hoisted(() => ({
  isRouteConfirmed: false,
  organizations: [] as Array<{
    id: string;
    isActive: boolean;
    label: string;
    slug: string;
  }>,
  retry: vi.fn(),
  status: 'loading',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/missing-organization',
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@genfeedai/contexts/user/organization-context/organization-context',
  () => ({
    useRoutedOrganization: () => contextState,
  }),
);

describe('RoutedOrganizationBoundary', () => {
  beforeEach(() => {
    contextState.isRouteConfirmed = false;
    contextState.organizations = [];
    contextState.retry.mockReset();
    contextState.status = 'loading';
  });

  it('shows a loader instead of tenant content while route reconciliation is pending', () => {
    render(
      <RoutedOrganizationBoundary>
        <span>Tenant content</span>
      </RoutedOrganizationBoundary>,
    );

    expect(screen.queryByText('Tenant content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading your workspace',
    );
    expect(screen.getByTestId('organization-route-pending')).toHaveClass(
      'min-h-dvh',
      'bg-background',
    );
    expect(document.querySelector('.genfeed-loader-root')).toBeTruthy();
  });

  it('shows a switching loader without mounting tenant content', () => {
    contextState.status = 'switching';

    render(
      <RoutedOrganizationBoundary>
        <span>Tenant content</span>
      </RoutedOrganizationBoundary>,
    );

    expect(screen.queryByText('Tenant content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Switching organization',
    );
    expect(
      screen.queryByText('Loading your workspace'),
    ).not.toBeInTheDocument();
  });

  it('renders tenant content only for a confirmed route', () => {
    contextState.isRouteConfirmed = true;
    contextState.status = 'matched';

    render(
      <RoutedOrganizationBoundary>
        <span>Tenant content</span>
      </RoutedOrganizationBoundary>,
    );

    expect(screen.getByText('Tenant content')).toBeInTheDocument();
  });

  it('shows a recoverable switch failure without stale tenant content', () => {
    contextState.status = 'failed';

    render(
      <RoutedOrganizationBoundary>
        <span>Tenant content</span>
      </RoutedOrganizationBoundary>,
    );

    expect(screen.queryByText('Tenant content')).not.toBeInTheDocument();
    expect(screen.getByText('Organization switch failed')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass(
      'min-h-dvh',
      'items-center',
      'justify-center',
    );
    // Route smoke checks (#5070) key off this marker — an unrecoverable,
    // page-blocking boundary failure, not a normal-looking page.
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(contextState.retry).toHaveBeenCalledTimes(1);
  });

  it('shows an explicit authorization failure without offering a switch retry', () => {
    contextState.status = 'unauthorized';
    contextState.organizations = [
      {
        id: 'org_alpha',
        isActive: true,
        label: 'Alpha',
        slug: 'alpha',
      },
      {
        id: 'org_bravo',
        isActive: false,
        label: 'Bravo',
        slug: 'bravo',
      },
    ];

    render(
      <RoutedOrganizationBoundary>
        <span>Tenant content</span>
      </RoutedOrganizationBoundary>,
    );

    expect(screen.getByText('Organization unavailable')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open alpha workspace/i }),
    ).toHaveAttribute('href', '/alpha/~/workspace/overview');
    expect(
      screen.getByRole('link', { name: /open bravo workspace/i }),
    ).toHaveAttribute('href', '/bravo/~/workspace/overview');
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
    // A missing/unauthorized organization is a valid product state (the
    // user can pick another workspace below), not a caught render exception
    // — it must NOT trip the route smoke suite's ErrorBoundary check (#5070).
    expect(
      screen.queryByTestId('error-boundary-fallback'),
    ).not.toBeInTheDocument();
  });
});
