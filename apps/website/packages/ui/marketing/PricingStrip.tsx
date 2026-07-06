'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { PricingStripProps } from '@props/website/pricing-strip.props';
import Link from 'next/link';

const PILLAR_COLUMNS = [
  {
    href: '/pricing',
    label: 'Creator',
    price: '$49/mo + PAYG',
    subtitle: 'Default',
  },
  {
    href: '/pricing',
    label: 'Teams',
    price: 'From $499/mo',
    subtitle: 'Agencies',
  },
  {
    href: '/pricing',
    label: 'Enterprise',
    price: 'Custom',
    subtitle: 'Studios',
  },
] as const;

export default function PricingStrip({ className }: PricingStripProps) {
  return (
    <div className={cn('mb-12 border border-edge/5', className)}>
      <div className="grid grid-cols-1 gap-px md:grid-cols-3">
        {PILLAR_COLUMNS.map((column) => {
          const isFeatured = column.label === 'Creator';

          return (
            <div
              key={column.label}
              className={cn(
                'px-6 py-5 text-center',
                isFeatured && 'bg-white/[0.04]',
              )}
            >
              <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-surface/50">
                {column.subtitle}
                {isFeatured ? (
                  <span className="text-[9px] font-bold text-surface/65">
                    ★ Popular
                  </span>
                ) : null}
              </div>

              <div className="text-2xl font-semibold text-surface">
                {column.price}
              </div>

              <div className="mt-1 text-xs text-surface/60">{column.label}</div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-edge/5 py-3 text-center">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-surface/55 transition-colors hover:text-surface/80"
        >
          View all plans
        </Link>
      </div>
    </div>
  );
}
