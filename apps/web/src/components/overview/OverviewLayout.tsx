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
import { BLOCK_STACK_CLASS } from '@ui/styles/block-spacing';
import Container from '@ui/layout/container/Container';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
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
