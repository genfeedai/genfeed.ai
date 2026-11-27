import type { PlanTier } from '@genfeedai/pricing';
import {
  formatPlanPriceLabel,
  formatPrice,
  getPlanLabel,
} from '@genfeedai/pricing';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { PricingStripProps } from '@props/website/pricing-strip.props';
import { serviceOffering } from '@web-components/landing/service-offering.data';
import Link from 'next/link';

/**
 * Plan names and prices come from @genfeedai/pricing. Only the marketing
 * framing (audience label, price suffix, which column is featured) lives here.
 */
const FEATURED_TIER: PlanTier = 'pro';

const PILLAR_COLUMNS: {
  subtitle: string;
  tier: PlanTier;
}[] = [
  { subtitle: 'Credits only', tier: 'payg' },
  { subtitle: 'Creators', tier: 'pro' },
  { subtitle: 'Agencies', tier: 'scale' },
  { subtitle: 'We run it', tier: 'enterprise' },
];

/**
 * The fourth column is the done-for-you service, named and priced as the
 * pricing page names and prices it, not as the Enterprise plan.
 */
function getColumnCopy(tier: PlanTier): { label: string; price: string } {
  if (tier === 'enterprise') {
    return {
      label: serviceOffering.name,
      price: `From ${formatPrice(serviceOffering.startingMonthlyPrice)}/mo`,
    };
  }

  return { label: getPlanLabel(tier), price: formatPlanPriceLabel(tier) };
}

export default function PricingStrip({ className }: PricingStripProps) {
  return (
    <div className={cn('mb-12 border border-foreground/5', className)}>
      <div className="grid grid-cols-1 gap-px md:grid-cols-4">
        {PILLAR_COLUMNS.map((column) => {
          const isFeatured = column.tier === FEATURED_TIER;
          const { label, price } = getColumnCopy(column.tier);

          return (
            <div
              key={column.tier}
              className={cn(
                'px-6 py-5 text-center',
                isFeatured && 'bg-[var(--gen-accent-bg)]',
              )}
            >
              <div className="mb-2 flex items-center justify-center gap-2 text-2xs font-semibold uppercase tracking-label text-foreground/50">
                {column.subtitle}
              </div>

              <div className="text-2xl font-semibold text-foreground">
                {price}
              </div>

              <div className="mt-1 text-xs text-foreground/60">{label}</div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-foreground/5 py-3 text-center">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-label text-foreground/60 transition-colors hover:text-foreground/80"
        >
          View all plans
        </Link>
      </div>
    </div>
  );
}
