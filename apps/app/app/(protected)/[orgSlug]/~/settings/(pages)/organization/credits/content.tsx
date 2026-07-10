'use client';

import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

export default function SettingsCreditsPage() {
  const selfHosted = isSelfHostedDeployment();

  return (
    <div className="pb-10">
      {selfHosted ? <ManagedCreditsCheckoutCard /> : <AddCreditsCard />}
    </div>
  );
}
