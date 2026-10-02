'use client';
import { ButtonVariant } from '@genfeedai/contracts';

import type {
  ISystemNotificationDestination,
  ISystemNotificationDestinationInput,
  ISystemNotificationOverview,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminSystemNotificationsService } from '@services/admin/system-notifications.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { NotificationsService } from '@services/core/notifications.service';
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
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

const EVENTS = [
  'user.created',
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
  'subscription.payment_succeeded',
  'payment.failed',
  'credits.purchased',
];
const EMPTY: ISystemNotificationDestinationInput = {
  label: '',
  provider: 'discord',
  address: '',
  isEnabled: true,
  eventTypes: ['user.created'],
};

export default function SystemNotificationsPanel() {
  const t = useTranslations('pages.platformSettings.notifications');
  const getService = useAuthedService((token: string) =>
    AdminSystemNotificationsService.getInstance(token),
  );
  const alerts = NotificationsService.getInstance();
  const [overview, setOverview] = useState<ISystemNotificationOverview | null>(
    null,
  );
  const [draft, setDraft] =
    useState<ISystemNotificationDestinationInput>(EMPTY);
  const [editingId, setEditingId] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const result = await (await getService()).overview(signal);
        if (!signal.aborted) setOverview(result);
      } catch {
        if (!signal.aborted) alerts.error(t('loadFailed'));
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    },
    [getService, alerts, t],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function act(
    operation: (
      service: AdminSystemNotificationsService,
    ) => Promise<ISystemNotificationOverview>,
    message: string,
  ): Promise<boolean> {
    setIsBusy(true);
    try {
      setOverview(await operation(await getService()));
      alerts.success(message);
      return true;
    } catch (error) {
      alerts.error(getJsonApiErrorMessage(error, t('actionFailed')));
      return false;
    } finally {
      setIsBusy(false);
    }
  }
  function edit(destination: ISystemNotificationDestination) {
    setEditingId(destination.id);
    setDraft({
      label: destination.label,
      provider: destination.provider,
      isEnabled: destination.isEnabled,
      eventTypes: destination.eventTypes,
      address: destination.address ?? '',
    });
  }
  function reset() {
    setEditingId(undefined);
    setDraft(EMPTY);
  }

  return (
    <section className="mb-10 max-w-2xl space-y-4" aria-label={t('title')}>
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      {isLoading ? (
        <p>{t('loading')}</p>
      ) : !overview ? (
        <Button
          type="button"
          onClick={() => void load(new AbortController().signal)}
        >
          {t('reload')}
        </Button>
      ) : (
        <>
          <p className="text-sm">
            {!overview.configuration.recordingEnabled
              ? t('recordingDisabled')
              : !overview.configuration.enabled
                ? t('deliveryDisabled')
                : !overview.configuration.transportConfigured
                  ? t('transportUnavailable')
                  : t('ready')}
          </p>
          <Switch
            aria-label={t('deliveryEnabled')}
            label={t('deliveryEnabled')}
            isChecked={overview.configuration.enabled}
            isDisabled={isBusy}
            onCheckedChange={(isEnabled) =>
              void act(
                (service) =>
                  service.configure(
                    isEnabled,
                    overview.configuration.eventTypes,
                  ),
                t('saved'),
              )
            }
          />
          <div className="space-y-3">
            {overview.destinations.map((destination) => (
              <div
                key={destination.id}
                className="rounded-md border p-3 space-y-2"
              >
                <p className="font-medium">
                  {destination.label} · {destination.provider}
                </p>
                <p className="text-sm text-muted-foreground">
                  {destination.address ?? t('webhookSaved')} ·{' '}
                  {destination.eventTypes.join(', ')}
                </p>
                <Switch
                  label={t('enabled')}
                  isChecked={destination.isEnabled}
                  isDisabled={isBusy}
                  onCheckedChange={(isEnabled) =>
                    void act(
                      (service) =>
                        service.save(
                          {
                            ...destination,
                            address: destination.address ?? undefined,
                            isEnabled,
                          },
                          destination.id,
                        ),
                      t('saved'),
                    )
                  }
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={ButtonVariant.SECONDARY}
                    disabled={isBusy}
                    onClick={() => edit(destination)}
                  >
                    {t('edit')}
                  </Button>
                  <Button
                    type="button"
                    variant={ButtonVariant.SECONDARY}
                    disabled={isBusy}
                    onClick={() =>
                      void act(
                        (service) => service.test(destination.id),
                        t('testSent'),
                      )
                    }
                  >
                    {t('test')}
                  </Button>
                  <Button
                    type="button"
                    variant={ButtonVariant.SECONDARY}
                    disabled={isBusy}
                    onClick={() =>
                      void act(
                        (service) => service.remove(destination.id),
                        t('removed'),
                      ).then((isRemoved) => {
                        if (isRemoved && editingId === destination.id) reset();
                      })
                    }
                  >
                    {t('remove')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Form
            spacing="section"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = {
                ...draft,
                address:
                  editingId &&
                  draft.provider === 'discord' &&
                  !draft.address?.trim()
                    ? undefined
                    : draft.address,
              };
              if (
                await act(
                  (service) => service.save(data, editingId),
                  t('saved'),
                )
              )
                reset();
            }}
          >
            <h3 className="font-medium">
              {editingId ? t('editDestination') : t('addDestination')}
            </h3>
            <Field label={t('label')} htmlFor="notification-label">
              <Input
                id="notification-label"
                value={draft.label}
                required
                maxLength={80}
                disabled={isBusy}
                onChange={(event) =>
                  setDraft({ ...draft, label: event.target.value })
                }
              />
            </Field>
            <Field label={t('provider')} htmlFor="notification-provider">
              <Select
                value={draft.provider}
                disabled={isBusy || Boolean(editingId)}
                onValueChange={(provider) => {
                  if (
                    provider === 'discord' ||
                    provider === 'telegram' ||
                    provider === 'email'
                  )
                    setDraft({ ...draft, provider, address: '' });
                }}
              >
                <SelectTrigger id="notification-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">
                    {t('providers.discord')}
                  </SelectItem>
                  <SelectItem value="telegram">
                    {t('providers.telegram')}
                  </SelectItem>
                  <SelectItem value="email">{t('providers.email')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={
                draft.provider === 'discord'
                  ? t('webhookUrl')
                  : draft.provider === 'telegram'
                    ? t('chatId')
                    : t('email')
              }
              htmlFor="notification-address"
              helpText={
                draft.provider === 'discord'
                  ? t(editingId ? 'preserveWebhook' : 'webhookHelp')
                  : draft.provider === 'telegram'
                    ? t('telegramHelp')
                    : undefined
              }
            >
              <Input
                id="notification-address"
                type={
                  draft.provider === 'discord'
                    ? 'password'
                    : draft.provider === 'email'
                      ? 'email'
                      : 'text'
                }
                value={draft.address ?? ''}
                autoComplete="off"
                required={!(editingId && draft.provider === 'discord')}
                disabled={isBusy}
                onChange={(event) =>
                  setDraft({ ...draft, address: event.target.value })
                }
              />
            </Field>
            <Switch
              label={t('enabled')}
              isChecked={draft.isEnabled}
              isDisabled={isBusy}
              onCheckedChange={(isEnabled) => setDraft({ ...draft, isEnabled })}
            />
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                {t('events')}
              </legend>
              {EVENTS.map((type) => (
                <Switch
                  key={type}
                  label={type}
                  isChecked={draft.eventTypes.includes(type)}
                  isDisabled={isBusy}
                  onCheckedChange={(isSelected) =>
                    setDraft({
                      ...draft,
                      eventTypes: isSelected
                        ? [...draft.eventTypes, type]
                        : draft.eventTypes.filter((event) => event !== type),
                    })
                  }
                />
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isBusy || !draft.eventTypes.length}
              >
                {t('save')}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  disabled={isBusy}
                  onClick={reset}
                >
                  {t('cancel')}
                </Button>
              )}
            </div>
          </Form>
          <h3 className="font-medium">{t('history')}</h3>
          {!overview.deliveries.length && (
            <p className="text-sm text-muted-foreground">{t('noHistory')}</p>
          )}
          {overview.deliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div>
                <p>
                  {delivery.type} ·{' '}
                  {overview.destinations.find(
                    (destination) => destination.id === delivery.destinationId,
                  )?.label ?? t('removedDestination')}
                </p>
                <p className="text-muted-foreground">
                  {delivery.occurredAt} · {delivery.status} ·{' '}
                  {t('attempts', { count: delivery.attempts })}
                </p>
              </div>
              {(delivery.status === 'failed' ||
                delivery.status === 'pending') && (
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  disabled={isBusy}
                  onClick={() =>
                    void act(
                      (service) => service.retry(delivery.id),
                      t('retryScheduled'),
                    )
                  }
                >
                  {t('retry')}
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant={ButtonVariant.SECONDARY}
            disabled={isBusy}
            onClick={() => void load(new AbortController().signal)}
          >
            {t('reload')}
          </Button>
        </>
      )}
    </section>
  );
}
