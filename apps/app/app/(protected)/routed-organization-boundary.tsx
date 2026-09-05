'use client';

import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES, getOrgSwitchHref } from '@genfeedai/contracts/constants';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Button } from '@ui/primitives/button';
import { Building2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

function OrganizationUnavailable() {
  const pathname = usePathname() ?? APP_ROUTES.ROOT;
  const { organizations } = useRoutedOrganization();
  const translate = useTranslations('pages.organizationRouting.unavailable');

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
          {translate('title')}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {translate('description')}
        </p>

        {organizations.length > 0 ? (
          <div className="mt-7 w-full">
            <p className="mb-2 text-left text-xs font-medium text-foreground/55">
              {translate('chooseOrganization')}
            </p>
            <ul className="flex flex-col gap-2">
              {organizations.map((organization) => (
                <li key={organization.id}>
                  <Button
                    asChild
                    withWrapper={false}
                    variant={ButtonVariant.SECONDARY}
                    className="group h-auto w-full justify-start gap-3 px-4 py-3 text-left"
                  >
                    <Link
                      aria-label={translate('openWorkspaceAria', {
                        organization: organization.label,
                      })}
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
                            ? translate('currentWorkspace')
                            : translate('openWorkspace')}
                        </span>
                      </span>
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Link
            className="mt-6 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={APP_ROUTES.ROOT}
          >
            {translate('returnSetup')}
          </Link>
        )}
      </div>
    </main>
  );
}

export default function RoutedOrganizationBoundary({ children }: LayoutProps) {
  const { isRouteConfirmed, retry, status } = useRoutedOrganization();
  const translate = useTranslations('pages.organizationRouting');

  if (isRouteConfirmed) {
    return <>{children}</>;
  }

  if (status === 'unauthorized') {
    return <OrganizationUnavailable />;
  }

  if (status === 'failed') {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 sm:px-6">
        <ErrorFallback
          title={translate('failure.title')}
          description={translate('failure.description')}
          resetErrorBoundary={retry}
        />
      </main>
    );
  }

  return null;
}
