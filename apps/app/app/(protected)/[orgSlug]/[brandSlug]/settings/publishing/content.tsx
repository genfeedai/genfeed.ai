'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { redactSensitiveString } from '@genfeedai/helpers';
import type {
  AccountPublishingContext,
  ICredential,
  PublishingReadinessState,
  PublishingSetupCheckStatus,
} from '@genfeedai/interfaces';
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
import { Switch } from '@ui/primitives/switch';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

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
            result.status === 'fulfilled' ? [result.value] : [],
          ),
        );
        setFailedCredentialIds(
          results.flatMap((result, index) =>
            result.status === 'rejected'
              ? [connectedCredentials[index].id]
              : [],
          ),
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

        <div className="border-t border-border pt-6">
          <div>
            <h2 className="text-lg font-semibold">
              Connected Account Readiness
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check provider credentials and setup before enabling automated
              publishing.
            </p>
          </div>

          {connectedCredentials.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No connected accounts are available for this brand.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {connectedCredentials.map((credential) => {
                const context = publishingContexts.find(
                  (candidate) => candidate.account.id === credential.id,
                );
                const hasFailed = failedCredentialIds.includes(credential.id);

                if (!context) {
                  return (
                    <div
                      key={credential.id}
                      className="rounded-md bg-background-secondary p-4 shadow-border"
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
                    className="rounded-md bg-background-secondary p-4 shadow-border"
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
                        {redactSensitiveString(
                          context.readiness.requiredAction,
                        )}
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
