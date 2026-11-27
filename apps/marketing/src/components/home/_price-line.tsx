import {
  creditPackPrice,
  formatPrice,
  getLaunchPrice,
  getPlanByTier,
  WEBSITE_CREDIT_PACKS,
} from '@genfeedai/pricing';
import { Text } from '@ui/typography/text';
import Link from 'next/link';

/**
 * The price, one line under the buttons. Both numbers are read from
 * `@genfeedai/pricing`; the launch price is the one the pricing page shows
 * first, and the pricing page spells out how long it lasts.
 */
export default function HomePriceLine({
  className = 'mt-5',
}: {
  className?: string;
}): React.ReactElement {
  const planPrice = getLaunchPrice('pro') ?? getPlanByTier('pro').price ?? 0;
  const smallestPack = WEBSITE_CREDIT_PACKS[0];

  return (
    <Text
      as="p"
      className={`${className} text-center text-sm text-foreground/80`}
      data-testid="home-price-line"
    >
      Plans from {formatPrice(planPrice)} a month, or pay as you go from{' '}
      {formatPrice(creditPackPrice(smallestPack))}.{' '}
      <Link
        className="font-semibold underline underline-offset-4"
        href="/pricing"
      >
        See pricing
      </Link>
    </Text>
  );
}
