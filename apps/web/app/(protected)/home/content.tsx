'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { useAccessState } from '@providers/access-state/access-state.provider';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { ArrowRight, Plug, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import {
  type RememberedConnectLine,
  readRememberedConnectLine,
  rememberConnectLine,
} from './connect-line-memory';
import { resolveOperationalHomeScope } from './operational-home.helpers';
import OperationalHomeSections from './operational-home-sections';
import { useConnectCardDismissal } from './use-connect-card-dismissal';
import {
  type UseConnectGenfeedStatusResult,
  useConnectGenfeedStatus,
} from './use-connect-genfeed-status';

/**
 * The connection state is unknown until the query settles, so nothing is
 * reserved for it up front. A viewer whose state was remembered from the last
 * visit has it on the first paint and nothing grows in; one with nothing
 * remembered, or whose state changed, sees it grow in with a fade instead of
 * the page jumping. The bottom
 * padding is the gap to the sections below and animates with the row, so no
 * space is left behind while it is hidden.
 */
function ConnectionStatusReveal({
  animate,
  children,
}: {
  animate: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        animate
          ? 'grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-300 ease-out starting:grid-rows-[0fr] starting:opacity-0 motion-reduce:transition-none'
          : 'grid grid-rows-[1fr] opacity-100'
      }
    >
      <div className="min-h-0 overflow-hidden pb-5">{children}</div>
    </div>
  );
}

function ConnectionStatusLine({
  connectHref,
  connection,
  isDismissed,
  onDismiss,
  remembered,
}: {
  connectHref: string;
  connection: UseConnectGenfeedStatusResult;
  isDismissed: boolean | null;
  onDismiss: () => void;
  remembered: RememberedConnectLine | null;
}) {
  // Whether the line was already on screen at the first paint, from memory. It
  // is read once: later changes of state must not turn the animation on or off.
  const [isPaintedFromMemory] = useState(
    () =>
      remembered !== null &&
      (remembered.status === 'configured' || isDismissed === false),
  );
  const status =
    connection.status === 'loading' && remembered
      ? remembered.status
      : connection.status;
  const verifiedAt =
    connection.status === 'loading'
      ? (remembered?.verifiedAt ?? null)
      : connection.verifiedAt;

  if (status === 'loading') {
    return (
      <span aria-live="polite" className="sr-only" role="status">
        Checking MCP connection state...
      </span>
    );
  }

  if (status === 'unconfigured' && isDismissed !== false) {
    return null;
  }

  return (
    <ConnectionStatusReveal animate={!isPaintedFromMemory}>
      <ConnectionStatusBody
        connectHref={connectHref}
        connection={connection}
        onDismiss={onDismiss}
        status={status}
        verifiedAt={verifiedAt}
      />
    </ConnectionStatusReveal>
  );
}

function ConnectionStatusBody({
  connectHref,
  connection,
  onDismiss,
  status,
  verifiedAt,
}: {
  connectHref: string;
  connection: UseConnectGenfeedStatusResult;
  onDismiss: () => void;
  status: UseConnectGenfeedStatusResult['status'];
  verifiedAt: string | null;
}) {
  const translate = useTranslations('common');

  if (status === 'configured') {
    return (
      <div
        className="flex items-center justify-end gap-2 text-xs text-foreground/60"
        data-testid="operational-home-connected"
      >
        <ShieldCheck aria-hidden="true" className="size-3.5 text-success" />
        <span>MCP verified</span>
        <span aria-hidden="true">·</span>
        <ClientFormattedDate
          fallback="Verification time unavailable"
          format="relative"
          value={verifiedAt}
        />
      </div>
    );
  }

  if (status === 'error') {
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
    <Alert
      closeLabel={translate('home.connect.dismiss')}
      data-testid="operational-home-unconfigured"
      icon={<Plug className="size-5" />}
      onClose={onDismiss}
      variant="info"
    >
      <AlertTitle>{translate('home.connect.title')}</AlertTitle>
      <AlertActions>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          <Link href={connectHref}>
            {translate('home.connect.action')}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      </AlertActions>
    </Alert>
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
  const connectCard = useConnectCardDismissal(resolvedOrganizationId);
  const remembered = useMemo(
    () => readRememberedConnectLine(resolvedOrganizationId),
    [resolvedOrganizationId],
  );
  const connectionStatus = connection.status;
  const connectionVerifiedAt = connection.verifiedAt;

  // use-effect-audit: ignore writes to browser storage, an outside system
  useEffect(() => {
    if (
      connectionStatus === 'configured' ||
      connectionStatus === 'unconfigured'
    ) {
      rememberConnectLine(resolvedOrganizationId, {
        status: connectionStatus,
        verifiedAt: connectionVerifiedAt,
      });
    }
  }, [connectionStatus, connectionVerifiedAt, resolvedOrganizationId]);

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

  const connectHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.CONNECTORS.AGENTS,
  );

  // Shell Container owns equal page insets — do not re-apply px/py here.
  return (
    <div className="flex w-full flex-col">
      <h1 className="sr-only">Operational home</h1>

      <ConnectionStatusLine
        connectHref={connectHref}
        connection={connection}
        isDismissed={connectCard.isDismissed}
        onDismiss={connectCard.dismiss}
        remembered={remembered}
      />

      <OperationalHomeSections brandSlug={brandSlug} orgSlug={orgSlug} />
    </div>
  );
}
