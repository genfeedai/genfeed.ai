'use client';

import { isSelfHosted } from '@/lib/config/edition';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

export default function SettingsCreditsPage() {
  const selfHosted = isSelfHosted();

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Credits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage credit top-ups separately from provider and API key
          configuration.
        </p>
      </div>

      {selfHosted ? <ManagedCreditsCheckoutCard /> : <AddCreditsCard />}
    </div>
  );
}
