'use client';

import {
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import { isPublishApprovalRequired } from '@genfeedai/contracts/constants';
import type {
  AccountPublishingContext,
  PublishingReadinessState,
  PublishingSetupCheckStatus,
} from '@genfeedai/contracts/interfaces';
import { redactSensitiveString } from '@genfeedai/helpers';
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { getCredentialLabel } from '@helpers/publisher/credential-label.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Loading from '@ui/loading/default/Loading';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import type {
  FormAction,
  FormState,
  PublishingConfig,
  PublishingReadinessSnapshot,
} from '@/features/settings/props/publishing-content.props';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';
import PublishingPostingSetsSection from './publishing-posting-sets-section';
import PublishingRssSourcesSection from './publishing-rss-sources-section';

const LEADING_AT_SIGN_PATTERN = /^@/;

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
    <Card
      padding={CardPadding.SM}
      gap={CardGap.LG}
      bodyClassName="flex-row items-start justify-between"
    >
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
    </Card>
  );
}

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

function publishingReadinessQueryKey(
  brandId: string,
  credentialIds: readonly string[],
) {
  return ['publishing-readiness', 'by-brand', brandId, credentialIds] as const;
}

const EMPTY_READINESS: PublishingReadinessSnapshot = {
  contexts: [],
  failedCredentialIds: [],
};

function buildStateFromConfig(
  config: PublishingConfig | undefined,
): Omit<FormState, 'hasEdits' | 'isSaving'> {
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
        hasEdits: false,
        isSaving: state.isSaving,
      };
    case 'SET_CRON':
      return { ...state, cronExpression: action.value, hasEdits: true };
    case 'SET_TIMEZONE':
      return { ...state, hasEdits: true, timezone: action.value };
    case 'SET_SCHEDULE_ENABLED':
      return { ...state, hasEdits: true, isScheduleEnabled: action.value };
    case 'SET_AUTO_PUBLISH_ENABLED':
      return { ...state, hasEdits: true, isAutoPublishEnabled: action.value };
    case 'SET_CONFIDENCE_THRESHOLD':
      return { ...state, confidenceThreshold: action.value, hasEdits: true };
    case 'SET_SAVING':
      return { ...state, isSaving: action.value };
    case 'MARK_SAVED':
      return { ...state, hasEdits: false };
    default:
      return state;
  }
}

export default function BrandSettingsPublishingPage() {
  const translate = useTranslations('pages.brandPublishingSettings');
  const { brand, brandId, hasBrandId, isLoading, handleRefreshBrand } =
    useBrandDetail();
  const clipboardService = ClipboardService.getInstance();
  const notifications = NotificationsService.getInstance();
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const publishingConfig = brand?.agentConfig as PublishingConfig | undefined;
  const connectedCredentials = useMemo(
    () =>
      (brand?.credentials ?? []).filter(
        (credential) => credential.isConnected && credential.id,
      ),
    [brand?.credentials],
  );
  const connectedCredentialIds = useMemo(
    () => connectedCredentials.map((credential) => credential.id),
    [connectedCredentials],
  );
  // Readiness reads through React Query, so coming back to the page paints
  // the last readiness at once and re-checks it in the background.
  const readinessQuery = useAuthedQuery<
    CredentialsService,
    PublishingReadinessSnapshot
  >({
    enabled: Boolean(brandId) && connectedCredentialIds.length > 0,
    queryFn: async (service, signal) => {
      const results = await Promise.allSettled(
        connectedCredentialIds.map((credentialId) =>
          service.getPublishingContext(credentialId, 'post', signal),
        ),
      );
      return {
        contexts: results.flatMap((result) =>
          result.status === 'fulfilled' && result.value?.account?.id
            ? [result.value]
            : [],
        ),
        failedCredentialIds: results.flatMap((result, index) =>
          result.status === 'fulfilled' && result.value?.account?.id
            ? []
            : [connectedCredentialIds[index]],
        ),
      };
    },
    queryKey: publishingReadinessQueryKey(brandId, connectedCredentialIds),
    service: (token: string) => CredentialsService.getInstance(token),
  });
  const { error: readinessError } = readinessQuery;
  const hasReadiness = readinessQuery.data !== undefined;
  useEffect(() => {
    if (readinessError && !hasReadiness) {
      logger.error('Failed to load publishing readiness', readinessError);
    }
  }, [hasReadiness, readinessError]);
  // A failed background re-check keeps the readiness on screen.
  const readiness =
    readinessQuery.data ??
    (readinessError
      ? { contexts: [], failedCredentialIds: connectedCredentialIds }
      : EMPTY_READINESS);
  const publishingContexts = readiness.contexts;
  const failedCredentialIds = readiness.failedCredentialIds;
  const isReadinessLoading = readinessQuery.isLoading;

  const [state, dispatch] = useReducer(formReducer, undefined, () => ({
    ...buildStateFromConfig(publishingConfig),
    hasEdits: false,
    isSaving: false,
  }));

  const {
    cronExpression,
    timezone,
    hasEdits,
    isScheduleEnabled,
    isAutoPublishEnabled,
    confidenceThreshold,
    isSaving,
  } = state;

  const [isCustomSchedule, setIsCustomSchedule] = useState(
    () =>
      resolveSchedulePresetValue(
        publishingConfig?.schedule?.cronExpression ?? '',
      ) === CUSTOM_SCHEDULE_VALUE,
  );

  // The config the form was last seeded from. The brand refreshes in the
  // background, so fresh config re-seeds the form only while it is
  // untouched; another brand always re-seeds it.
  const [configSource, setConfigSource] = useState({
    brandId,
    publishingConfig,
  });
  if (
    configSource.publishingConfig !== publishingConfig ||
    configSource.brandId !== brandId
  ) {
    setConfigSource({ brandId, publishingConfig });
    if (configSource.brandId !== brandId || !hasEdits) {
      dispatch({ type: 'RESET', config: publishingConfig });
      setIsCustomSchedule(
        resolveSchedulePresetValue(
          publishingConfig?.schedule?.cronExpression ?? '',
        ) === CUSTOM_SCHEDULE_VALUE,
      );
    }
  }

  // Enabling auto-publish always clears the gate, so the note reflects the
  // live toggle rather than only the last-saved config.
  const showApprovalGateNote = isPublishApprovalRequired({
    enabled: isAutoPublishEnabled,
    isApprovalRequired: publishingConfig?.autoPublish?.isApprovalRequired,
  });

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
          // Enabling auto-publish always turns the approval gate off. This
          // never sends `true` — re-enabling the gate happens elsewhere.
          ...(isAutoPublishEnabled ? { isApprovalRequired: false } : {}),
        },
        schedule: {
          cronExpression: cronExpression.trim() || undefined,
          enabled: isScheduleEnabled,
          timezone: timezone.trim() || 'UTC',
        },
      });
      // The saved values become the form's seed, so the refreshed brand
      // re-seeds it.
      dispatch({ type: 'MARK_SAVED' });
      await handleRefreshBrand();
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
      <Card>
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card label="Publishing defaults" labelAs="h1">
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
              <Label className="text-foreground" htmlFor="publishing-cadence">
                Cadence
              </Label>
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
                  <Label
                    className="text-xs text-muted-foreground"
                    htmlFor="publishing-custom-schedule"
                  >
                    Custom schedule
                  </Label>
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
              <Label className="text-foreground" htmlFor="publishing-timezone">
                Timezone
              </Label>
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

          {showApprovalGateNote ? (
            <Alert
              data-testid="publish-approval-gate-note"
              variant="info"
              icon={false}
            >
              <AlertTitle>{translate('approvalGate.title')}</AlertTitle>
              <AlertDescription>
                {translate('approvalGate.description')}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-foreground" htmlFor="confidence-threshold">
              Confidence threshold
            </Label>
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

      <Card label="Connected account readiness">
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
                  <Card variant={CardVariant.INSET} key={credential.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {getCredentialLabel(credential)}
                        </p>
                        <PlatformBadge
                          platform={credential.platform}
                          size={ComponentSize.SM}
                        />
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
                  </Card>
                );
              }

              return (
                <Card variant={CardVariant.INSET} key={credential.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {context.account.label}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <PlatformBadge
                          platform={context.account.platform}
                          size={ComponentSize.SM}
                        />
                        {context.account.handle
                          ? ` · @${context.account.handle.replace(LEADING_AT_SIGN_PATTERN, '')}`
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
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
