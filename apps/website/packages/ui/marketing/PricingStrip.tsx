'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { PricingStripProps } from '@props/website/pricing-strip.props';
import Link from 'next/link';
import { LuArrowRight } from 'react-icons/lu';

const PILLAR_COLUMNS = [
  {
    href: '/pricing',
    label: 'Pro',
    price: '$499/mo',
    subtitle: 'Creators',
  },
  {
    href: '/pricing',
    label: 'Scale',
    price: '$1,499/mo',
    subtitle: 'Agencies',
  },
  {
    href: '/pricing',
    label: 'Enterprise',
    price: 'Custom',
    subtitle: 'Studios',
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
        inverted ? 'border-inv-fg/10' : 'border-edge/5',
        className,
      )}
    >
      <div className="grid grid-cols-1 gap-px md:grid-cols-3">
        {PILLAR_COLUMNS.map((column) => {
          const isFeatured = column.label === 'Scale';

          return (
            <div
              key={column.label}
              className={cn(
                'px-6 py-5 text-center',
                isFeatured && (inverted ? 'bg-inv-fg/[0.03]' : 'bg-fill/5'),
              )}
            >
              <div
                className={cn(
                  'mb-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest',
                  inverted ? 'text-inv-fg/30' : 'text-surface/30',
                )}
              >
                {column.subtitle}
                {isFeatured ? (
                  <span
                    className={cn(
                      'text-[9px] font-bold',
                      inverted ? 'text-inv-fg/50' : 'text-surface/50',
                    )}
                  >
                    ★ Popular
                  </span>
                ) : null}
              </div>

              <div
                className={cn(
                  'text-2xl font-serif',
                  inverted ? 'text-inv-fg' : 'text-surface',
                )}
              >
                {column.price}
              </div>

              <div
                className={cn(
                  'mt-1 text-xs',
                  inverted ? 'text-inv-fg/40' : 'text-surface/40',
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
          inverted ? 'border-inv-fg/10' : 'border-edge/5',
        )}
      >
        <Link
          href="/pricing"
          className={cn(
            'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all hover:gap-3',
            inverted
              ? 'text-inv-fg/50 hover:text-inv-fg/70'
              : 'text-surface/40 hover:text-surface/60',
          )}
        >
          View all plans <LuArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
