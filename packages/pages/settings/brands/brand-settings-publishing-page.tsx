'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';
import Loading from '@ui/loading/default/Loading';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useState } from 'react';

export default function BrandSettingsPublishingPage() {
  const { brand, brandId, hasBrandId, isLoading, handleRefreshBrand } =
    useBrandDetail();
  const notifications = NotificationsService.getInstance();
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const [cronExpression, setCronExpression] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState('0.8');
  const [isSaving, setIsSaving] = useState(false);
  const publishingConfig = brand?.agentConfig as
    | {
        autoPublish?: {
          confidenceThreshold?: number;
          enabled?: boolean;
        };
        schedule?: {
          cronExpression?: string;
          enabled?: boolean;
          timezone?: string;
        };
      }
    | undefined;

  useEffect(() => {
    setCronExpression(publishingConfig?.schedule?.cronExpression ?? '');
    setTimezone(publishingConfig?.schedule?.timezone ?? 'UTC');
    setScheduleEnabled(Boolean(publishingConfig?.schedule?.enabled));
    setAutoPublishEnabled(Boolean(publishingConfig?.autoPublish?.enabled));
    setConfidenceThreshold(
      publishingConfig?.autoPublish?.confidenceThreshold?.toString() ?? '0.8',
    );
  }, [
    publishingConfig?.autoPublish?.confidenceThreshold,
    publishingConfig?.autoPublish?.enabled,
    publishingConfig?.schedule?.cronExpression,
    publishingConfig?.schedule?.enabled,
    publishingConfig?.schedule?.timezone,
  ]);

  const handleSave = useCallback(async () => {
    if (!brandId) {
      return;
    }

    setIsSaving(true);
    try {
      const service = await getBrandsService();
      await service.updateAgentConfig(brandId, {
        autoPublish: {
          confidenceThreshold:
            confidenceThreshold.trim().length > 0
              ? Number(confidenceThreshold)
              : undefined,
          enabled: autoPublishEnabled,
        },
        schedule: {
          cronExpression: cronExpression.trim() || undefined,
          enabled: scheduleEnabled,
          timezone: timezone.trim() || 'UTC',
        },
      });
      await handleRefreshBrand(true);
      notifications.success('Brand publishing defaults saved');
    } catch (error) {
      logger.error('Failed to save brand publishing defaults', error);
      notifications.error('Failed to save brand publishing defaults');
    } finally {
      setIsSaving(false);
    }
  }, [
    autoPublishEnabled,
    brandId,
    confidenceThreshold,
    cronExpression,
    getBrandsService,
    handleRefreshBrand,
    notifications,
    scheduleEnabled,
    timezone,
  ]);

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Publishing Defaults</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure recurring execution and auto-publish behavior for this
            brand.
          </p>
        </div>

        <div className="space-y-4">
          <FormToggle
            label="Enable Recurring Schedule"
            description="Run this brand on a recurring cadence using the cron expression below."
            isChecked={scheduleEnabled}
            isDisabled={isSaving}
            onChange={(event) => setScheduleEnabled(event.target.checked)}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="cron">
                Cron Expression
              </label>
              <Input
                id="cron"
                placeholder="0 9 * * 1-5"
                value={cronExpression}
                disabled={isSaving}
                onChange={(event) => setCronExpression(event.target.value)}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="timezone"
              >
                Timezone
              </label>
              <Input
                id="timezone"
                placeholder="Europe/Malta"
                value={timezone}
                disabled={isSaving}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </div>
          </div>

          <FormToggle
            label="Enable Auto-Publish"
            description="Allow approved outputs for this brand to publish automatically when confidence is high enough."
            isChecked={autoPublishEnabled}
            isDisabled={isSaving}
            onChange={(event) => setAutoPublishEnabled(event.target.checked)}
          />

          <div>
            <label
              className="mb-1 block text-sm font-medium"
              htmlFor="confidence-threshold"
            >
              Auto-Publish Confidence Threshold
            </label>
            <Input
              id="confidence-threshold"
              inputMode="decimal"
              placeholder="0.8"
              value={confidenceThreshold}
              disabled={isSaving}
              onChange={(event) => setConfidenceThreshold(event.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            withWrapper={false}
            onClick={handleSave}
            isDisabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
