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
import { CreditCard } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';

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
      return `Minimum ${formatUsd(PAYG_MIN_PURCHASE_USD)}.`;
    }
    if (isAboveMax) {
      return `Maximum ${formatUsd(PAYG_MAX_PURCHASE_USD)}. Contact support for more.`;
    }
    return null;
  })();

  const handleSubmit = () => {
    if (!isValid || usd === null) {
      return;
    }

    void onSubmit({ credits, usd });
  };

  const packClass = (selected: boolean) =>
    cn(
      'inline-flex h-9 items-center gap-2 rounded border px-3 text-left transition-colors',
      selected
        ? 'border-foreground bg-foreground/[0.06] text-foreground'
        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    );

  return (
    <Card
      label={title}
      description="Credits land within a few minutes and expire after one year."
      bodyClassName="gap-3 p-4"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Amount</p>
          <div className="flex flex-wrap gap-2">
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
                  className={packClass(isSelected)}
                >
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {pack.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {pack.credits.toLocaleString()} credits
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => setIsCustom(true)}
              ariaLabel="Select custom credit amount"
              aria-pressed={isCustom}
              className={packClass(isCustom)}
            >
              <span className="text-sm font-semibold text-foreground">
                Custom
              </span>
            </Button>

            {isCustom ? (
              <>
                <span className="text-sm text-muted-foreground">$</span>
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
                  className="h-9 w-28"
                />
                <p
                  className={cn(
                    'text-xs',
                    customError ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {customError ??
                    `${formatUsd(PAYG_MIN_PURCHASE_USD)}–${formatUsd(PAYG_MAX_PURCHASE_USD)}`}
                </p>
              </>
            ) : null}
          </div>
        </div>

        {helperContent}

        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Payment</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Checkout opens Stripe securely. Card details are collected there —
            not stored in Genfeed.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
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
            icon={<CreditCard className="size-4" />}
          >
            {isStartingCheckout ? 'Opening checkout...' : submitLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
