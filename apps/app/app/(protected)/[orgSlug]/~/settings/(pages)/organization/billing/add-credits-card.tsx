'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  PAYG_CREDIT_PACKS,
  PAYG_MAX_PURCHASE_USD,
  PAYG_MIN_PURCHASE_USD,
} from '@helpers/business/pricing/pricing.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { StripeService } from '@services/billing/stripe.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useMemo, useState } from 'react';
import { HiOutlineCreditCard } from 'react-icons/hi2';

/** 1 credit = $0.01, so a whole-dollar top-up always maps to an integer credit count. */
const CREDITS_PER_USD = 100;

/** Preset dollar amounts, derived from the canonical credit packs ($10/$20/$50/$100/$1,000). */
const PRESET_USD_AMOUNTS = PAYG_CREDIT_PACKS.map(
  (pack) => pack.credits / CREDITS_PER_USD,
);

/**
 * Parse a whole-dollar top-up amount from raw input.
 * Returns null for empty, non-numeric, or non-integer values.
 */
function parseUsd(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export default function AddCreditsCard() {
  const [selectedUsd, setSelectedUsd] = useState<number>(
    PRESET_USD_AMOUNTS[0] ?? PAYG_MIN_PURCHASE_USD,
  );
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const getStripeService = useAuthedService((token: string) =>
    StripeService.getInstance(token),
  );

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
      return `The minimum amount is $${PAYG_MIN_PURCHASE_USD.toLocaleString()}.`;
    }
    if (isAboveMax) {
      return `The maximum amount is $${PAYG_MAX_PURCHASE_USD.toLocaleString()}. For a larger top-up, contact support.`;
    }
    return null;
  })();

  const handleAddCredits = async () => {
    if (!isValid || usd === null) {
      return;
    }

    const paygPriceId = EnvironmentService.plans.payg;
    if (!paygPriceId) {
      NotificationsService.getInstance().error(
        'Credit top-ups are not available right now.',
      );
      return;
    }

    setIsStartingCheckout(true);

    try {
      const service = await getStripeService();
      const result = await service.createCheckoutSession({
        cancelUrl: window.location.href,
        quantity: usd * CREDITS_PER_USD,
        stripePriceId: paygPriceId,
        successUrl: `${window.location.origin}${window.location.pathname}?credits=success`,
      });

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      throw new Error('Checkout session did not return a URL');
    } catch (error) {
      logger.error('Failed to start credit top-up checkout', error);
      NotificationsService.getInstance().error(
        'Failed to start checkout. Please try again.',
      );
      setIsStartingCheckout(false);
    }
  };

  return (
    <Card className="p-6">
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading size="lg">Add credits</Heading>
          <Text size="sm" color="muted">
            Top up your balance. Credits never expire — 1 credit = $0.01.
          </Text>
        </VStack>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYG_CREDIT_PACKS.map((pack) => {
            const amountUsd = pack.credits / CREDITS_PER_USD;
            const isSelected = !isCustom && selectedUsd === amountUsd;

            return (
              <Button
                key={pack.label}
                variant={
                  isSelected ? ButtonVariant.DEFAULT : ButtonVariant.OUTLINE
                }
                onClick={() => {
                  setIsCustom(false);
                  setSelectedUsd(amountUsd);
                }}
                withWrapper={false}
                className="w-full justify-center"
              >
                {pack.label}
              </Button>
            );
          })}

          <Button
            variant={isCustom ? ButtonVariant.DEFAULT : ButtonVariant.OUTLINE}
            onClick={() => setIsCustom(true)}
            withWrapper={false}
            className="w-full justify-center"
          >
            Custom
          </Button>
        </div>

        {isCustom && (
          <VStack gap={1}>
            <div className="flex items-center gap-2">
              <Text size="sm" color="muted">
                $
              </Text>
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
            <Text size="xs" color={customError ? 'destructive' : 'muted'}>
              {customError ??
                `Enter an amount between $${PAYG_MIN_PURCHASE_USD.toLocaleString()} and $${PAYG_MAX_PURCHASE_USD.toLocaleString()}.`}
            </Text>
          </VStack>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Text size="sm" color="muted">
            {isValid ? (
              <>
                <Text as="span" weight="medium" color="default">
                  {credits.toLocaleString()} credits
                </Text>{' '}
                for ${(usd ?? 0).toLocaleString()}
              </>
            ) : (
              'Choose an amount to continue.'
            )}
          </Text>

          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={handleAddCredits}
            isDisabled={!isValid || isStartingCheckout}
            isLoading={isStartingCheckout}
            icon={<HiOutlineCreditCard className="size-4" />}
          >
            {isStartingCheckout ? 'Opening checkout…' : 'Add credits'}
          </Button>
        </div>
      </VStack>
    </Card>
  );
}
