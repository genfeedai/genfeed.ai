'use client';

import { CardGap, CardPadding } from '@genfeedai/contracts';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import Container from '@ui/layout/container/Container';
import { BLOCK_STACK_CLASS } from '@ui/styles/block-spacing';
import Link from 'next/link';
import type { OverviewContentProps } from '@/props/layout/overview.props';

const EMPTY_ARRAY: never[] = [];

/** One quick-action tile: icon, title and what it opens. The whole tile is the way in. */
export function OverviewActionCard({ card }: { card: OverviewCard }) {
  const tile = (
    <Card
      bodyClassName="h-full"
      className="h-full"
      description={card.description}
      gap={CardGap.LG}
      icon={card.icon}
      iconWrapperClassName={cn('p-2', card.color)}
      isInteractive={Boolean(card.href) && !card.onClick}
      label={card.label}
      onClick={card.onClick}
      padding={CardPadding.LG}
    />
  );

  if (card.onClick) {
    return tile;
  }

  return (
    <Link
      aria-label={card.cta}
      className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={card.href || '#'}
    >
      {tile}
    </Link>
  );
}

export function OverviewContent({
  cards = EMPTY_ARRAY,
  actionsTitle = 'Quick Actions',
  header,
  children,
}: OverviewContentProps) {
  return (
    <div className={BLOCK_STACK_CLASS}>
      {header ? <div>{header}</div> : null}

      {cards.length > 0 ? (
        <section>
          <h2 className="sr-only">{actionsTitle}</h2>
          <CollectionGrid data-testid="overview-quick-actions" maxColumns={4}>
            {cards.map((card) => (
              <OverviewActionCard card={card} key={card.id} />
            ))}
          </CollectionGrid>
        </section>
      ) : null}

      {children ? <div>{children}</div> : null}
    </div>
  );
}

export default function OverviewLayout(props: OverviewContentProps) {
  return (
    <Container label={props.label} icon={props.icon}>
      <div className="max-w-6xl">
        <OverviewContent {...props} />
      </div>
    </Container>
  );
}
