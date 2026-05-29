'use client';

import { ButtonSize, type ButtonVariant, CardVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { buttonVariants } from '@ui/primitives/button.variants';
import Link from 'next/link';
import type { IconType } from 'react-icons';

interface HeroAction {
  href: string;
  label: string;
  variant: ButtonVariant;
}

type OverviewPlaceholderCardProps = {
  title: string;
  description: string;
  icon: IconType;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
};

export default function OverviewPlaceholderCard({
  title,
  description,
  icon: Icon,
  primaryAction,
  secondaryAction,
}: OverviewPlaceholderCardProps) {
  return (
    <Card variant={CardVariant.DEFAULT} bodyClassName="p-6">
      <div className="flex h-full flex-col gap-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-white/5 text-foreground/70">
          <Icon className="size-6" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h3>
          <p className="max-w-2xl text-sm leading-6 text-foreground/70">
            {description}
          </p>
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {primaryAction ? (
              <Link
                href={primaryAction.href}
                className={buttonVariants({
                  size: ButtonSize.SM,
                  variant: primaryAction.variant,
                })}
              >
                {primaryAction.label}
              </Link>
            ) : null}
            {secondaryAction ? (
              <Link
                href={secondaryAction.href}
                className={buttonVariants({
                  size: ButtonSize.SM,
                  variant: secondaryAction.variant,
                })}
              >
                {secondaryAction.label}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
