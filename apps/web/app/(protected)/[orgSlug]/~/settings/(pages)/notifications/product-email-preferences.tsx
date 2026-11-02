'use client';

import {
  PRODUCT_EMAIL_PREFERENCES,
  type ProductEmailTopic,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type ProductEmailPreferenceValues = Partial<Record<ProductEmailTopic, boolean>>;

const PRODUCT_EMAIL_KEY = ['users', 'email-preferences', 'product'] as const;

export default function ProductEmailPreferences() {
  const translate = useTranslations('pages.productEmailPreferences');
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cached: coming back to Notifications shows the saved values at once while
  // they refresh, and the toggles show a skeleton, never "off", until the first
  // read lands.
  const preferencesQuery = useAuthedQuery({
    queryFn: async (service, signal): Promise<ProductEmailPreferenceValues> => {
      try {
        const rows = await Promise.all(
          PRODUCT_EMAIL_PREFERENCES.map(({ topic }) =>
            service.findProductEmailPreference(topic, signal),
          ),
        );
        return Object.fromEntries(
          rows.map((row) => [row.topic, row.isEnabled]),
        );
      } catch (cause) {
        if (!signal.aborted) {
          logger.error('Failed to load product email preferences', cause);
        }
        throw cause;
      }
    },
    queryKey: PRODUCT_EMAIL_KEY,
    service: (token: string) => UsersService.getInstance(token),
  });
  const { isError, isPending, refetch } = preferencesQuery;
  const preferences = preferencesQuery.data ?? {};
  const error = saveError
    ? saveError
    : isError
      ? 'Email preferences could not be loaded.'
      : null;

  async function save(topic: ProductEmailTopic, isEnabled: boolean) {
    setIsSaving(true);
    setSaveError(null);
    try {
      const service = await getService();
      const result = await service.patchProductEmailPreference(
        topic,
        isEnabled,
      );
      queryClient.setQueriesData<ProductEmailPreferenceValues>(
        { queryKey: PRODUCT_EMAIL_KEY },
        (current) => ({ ...current, [topic]: result.isEnabled }),
      );
    } catch (cause) {
      logger.error('Failed to update product email preference', cause);
      setSaveError(
        'Your email preference could not be saved. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function retry() {
    setSaveError(null);
    void refetch();
  }

  return (
    <div className="space-y-3" aria-busy={isPending}>
      {error ? (
        <Alert variant="warning">
          <span>{error}</span>
          <Button label={translate('retry')} onClick={retry} />
        </Alert>
      ) : null}
      {PRODUCT_EMAIL_PREFERENCES.map(({ topic, label, description }) => (
        <Switch
          key={topic}
          aria-label={label}
          label={label}
          description={description}
          isChecked={preferences[topic] ?? false}
          isDisabled={isSaving || preferences[topic] === undefined}
          isLoading={isPending}
          onChange={(event) => {
            void save(topic, event.target.checked);
          }}
        />
      ))}
      <p className="text-sm text-muted-foreground">
        {translate('transactionalNote')}
      </p>
    </div>
  );
}
