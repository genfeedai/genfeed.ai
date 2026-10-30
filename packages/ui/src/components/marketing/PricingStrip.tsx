'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PricingStripProps } from '@genfeedai/props/website/pricing-strip.props';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

const PILLAR_COLUMNS = [
  {
    label: 'BYOK + Credit Packs',
    price: 'Free / PAYG',
    subtitle: 'Self-Serve',
  },
  {
    label: 'Done-For-You',
    price: 'Monthly Retainer',
    subtitle: 'Full Service',
  },
  {
    label: 'Setup & Training',
    price: 'One-Time',
    subtitle: 'Onboarding',
  },
] as const;

export default function PricingStrip({
  inverted,
  className,
}: PricingStripProps) {
  return (
    <div
      className={cn(
        'mb-12 border',
        inverted ? 'border-primary-foreground/10' : 'border-foreground/5',
        className,
      )}
    >
      <div className="grid grid-cols-1 gap-px md:grid-cols-3">
        {PILLAR_COLUMNS.map((column) => {
          const isFeatured = column.label === 'Done-For-You';

          return (
            <div
              key={column.label}
              className={cn(
                'px-6 py-5 text-center',
                isFeatured &&
                  (inverted ? 'bg-primary-foreground/5' : 'bg-foreground/5'),
              )}
            >
              <div
                className={cn(
                  'mb-2 flex items-center justify-center gap-2 text-2xs font-black uppercase tracking-widest',
                  inverted
                    ? 'text-primary-foreground/40'
                    : 'text-foreground/40',
                )}
              >
                {column.subtitle}
              </div>

              <div
                className={cn(
                  'text-2xl font-semibold',
                  inverted ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {column.price}
              </div>

              <div
                className={cn(
                  'mt-1 text-xs',
                  inverted
                    ? 'text-primary-foreground/40'
                    : 'text-foreground/40',
                )}
              >
                {column.label}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          'border-t py-3 text-center',
          inverted ? 'border-primary-foreground/10' : 'border-foreground/5',
        )}
      >
        <Link
          href="/pricing"
          className={cn(
            'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-[gap,color] hover:gap-3',
            inverted
              ? 'text-primary-foreground/50 hover:text-primary-foreground/70'
              : 'text-foreground/40 hover:text-foreground/60',
          )}
        >
          View all plans <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
