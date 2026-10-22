import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandDetailLatestContentCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export default function BrandDetailLatestContentCard({
  label,
  viewAllHref,
  emptyTitle,
  emptyDescription,
  createLabel,
  createHref,
  children,
}: BrandDetailLatestContentCardProps) {
  return (
    <Card
      label={label}
      bodyClassName="gap-3 p-4"
      headerAction={
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Link href={viewAllHref}>View all</Link>
        </Button>
      }
    >
      {children ?? (
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground/70">{emptyTitle}</p>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            {emptyDescription}
          </p>
          <Button
            asChild
            className="mt-2"
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <Link href={createHref}>{createLabel}</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
