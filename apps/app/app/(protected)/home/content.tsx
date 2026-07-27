'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES, createOrganizationAppRoute } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { useAccessState } from '@providers/access-state/access-state.provider';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import {
  HiArrowPath,
  HiArrowRight,
  HiOutlineBolt,
  HiOutlineCheckCircle,
  HiOutlineCommandLine,
  HiOutlineKey,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';
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
      contentClassName="gap-8 p-6 sm:p-8"
      data-testid="operational-home-unconfigured"
      framed={false}
    >
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <div className="flex size-12 items-center justify-center rounded-lg bg-info/10 text-info shadow-border">
            <HiOutlineCommandLine aria-hidden="true" className="size-6" />
          </div>
          <div className="max-w-2xl space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
              Connection required
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
              Connect an AI client to start operating
            </h2>
            <p className="text-sm leading-7 text-foreground/60">
              Configure Claude Code, Codex, or another Streamable HTTP MCP
              client. Genfeed will switch this home to live approvals,
              publishing state, channel health, and activity after a successful
              verification.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant={ButtonVariant.DEFAULT}>
              <Link href={connectHref}>
                Connect Genfeed
                <HiArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
            <Button asChild variant={ButtonVariant.SECONDARY}>
              <Link href={apiKeysHref}>
                <HiOutlineKey aria-hidden="true" className="size-4" />
                Manage API keys
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-card bg-background p-5 shadow-border">
          {[
            'Scoped MCP access',
            'Verified tool discovery',
            'Human approval controls',
          ].map((label) => (
            <div className="flex items-center gap-3" key={label}>
              <HiOutlineCheckCircle
                aria-hidden="true"
                className="size-5 shrink-0 text-success"
              />
              <span className="text-sm text-foreground/65">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </WorkspaceSurface>
  );
}

export default function OperationalHomeContent() {
  const { brands, organizationId, selectedBrand } = useBrand();
  const { accessState } = useAccessState();
  const connection = useConnectGenfeedStatus();
  const { brandSlug, orgSlug } = resolveOperationalHomeScope({
    accessOrganizationId: accessState?.organizationId,
    brands,
    organizationId,
    selectedBrand,
  });

  if (!orgSlug) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <Alert>
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
      </main>
    );
  }

  const connectHref = createOrganizationAppRoute(orgSlug, APP_ROUTES.CONNECT);
  const apiKeysHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.API_KEYS,
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex justify-end">
        <h1 className="sr-only">Operational home</h1>

        {connection.status === 'configured' ? (
          <div
            className="flex items-center gap-3 rounded-card bg-success/5 px-4 py-3 shadow-border"
            data-testid="operational-home-connected"
          >
            <HiOutlineShieldCheck
              aria-hidden="true"
              className="size-5 text-success"
            />
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
        ) : null}
      </div>

      {connection.status === 'loading' ? (
        <div
          aria-live="polite"
          className="rounded-card bg-card p-6 text-sm text-foreground/55 shadow-border"
          role="status"
        >
          Checking MCP connection state...
        </div>
      ) : null}

      {connection.status === 'error' ? (
        <Alert variant="destructive">
          <HiOutlineBolt aria-hidden="true" className="size-4" />
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
                <HiArrowPath aria-hidden="true" className="size-4" />
                Retry status
              </Button>
              <Button asChild variant={ButtonVariant.GHOST}>
                <Link href={connectHref}>Open Connect Genfeed</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <OperationalHomeSections brandSlug={brandSlug} orgSlug={orgSlug} />

      {connection.status === 'unconfigured' ? (
        <ConnectionState apiKeysHref={apiKeysHref} connectHref={connectHref} />
      ) : null}
    </main>
  );
}
