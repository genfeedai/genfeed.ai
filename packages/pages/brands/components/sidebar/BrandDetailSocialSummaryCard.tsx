'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandDetailSocialSummaryCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

function formatConnected(count: number): string {
  return `${count} connected`;
}

/**
 * Profile-sidebar summary for OAuth / social integrations only.
 * External website links live on Brand Profile (inline list + ModalBrandLink).
 */
export default function BrandDetailSocialSummaryCard({
  connectedPlatformsCount,
  manageHref,
}: BrandDetailSocialSummaryCardProps) {
  return (
    <Card
      label="Social accounts"
      description="Connected platforms used for publishing and ads."
      headerAction={
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          className="h-8 shrink-0 px-2.5 text-xs"
        >
          <Link href={manageHref}>Manage</Link>
        </Button>
      }
    >
      <div className="rounded-md bg-background-secondary/50 px-3 py-2.5">
        <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Accounts
        </p>
        <p className="mt-1 text-sm text-foreground/90">
          {formatConnected(connectedPlatformsCount)}
        </p>
      </div>
    </Card>
  );
}
