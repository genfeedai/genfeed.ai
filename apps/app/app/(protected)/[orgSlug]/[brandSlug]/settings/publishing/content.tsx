'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { useCallback, useEffect, useReducer } from 'react';

type PublishingConfig = {
  autoPublish?: {
    confidenceThreshold?: number;
    enabled?: boolean;
  };
  schedule?: {
    cronExpression?: string;
    enabled?: boolean;
    timezone?: string;
  };
};

type FormState = {
  cronExpression: string;
  timezone: string;
  isScheduleEnabled: boolean;
  isAutoPublishEnabled: boolean;
  confidenceThreshold: string;
  isSaving: boolean;
};

type FormAction =
  | { type: 'RESET'; config: PublishingConfig | undefined }
  | { type: 'SET_CRON'; value: string }
  | { type: 'SET_TIMEZONE'; value: string }
  | { type: 'SET_SCHEDULE_ENABLED'; value: boolean }
  | { type: 'SET_AUTO_PUBLISH_ENABLED'; value: boolean }
  | { type: 'SET_CONFIDENCE_THRESHOLD'; value: string }
  | { type: 'SET_SAVING'; value: boolean };

function buildStateFromConfig(
  config: PublishingConfig | undefined,
): Omit<FormState, 'isSaving'> {
  return {
    cronExpression: config?.schedule?.cronExpression ?? '',
    timezone: config?.schedule?.timezone ?? 'UTC',
    isScheduleEnabled: Boolean(config?.schedule?.enabled),
    isAutoPublishEnabled: Boolean(config?.autoPublish?.enabled),
    confidenceThreshold:
      config?.autoPublish?.confidenceThreshold?.toString() ?? '0.8',
  };
}

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'RESET':
      return {
        ...buildStateFromConfig(action.config),
        isSaving: state.isSaving,
      };
    case 'SET_CRON':
      return { ...state, cronExpression: action.value };
    case 'SET_TIMEZONE':
      return { ...state, timezone: action.value };
    case 'SET_SCHEDULE_ENABLED':
      return { ...state, isScheduleEnabled: action.value };
    case 'SET_AUTO_PUBLISH_ENABLED':
      return { ...state, isAutoPublishEnabled: action.value };
    case 'SET_CONFIDENCE_THRESHOLD':
      return { ...state, confidenceThreshold: action.value };
    case 'SET_SAVING':
      return { ...state, isSaving: action.value };
    default:
      return state;
  }
}

export default function BrandSettingsPublishingPage() {
  const { brand, brandId, hasBrandId, isLoading, handleRefreshBrand } =
    useBrandDetail();
  const notifications = NotificationsService.getInstance();
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const publishingConfig = brand?.agentConfig as PublishingConfig | undefined;

  const [state, dispatch] = useReducer(formReducer, undefined, () => ({
    ...buildStateFromConfig(publishingConfig),
    isSaving: false,
  }));

  const {
    cronExpression,
    timezone,
    isScheduleEnabled,
    isAutoPublishEnabled,
    confidenceThreshold,
    isSaving,
  } = state;

  useEffect(() => {
    dispatch({ type: 'RESET', config: publishingConfig });
  }, [publishingConfig]);

  const handleSave = useCallback(async () => {
    if (!brandId) {
      return;
    }

    dispatch({ type: 'SET_SAVING', value: true });
    try {
      const service = await getBrandsService();
      await service.updateAgentConfig(brandId, {
        autoPublish: {
          confidenceThreshold:
            confidenceThreshold.trim().length > 0
              ? Number(confidenceThreshold)
              : undefined,
          enabled: isAutoPublishEnabled,
        },
        schedule: {
          cronExpression: cronExpression.trim() || undefined,
          enabled: isScheduleEnabled,
          timezone: timezone.trim() || 'UTC',
        },
      });
      await handleRefreshBrand(true);
      notifications.success('Brand publishing defaults saved');
    } catch (error) {
      logger.error('Failed to save brand publishing defaults', error);
      notifications.error('Failed to save brand publishing defaults');
    } finally {
      dispatch({ type: 'SET_SAVING', value: false });
    }
  }, [
    isAutoPublishEnabled,
    brandId,
    confidenceThreshold,
    cronExpression,
    getBrandsService,
    handleRefreshBrand,
    notifications,
    isScheduleEnabled,
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
          <Switch
            label="Enable Recurring Schedule"
            description="Run this brand on a recurring cadence using the cron expression below."
            isChecked={isScheduleEnabled}
            isDisabled={isSaving}
            onChange={(event) =>
              dispatch({
                type: 'SET_SCHEDULE_ENABLED',
                value: event.target.checked,
              })
            }
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
                onChange={(event) =>
                  dispatch({ type: 'SET_CRON', value: event.target.value })
                }
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
                onChange={(event) =>
                  dispatch({ type: 'SET_TIMEZONE', value: event.target.value })
                }
              />
            </div>
          </div>

          <Switch
            label="Enable Auto-Publish"
            description="Allow approved outputs for this brand to publish automatically when confidence is high enough."
            isChecked={isAutoPublishEnabled}
            isDisabled={isSaving}
            onChange={(event) =>
              dispatch({
                type: 'SET_AUTO_PUBLISH_ENABLED',
                value: event.target.checked,
              })
            }
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
              onChange={(event) =>
                dispatch({
                  type: 'SET_CONFIDENCE_THRESHOLD',
                  value: event.target.value,
                })
              }
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
