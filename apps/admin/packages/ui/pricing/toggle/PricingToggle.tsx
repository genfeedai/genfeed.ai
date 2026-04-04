'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { PricingToggleProps } from '@props/content/pricing.props';
import Button from '@ui/buttons/base/Button';

export default function PricingToggle({
  isYearly,
  setIsYearly,
}: PricingToggleProps) {
  return (
    <div className="flex items-center justify-center">
      <div className="relative bg-card border border-primary/10 shadow-primary/10 p-1 w-fit transition-all duration-300">
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="relative flex items-center cursor-pointer"
          ariaLabel="Toggle yearly pricing"
          onClick={() => setIsYearly(!isYearly)}
        >
          {/* Background pill that slides */}
          <div
            className={`absolute bg-primary shadow-sm transition-transform duration-300 ease-in-out h-8 w-48 ${
              isYearly ? 'translate-x-48' : 'translate-x-0'
            }`}
          />

          {/* Monthly option */}
          <div
            className={`relative z-10 flex items-center justify-center h-8 w-48 px-3 text-sm font-medium transition-colors duration-300 ${
              !isYearly
                ? 'text-primary-foreground'
                : 'text-foreground/60 hover:text-foreground/80'
            }`}
          >
            Monthly
          </div>

          {/* Yearly option */}
          <div
            className={`relative z-10 flex items-center justify-center h-8 w-48 px-3 transition-colors duration-300 gap-2 ${
              isYearly
                ? 'text-primary-foreground'
                : 'text-foreground/60 hover:text-foreground/80'
            }`}
          >
            <span className="text-sm">Yearly</span>
            <span className="text-xs text-success font-bold">(20% Bonus)</span>
          </div>
        </Button>
      </div>
    </div>
  );
}
