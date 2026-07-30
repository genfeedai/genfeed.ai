'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailSocialSummaryCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function BrandDetailSocialSummaryCard({
  connectedPlatformsCount,
  linksCount,
  manageHref,
}: BrandDetailSocialSummaryCardProps) {
  return (
    <Card
      label="Social & Links"
      description="Connected accounts and external links on this brand."
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
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-background-secondary/50 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Accounts
          </p>
          <p className="mt-1 text-sm text-foreground/90">
            {formatCount(connectedPlatformsCount, 'connected', 'connected')}
          </p>
        </div>
        <div className="rounded-md bg-background-secondary/50 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Links
          </p>
          <p className="mt-1 text-sm text-foreground/90">
            {formatCount(linksCount, 'link', 'links')}
          </p>
        </div>
      </div>
    </Card>
  );
}
