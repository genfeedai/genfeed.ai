'use client';

import { AlertCategory } from '@genfeedai/contracts';
import {
  PRODUCT_EMAIL_PREFERENCES,
  type ProductEmailTopic,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function ProductEmailPreferences() {
  const translate = useTranslations('pages.productEmailPreferences');
  const getService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const [preferences, setPreferences] = useState<
    Partial<Record<ProductEmailTopic, boolean>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: request explicitly retries the abortable preference load
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const service = await getService();
        const rows = await Promise.all(
          PRODUCT_EMAIL_PREFERENCES.map(({ topic }) =>
            service.findProductEmailPreference(topic, controller.signal),
          ),
        );
        controller.signal.throwIfAborted();
        setPreferences(
          Object.fromEntries(rows.map((row) => [row.topic, row.isEnabled])),
        );
      } catch (cause) {
        if (controller.signal.aborted) return;
        logger.error('Failed to load product email preferences', cause);
        setError('Email preferences could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [getService, request]);

  async function save(topic: ProductEmailTopic, isEnabled: boolean) {
    setIsSaving(true);
    setError(null);
    try {
      const service = await getService();
      const result = await service.patchProductEmailPreference(
        topic,
        isEnabled,
      );
      setPreferences((previous) => ({
        ...previous,
        [topic]: result.isEnabled,
      }));
    } catch (cause) {
      logger.error('Failed to update product email preference', cause);
      setError('Your email preference could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3" aria-busy={isLoading}>
      {error ? (
        <Alert type={AlertCategory.WARNING}>
          <span>{error}</span>
          <Button
            label={translate('retry')}
            onClick={() => setRequest((value) => value + 1)}
          />
        </Alert>
      ) : null}
      {PRODUCT_EMAIL_PREFERENCES.map(({ topic, label, description }) => (
        <Switch
          key={topic}
          aria-label={label}
          label={label}
          description={description}
          isChecked={preferences[topic] ?? false}
          isDisabled={isLoading || isSaving || preferences[topic] === undefined}
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
