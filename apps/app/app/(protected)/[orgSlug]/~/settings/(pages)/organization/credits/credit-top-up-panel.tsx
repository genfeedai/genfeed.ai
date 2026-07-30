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

function formatCreditsShort(credits: number): string {
  if (credits >= 1000) {
    const thousands = credits / 1000;
    return Number.isInteger(thousands)
      ? `${thousands}k cr`
      : `${thousands.toFixed(1)}k cr`;
  }

  return `${credits.toLocaleString()} cr`;
}

type CreditTopUpPanelProps = {
  helperContent?: ReactNode;
  isSubmitDisabled?: boolean;
  isStartingCheckout: boolean;
  submitLabel?: string;
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

  const packButtonClass = (selected: boolean) =>
    cn(
      'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-left transition-colors',
      selected
        ? 'border-foreground bg-foreground/[0.08] text-foreground'
        : 'border-border bg-card text-muted-foreground hover:border-foreground/50 hover:text-foreground',
    );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-3">
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
                className={packButtonClass(isSelected)}
              >
                <span className="text-sm font-semibold tabular-nums">
                  {pack.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatCreditsShort(pack.credits)}
                </span>
              </Button>
            );
          })}

          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => setIsCustom(true)}
            ariaLabel="Select custom credit amount"
            className={packButtonClass(isCustom)}
          >
            <span className="text-sm font-semibold">Custom</span>
          </Button>
        </div>

        {isCustom ? (
          <div className="flex max-w-xs flex-wrap items-center gap-2">
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
          </div>
        ) : null}
      </div>

      {helperContent}

      <p className="text-xs leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">Payment method.</span>{' '}
        Uses your default card. Manage methods in the billing portal.
      </p>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          {isValid ? (
            <>
              <span className="font-medium text-foreground">
                {credits.toLocaleString()} credits
              </span>{' '}
              for {formatUsd(usd ?? 0)}
              <span className="text-muted-foreground/80">
                {' '}
                · up to 5 min to land · expires in 1 year
              </span>
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
  );
}
