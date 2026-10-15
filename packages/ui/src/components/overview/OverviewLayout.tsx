'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { OverviewContentProps } from '@genfeedai/props/layout/overview.props';
import Card from '@ui/card/Card';
import CardIcon from '@ui/card/icon/CardIcon';
import CollectionGrid from '@ui/collection/CollectionGrid';
import Container from '@ui/layout/container/Container';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

const EMPTY_ARRAY: never[] = [];

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
          {cards.map((card) => (
            <Link
              key={card.id}
              href={card.href || '#'}
              className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <card.icon className="size-4 shrink-0" />
              {card.cta}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          ))}
        </nav>
      ) : null}
      {header ? <div>{header}</div> : null}

      {actionsLayout === 'cards' && cards.length > 0 ? (
        <section>
          <div className="mb-5 space-y-1">
            <p className="text-2xs font-bold uppercase tracking-[0.2em] text-foreground/35">
              Launch
            </p>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              {actionsTitle}
            </h2>
          </div>
          <CollectionGrid data-testid="overview-quick-actions" maxColumns={4}>
            {cards.map((card) => (
              <Card
                key={card.id}
                className="h-full"
                bodyClassName="flex h-full flex-col justify-between gap-6 p-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-2xs font-bold uppercase tracking-[0.16em] text-foreground/35">
                        {card.label}
                      </p>
                      <p className="max-w-[16rem] text-sm leading-6 text-foreground/60">
                        {card.description}
                      </p>
                    </div>
                    <CardIcon
                      icon={card.icon}
                      className={cn(
                        'gen-shell-surface flex size-11 items-center justify-center rounded-md border-white/[0.08]',
                        card.color,
                      )}
                      iconClassName="size-5"
                    />
                  </div>
                </div>

                <div className="mt-auto border-t border-border pt-4">
                  {card.onClick ? (
                    <Button
                      onClick={card.onClick}
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      className="w-full justify-center text-xs tracking-[0.08em]"
                      label={card.cta}
                    />
                  ) : (
                    <PrimitiveButton
                      asChild
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      className="w-full justify-center text-xs tracking-[0.08em]"
                    >
                      <Link href={card.href || '#'}>{card.cta}</Link>
                    </PrimitiveButton>
                  )}
                </div>
              </Card>
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
    <Container
      label={props.label}
      description={props.description}
      icon={props.icon}
    >
      <div className="max-w-6xl">
        <OverviewContent {...props} />
      </div>
    </Container>
  );
}
