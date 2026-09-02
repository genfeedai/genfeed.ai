'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandDetailLinksSummaryCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

function formatLinks(count: number): string {
  return `${count} ${count === 1 ? 'link' : 'links'}`;
}

/**
 * Profile-sidebar summary for external website / profile URLs.
 * OAuth social accounts live on Social summary + /settings/social.
 */
export default function BrandDetailLinksSummaryCard({
  linksCount,
  manageHref,
}: BrandDetailLinksSummaryCardProps) {
  return (
    <Card
      label="Links"
      description="Websites and public profiles shown on this brand."
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
          External
        </p>
        <p className="mt-1 text-sm text-foreground/90">
          {formatLinks(linksCount)}
        </p>
      </div>
    </Card>
  );
}
