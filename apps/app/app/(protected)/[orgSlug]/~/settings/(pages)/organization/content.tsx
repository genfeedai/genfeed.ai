'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type AppLocale,
  DEFAULT_LOCALE,
  getSelectableLocales,
  LOCALE_LABELS,
} from '@genfeedai/contracts/constants';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Spinner from '@ui/primitives/spinner';
import { useCallback, useState } from 'react';
import OrganizationIdentityCard from './organization-identity-card';

// The pseudo-locale is a QA instrument, not a language — offering it to an
// entire organization would put every member on accented, padded English.
const SELECTABLE_LOCALES = getSelectableLocales(
  process.env.NODE_ENV !== 'production',
);

export default function SettingsOrganizationPage() {
  const { organizationId, isReady } = useBrand();
  const { settings, updateSettings } = useOrganization();
  const [isSaving, setIsSaving] = useState(false);

  // A stored locale that is not selectable here (the pseudo-locale in a
  // production build) would leave the trigger blank, so the picker shows the
  // default and offers the way back out.
  const storedDefaultLocale = settings?.defaultLocale ?? DEFAULT_LOCALE;
  const defaultLocale = SELECTABLE_LOCALES.includes(storedDefaultLocale)
    ? storedDefaultLocale
    : DEFAULT_LOCALE;

  const handleDefaultLocaleChange = useCallback(
    async (value: string) => {
      setIsSaving(true);
      try {
        await updateSettings('defaultLocale', value as AppLocale);
      } finally {
        setIsSaving(false);
      }
    },
    [updateSettings],
  );

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OrganizationIdentityCard organizationId={organizationId} />

      <Card
        label="Language"
        description="Applied to members who have not picked a language of their own."
        bodyClassName="gap-3 p-4"
      >
        <Select
          disabled={isSaving}
          onValueChange={handleDefaultLocaleChange}
          value={defaultLocale}
        >
          <SelectTrigger
            id="org-default-locale"
            className="w-full"
            data-testid="org-default-locale-trigger"
          >
            <SelectValue placeholder="Select a language" />
          </SelectTrigger>
          <SelectContent>
            {SELECTABLE_LOCALES.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {LOCALE_LABELS[locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>
    </div>
  );
}
