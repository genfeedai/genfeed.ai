'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  PAYG_CREDIT_PACKS,
  PAYG_MAX_PURCHASE_USD,
  PAYG_MIN_PURCHASE_USD,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { ReactElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { HiOutlineCreditCard } from 'react-icons/hi2';

export const CREDITS_PER_USD = 100;

const PRESET_USD_AMOUNTS = PAYG_CREDIT_PACKS.map(
  (pack) => pack.credits / CREDITS_PER_USD,
);

function parseUsd(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString()}`;
}

type CreditTopUpPanelProps = {
  title?: string;
  description?: string;
  helperContent?: ReactNode;
  isStartingCheckout: boolean;
  submitLabel?: string;
  onSubmit: (selection: {
    credits: number;
    usd: number;
  }) => void | Promise<void>;
};

export default function CreditTopUpPanel({
  title = 'Billing / Add credit',
  description = 'Choose a credit amount and continue to checkout.',
  helperContent,
  isStartingCheckout,
  submitLabel = 'Add credit',
  onSubmit,
}: CreditTopUpPanelProps): ReactElement {
  const [selectedUsd, setSelectedUsd] = useState<number>(
    PRESET_USD_AMOUNTS[0] ?? PAYG_MIN_PURCHASE_USD,
  );
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const customUsd = useMemo(() => parseUsd(customValue), [customValue]);
  const usd = isCustom ? customUsd : selectedUsd;
  const isBelowMin = usd !== null && usd < PAYG_MIN_PURCHASE_USD;
  const isAboveMax = usd !== null && usd > PAYG_MAX_PURCHASE_USD;
  const isValid = usd !== null && !isBelowMin && !isAboveMax;
  const credits = usd !== null ? usd * CREDITS_PER_USD : 0;

  const customError = (() => {
    if (!isCustom || customValue.trim() === '') {
      return null;
    }
    if (customUsd === null) {
      return 'Enter a whole-dollar amount.';
    }
    if (isBelowMin) {
      return `The minimum amount is ${formatUsd(PAYG_MIN_PURCHASE_USD)}.`;
    }
    if (isAboveMax) {
      return `The maximum amount is ${formatUsd(PAYG_MAX_PURCHASE_USD)}. For a larger top-up, contact support.`;
    }
    return null;
  })();

  const handleSubmit = () => {
    if (!isValid || usd === null) {
      return;
    }

    void onSubmit({ credits, usd });
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <h2 className="text-4xl font-medium tracking-normal text-foreground md:text-5xl">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>

      <section className="space-y-4" aria-labelledby="credit-amount-heading">
        <h3
          id="credit-amount-heading"
          className="text-2xl font-semibold tracking-normal text-foreground"
        >
          Credit amount
        </h3>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAYG_CREDIT_PACKS.map((pack) => {
            const amountUsd = pack.credits / CREDITS_PER_USD;
            const isSelected = !isCustom && selectedUsd === amountUsd;

            return (
              <Button
                key={pack.label}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => {
                  setIsCustom(false);
                  setSelectedUsd(amountUsd);
                }}
                ariaLabel={`Select ${pack.label} credit pack`}
                className={cn(
                  'flex h-56 w-full flex-col items-center justify-center rounded-none border bg-card text-center transition-colors hover:border-foreground/70 hover:text-foreground md:h-60',
                  isSelected
                    ? 'border-2 border-foreground text-foreground'
                    : 'border-border text-muted-foreground',
                )}
              >
                <span className="text-4xl font-semibold tracking-normal md:text-5xl">
                  {pack.label}
                </span>
                <span className="mt-3 text-xs text-muted-foreground">
                  {pack.credits.toLocaleString()} credits
                </span>
              </Button>
            );
          })}

          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => setIsCustom(true)}
            ariaLabel="Select custom credit amount"
            className={cn(
              'flex h-56 w-full items-center justify-center rounded-none border bg-card text-center text-4xl font-medium tracking-normal transition-colors hover:border-foreground/70 hover:text-foreground md:h-60 md:text-5xl',
              isCustom
                ? 'border-2 border-foreground text-foreground'
                : 'border-border text-muted-foreground',
            )}
          >
            Custom
          </Button>
        </div>

        {isCustom ? (
          <div className="max-w-sm space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg text-muted-foreground">$</span>
              <Input
                type="number"
                inputMode="numeric"
                min={PAYG_MIN_PURCHASE_USD}
                max={PAYG_MAX_PURCHASE_USD}
                step={1}
                value={customValue}
                hasError={Boolean(customError)}
                onChange={(event) => setCustomValue(event.target.value)}
                placeholder={String(PAYG_MIN_PURCHASE_USD)}
                aria-label="Custom credit top-up amount in dollars"
              />
            </div>
            <p
              className={cn(
                'text-xs leading-5',
                customError ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {customError ??
                `Enter an amount between ${formatUsd(PAYG_MIN_PURCHASE_USD)} and ${formatUsd(PAYG_MAX_PURCHASE_USD)}.`}
            </p>
          </div>
        ) : null}
      </section>

      {helperContent}

      <section className="space-y-4" aria-labelledby="payment-method-heading">
        <h3
          id="payment-method-heading"
          className="text-2xl font-semibold tracking-normal text-primary"
        >
          Payment method
        </h3>
        <div className="border border-primary/50 bg-primary/10 px-5 py-4 text-sm leading-6 text-primary">
          This will use your default payment method. Manage payment methods from
          your billing portal.
        </div>
      </section>

      <div className="space-y-5">
        <p className="text-lg leading-8 text-muted-foreground">
          <span className="font-semibold text-foreground">Please note:</span>{' '}
          Credit may take up to 5 minutes to become available after purchase.
          Credit expires after 1 year.
        </p>

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {isValid ? (
              <>
                <span className="font-medium text-foreground">
                  {credits.toLocaleString()} credits
                </span>{' '}
                for {formatUsd(usd ?? 0)}
              </>
            ) : (
              'Choose an amount to continue.'
            )}
          </p>

          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={handleSubmit}
            isDisabled={!isValid || isStartingCheckout}
            isLoading={isStartingCheckout}
            icon={<HiOutlineCreditCard className="size-4" />}
          >
            {isStartingCheckout ? 'Opening checkout...' : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
