'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  AccountPublishingContext,
  ICredential,
  PublishingReadinessState,
  PublishingSetupCheckStatus,
} from '@genfeedai/contracts/interfaces';
import { redactSensitiveString } from '@genfeedai/helpers';
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import PublishingPostingSetsSection from './publishing-posting-sets-section';
import PublishingRssSourcesSection from './publishing-rss-sources-section';

const CUSTOM_SCHEDULE_VALUE = 'custom';

/** Human cadence presets — still stored as cron on the brand config. */
const SCHEDULE_PRESETS = [
  { cron: '0 9 * * 1-5', label: 'Weekdays at 9:00 AM' },
  { cron: '0 9 * * *', label: 'Every day at 9:00 AM' },
  { cron: '0 12 * * *', label: 'Every day at noon' },
  { cron: '0 18 * * *', label: 'Every day at 6:00 PM' },
  { cron: '0 9 * * 1', label: 'Mondays at 9:00 AM' },
  { cron: '0 9,18 * * *', label: 'Twice daily (9:00 AM and 6:00 PM)' },
] as const;

function resolveSchedulePresetValue(cronExpression: string): string {
  const match = SCHEDULE_PRESETS.find(
    (preset) => preset.cron === cronExpression.trim(),
  );
  return match?.cron ?? (cronExpression.trim() ? CUSTOM_SCHEDULE_VALUE : '');
}

function SettingsToggleRow({
  description,
  isChecked,
  isDisabled,
  label,
  onCheckedChange,
}: {
  description: string;
  isChecked: boolean;
  isDisabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}): ReactNode {
  return (
    <div className="flex items-start justify-between gap-4 rounded-card bg-background-secondary/40 px-4 py-3 shadow-border">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch
        aria-label={label}
        className="mt-0.5 shrink-0"
        isChecked={isChecked}
        isDisabled={isDisabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onCheckedChange(event.target.checked);
        }}
      />
    </div>
  );
}

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

const READINESS_CHECKS = [
  ['tokenFreshness', 'Token'],
  ['callbackUrlStatus', 'Callback'],
  ['permissionScopeStatus', 'Permissions'],
  ['appReviewStatus', 'App review'],
  ['quotaStatus', 'Quota'],
] as const;

const MAX_EXPORTED_DIAGNOSTICS = 5;

function getReadinessBadgeVariant(
  state: PublishingReadinessState,
): 'destructive' | 'outline' | 'success' | 'warning' {
  if (state === 'publish_capable') {
    return 'success';
  }

  if (state === 'degraded') {
    return 'warning';
  }

  if (state === 'blocked') {
    return 'destructive';
  }

  return 'outline';
}

function formatReadinessState(state: PublishingReadinessState): string {
  return state
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function formatCheckStatus(status: PublishingSetupCheckStatus): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function getCredentialLabel(credential: ICredential): string {
  const handle = credential.externalHandle?.replace(/^@/, '');

  return (
    credential.label ??
    credential.externalName ??
    (handle ? `@${handle}` : credential.platform)
  );
}

function buildPublishingReadinessSummary(
  context: AccountPublishingContext,
): string {
  const { account, readiness } = context;
  const lines = [
    'Genfeed publishing readiness',
    `Account: ${redactSensitiveString(account.label)}`,
    `Provider: ${account.platform}`,
    `State: ${formatReadinessState(readiness.state)}`,
    `Can schedule: ${readiness.canSchedule ? 'yes' : 'no'}`,
    `Token: ${formatCheckStatus(readiness.tokenFreshness)}`,
    `Callback: ${formatCheckStatus(readiness.callbackUrlStatus)}`,
    `Permissions: ${formatCheckStatus(readiness.permissionScopeStatus)}`,
    `App review: ${formatCheckStatus(readiness.appReviewStatus)}`,
    `Quota: ${formatCheckStatus(readiness.quotaStatus)}`,
  ];

  if (readiness.requiredAction) {
    lines.push(
      `Required action: ${redactSensitiveString(readiness.requiredAction)}`,
    );
  }

  for (const diagnostic of readiness.diagnostics.slice(
    0,
    MAX_EXPORTED_DIAGNOSTICS,
  )) {
    lines.push(
      `[${diagnostic.severity}] ${redactSensitiveString(
        diagnostic.code,
      )}: ${redactSensitiveString(diagnostic.message)}`,
    );

    if (diagnostic.correctiveAction) {
      lines.push(
        `Next step: ${redactSensitiveString(diagnostic.correctiveAction)}`,
      );
    }
  }

  if (readiness.diagnostics.length > MAX_EXPORTED_DIAGNOSTICS) {
    lines.push(
      `${readiness.diagnostics.length - MAX_EXPORTED_DIAGNOSTICS} additional diagnostics omitted`,
    );
  }

  return lines.join('\n');
}

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
  const clipboardService = ClipboardService.getInstance();
  const notifications = NotificationsService.getInstance();
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );

  const publishingConfig = brand?.agentConfig as PublishingConfig | undefined;
  const connectedCredentials = useMemo(
    () =>
      (brand?.credentials ?? []).filter(
        (credential) => credential.isConnected && credential.id,
      ),
    [brand?.credentials],
  );
  const [publishingContexts, setPublishingContexts] = useState<
    AccountPublishingContext[]
  >([]);
  const [failedCredentialIds, setFailedCredentialIds] = useState<string[]>([]);
  const [isReadinessLoading, setIsReadinessLoading] = useState(false);

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

  useEffect(() => {
    const controller = new AbortController();

    if (!brandId || connectedCredentials.length === 0) {
      setPublishingContexts([]);
      setFailedCredentialIds([]);
      setIsReadinessLoading(false);
      return () => controller.abort();
    }

    setPublishingContexts([]);
    setFailedCredentialIds([]);
    setIsReadinessLoading(true);

    const loadPublishingReadiness = async () => {
      try {
        const service = await getCredentialsService();
        const results = await Promise.allSettled(
          connectedCredentials.map((credential) =>
            service.getPublishingContext(
              credential.id,
              'post',
              controller.signal,
            ),
          ),
        );

        if (controller.signal.aborted) {
          return;
        }

        setPublishingContexts(
          results.flatMap((result) =>
            result.status === 'fulfilled' && result.value?.account?.id
              ? [result.value]
              : [],
          ),
        );
        setFailedCredentialIds(
          results.flatMap((result, index) => {
            if (result.status === 'fulfilled' && result.value?.account?.id) {
              return [];
            }

            return [connectedCredentials[index].id];
          }),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load publishing readiness', error);
          setFailedCredentialIds(
            connectedCredentials.map((credential) => credential.id),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsReadinessLoading(false);
        }
      }
    };

    void loadPublishingReadiness();

    return () => controller.abort();
  }, [brandId, connectedCredentials, getCredentialsService]);

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

  const handleCopyReadiness = useCallback(
    (context: AccountPublishingContext) => {
      void clipboardService.copyToClipboard(
        buildPublishingReadinessSummary(context),
      );
    },
    [clipboardService],
  );

  const [isCustomSchedule, setIsCustomSchedule] = useState(
    () =>
      resolveSchedulePresetValue(
        publishingConfig?.schedule?.cronExpression ?? '',
      ) === CUSTOM_SCHEDULE_VALUE,
  );

  useEffect(() => {
    setIsCustomSchedule(
      resolveSchedulePresetValue(
        publishingConfig?.schedule?.cronExpression ?? '',
      ) === CUSTOM_SCHEDULE_VALUE,
    );
  }, [publishingConfig]);

  const scheduleSelectValue = isCustomSchedule
    ? CUSTOM_SCHEDULE_VALUE
    : resolveSchedulePresetValue(cronExpression) || undefined;

  const timezoneOptions = useMemo(() => {
    if (!timezone || TIMEZONES.some((entry) => entry.value === timezone)) {
      return TIMEZONES;
    }
    return [{ label: timezone, offset: 0, value: timezone }, ...TIMEZONES];
  }, [timezone]);

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card bodyClassName="gap-3 p-4">
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        label="Publishing defaults"
        description="Recurring content generation cadence and auto-publish rules for this brand."
        bodyClassName="gap-3 p-4"
      >
        <div className="space-y-3">
          <SettingsToggleRow
            description="Generate recurring content for this brand on the cadence and timezone below."
            isChecked={isScheduleEnabled}
            isDisabled={isSaving}
            label="Recurring schedule"
            onCheckedChange={(checked) =>
              dispatch({ type: 'SET_SCHEDULE_ENABLED', value: checked })
            }
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="publishing-cadence"
              >
                Cadence
              </label>
              <Select
                disabled={isSaving || !isScheduleEnabled}
                value={scheduleSelectValue}
                onValueChange={(value) => {
                  if (value === CUSTOM_SCHEDULE_VALUE) {
                    setIsCustomSchedule(true);
                    if (!cronExpression.trim()) {
                      dispatch({
                        type: 'SET_CRON',
                        value: '0 9 * * 1-5',
                      });
                    }
                    return;
                  }
                  setIsCustomSchedule(false);
                  dispatch({ type: 'SET_CRON', value });
                }}
              >
                <SelectTrigger aria-label="Cadence" id="publishing-cadence">
                  <SelectValue placeholder="Choose when to run" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_PRESETS.map((preset) => (
                    <SelectItem key={preset.cron} value={preset.cron}>
                      {preset.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_SCHEDULE_VALUE}>Custom…</SelectItem>
                </SelectContent>
              </Select>
              {isCustomSchedule ? (
                <div className="space-y-1.5 pt-2">
                  <label
                    className="block text-xs font-medium text-muted-foreground"
                    htmlFor="publishing-custom-schedule"
                  >
                    Custom schedule
                  </label>
                  <Input
                    aria-label="Custom schedule"
                    disabled={isSaving || !isScheduleEnabled}
                    id="publishing-custom-schedule"
                    placeholder="e.g. weekdays at 9am → 0 9 * * 1-5"
                    value={cronExpression}
                    onChange={(event) =>
                      dispatch({
                        type: 'SET_CRON',
                        value: event.target.value,
                      })
                    }
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Advanced schedule format. Prefer a preset unless you need
                    something specific.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="publishing-timezone"
              >
                Timezone
              </label>
              <Select
                disabled={isSaving || !isScheduleEnabled}
                value={timezone || 'UTC'}
                onValueChange={(value) =>
                  dispatch({ type: 'SET_TIMEZONE', value })
                }
              >
                <SelectTrigger aria-label="Timezone" id="publishing-timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SettingsToggleRow
            description="Publish approved outputs automatically when confidence clears the threshold."
            isChecked={isAutoPublishEnabled}
            isDisabled={isSaving}
            label="Auto-publish"
            onCheckedChange={(checked) =>
              dispatch({
                type: 'SET_AUTO_PUBLISH_ENABLED',
                value: checked,
              })
            }
          />

          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="confidence-threshold"
            >
              Confidence threshold
            </label>
            <Input
              aria-label="Confidence threshold"
              disabled={isSaving || !isAutoPublishEnabled}
              id="confidence-threshold"
              inputMode="decimal"
              placeholder="0.8"
              value={confidenceThreshold}
              onChange={(event) =>
                dispatch({
                  type: 'SET_CONFIDENCE_THRESHOLD',
                  value: event.target.value,
                })
              }
            />
            <p className="text-xs leading-5 text-muted-foreground">
              0–1 scale. Higher means only higher-confidence outputs publish
              without review.
            </p>
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <Button
              isDisabled={isSaving}
              withWrapper={false}
              onClick={handleSave}
            >
              {isSaving ? 'Saving…' : 'Save defaults'}
            </Button>
          </div>
        </div>
      </Card>

      {brandId ? (
        <PublishingPostingSetsSection brandId={brandId} timezone={timezone} />
      ) : null}

      {brandId ? (
        <PublishingRssSourcesSection
          brandId={brandId}
          credentials={connectedCredentials}
          timezone={timezone}
        />
      ) : null}

      <Card
        label="Connected account readiness"
        description="Check provider credentials and setup before enabling automated publishing."
        bodyClassName="gap-3 p-4"
      >
        {connectedCredentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No connected accounts are available for this brand.
          </p>
        ) : (
          <div className="space-y-3">
            {connectedCredentials.map((credential) => {
              const context = publishingContexts.find(
                (candidate) => candidate.account?.id === credential.id,
              );
              const hasFailed = failedCredentialIds.includes(credential.id);

              if (!context) {
                return (
                  <div
                    key={credential.id}
                    className="rounded-card bg-background-secondary p-4 shadow-border"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {getCredentialLabel(credential)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {credential.platform}
                        </p>
                      </div>
                      <Badge variant={hasFailed ? 'destructive' : 'outline'}>
                        {hasFailed
                          ? 'Unavailable'
                          : isReadinessLoading
                            ? 'Checking'
                            : 'Unknown'}
                      </Badge>
                    </div>
                    {hasFailed ? (
                      <p className="mt-3 text-sm text-destructive">
                        Publishing readiness could not be loaded for this
                        account. Retry by refreshing this page.
                      </p>
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  key={credential.id}
                  className="rounded-card bg-background-secondary p-4 shadow-border"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {context.account.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {context.account.platform}
                        {context.account.handle
                          ? ` · @${context.account.handle.replace(/^@/, '')}`
                          : ''}
                      </p>
                    </div>
                    <Badge
                      variant={getReadinessBadgeVariant(
                        context.readiness.state,
                      )}
                    >
                      {formatReadinessState(context.readiness.state)}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {READINESS_CHECKS.map(([key, label]) => (
                      <div key={key}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                          {formatCheckStatus(context.readiness[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {context.readiness.requiredAction ? (
                    <p className="mt-4 text-sm text-foreground">
                      {redactSensitiveString(context.readiness.requiredAction)}
                    </p>
                  ) : null}

                  {context.readiness.diagnostics.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {context.readiness.diagnostics.map((diagnostic) => (
                        <li key={`${diagnostic.code}-${diagnostic.message}`}>
                          {redactSensitiveString(diagnostic.message)}
                          {diagnostic.correctiveAction
                            ? ` Next: ${redactSensitiveString(
                                diagnostic.correctiveAction,
                              )}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      This account is ready to publish.
                    </p>
                  )}

                  <div className="mt-4 flex justify-end">
                    <Button
                      label="Copy diagnostics"
                      variant={ButtonVariant.SECONDARY}
                      withWrapper={false}
                      onClick={() => handleCopyReadiness(context)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
