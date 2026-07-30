'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  PAYG_CREDIT_PACKS,
  PAYG_MAX_PURCHASE_USD,
  PAYG_MIN_PURCHASE_USD,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { ReactElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { HiOutlineCreditCard } from 'react-icons/hi2';

export const CREDITS_PER_USD = 100;

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
  helperContent?: ReactNode;
  isSubmitDisabled?: boolean;
  isStartingCheckout: boolean;
  submitLabel?: string;
  title?: string;
  onSubmit: (selection: {
    credits: number;
    usd: number;
  }) => void | Promise<void>;
};

export default function CreditTopUpPanel({
  helperContent,
  isSubmitDisabled = false,
  isStartingCheckout,
  submitLabel = 'Add credit',
  title = 'Add credits',
  onSubmit,
}: CreditTopUpPanelProps): ReactElement {
  const [selectedUsd, setSelectedUsd] = useState<number | null>(null);
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

  const optionClass = (selected: boolean) =>
    cn(
      'flex w-full flex-col items-start gap-1 rounded border bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted/70',
      selected
        ? 'border-foreground bg-foreground/[0.06] text-foreground'
        : 'border-border text-muted-foreground',
    );

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a pack or enter a custom amount. Credits land within a few
            minutes and expire after one year.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Amount</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  aria-pressed={isSelected}
                  className={optionClass(isSelected)}
                >
                  <span className="text-xl font-semibold tabular-nums text-foreground">
                    {pack.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
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
              aria-pressed={isCustom}
              className={optionClass(isCustom)}
            >
              <span className="text-xl font-semibold text-foreground">
                Custom
              </span>
              <span className="text-xs text-muted-foreground">
                Any whole-dollar amount
              </span>
            </Button>
          </div>

          {isCustom ? (
            <div className="max-w-sm space-y-2 pt-1">
              <label
                htmlFor="custom-credit-usd"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Custom amount (USD)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  id="custom-credit-usd"
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
                  className="mt-0"
                />
              </div>
              <p
                className={cn(
                  'text-xs leading-5',
                  customError ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {customError ??
                  `Between ${formatUsd(PAYG_MIN_PURCHASE_USD)} and ${formatUsd(PAYG_MAX_PURCHASE_USD)}.`}
              </p>
            </div>
          ) : null}
        </div>

        {helperContent}

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Payment method</p>
          <p className="text-sm leading-6 text-muted-foreground">
            This charge uses your default payment method. Update cards from the
            billing portal.
          </p>
        </div>

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
            isDisabled={!isValid || isSubmitDisabled || isStartingCheckout}
            isLoading={isStartingCheckout}
            icon={<HiOutlineCreditCard className="size-4" />}
          >
            {isStartingCheckout ? 'Opening checkout...' : submitLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
