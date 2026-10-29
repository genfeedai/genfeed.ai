'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { useAccessState } from '@providers/access-state/access-state.provider';
import NoticeBanner from '@ui/banners/notice-banner/NoticeBanner';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { ArrowRight, Plug, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { resolveOperationalHomeScope } from './operational-home.helpers';
import OperationalHomeSections from './operational-home-sections';
import { useConnectCardDismissal } from './use-connect-card-dismissal';
import {
  type UseConnectGenfeedStatusResult,
  useConnectGenfeedStatus,
} from './use-connect-genfeed-status';

function ConnectionStatusLine({
  connectHref,
  connection,
  isDismissed,
  onDismiss,
}: {
  connectHref: string;
  connection: UseConnectGenfeedStatusResult;
  isDismissed: boolean | null;
  onDismiss: () => void;
}) {
  const translate = useTranslations('common');

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
        className="flex items-center justify-end gap-2 text-xs text-muted-foreground"
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

  if (isDismissed !== false) {
    return null;
  }

  return (
    <NoticeBanner
      tone="info"
      icon={<Plug />}
      title={translate('home.connect.title')}
      dismissLabel={translate('home.connect.dismiss')}
      onDismiss={onDismiss}
      testId="operational-home-unconfigured"
      actions={
        <Button
          asChild
          className="flex-1 @2xl:flex-none"
          size={ButtonSize.LG}
          variant={ButtonVariant.DEFAULT}
        >
          <Link href={connectHref}>
            {translate('home.connect.action')}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      }
    />
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

  // Shell Container owns equal page insets — do not re-apply px/py here.
  return (
    <div className="flex w-full flex-col gap-5">
      <h1 className="sr-only">Operational home</h1>

      <ConnectionStatusLine
        connectHref={connectHref}
        connection={connection}
        isDismissed={connectCard.isDismissed}
        onDismiss={connectCard.dismiss}
      />

      <OperationalHomeSections brandSlug={brandSlug} orgSlug={orgSlug} />
    </div>
  );
}
