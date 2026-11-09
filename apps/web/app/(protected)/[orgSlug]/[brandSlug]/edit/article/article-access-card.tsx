import { ButtonVariant, CardGap } from '@genfeedai/contracts';
import {
  ARTICLE_UNLOCK_MAX_PRICE,
  ARTICLE_UNLOCK_MIN_PRICE,
} from '@genfeedai/contracts/constants';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import type { ArticleAccessCardProps } from '@/props/edit/article-public-page.props';

const UNLOCK_PRICE_INPUT_ID = 'article-unlock-price';

/** Empty means subscribers only; anything else must be a valid price. */
function parseUnlockPrice(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const price = Number(trimmed);
  return Number.isInteger(price) &&
    price >= ARTICLE_UNLOCK_MIN_PRICE &&
    price <= ARTICLE_UNLOCK_MAX_PRICE
    ? price
    : undefined;
}

/**
 * Who reads the article in full (#9718). A paid article shows everyone a
 * preview; the creator's paying subscribers read it all, and other readers
 * can unlock it once when it has an unlock price.
 */
export default function ArticleAccessCard({
  article,
  isSaving,
  onSave,
}: ArticleAccessCardProps) {
  const translate = useTranslations('common.articleDetail.access');
  const savedIsPaid = article.accessLevel === 'paid';
  const savedPrice =
    article.unlockPriceCredits == null
      ? ''
      : String(article.unlockPriceCredits);
  const [isPaid, setIsPaid] = useState(savedIsPaid);
  const [priceText, setPriceText] = useState(savedPrice);

  useEffect(() => {
    setIsPaid(savedIsPaid);
    setPriceText(savedPrice);
  }, [savedIsPaid, savedPrice]);

  const price = parseUnlockPrice(priceText);
  const isUnchanged = isPaid === savedIsPaid && priceText.trim() === savedPrice;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (price === undefined) {
      return;
    }
    await onSave(
      isPaid
        ? { accessLevel: 'paid', unlockPriceCredits: price }
        : { accessLevel: 'public', unlockPriceCredits: null },
    );
  };

  return (
    <Card gap={CardGap.LG}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/60">
          {translate('title')}
        </h3>
        <Text as="p" size="sm" color="muted">
          {isPaid ? translate('paidIntro') : translate('publicIntro')}
        </Text>
      </div>
      <Form aria-label={translate('title')} onSubmit={submit}>
        <Switch
          aria-label={translate('paidLabel')}
          label={translate('paidLabel')}
          isChecked={isPaid}
          onCheckedChange={setIsPaid}
        />
        {isPaid ? (
          <Field
            htmlFor={UNLOCK_PRICE_INPUT_ID}
            label={translate('unlockPriceLabel')}
            helpText={translate('unlockPriceHelp', {
              max: ARTICLE_UNLOCK_MAX_PRICE,
              min: ARTICLE_UNLOCK_MIN_PRICE,
            })}
            error={
              price === undefined ? translate('unlockPriceInvalid') : undefined
            }
          >
            <Input
              id={UNLOCK_PRICE_INPUT_ID}
              inputMode="numeric"
              min={ARTICLE_UNLOCK_MIN_PRICE}
              max={ARTICLE_UNLOCK_MAX_PRICE}
              onChange={(event) => setPriceText(event.target.value)}
              type="number"
              value={priceText}
            />
          </Field>
        ) : null}
        <Button
          type="submit"
          variant={ButtonVariant.SECONDARY}
          isDisabled={isUnchanged || price === undefined || isSaving}
          label={isSaving ? translate('saving') : translate('save')}
          withWrapper={false}
        />
      </Form>
    </Card>
  );
}
