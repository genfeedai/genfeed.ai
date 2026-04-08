'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { OverviewContentProps } from '@props/layout/overview.props';
import Card from '@ui/card/Card';
import CardIcon from '@ui/card/icon/CardIcon';
import Container from '@ui/layout/container/Container';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import Link from 'next/link';

export default function OverviewLayout({
  label,
  description,
  icon,
  cards = [],
  actionsTitle = 'Quick Actions',
  header,
  children,
}: OverviewContentProps) {
  return (
    <Container label={label} description={description} icon={icon}>
      {header}

      {cards.length > 0 ? (
        <section className="mt-10">
          <div className="mb-5 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
              Launch
            </p>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              {actionsTitle}
            </h2>
          </div>
          <div
            data-testid="overview-quick-actions"
            className={cn(
              'grid grid-cols-1 gap-3 md:grid-cols-2',
              'xl:grid-cols-4',
            )}
          >
            {cards.map((card) => (
              <Card
                key={card.id}
                className="h-full shadow-none"
                bodyClassName="flex h-full flex-col justify-between gap-5 p-4"
              >
                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
                    {card.label}
                  </p>
                  <CardIcon
                    icon={card.icon}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center border border-white/[0.12]',
                      card.color,
                    )}
                    iconClassName="h-5 w-5"
                  />
                  <p className="text-sm text-foreground/60">
                    {card.description}
                  </p>
                </div>

                <div className="mt-auto border-t border-white/[0.06] pt-4">
                  {card.onClick ? (
                    <Button
                      onClick={card.onClick}
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      className="text-xs tracking-[0.12em]"
                      label={card.cta}
                    />
                  ) : (
                    <PrimitiveButton
                      asChild
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      className="text-xs tracking-[0.12em]"
                    >
                      <Link href={card.href || '#'}>{card.cta}</Link>
                    </PrimitiveButton>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {children ? <div className="mt-8">{children}</div> : null}
    </Container>
  );
}
