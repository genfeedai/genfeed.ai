'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  CREATOR_SUBSCRIPTION_MAX_PRICE,
  CREATOR_SUBSCRIPTION_MIN_PRICE,
} from '@genfeedai/contracts/constants';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import type { CreatorSubscriptionPlanRowProps } from '@/props/settings/creator-subscription-plans.props';

function parsePrice(value: string): number | null {
  const price = Number(value.trim());
  return Number.isInteger(price) &&
    price >= CREATOR_SUBSCRIPTION_MIN_PRICE &&
    price <= CREATOR_SUBSCRIPTION_MAX_PRICE
    ? price
    : null;
}

/** One public profile's monthly price and whether new readers can subscribe. */
export default function SubscriptionPlanRow({
  onSave,
  plan,
}: CreatorSubscriptionPlanRowProps) {
  const translate = useTranslations('pages.creatorEarnings.plans');
  const [priceText, setPriceText] = useState(
    plan.monthlyPriceCredits === null ? '' : String(plan.monthlyPriceCredits),
  );
  const [isEnabled, setIsEnabled] = useState(plan.isEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const price = parsePrice(priceText);
  const inputId = `creator-plan-${plan.brandId}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (price === null) {
      return;
    }
    setIsSaving(true);
    try {
      await onSave(plan.brandId, { isEnabled, monthlyPriceCredits: price });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Form
      aria-label={plan.label}
      className="flex flex-col gap-3 px-4 py-3"
      onSubmit={submit}
      spacing="none"
    >
      <div className="flex flex-col gap-1">
        <Text as="span" size="sm" weight="medium">
          {plan.label}
        </Text>
        <Text as="p" size="xs" color="muted">
          {translate('subscribers', {
            count: plan.activeSubscribers,
            handle: plan.handle,
          })}
        </Text>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field
          htmlFor={inputId}
          label={translate('priceLabel', { creator: plan.label })}
          helpText={translate('priceHelp', {
            max: CREATOR_SUBSCRIPTION_MAX_PRICE,
            min: CREATOR_SUBSCRIPTION_MIN_PRICE,
          })}
        >
          <Input
            id={inputId}
            inputMode="numeric"
            min={CREATOR_SUBSCRIPTION_MIN_PRICE}
            max={CREATOR_SUBSCRIPTION_MAX_PRICE}
            onChange={(event) => setPriceText(event.target.value)}
            type="number"
            value={priceText}
          />
        </Field>
        <Switch
          aria-label={translate('openLabel')}
          label={translate('openLabel')}
          isChecked={isEnabled}
          onCheckedChange={setIsEnabled}
        />
        <Button
          type="submit"
          variant={ButtonVariant.SECONDARY}
          isDisabled={price === null || isSaving}
          label={isSaving ? translate('saving') : translate('save')}
          withWrapper={false}
        />
      </div>
    </Form>
  );
}
