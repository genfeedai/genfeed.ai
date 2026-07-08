'use client';

import { isSelfHosted } from '@/lib/config/edition';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

export default function SettingsCreditsPage() {
  const selfHosted = isSelfHosted();

  return (
    <div className="pb-10">
      {selfHosted ? <ManagedCreditsCheckoutCard /> : <AddCreditsCard />}
    </div>
  );
}
