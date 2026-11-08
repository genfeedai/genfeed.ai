'use client';

import { ButtonVariant, CardGap, CardPadding } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { Text } from '@ui/typography/text';
import { Copy, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import type { ReferralCodesCardProps } from '@/props/settings/referral-codes-card.props';

const NO_BRAND = '__none__';

/**
 * Every affiliate code the member holds, with its own sign-ups and credits,
 * and the form to add a named or per-brand code.
 */
export default function ReferralCodesCard({
  brands,
  codes,
  isLoading,
  onCopy,
  onCreate,
  onSetActive,
}: ReferralCodesCardProps) {
  const translate = useTranslations('common.referrals');
  const [codeText, setCodeText] = useState('');
  const [brandId, setBrandId] = useState(NO_BRAND);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onCreate({
        ...(brandId === NO_BRAND ? {} : { brandId }),
        ...(codeText.trim() ? { code: codeText.trim() } : {}),
      });
      setCodeText('');
      setBrandId(NO_BRAND);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      label={translate('codes.title')}
      padding={CardPadding.LG}
      gap={CardGap.LG}
    >
      <Text as="p" size="sm" color="muted" className="max-w-2xl">
        {translate('codes.description')}
      </Text>

      <div className="divide-y divide-border rounded-lg border border-border">
        {codes.map((code) => (
          <div
            key={code.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Text as="span" size="sm" weight="medium" className="font-mono">
                  {code.code}
                </Text>
                {code.brandLabel ? <Badge>{code.brandLabel}</Badge> : null}
                {code.isPrimary ? (
                  <Badge>{translate('codes.primary')}</Badge>
                ) : null}
              </div>
              <Text as="p" size="xs" color="muted">
                {translate('codes.stats', {
                  earned: code.earnedCredits.toLocaleString('en-US'),
                  referred: code.referralCount.toLocaleString('en-US'),
                })}
              </Text>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                aria-label={translate('codes.activeLabel', { code: code.code })}
                isChecked={code.isActive}
                isDisabled={code.isPrimary}
                onCheckedChange={(next) => {
                  void onSetActive(code.id, next);
                }}
              />
              <Button
                aria-label={translate('codes.copyLabel', { code: code.code })}
                icon={<Copy className="size-4" aria-hidden="true" />}
                onClick={() => onCopy(code.shareUrl)}
                type="button"
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              />
            </div>
          </div>
        ))}
        {codes.length === 0 && isLoading ? (
          <Text as="p" size="sm" color="muted" className="px-4 py-3">
            {translate('loadingLink')}
          </Text>
        ) : null}
      </div>

      <Form
        aria-label={translate('codes.add')}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={submit}
        spacing="none"
      >
        <Field label={translate('codes.codeLabel')} htmlFor="affiliate-code">
          <Input
            id="affiliate-code"
            maxLength={32}
            onChange={(event) => setCodeText(event.target.value)}
            placeholder={translate('codes.codePlaceholder')}
            value={codeText}
          />
        </Field>
        <Field label={translate('codes.brandLabel')} htmlFor="affiliate-brand">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger id="affiliate-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BRAND}>
                {translate('codes.noBrand')}
              </SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          className="shrink-0"
          icon={<Plus className="size-4" aria-hidden="true" />}
          isDisabled={isSaving}
          type="submit"
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          {translate('codes.add')}
        </Button>
      </Form>
    </Card>
  );
}
