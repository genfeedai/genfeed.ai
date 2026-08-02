'use client';

import {
  type ChannelCapability,
  type ChannelSettingDefinition,
  type ChannelValidationIssue,
  getChannelCapability,
  PRODUCTIZED_SCHEDULER_PLATFORMS,
  validateChannelTargetSettings,
} from '@api-types/contracts';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  type CredentialPlatform,
} from '@genfeedai/enums';
import type {
  ICredential,
  IPublishingProviderReadiness,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { CredentialsService } from '@services/organization/credentials.service';
import Card from '@ui/card/Card';
import PlatformPreview, {
  type PlatformPreviewTarget,
} from '@ui/posts/platform-preview/PlatformPreview';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useEffect, useMemo, useState } from 'react';

type ComposerDraft = {
  baseContent: string;
  scheduledDate: string;
  timezone: string;
  title: string;
};

type ComposerTarget = {
  captionOverride: string;
  credentialId: string;
  credentialLabel: string;
  firstComment: string;
  id: string;
  isConnected: boolean;
  platform: CredentialPlatform;
  platformLabel: string;
  settings: Record<string, unknown>;
  signature: string;
};

type TargetReview = {
  errors: ChannelValidationIssue[];
  target: ComposerTarget;
  valid: boolean;
  warnings: ChannelValidationIssue[];
};

type ChannelOption = {
  capability: ChannelCapability;
  credentials: ICredential[];
};

type ChannelReadinessIssue = {
  code: string;
  message: string;
};

type ChannelReadinessVerdict = {
  block: ChannelReadinessIssue | null;
  warning: ChannelReadinessIssue | null;
};

const DEFAULT_TIMEZONE = 'UTC';

function getInitialTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
}

function getDefaultSettings(
  capability: ChannelCapability,
): Record<string, unknown> {
  return Object.fromEntries(
    capability.settings
      .filter((setting) => setting.defaultValue !== undefined)
      .map((setting) => [setting.key, setting.defaultValue]),
  );
}

function getCredentialLabel(credential: ICredential): string {
  const capability = getChannelCapability(credential.platform);
  const platformLabel = capability?.label ?? String(credential.platform);
  const accountLabel =
    credential.label || credential.externalHandle || credential.externalId;

  return accountLabel ? `${platformLabel} @${accountLabel}` : platformLabel;
}

function buildTarget(
  credential: ICredential,
  capability: ChannelCapability,
): ComposerTarget {
  return {
    captionOverride: '',
    credentialId: credential.id,
    credentialLabel: getCredentialLabel(credential),
    firstComment: '',
    id: credential.id,
    isConnected: credential.isConnected,
    platform: capability.platform,
    platformLabel: capability.label,
    settings: getDefaultSettings(capability),
    signature: '',
  };
}

function getChannelOptions(credentials: ICredential[]): ChannelOption[] {
  return PRODUCTIZED_SCHEDULER_PLATFORMS.map((platform) => {
    const capability = getChannelCapability(platform);

    if (!capability) {
      return null;
    }

    return {
      capability,
      credentials: credentials.filter(
        (credential) => credential.platform === platform,
      ),
    };
  }).filter((option): option is ChannelOption => option !== null);
}

function createValidationIssue(
  code: string,
  message: string,
  field?: string,
): ChannelValidationIssue {
  return {
    code,
    field,
    message,
    severity: 'error',
  };
}

function createValidationWarning(
  code: string,
  message: string,
  field?: string,
): ChannelValidationIssue {
  return {
    code,
    field,
    message,
    severity: 'warning',
  };
}

/**
 * The channel-picker verdict for one credential.
 *
 * Readiness is optional on purpose: it is fetched after first paint, and a
 * failed request must leave authoring available rather than block it. Without
 * a record the composer falls back to the `isConnected` flag it already had.
 */
function resolveChannelReadiness(
  isConnected: boolean,
  readiness: IPublishingProviderReadiness | undefined,
): ChannelReadinessVerdict {
  if (readiness && !readiness.canSchedule) {
    return {
      block: {
        code: 'channel_target.not_publish_capable',
        message:
          readiness.requiredAction ??
          'This channel cannot publish until its provider setup is fixed.',
      },
      warning: null,
    };
  }

  if (!isConnected) {
    return {
      block: {
        code: 'channel_target.disconnected_credential',
        message: 'Reconnect before scheduling',
      },
      warning: null,
    };
  }

  if (readiness?.state === 'degraded') {
    const diagnostic =
      readiness.diagnostics.find(
        (candidate) => candidate.severity === 'warning',
      ) ?? readiness.diagnostics[0];

    return {
      block: null,
      warning: {
        code: 'channel_target.degraded_publish_capability',
        message:
          diagnostic?.message ??
          'This channel can publish, but its provider readiness is degraded.',
      },
    };
  }

  return { block: null, warning: null };
}

function validateComposerTarget(
  draft: ComposerDraft,
  target: ComposerTarget,
  readiness: IPublishingProviderReadiness | undefined,
): TargetReview {
  const caption = target.captionOverride.trim() || draft.baseContent.trim();
  const validation = validateChannelTargetSettings({
    caption,
    credentialId: target.credentialId,
    media: [],
    platform: target.platform,
    publishMode: 'scheduled',
    settings: target.settings,
  });
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];

  const { block, warning } = resolveChannelReadiness(
    target.isConnected,
    readiness,
  );
  if (block) {
    errors.unshift(
      createValidationIssue(
        block.code,
        `${target.credentialLabel}: ${block.message}`,
        'credentialId',
      ),
    );
  }

  if (warning) {
    warnings.unshift(
      createValidationWarning(
        warning.code,
        `${target.credentialLabel}: ${warning.message}`,
        'credentialId',
      ),
    );
  }

  if (!caption) {
    errors.unshift(
      createValidationIssue(
        'release.base_content_required',
        `Release content is required for ${target.platformLabel}.`,
        'baseContent',
      ),
    );
  }

  if (!draft.scheduledDate.trim()) {
    errors.unshift(
      createValidationIssue(
        'release.scheduled_date_required',
        `Schedule date is required for ${target.platformLabel}.`,
        'scheduledDate',
      ),
    );
  }

  return {
    errors,
    target,
    valid: errors.length === 0,
    warnings,
  };
}

/**
 * The preview reuses the review's validation result so the rendered target and
 * the readiness column can never disagree about what blocks publishing.
 */
function buildPreviewTarget(
  draft: ComposerDraft,
  target: ComposerTarget,
): PlatformPreviewTarget {
  const [, accountHandle] = target.credentialLabel.split(' @');

  return {
    author: {
      handle: accountHandle ?? target.platformLabel,
      name: target.credentialLabel,
    },
    caption: target.captionOverride.trim() || draft.baseContent,
    platform: target.platform,
    publishMode: 'scheduled',
    settings: target.settings,
    title: draft.title,
  };
}

function formatSettingValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return value === undefined || value === null ? '' : String(value);
}

function coerceSettingValue(
  setting: ChannelSettingDefinition,
  value: string | boolean,
): unknown {
  if (setting.type === 'boolean') {
    return value === true;
  }

  if (setting.type === 'number') {
    return value === '' ? undefined : Number(value);
  }

  if (setting.type === 'multi_select') {
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return String(value);
}

function TargetSettingField({
  onChange,
  setting,
  value,
}: {
  onChange: (key: string, value: unknown) => void;
  setting: ChannelSettingDefinition;
  value: unknown;
}) {
  const label = `${setting.label}${setting.required ? ' *' : ''}`;

  if (setting.type === 'boolean') {
    return (
      <Checkbox
        isChecked={value === true}
        label={label}
        onCheckedChange={(checked) =>
          onChange(setting.key, coerceSettingValue(setting, checked === true))
        }
      />
    );
  }

  if (setting.type === 'select' && setting.options?.length) {
    return (
      <div className="grid gap-2 text-sm text-foreground/75">
        <span>{label}</span>
        <Select
          value={formatSettingValue(value)}
          onValueChange={(nextValue) => onChange(setting.key, nextValue)}
        >
          <SelectTrigger aria-label={setting.label}>
            <SelectValue placeholder={`Choose ${setting.label}`} />
          </SelectTrigger>
          <SelectContent>
            {setting.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <Input
      label={label}
      type={setting.type === 'number' ? 'number' : 'text'}
      value={formatSettingValue(value)}
      onChange={(event) =>
        onChange(setting.key, coerceSettingValue(setting, event.target.value))
      }
      placeholder={setting.description ?? setting.label}
    />
  );
}

function TargetReviewList({ reviews }: { reviews: TargetReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select at least one channel target to review scheduling readiness.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {reviews.map((review) => (
        <div
          key={review.target.id}
          className="rounded-lg border border-border/70 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {review.target.credentialLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {review.target.platformLabel}
              </p>
            </div>
            <Badge variant={review.valid ? 'success' : 'warning'}>
              {review.valid ? 'Ready' : 'Blocked'}
            </Badge>
          </div>

          {review.errors.length ? (
            // The preview panel repeats these messages for the active target.
            // Naming the list keeps the two addressable apart — by a reader
            // and by a test.
            <ul
              aria-label={`${review.target.credentialLabel} blockers`}
              className="mt-3 grid gap-2 text-sm text-destructive"
            >
              {review.errors.map((issue) => (
                <li key={`${review.target.id}-${issue.code}-${issue.field}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              This target is ready to schedule.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CrossPostComposerPage() {
  const { brandId, credentials = [] } = useBrand();
  const channelOptions = useMemo(
    () => getChannelOptions(credentials),
    [credentials],
  );
  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );
  const [readinessByCredentialId, setReadinessByCredentialId] = useState<
    Record<string, IPublishingProviderReadiness>
  >({});
  const [draft, setDraft] = useState<ComposerDraft>(() => ({
    baseContent: '',
    scheduledDate: '',
    timezone: getInitialTimezone(),
    title: '',
  }));
  const [targetsById, setTargetsById] = useState<
    Record<string, ComposerTarget>
  >({});
  const selectedTargets = useMemo(
    () => Object.values(targetsById),
    [targetsById],
  );
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const activeTarget =
    selectedTargets.find((target) => target.id === activeTargetId) ??
    selectedTargets[0];
  const reviews = useMemo(
    () =>
      selectedTargets.map((target) =>
        validateComposerTarget(
          draft,
          target,
          readinessByCredentialId[target.credentialId],
        ),
      ),
    [draft, readinessByCredentialId, selectedTargets],
  );
  const readyCount = reviews.filter((review) => review.valid).length;
  const blockedCount = reviews.length - readyCount;

  useEffect(() => {
    const controller = new AbortController();

    if (!brandId) {
      setReadinessByCredentialId({});
      return () => controller.abort();
    }

    const loadReadiness = async () => {
      try {
        const service = await getCredentialsService();
        const records = await service.listBrandPublishingReadiness(
          brandId,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setReadinessByCredentialId(
          Object.fromEntries(
            records.flatMap((record) =>
              record.credentialId ? [[record.credentialId, record]] : [],
            ),
          ),
        );
      } catch (error) {
        // Readiness is an enhancement over the `isConnected` flag the composer
        // already has. Losing it must not stop the user from authoring.
        if (!controller.signal.aborted) {
          logger.error('Failed to load channel publishing readiness', error);
          setReadinessByCredentialId({});
        }
      }
    };

    void loadReadiness();

    return () => controller.abort();
  }, [brandId, getCredentialsService]);

  useEffect(() => {
    if (selectedTargets.length === 0) {
      setActiveTargetId(null);
      return;
    }

    if (
      !activeTargetId ||
      !selectedTargets.some((t) => t.id === activeTargetId)
    ) {
      setActiveTargetId(selectedTargets[0]?.id ?? null);
    }
  }, [activeTargetId, selectedTargets]);

  function updateDraft(key: keyof ComposerDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleTarget(
    credential: ICredential,
    capability: ChannelCapability,
    isSelected: boolean,
  ) {
    setTargetsById((current) => {
      if (!isSelected) {
        const remainingTargets = { ...current };
        delete remainingTargets[credential.id];
        return remainingTargets;
      }

      return {
        ...current,
        [credential.id]:
          current[credential.id] ?? buildTarget(credential, capability),
      };
    });

    if (isSelected) {
      setActiveTargetId(credential.id);
    }
  }

  function updateActiveTarget(
    key: keyof Pick<
      ComposerTarget,
      'captionOverride' | 'firstComment' | 'signature'
    >,
    value: string,
  ) {
    if (!activeTarget) {
      return;
    }

    setTargetsById((current) => ({
      ...current,
      [activeTarget.id]: {
        ...activeTarget,
        [key]: value,
      },
    }));
  }

  function updateActiveTargetSetting(key: string, value: unknown) {
    if (!activeTarget) {
      return;
    }

    setTargetsById((current) => ({
      ...current,
      [activeTarget.id]: {
        ...activeTarget,
        settings: {
          ...activeTarget.settings,
          [key]: value,
        },
      },
    }));
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-6">
        <Card bodyClassName="gap-5 p-6">
          <div>
            <h2 className="text-base font-semibold">Release draft</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Compose once, then tune each selected channel.
            </p>
          </div>

          <Input
            label="Release title"
            value={draft.title}
            onChange={(event) => updateDraft('title', event.target.value)}
            placeholder="Launch announcement"
          />

          <label
            className="grid gap-2 text-sm text-foreground/75"
            htmlFor="cross-post-base-content"
          >
            <span>Base content</span>
            <Textarea
              id="cross-post-base-content"
              value={draft.baseContent}
              onChange={(event) =>
                updateDraft('baseContent', event.target.value)
              }
              placeholder="Write the shared caption or post body."
              rows={5}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Schedule date"
              type="datetime-local"
              value={draft.scheduledDate}
              onChange={(event) =>
                updateDraft('scheduledDate', event.target.value)
              }
            />
            <Input
              label="Timezone"
              value={draft.timezone}
              onChange={(event) => updateDraft('timezone', event.target.value)}
              placeholder={DEFAULT_TIMEZONE}
            />
          </div>
        </Card>

        <Card bodyClassName="gap-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Channel targets</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Connected publishing channels can be selected for this release.
              </p>
            </div>
            <Badge variant={selectedTargets.length ? 'info' : 'outline'}>
              {selectedTargets.length} selected
            </Badge>
          </div>

          <div className="grid gap-3">
            {channelOptions.map(
              ({ capability, credentials: channelCredentials }) => {
                // The platform badge tracks what can actually be scheduled, so
                // it cannot read "Connected" while every account is blocked.
                // A platform with no credential at all is a different state:
                // nothing is broken, the brand simply has not connected one.
                const isPlatformSchedulable = channelCredentials.some(
                  (credential) =>
                    resolveChannelReadiness(
                      credential.isConnected,
                      readinessByCredentialId[credential.id],
                    ).block === null,
                );
                const platformBadgeLabel = !channelCredentials.length
                  ? 'Disconnected'
                  : isPlatformSchedulable
                    ? 'Ready'
                    : 'Not publishable';

                return (
                  <div
                    key={capability.platform}
                    className="rounded-lg border border-border/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {capability.label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {capability.description}
                        </p>
                      </div>
                      <Badge
                        variant={isPlatformSchedulable ? 'success' : 'outline'}
                      >
                        {platformBadgeLabel}
                      </Badge>
                    </div>

                    {channelCredentials.length ? (
                      <div className="mt-4 grid gap-2">
                        {channelCredentials.map((credential) => {
                          const { block, warning } = resolveChannelReadiness(
                            credential.isConnected,
                            readinessByCredentialId[credential.id],
                          );
                          const status = block ?? warning;

                          return (
                            <Checkbox
                              key={credential.id}
                              isChecked={Boolean(targetsById[credential.id])}
                              isDisabled={block !== null}
                              label={
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate text-sm">
                                    {getCredentialLabel(credential)}
                                  </span>
                                  <span
                                    className={
                                      block
                                        ? 'text-xs text-destructive'
                                        : warning
                                          ? 'text-xs text-warning'
                                          : 'text-xs text-muted-foreground'
                                    }
                                  >
                                    {status?.message ?? 'Ready for review'}
                                  </span>
                                </span>
                              }
                              onCheckedChange={(checked) =>
                                toggleTarget(
                                  credential,
                                  capability,
                                  checked === true,
                                )
                              }
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        No connected {capability.label} credential is available.
                      </p>
                    )}
                  </div>
                );
              },
            )}
          </div>

          {credentials.length === 0 ? (
            <p className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">
              No connected publishing channels available.
            </p>
          ) : null}
        </Card>

        {activeTarget ? (
          <Card bodyClassName="gap-5 p-6">
            <div>
              <h2 className="text-base font-semibold">Target overrides</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Switch targets without losing channel-specific values.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedTargets.map((target) => (
                <Button
                  key={target.id}
                  label={`Edit ${target.credentialLabel}`}
                  size={ButtonSize.SM}
                  variant={
                    target.id === activeTarget.id
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => setActiveTargetId(target.id)}
                />
              ))}
            </div>

            <label
              className="grid gap-2 text-sm text-foreground/75"
              htmlFor="cross-post-target-caption"
            >
              <span>Target caption</span>
              <Textarea
                id="cross-post-target-caption"
                value={activeTarget.captionOverride}
                onChange={(event) =>
                  updateActiveTarget('captionOverride', event.target.value)
                }
                placeholder={
                  draft.baseContent || 'Override caption for this target'
                }
                rows={4}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="First comment or thread"
                value={activeTarget.firstComment}
                onChange={(event) =>
                  updateActiveTarget('firstComment', event.target.value)
                }
                placeholder="Optional"
              />
              <Input
                label="Signature"
                value={activeTarget.signature}
                onChange={(event) =>
                  updateActiveTarget('signature', event.target.value)
                }
                placeholder="Optional"
              />
            </div>

            {getChannelCapability(activeTarget.platform)?.settings.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {getChannelCapability(activeTarget.platform)?.settings.map(
                  (setting) => (
                    <TargetSettingField
                      key={setting.key}
                      setting={setting}
                      value={activeTarget.settings[setting.key]}
                      onChange={updateActiveTargetSetting}
                    />
                  ),
                )}
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      <aside className="grid content-start gap-6">
        {activeTarget ? (
          <Card bodyClassName="gap-5 p-6">
            <div>
              <h2 className="text-base font-semibold">Preview</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeTarget.credentialLabel} as it will publish.
              </p>
            </div>

            <PlatformPreview target={buildPreviewTarget(draft, activeTarget)} />
          </Card>
        ) : null}

        <Card bodyClassName="gap-5 p-6">
          <div>
            <h2 className="text-base font-semibold">Review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Resolve channel blockers before scheduling.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-lg font-semibold">{reviews.length}</p>
              <p className="text-xs text-muted-foreground">Targets</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-lg font-semibold">{readyCount}</p>
              <p className="text-xs text-muted-foreground">Ready</p>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-lg font-semibold">{blockedCount}</p>
              <p className="text-xs text-muted-foreground">Blocked</p>
            </div>
          </div>

          <TargetReviewList reviews={reviews} />
        </Card>
      </aside>
    </section>
  );
}
