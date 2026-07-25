'use client';

import type { PlanTier } from '@helpers/business/pricing/pricing.helper';
import {
  formatPlanPriceLabel,
  getPlanLabel,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PricingStripProps } from '@props/website/pricing-strip.props';
import Link from 'next/link';

/**
 * Plan names and prices come from @genfeedai/pricing. Only the marketing
 * framing (audience label, price suffix, which column is featured) lives here.
 */
const FEATURED_TIER: PlanTier = 'pro';

const PILLAR_COLUMNS: {
  priceSuffix?: string;
  pricePrefix?: string;
  subtitle: string;
  tier: PlanTier;
}[] = [
  { priceSuffix: ' + PAYG', subtitle: 'Default', tier: 'pro' },
  { pricePrefix: 'From ', subtitle: 'Agencies', tier: 'scale' },
  { subtitle: 'Studios', tier: 'enterprise' },
];

export default function PricingStrip({ className }: PricingStripProps) {
  return (
    <div className={cn('mb-12 border border-edge/5', className)}>
      <div className="grid grid-cols-1 gap-px md:grid-cols-3">
        {PILLAR_COLUMNS.map((column) => {
          const isFeatured = column.tier === FEATURED_TIER;
          const label = getPlanLabel(column.tier);
          const price = `${column.pricePrefix ?? ''}${formatPlanPriceLabel(column.tier)}${column.priceSuffix ?? ''}`;

          return (
            <div
              key={column.tier}
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

              <div className="text-2xl font-semibold text-surface">{price}</div>

              <div className="mt-1 text-xs text-surface/60">{label}</div>
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
