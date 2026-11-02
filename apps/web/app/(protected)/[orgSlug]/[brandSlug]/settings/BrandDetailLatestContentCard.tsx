import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandDetailLatestContentCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

/**
 * One "latest" strip on the brand page. The title and View all sit above the
 * content, like every collection section in the app; nothing is wrapped in a
 * card header. Only the empty state is a card.
 */
export default function BrandDetailLatestContentCard({
  label,
  viewAllLink,
  emptyTitle,
  createLabel,
  createHref,
  children,
}: BrandDetailLatestContentCardProps) {
  return (
    <CollectionSection
      actions={
        <Button
          asChild
          size={ButtonSize.XS}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {viewAllLink}
        </Button>
      }
      title={label}
    >
      {children ?? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground/70">
              {emptyTitle}
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
        </Card>
      )}
    </CollectionSection>
  );
}
