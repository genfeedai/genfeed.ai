'use client';

import { APP_ROUTES, getOrgSwitchHref } from '@genfeedai/constants';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Building2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function OrganizationUnavailable() {
  const pathname = usePathname() ?? APP_ROUTES.ROOT;
  const { organizations } = useRoutedOrganization();

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlert
            aria-hidden="true"
            className="size-6 text-destructive"
          />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          Organization unavailable
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          This organization does not exist or your account is not authorized to
          access it.
        </p>

        {organizations.length > 0 ? (
          <div className="mt-7 w-full">
            <p className="mb-2 text-left text-xs font-medium text-foreground/55">
              Choose an organization you can access
            </p>
            <ul className="flex flex-col gap-2">
              {organizations.map((organization) => (
                <li key={organization.id}>
                  <Link
                    aria-label={`Open ${organization.label} workspace`}
                    className="group flex w-full items-center gap-3 rounded-card bg-card px-4 py-3 text-left shadow-border transition hover:bg-foreground/[0.04] hover:shadow-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={getOrgSwitchHref(organization.slug, pathname)}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-foreground/65 transition group-hover:text-foreground">
                      <Building2 aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {organization.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {organization.isActive
                          ? 'Current workspace'
                          : 'Open workspace'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Link
            className="mt-6 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={APP_ROUTES.ROOT}
          >
            Return to workspace setup
          </Link>
        )}
      </div>
    </main>
  );
}

export default function RoutedOrganizationBoundary({ children }: LayoutProps) {
  const { isRouteConfirmed, retry, status } = useRoutedOrganization();

  if (isRouteConfirmed) {
    return <>{children}</>;
  }

  if (status === 'unauthorized') {
    return <OrganizationUnavailable />;
  }

  if (status === 'failed') {
    return (
      <ErrorFallback
        title="Organization switch failed"
        description="The requested organization could not be confirmed. No tenant data was loaded."
        resetErrorBoundary={retry}
      />
    );
  }

  if (status === 'stale') {
    return (
      <ErrorFallback
        title="Organization context changed"
        description="Another tab changed organization context. Synchronize this tab before continuing."
        resetErrorBoundary={retry}
      />
    );
  }

  return null;
}
