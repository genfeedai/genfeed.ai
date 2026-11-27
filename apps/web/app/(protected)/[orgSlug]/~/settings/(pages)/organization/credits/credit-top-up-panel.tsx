import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  PAYG_CREDIT_PACKS,
  PAYG_CREDITS_PER_USD,
  PAYG_MAX_PURCHASE_USD,
  PAYG_MIN_PURCHASE_USD,
} from '@genfeedai/pricing';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  InputGroup,
  InputGroupAddon,
  inputGroupButtonClassName,
} from '@ui/primitives/input-group';
import { Label } from '@ui/primitives/label';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { CreditCard, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import type { CreditTopUpPanelProps } from '@/features/settings/props/credit-top-up-panel.props';

const DIGITS_ONLY_PATTERN = /^\d+$/;
const COMMAS_PATTERN = /,/g;
/** The − and + buttons of the custom field move the amount by this many dollars. */
const CUSTOM_STEP_USD = 10;

function parseUsd(value: string): number | null {
  const normalized = value.trim().replace(COMMAS_PATTERN, '');
  if (!DIGITS_ONLY_PATTERN.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString()}`;
}

const CUSTOM_AMOUNT = 'custom';

export default function CreditTopUpPanel({
  helperContent,
  isSubmitDisabled = false,
  isStartingCheckout,
  secondaryAction,
  submitLabel = 'Add credit',
  title = 'Add credits',
  onSubmit,
}: CreditTopUpPanelProps): ReactElement {
  const selectionLabels = useTranslations('ui.selectionGroups');
  const [selectedUsd, setSelectedUsd] = useState<number | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const customUsd = useMemo(() => parseUsd(customValue), [customValue]);
  const usd = isCustom ? customUsd : selectedUsd;
  const isBelowMin = usd !== null && usd < PAYG_MIN_PURCHASE_USD;
  const isAboveMax = usd !== null && usd > PAYG_MAX_PURCHASE_USD;
  const isValid = usd !== null && !isBelowMin && !isAboveMax;
  const credits = usd !== null ? usd * PAYG_CREDITS_PER_USD : 0;

  const customError = (() => {
    if (!isCustom || customValue.trim() === '') {
      return null;
    }
    if (customUsd === null) {
      return 'Enter a whole-dollar amount.';
    }
    if (isBelowMin) {
      return `The minimum is ${formatUsd(PAYG_MIN_PURCHASE_USD)}.`;
    }
    if (isAboveMax) {
      return `The maximum is ${formatUsd(PAYG_MAX_PURCHASE_USD)}. Contact support for more.`;
    }
    return null;
  })();

  const stepCustomAmount = (deltaUsd: number) => {
    const base = customUsd ?? 0;
    const next =
      base < PAYG_MIN_PURCHASE_USD && deltaUsd > 0
        ? PAYG_MIN_PURCHASE_USD
        : base + deltaUsd;
    setCustomValue(
      String(
        Math.min(PAYG_MAX_PURCHASE_USD, Math.max(PAYG_MIN_PURCHASE_USD, next)),
      ),
    );
  };

  const handleSubmit = () => {
    if (!isValid || usd === null) {
      return;
    }

    void onSubmit({ credits, usd });
  };

  return (
    <Card
      label={title}
      description="Credits land within a few minutes and expire after one year."
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Amount</p>
          <OptionTileGroup
            ariaLabel={selectionLabels('creditAmount')}
            columns="auto"
            onValueChange={(value) => {
              if (value === CUSTOM_AMOUNT) {
                setIsCustom(true);
                return;
              }
              setIsCustom(false);
              setSelectedUsd(Number(value));
            }}
            value={
              isCustom
                ? CUSTOM_AMOUNT
                : selectedUsd === null
                  ? undefined
                  : String(selectedUsd)
            }
          >
            {PAYG_CREDIT_PACKS.map((pack) => (
              <OptionTile
                ariaLabel={`${pack.label}, ${pack.credits.toLocaleString('en-US')} credits`}
                className="w-auto"
                description={`${pack.credits.toLocaleString()} credits`}
                key={pack.label}
                layout="stack"
                size="sm"
                title={pack.label}
                value={String(pack.credits / PAYG_CREDITS_PER_USD)}
              />
            ))}
            <OptionTile
              ariaLabel="Custom credit amount"
              className="w-auto"
              description={`${formatUsd(PAYG_MIN_PURCHASE_USD)} to ${formatUsd(PAYG_MAX_PURCHASE_USD)}`}
              layout="stack"
              size="sm"
              title="Custom"
              value={CUSTOM_AMOUNT}
            />
          </OptionTileGroup>
        </div>

        {isCustom ? (
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="custom-credit-amount">Custom amount</Label>
            <InputGroup
              aria-label="Custom amount in dollars"
              className={cn(
                'h-10 [&>*+*]:border-l-0',
                customError
                  ? 'border-destructive'
                  : 'focus-within:border-border-strong',
              )}
            >
              <Button
                ariaLabel={`Decrease amount by ${formatUsd(CUSTOM_STEP_USD)}`}
                className={cn(inputGroupButtonClassName, 'h-full w-10')}
                icon={<Minus className="size-4" />}
                isDisabled={(customUsd ?? 0) <= PAYG_MIN_PURCHASE_USD}
                onClick={() => stepCustomAmount(-CUSTOM_STEP_USD)}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
              <InputGroupAddon
                aria-hidden="true"
                className="border-l border-border pr-0 text-base text-muted-foreground"
              >
                $
              </InputGroupAddon>
              <Input
                aria-describedby="custom-credit-amount-hint"
                aria-invalid={Boolean(customError)}
                aria-label="Custom credit top-up amount in dollars"
                autoFocus
                className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 text-base font-medium tabular-nums shadow-none focus-visible:border-0 focus-visible:ring-0"
                hasError={Boolean(customError)}
                id="custom-credit-amount"
                inputMode="numeric"
                onChange={(event) => setCustomValue(event.target.value)}
                placeholder="25"
                value={customValue}
              />
              <InputGroupAddon className="text-xs font-normal tabular-nums text-muted-foreground">
                {isValid ? `${credits.toLocaleString()} credits` : 'credits'}
              </InputGroupAddon>
              <Button
                ariaLabel={`Increase amount by ${formatUsd(CUSTOM_STEP_USD)}`}
                className={cn(
                  inputGroupButtonClassName,
                  'h-full w-10 border-l border-border',
                )}
                icon={<Plus className="size-4" />}
                isDisabled={(customUsd ?? 0) >= PAYG_MAX_PURCHASE_USD}
                onClick={() => stepCustomAmount(CUSTOM_STEP_USD)}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </InputGroup>
            <p
              className={cn(
                'text-xs',
                customError ? 'text-destructive' : 'text-muted-foreground',
              )}
              id="custom-credit-amount-hint"
            >
              {customError ??
                `Whole dollars from ${formatUsd(PAYG_MIN_PURCHASE_USD)} to ${formatUsd(PAYG_MAX_PURCHASE_USD)}. $1 buys ${PAYG_CREDITS_PER_USD} credits.`}
            </p>
          </div>
        ) : null}

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
            ) : isCustom ? (
              'Enter an amount to continue.'
            ) : (
              'Choose an amount to continue.'
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {secondaryAction}
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
      </div>
    </Card>
  );
}
