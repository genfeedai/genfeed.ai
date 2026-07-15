'use client';

import {
  PUBLISH_WEBHOOK_EVENT_TYPES,
  type PublishWebhookEventType,
} from '@api-types/contracts';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { webhookSettingsSchema } from '@genfeedai/client/schemas/integrations/webhook.schema';
import type { ButtonVariant } from '@genfeedai/enums';
import type {
  IOrganizationSetting,
  IWebhookDeliveryStatus,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Switch } from '@ui/primitives/switch';
import { Text } from '@ui/typography/text';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiArrowPath, HiPaperAirplane } from 'react-icons/hi2';

type WebhookFormState = {
  isWebhookEnabled: boolean;
  webhookEndpoint: string;
  webhookEventTypes: string[];
  webhookSecret: string;
};

const SECONDARY_BUTTON_VARIANT = 'secondary' as ButtonVariant;

const EVENT_LABELS: Record<PublishWebhookEventType, string> = {
  'release.failed': 'Release failed',
  'release.partially_published': 'Release partially published',
  'release.published': 'Release published',
  'target.failed': 'Target failed',
  'target.published': 'Target published',
};

const initialForm: WebhookFormState = {
  isWebhookEnabled: false,
  webhookEndpoint: '',
  webhookEventTypes: [],
  webhookSecret: '',
};

function toForm(settings: IOrganizationSetting | null): WebhookFormState {
  if (!settings) {
    return initialForm;
  }

  return {
    isWebhookEnabled: Boolean(settings.isWebhookEnabled),
    webhookEndpoint: settings.webhookEndpoint ?? '',
    webhookEventTypes: settings.webhookEventTypes ?? [],
    webhookSecret: '',
  };
}

function formatDate(value?: string | Date | null): string {
  if (!value) {
    return 'Never';
  }

  return new Date(value).toLocaleString();
}

function formatHttpStatus(status?: IWebhookDeliveryStatus | null): string {
  if (!status) {
    return 'None';
  }

  if (typeof status.statusCode === 'number') {
    return String(status.statusCode);
  }

  return status.status === 'queued' ? 'Pending' : 'None';
}

function statusVariant(
  status?: IWebhookDeliveryStatus['status'],
): 'default' | 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'queued':
      return 'secondary';
    case 'rejected':
      return 'warning';
    case 'failed':
      return 'destructive';
    default:
      return 'default';
  }
}

export default function SettingsWebhooksPage() {
  const { organizationId, isReady } = useBrand();
  const [settings, setSettings] = useState<IOrganizationSetting | null>(null);
  const [form, setForm] = useState<WebhookFormState>(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const getOrganizationsService = useAuthedService(
    useCallback((token: string) => OrganizationsService.getInstance(token), []),
  );

  const deliveryStatus = settings?.webhookDeliveryStatus ?? null;
  // The API rejects a test with 400 "Webhook endpoint is not configured" unless
  // a webhook endpoint is saved AND enabled. Gate the Test button on the SAVED
  // settings (not the unsaved form) so users configure + save before testing.
  const isWebhookConfigured = Boolean(
    settings?.isWebhookEnabled && settings?.webhookEndpoint,
  );
  const selectedEvents = useMemo(
    () => new Set(form.webhookEventTypes),
    [form.webhookEventTypes],
  );

  const loadSettings = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId || !isReady) {
        return;
      }

      setIsLoading(true);

      try {
        const service =
          (await getOrganizationsService()) as OrganizationsService;
        const nextSettings = await service.getSettings(organizationId);
        if (signal?.aborted) {
          return;
        }
        setSettings(nextSettings);
        setForm(toForm(nextSettings));
      } catch (error) {
        if (!signal?.aborted) {
          logger.error('Failed to load webhook settings', error);
          NotificationsService.getInstance().error(
            'Failed to load webhook settings',
          );
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getOrganizationsService, isReady, organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);
    return () => controller.abort();
  }, [loadSettings]);

  const toggleEvent = useCallback((event: PublishWebhookEventType) => {
    setForm((current) => {
      const eventSet = new Set(current.webhookEventTypes);
      if (eventSet.has(event)) {
        eventSet.delete(event);
      } else {
        eventSet.add(event);
      }

      return {
        ...current,
        webhookEventTypes: [...eventSet],
      };
    });
  }, []);

  const saveSettings = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    const parsed = webhookSettingsSchema.safeParse({
      isWebhookEnabled: form.isWebhookEnabled,
      webhookEndpoint: form.webhookEndpoint,
      webhookEventTypes: form.webhookEventTypes,
    });

    if (!parsed.success) {
      NotificationsService.getInstance().error(
        parsed.error.issues[0]?.message ?? 'Webhook settings are invalid',
      );
      return;
    }

    setIsSaving(true);

    try {
      const service = (await getOrganizationsService()) as OrganizationsService;
      const payload: Partial<IOrganizationSetting> = {
        isWebhookEnabled: form.isWebhookEnabled,
        webhookEndpoint: form.webhookEndpoint.trim() || undefined,
        webhookEventTypes: form.webhookEventTypes,
      };
      const secret = form.webhookSecret.trim();

      if (secret) {
        payload.webhookSecret = secret;
      }

      const nextSettings = await service.patchSettings(organizationId, payload);
      setSettings(nextSettings);
      setForm(toForm(nextSettings));
      NotificationsService.getInstance().success('Webhook settings saved');
    } catch (error) {
      logger.error('Failed to save webhook settings', error);
      NotificationsService.getInstance().error(
        'Failed to save webhook settings',
      );
    } finally {
      setIsSaving(false);
    }
  }, [form, getOrganizationsService, organizationId]);

  const testDelivery = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    setIsTesting(true);

    try {
      const service = (await getOrganizationsService()) as OrganizationsService;
      const status = await service.testWebhookDelivery(organizationId, {
        event: form.webhookEventTypes[0],
      });
      setSettings((current) =>
        current
          ? {
              ...current,
              webhookDeliveryStatus: status,
            }
          : current,
      );
      NotificationsService.getInstance().success('Webhook test queued');
    } catch (error) {
      logger.error('Failed to test webhook delivery', error);
      const responseData =
        error && typeof error === 'object' && 'response' in error
          ? (
              error as {
                response?: {
                  data?: {
                    message?: string;
                    errors?: Array<{ detail?: string }>;
                  };
                };
              }
            ).response?.data
          : undefined;
      const message =
        responseData?.errors?.[0]?.detail ??
        responseData?.message ??
        'Failed to queue webhook test';
      NotificationsService.getInstance().error(message);
    } finally {
      setIsTesting(false);
    }
  }, [form.webhookEventTypes, getOrganizationsService, organizationId]);

  if (isLoading) {
    return <Card label="Webhooks" description="Loading endpoint settings..." />;
  }

  return (
    <div className="grid gap-4">
      <Card
        label="Outbound Webhook Endpoint"
        description="Signed publish events are sent to this organization endpoint."
      >
        <div className="grid gap-4">
          <Switch
            isChecked={form.isWebhookEnabled}
            label="Enable endpoint"
            description="Disabled endpoints do not receive publish webhook events."
            onCheckedChange={(checked) =>
              setForm((current) => ({
                ...current,
                isWebhookEnabled: checked,
              }))
            }
          />

          <div className="grid gap-2">
            <Label htmlFor="webhook-endpoint">Endpoint URL</Label>
            <Input
              id="webhook-endpoint"
              placeholder="https://example.com/webhooks/genfeed"
              value={form.webhookEndpoint}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  webhookEndpoint: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="webhook-secret">Signing secret</Label>
            <Input
              id="webhook-secret"
              type="password"
              placeholder="Leave blank to keep the existing secret"
              value={form.webhookSecret}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  webhookSecret: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Publish events</Label>
              <span className="text-xs text-muted-foreground">
                No selection means all publish events
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {PUBLISH_WEBHOOK_EVENT_TYPES.map((event) => (
                <Checkbox
                  key={event}
                  isChecked={selectedEvents.has(event)}
                  label={EVENT_LABELS[event]}
                  onCheckedChange={() => toggleEvent(event)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={<HiArrowPath />}
              isLoading={isSaving}
              onClick={saveSettings}
            >
              Save
            </Button>
            <Button
              icon={<HiPaperAirplane />}
              isDisabled={!isWebhookConfigured}
              isLoading={isTesting}
              onClick={testDelivery}
              variant={SECONDARY_BUTTON_VARIANT}
            >
              Test delivery
            </Button>
            {!isWebhookConfigured ? (
              <Text as="span" className="text-xs text-surface/55">
                Save an enabled endpoint before sending a test.
              </Text>
            ) : null}
          </div>
        </div>
      </Card>

      <Card
        label="Delivery Status"
        description="Latest queued or attempted delivery for this endpoint."
        headerAction={
          deliveryStatus ? (
            <Badge variant={statusVariant(deliveryStatus.status)}>
              {deliveryStatus.status}
            </Badge>
          ) : null
        }
      >
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Event</dt>
            <dd className="font-medium">{deliveryStatus?.event ?? 'None'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Delivery ID</dt>
            <dd className="break-all font-mono text-xs">
              {deliveryStatus?.deliveryId ?? 'None'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Queued</dt>
            <dd>{formatDate(deliveryStatus?.queuedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Completed</dt>
            <dd>{formatDate(deliveryStatus?.completedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">HTTP status</dt>
            <dd>{formatHttpStatus(deliveryStatus)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Error</dt>
            <dd>{deliveryStatus?.error ?? 'None'}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
