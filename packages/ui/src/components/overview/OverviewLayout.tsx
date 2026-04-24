'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { OverviewContentProps } from '@genfeedai/props/layout/overview.props';
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
      <div className="flex flex-col gap-10">
        {header ? <div className="max-w-6xl">{header}</div> : null}

        {cards.length > 0 ? (
          <section className="max-w-6xl">
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
                '2xl:grid-cols-4',
              )}
            >
              {cards.map((card) => (
                <Card
                  key={card.id}
                  className="ship-ui gen-shell-panel h-full rounded-[1.25rem] border-white/[0.06] bg-background/88 shadow-[0_28px_72px_-48px_rgba(0,0,0,0.92)]"
                  bodyClassName="flex h-full min-h-[220px] flex-col justify-between gap-6 p-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
                          {card.label}
                        </p>
                        <p className="max-w-[16rem] text-sm leading-6 text-foreground/60">
                          {card.description}
                        </p>
                      </div>
                      <CardIcon
                        icon={card.icon}
                        className={cn(
                          'gen-shell-surface flex h-11 w-11 items-center justify-center rounded-2xl border-white/[0.08]',
                          card.color,
                        )}
                        iconClassName="h-5 w-5"
                      />
                    </div>
                  </div>

                  <div className="mt-auto border-t border-white/[0.06] pt-4">
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
            </div>
          </section>
        ) : null}

        {children ? <div className="max-w-6xl">{children}</div> : null}
      </div>
    </Container>
  );
}
