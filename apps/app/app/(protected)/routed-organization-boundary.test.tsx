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

  it('does not mount tenant content while route reconciliation is pending', () => {
    render(
      <RoutedOrganizationBoundary>
        <span>Tenant content</span>
      </RoutedOrganizationBoundary>,
    );

    expect(screen.queryByText('Tenant content')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('status', {
        name: 'Confirming organization context',
      }).length,
    ).toBeGreaterThan(0);
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
  });
});
