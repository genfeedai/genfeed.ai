'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { useAccessState } from '@providers/access-state/access-state.provider';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { ArrowRight, Key, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { resolveOperationalHomeScope } from './operational-home.helpers';
import OperationalHomeSections from './operational-home-sections';
import {
  type UseConnectGenfeedStatusResult,
  useConnectGenfeedStatus,
} from './use-connect-genfeed-status';

function ConnectionStatusLine({
  apiKeysHref,
  connectHref,
  connection,
}: {
  apiKeysHref: string;
  connectHref: string;
  connection: UseConnectGenfeedStatusResult;
}) {
  if (connection.status === 'configured') {
    return (
      <div
        className="flex items-center justify-end gap-2 text-xs text-foreground/55"
        data-testid="operational-home-connected"
      >
        <ShieldCheck aria-hidden="true" className="size-3.5 text-success" />
        <span>MCP verified</span>
        <span aria-hidden="true">·</span>
        <ClientFormattedDate
          fallback="Verification time unavailable"
          format="relative"
          value={connection.verifiedAt}
        />
      </div>
    );
  }

  if (connection.status === 'loading') {
    return (
      <div
        aria-live="polite"
        className="flex items-center justify-end gap-2 text-xs text-foreground/45"
        role="status"
      >
        <Skeleton height={12} variant="text" width={160} />
        <span className="sr-only">Checking MCP connection state...</span>
      </div>
    );
  }

  if (connection.status === 'error') {
    return (
      <div
        className="flex flex-wrap items-center gap-2 text-xs text-destructive"
        role="alert"
      >
        <Zap aria-hidden="true" className="size-3.5 shrink-0" />
        <span>
          Connection status unavailable. Operational summaries remain available
          below.
        </span>
        <Button
          onClick={() => {
            void connection.refresh();
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Retry status
        </Button>
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
          <Link href={connectHref}>Open Connect Genfeed</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 text-xs"
      data-testid="operational-home-unconfigured"
    >
      <span className="text-foreground/60">
        Connect Claude Code, Codex, or another MCP client to unlock live
        operations.
      </span>
      <div className="flex flex-wrap gap-2">
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
          <Link href={connectHref}>
            Connect Genfeed
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
          <Link href={apiKeysHref}>
            <Key aria-hidden="true" className="size-3.5" />
            Manage API keys
          </Link>
        </Button>
      </div>
    </div>
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

      <ConnectionStatusLine
        apiKeysHref={apiKeysHref}
        connectHref={connectHref}
        connection={connection}
      />

      <OperationalHomeSections brandSlug={brandSlug} orgSlug={orgSlug} />
    </div>
  );
}
