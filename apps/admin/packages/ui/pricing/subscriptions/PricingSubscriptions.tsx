'use client';

import { websitePlans } from '@helpers/business/pricing/pricing.helper';
import type {
  PricingPlanProps,
  PricingSubscriptionsProps,
} from '@props/content/subscription.props';
import PricingCard from '@ui/pricing/card/PricingCard';
import PricingToggle from '@ui/pricing/toggle/PricingToggle';
import { useState } from 'react';

export default function PricingSubscriptions({
  subscription,
  onSubscribe,
}: PricingSubscriptionsProps) {
  const [isYearly, setIsYearly] = useState(true);

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <PricingToggle isYearly={isYearly} setIsYearly={setIsYearly} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {websitePlans
          .filter((plan) => plan.type === 'subscription')
          .map((plan: PricingPlanProps, index) => (
            <PricingCard
              key={index}
              buttonLabel="Subscribe"
              onSubscribe={onSubscribe}
              subscription={subscription}
              plan={{
                ...plan,
                interval: isYearly ? 'year' : 'month',
                price: isYearly && plan.price ? plan.price * 10 : plan.price,
              }}
            />
          ))}
      </div>
    </div>
  );
}
