'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import Link from 'next/link';

type Props = {
  accent: string;
  href?: string;
  label: string;
  tone: string;
  value: string;
};

export default function ContentTeamSummaryCard({
  accent,
  href,
  label,
  tone,
  value,
}: Props) {
  return (
    <Card className="h-full" bodyClassName="space-y-3 p-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
          {tone}
        </p>
        <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">
          {label}
        </h3>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
          {value}
        </p>
        <p className="text-sm leading-6 text-foreground/60">{accent}</p>
      </div>
      {href ? (
        <div className="pt-2">
          <PrimitiveButton
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="text-xs tracking-[0.12em]"
          >
            <Link href={href}>Open</Link>
          </PrimitiveButton>
        </div>
      ) : null}
    </Card>
  );
}
