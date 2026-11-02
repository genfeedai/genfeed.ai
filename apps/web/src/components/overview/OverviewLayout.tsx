'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
} from '@genfeedai/contracts';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import Container from '@ui/layout/container/Container';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { OverviewContentProps } from '@/props/layout/overview.props';

const EMPTY_ARRAY: never[] = [];

/** One quick-action tile: icon, title, what it opens, and the way in. */
export function OverviewActionCard({ card }: { card: OverviewCard }) {
  return (
    <Card
      actions={
        card.onClick ? (
          <Button
            onClick={card.onClick}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            label={card.cta}
          />
        ) : (
          <PrimitiveButton
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          >
            <Link href={card.href || '#'}>{card.cta}</Link>
          </PrimitiveButton>
        )
      }
      bodyClassName="h-full justify-between"
      className="h-full"
      description={card.description}
      gap={CardGap.LG}
      icon={card.icon}
      iconWrapperClassName={cn('p-2', card.color)}
      label={card.label}
      padding={CardPadding.LG}
    />
  );
}

export function OverviewContent({
  cards = EMPTY_ARRAY,
  actionsTitle = 'Quick Actions',
  actionsLayout = 'cards',
  header,
  children,
}: OverviewContentProps) {
  return (
    <div
      className={cn(
        'flex flex-col',
        actionsLayout === 'compact' ? '@container gap-6' : 'gap-10',
      )}
    >
      {actionsLayout === 'compact' && cards.length > 0 ? (
        <nav
          aria-label={actionsTitle}
          className="flex flex-wrap gap-2 border-b border-border pb-4"
        >
          {cards.map((card) =>
            card.onClick ? (
              <Button
                key={card.id}
                onClick={card.onClick}
                variant={ButtonVariant.UNSTYLED}
                textTransform="none"
                withWrapper={false}
                className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <card.icon className="size-4 shrink-0" />
                {card.cta}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Button>
            ) : (
              <Link
                key={card.id}
                href={card.href || '#'}
                className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <card.icon className="size-4 shrink-0" />
                {card.cta}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            ),
          )}
        </nav>
      ) : null}
      {header ? <div>{header}</div> : null}

      {actionsLayout === 'cards' && cards.length > 0 ? (
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
