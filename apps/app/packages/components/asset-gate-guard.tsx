'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { ButtonVariant, CardVariant } from '@genfeedai/enums';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { HiArrowRight, HiLockClosed, HiSparkles } from 'react-icons/hi2';
import {
  isAssetGateSectionPath,
  normalizeProtectedPathname,
} from '@/lib/navigation/operator-shell';

/**
 * First-asset unlock gate — authoritative page-level soft lock.
 *
 * Mounted inside the protected app shell (so the nav chrome stays visible), it
 * replaces the CONTENT of a gated section with a teaser whenever the org has not
 * generated its first asset. This is a soft lock: the section is never hidden and
 * never 404s, the CTA routes to the agent, and an "explore anyway" escape hatch
 * clears the lock permanently for the user. Non-gated routes (agent, settings,
 * studio, research, publish, messages, admin) always render their children.
 */
export default function AssetGateGuard({ children }: LayoutProps) {
  const { isAssetGateLocked, dismissAssetGate } = useAccessState();
  const { orgHref } = useOrgUrl();
  const rawPathname = usePathname();
  const [isDismissing, setIsDismissing] = useState(false);

  const isGatedSection = useMemo(
    () => isAssetGateSectionPath(normalizeProtectedPathname(rawPathname ?? '')),
    [rawPathname],
  );

  if (!isAssetGateLocked || !isGatedSection) {
    return <>{children}</>;
  }

  const agentHref = orgHref(APP_ROUTES.AGENT.NEW);

  async function handleExploreAnyway() {
    setIsDismissing(true);
    try {
      await dismissAssetGate();
    } finally {
      setIsDismissing(false);
    }
  }

  return (
    <div className="flex min-h-full w-full items-center justify-center p-6">
      <Card
        variant={CardVariant.DEFAULT}
        className="max-w-md"
        bodyClassName="items-center gap-5 p-8 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HiLockClosed className="h-6 w-6" aria-hidden="true" />
        </span>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            Generate your first asset to unlock
          </h2>
          <p className="text-sm text-muted-foreground">
            Your workspace, library, calendar, analytics, and workflows light up
            the moment you create something. Start with the agent — it will make
            your first asset in a couple of steps.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link
            href={agentHref}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            aria-label="Go to the agent to generate your first asset"
          >
            <HiSparkles className="h-4 w-4" aria-hidden="true" />
            Generate your first asset
            <HiArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <Button
            variant={ButtonVariant.GHOST}
            onClick={handleExploreAnyway}
            isLoading={isDismissing}
            ariaLabel="Explore the app without generating an asset first"
          >
            Explore anyway
          </Button>
        </div>
      </Card>
    </div>
  );
}
