'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAccessState } from '@providers/access-state/access-state.provider';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import {
  ArrowRight,
  CircleCheck,
  Key,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { resolveOperationalHomeScope } from './operational-home.helpers';
import OperationalHomeSections from './operational-home-sections';
import { useConnectGenfeedStatus } from './use-connect-genfeed-status';

function ConnectionState({
  apiKeysHref,
  connectHref,
}: {
  apiKeysHref: string;
  connectHref: string;
}) {
  return (
    <WorkspaceSurface
      className="overflow-hidden"
      data-testid="operational-home-unconfigured"
      density="compact"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info shadow-border">
            <Terminal aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-foreground/40">
              Connection required
            </p>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground sm:text-lg">
              Connect an AI client to start operating
            </h2>
            <p className="max-w-xl text-xs leading-5 text-foreground/55">
              Configure Claude Code, Codex, or another Streamable HTTP MCP
              client. Live ops unlock after verification.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              >
                <Link href={connectHref}>
                  Connect Genfeed
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </Button>
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              >
                <Link href={apiKeysHref}>
                  <Key aria-hidden="true" className="size-3.5" />
                  Manage API keys
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <ul className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-border/50 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4 lg:flex-col lg:items-start">
          {[
            'Scoped MCP access',
            'Verified tool discovery',
            'Human approval controls',
          ].map((label) => (
            <li className="flex items-center gap-2" key={label}>
              <CircleCheck
                aria-hidden="true"
                className="size-3.5 shrink-0 text-success"
              />
              <span className="text-xs text-foreground/60">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </WorkspaceSurface>
  );
}

export default function OperationalHomeContent() {
  const { brands, organizationId, selectedBrand } = useBrand();
  const { accessState } = useAccessState();
  const {
    brandSlug,
    organizationId: resolvedOrganizationId,
    orgSlug,
  } = resolveOperationalHomeScope({
    accessOrganizationId: accessState?.organizationId,
    brands,
    organizationId,
    selectedBrand,
  });
  const connection = useConnectGenfeedStatus(resolvedOrganizationId);

  if (!orgSlug) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Alert className="w-full max-w-3xl">
          <AlertTitle aria-level={1} role="heading">
            Operational home needs an organization
          </AlertTitle>
          <AlertDescription>
            <p>
              Select or create an organization and brand before opening the
              operational control plane.
            </p>
            <Button asChild className="mt-4" variant={ButtonVariant.SECONDARY}>
              <Link href={APP_ROUTES.ONBOARDING.ROOT}>Continue setup</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const connectHref = createOrganizationAppRoute(orgSlug, APP_ROUTES.CONNECT);
  const apiKeysHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.API_KEYS,
  );

  // Shell Container owns equal page insets — do not re-apply px/py here.
  return (
    <div className="flex w-full flex-col gap-5">
      <h1 className="sr-only">Operational home</h1>

      {connection.status === 'configured' ? (
        <div className="flex justify-end">
          <div
            className="flex items-center gap-3 rounded-card bg-success/5 px-4 py-3 shadow-border"
            data-testid="operational-home-connected"
          >
            <ShieldCheck aria-hidden="true" className="size-5 text-success" />
            <div>
              <p className="text-sm font-medium text-foreground">
                MCP verified
              </p>
              <ClientFormattedDate
                className="text-xs text-foreground/45"
                fallback="Verification time unavailable"
                format="relative"
                value={connection.verifiedAt}
              />
            </div>
          </div>
        </div>
      ) : null}

      {connection.status === 'loading' ? (
        <div
          aria-live="polite"
          className="rounded-card bg-card p-5 text-sm text-foreground/55 shadow-border"
          role="status"
        >
          Checking MCP connection state...
        </div>
      ) : null}

      {connection.status === 'error' ? (
        <Alert variant="destructive">
          <Zap aria-hidden="true" className="size-4" />
          <AlertTitle aria-level={2} role="heading">
            Connection status unavailable
          </AlertTitle>
          <AlertDescription>
            <p>
              Genfeed could not confirm whether this workspace has a verified
              MCP client. Operational summaries remain available below.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  void connection.refresh();
                }}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Retry status
              </Button>
              <Button asChild variant={ButtonVariant.GHOST}>
                <Link href={connectHref}>Open Connect Genfeed</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {connection.status === 'unconfigured' ? (
        <ConnectionState apiKeysHref={apiKeysHref} connectHref={connectHref} />
      ) : null}

      <OperationalHomeSections brandSlug={brandSlug} orgSlug={orgSlug} />
    </div>
  );
}
