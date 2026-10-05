'use client';

import { ModerationCategory } from '@genfeedai/contracts';
import { DEFAULT_MODERATION_THRESHOLDS } from '@genfeedai/contracts/api-types/contracts';
import {
  MODERATION_PROVIDER_NAMES,
  PLATFORM_FEATURE_SETTING_BOUNDS,
  SHADOW_CAPPED_DECISION_MODES,
  TYPED_DECISION_MODES,
} from '@genfeedai/contracts/constants';
import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';
import type {
  PlatformFeatureSettingsFieldsProps,
  PlatformNullableTextFeatureSettingKey,
  PlatformNumericFeatureSettingKey,
  PlatformRequiredTextFeatureSettingKey,
  PlatformSettingsTab,
} from '@props/admin/platform-settings.props';

import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import PlatformModeSettingField from './platform-mode-setting-field';
import PlatformNumberSettingField from './platform-number-setting-field';
import PlatformSettingsGroup from './platform-settings-group';

const { confidence, mediaPerceptionFrameCount, mediaPerceptionLookbackHours } =
  PLATFORM_FEATURE_SETTING_BOUNDS;

const MODERATION_CATEGORIES = Object.values(ModerationCategory);

/**
 * Product feature switches (#5407): every operator decision that used to be
 * an env var, rendered one platform settings tab at a time. The page owns the
 * state and saves every tab together.
 */
export default function PlatformFeatureSettingsFields({
  isDisabled,
  isEmailDeliveryConfigured,
  onChange,
  onValidityChange,
  section,
  settings,
}: PlatformFeatureSettingsFieldsProps) {
  const translate = useTranslations('pages.platformSettings.features');
  const format = useFormatter();

  function update<TKey extends keyof IPlatformFeatureSettings>(
    key: TKey,
    value: IPlatformFeatureSettings[TKey],
  ): void {
    onChange({ ...settings, [key]: value });
  }

  function updateNumber(key: PlatformNumericFeatureSettingKey) {
    return (value: number | null) => {
      if (value !== null) {
        update(key, value);
      }
    };
  }

  function updateThreshold(category: ModerationCategory, value: number | null) {
    const { [category]: _removed, ...rest } = settings.moderationThresholds;
    update(
      'moderationThresholds',
      value === null ? rest : { ...rest, [category]: value },
    );
  }

  function numberField(
    key: PlatformNumericFeatureSettingKey,
    label: string,
    bounds: { isInteger: boolean; max: number; min: number },
  ) {
    return (
      <PlatformNumberSettingField
        id={`platform-${key}`}
        label={label}
        min={bounds.min}
        max={bounds.max}
        value={settings[key]}
        isInteger={bounds.isInteger}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber(key)}
      />
    );
  }

  /** A decision's minimum confidence, labelled by the group it sits in. */
  function confidenceField(id: string, key: PlatformNumericFeatureSettingKey) {
    return (
      <PlatformNumberSettingField
        id={id}
        label={translate('decisions.confidenceLabel')}
        min={confidence.min}
        max={confidence.max}
        value={settings[key]}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber(key)}
      />
    );
  }

  /** A text switch an operator clears to `null` (the server default). */
  function nullableTextField(
    key: PlatformNullableTextFeatureSettingKey,
    label: string,
  ) {
    return (
      <Field label={label} htmlFor={`platform-${key}`}>
        <Input
          id={`platform-${key}`}
          value={settings[key] ?? ''}
          disabled={isDisabled}
          onChange={(event) => update(key, event.target.value || null)}
        />
      </Field>
    );
  }

  function requiredTextField(
    key: PlatformRequiredTextFeatureSettingKey,
    label: string,
  ) {
    return (
      <Field label={label} htmlFor={`platform-${key}`}>
        <Input
          id={`platform-${key}`}
          value={settings[key] ?? ''}
          disabled={isDisabled}
          onChange={(event) => update(key, event.target.value)}
        />
      </Field>
    );
  }

  function renderBilling(): ReactNode {
    return (
      <PlatformSettingsGroup title={translate('billing.creditsHeading')}>
        {numberField(
          'paygFallbackCredits',
          translate('runtime.paygFallbackCredits'),
          { isInteger: true, max: 1000000, min: 1 },
        )}
        {numberField(
          'trainingCreditsCost',
          translate('runtime.trainingCreditsCost'),
          { isInteger: false, max: 1000000, min: 0 },
        )}
        {numberField(
          'customModelCreditsCost',
          translate('runtime.customModelCreditsCost'),
          { isInteger: false, max: 1000000, min: 0 },
        )}
      </PlatformSettingsGroup>
    );
  }

  /**
   * One typed decision point as its own group: the group names the decision,
   * the fields inside are just its mode and minimum confidence.
   */
  function decisionGroup(
    label: string,
    modeField: ReactNode,
    confidenceKey?: PlatformNumericFeatureSettingKey,
    confidenceId?: string,
  ) {
    return (
      <PlatformSettingsGroup title={label}>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {modeField}
          {confidenceKey && confidenceId
            ? confidenceField(confidenceId, confidenceKey)
            : null}
        </div>
      </PlatformSettingsGroup>
    );
  }

  function renderDecisions(): ReactNode {
    const modeLabel = translate('decisions.modeLabel');
    const shadowCappedHelp = translate('decisions.shadowCappedHelp');

    return (
      <>
        {decisionGroup(
          translate('decisions.agentAutoRoutingLabel'),
          <PlatformModeSettingField
            id="platform-agent-auto-routing-mode"
            label={modeLabel}
            helpText={translate('decisions.agentAutoRoutingHelp')}
            modes={TYPED_DECISION_MODES}
            value={settings.agentAutoRoutingDecisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('agentAutoRoutingDecisionMode', mode)}
          />,
        )}
        {decisionGroup(
          translate('decisions.modelDiscoveryLabel'),
          <PlatformModeSettingField
            id="platform-model-discovery-mode"
            label={modeLabel}
            modes={TYPED_DECISION_MODES}
            value={settings.modelDiscoveryDecisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('modelDiscoveryDecisionMode', mode)}
          />,
          'modelDiscoveryMinConfidence',
          'platform-model-discovery-min-confidence',
        )}
        {decisionGroup(
          translate('decisions.replyBotIntentLabel'),
          <PlatformModeSettingField
            id="platform-reply-bot-intent-mode"
            label={modeLabel}
            modes={TYPED_DECISION_MODES}
            value={settings.replyBotIntentDecisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('replyBotIntentDecisionMode', mode)}
          />,
          'replyBotIntentMinConfidence',
          'platform-reply-bot-intent-min-confidence',
        )}
        {decisionGroup(
          translate('decisions.patternAnalyzerLabel'),
          <PlatformModeSettingField
            id="platform-pattern-analyzer-mode"
            label={modeLabel}
            helpText={shadowCappedHelp}
            modes={SHADOW_CAPPED_DECISION_MODES}
            value={settings.patternAnalyzerDecisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('patternAnalyzerDecisionMode', mode)}
          />,
          'patternAnalyzerMinConfidence',
          'platform-pattern-analyzer-min-confidence',
        )}
        {decisionGroup(
          translate('decisions.taskRoutingLabel'),
          <PlatformModeSettingField
            id="platform-task-routing-mode"
            label={modeLabel}
            helpText={shadowCappedHelp}
            modes={SHADOW_CAPPED_DECISION_MODES}
            value={settings.taskRoutingDecisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('taskRoutingDecisionMode', mode)}
          />,
          'taskRoutingMinConfidence',
          'platform-task-routing-min-confidence',
        )}
        {decisionGroup(
          translate('decisions.untrustedContentLabel'),
          <PlatformModeSettingField
            id="platform-untrusted-content-mode"
            label={modeLabel}
            helpText={shadowCappedHelp}
            modes={SHADOW_CAPPED_DECISION_MODES}
            value={settings.untrustedContentDecisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('untrustedContentDecisionMode', mode)}
          />,
          'untrustedContentMinConfidence',
          'platform-untrusted-content-min-confidence',
        )}
      </>
    );
  }

  function renderAgent(): ReactNode {
    return (
      <>
        <PlatformSettingsGroup title={translate('agent.heading')}>
          <Switch
            aria-label={translate('agent.contextCompressionLabel')}
            label={translate('agent.contextCompressionLabel')}
            description={translate('agent.contextCompressionHelp')}
            isChecked={settings.isAgentContextCompressionEnabled}
            isDisabled={isDisabled}
            onCheckedChange={(isChecked) =>
              update('isAgentContextCompressionEnabled', isChecked)
            }
          />
          <Switch
            aria-label={translate('agent.tokenStreamingLabel')}
            label={translate('agent.tokenStreamingLabel')}
            description={translate('agent.tokenStreamingHelp')}
            isChecked={settings.isAgentTokenStreamingEnabled}
            isDisabled={isDisabled}
            onCheckedChange={(isChecked) =>
              update('isAgentTokenStreamingEnabled', isChecked)
            }
          />
        </PlatformSettingsGroup>
        <PlatformSettingsGroup title={translate('agent.contextHeading')}>
          {nullableTextField(
            'agentContextCompressionModel',
            translate('runtime.agentContextCompressionModel'),
          )}
          {numberField(
            'agentContextWindowSize',
            translate('runtime.agentContextWindowSize'),
            { isInteger: true, max: 200, min: 1 },
          )}
          {numberField(
            'generationMaxTokens',
            translate('runtime.generationMaxTokens'),
            { isInteger: true, max: 128000, min: 1 },
          )}
        </PlatformSettingsGroup>
      </>
    );
  }

  function renderMedia(): ReactNode {
    return (
      <>
        <PlatformSettingsGroup title={translate('media.heading')}>
          <Switch
            aria-label={translate('media.perceptionLabel')}
            label={translate('media.perceptionLabel')}
            description={translate('media.perceptionHelp')}
            isChecked={settings.isMediaPerceptionEnabled}
            isDisabled={isDisabled}
            onCheckedChange={(isChecked) =>
              update('isMediaPerceptionEnabled', isChecked)
            }
          />
          <PlatformNumberSettingField
            id="platform-media-perception-frame-count"
            label={translate('media.frameCountLabel')}
            isInteger
            min={mediaPerceptionFrameCount.min}
            max={mediaPerceptionFrameCount.max}
            value={settings.mediaPerceptionFrameCount}
            isDisabled={isDisabled}
            onValidityChange={onValidityChange}
            onCommit={updateNumber('mediaPerceptionFrameCount')}
          />
          <PlatformNumberSettingField
            id="platform-media-perception-lookback-hours"
            label={translate('media.lookbackLabel')}
            isInteger
            min={mediaPerceptionLookbackHours.min}
            max={mediaPerceptionLookbackHours.max}
            value={settings.mediaPerceptionLookbackHours}
            isDisabled={isDisabled}
            onValidityChange={onValidityChange}
            onCommit={updateNumber('mediaPerceptionLookbackHours')}
          />
          <Field
            label={translate('media.visionModelLabel')}
            htmlFor="platform-media-perception-vision-model"
            helpText={translate('media.visionModelHelp')}
          >
            <Input
              id="platform-media-perception-vision-model"
              value={settings.mediaPerceptionVisionModel ?? ''}
              disabled={isDisabled}
              onChange={(event) =>
                update(
                  'mediaPerceptionVisionModel',
                  event.target.value.trim() ? event.target.value : null,
                )
              }
            />
          </Field>
        </PlatformSettingsGroup>

        <PlatformSettingsGroup title={translate('media.gatesHeading')}>
          <PlatformModeSettingField
            id="platform-media-gate-vision-mode"
            label={translate('media.visionGateLabel')}
            helpText={translate('media.visionGateHelp')}
            modes={TYPED_DECISION_MODES}
            value={settings.mediaGateVisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('mediaGateVisionMode', mode)}
          />
          <PlatformModeSettingField
            id="platform-media-text-gate-mode"
            label={translate('media.textGateLabel')}
            helpText={translate('media.textGateHelp')}
            modes={TYPED_DECISION_MODES}
            value={settings.mediaTextGateDecisionMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('mediaTextGateDecisionMode', mode)}
          />
          <PlatformNumberSettingField
            id="platform-media-text-gate-min-confidence"
            label={translate('media.textGateConfidenceLabel')}
            helpText={translate('confidenceHelp')}
            min={confidence.min}
            max={confidence.max}
            value={settings.mediaTextGateMinConfidence}
            isDisabled={isDisabled}
            onValidityChange={onValidityChange}
            onCommit={updateNumber('mediaTextGateMinConfidence')}
          />
        </PlatformSettingsGroup>

        <PlatformSettingsGroup title={translate('media.imagesHeading')}>
          {numberField(
            'imageCompressionQuality',
            translate('runtime.imageCompressionQuality'),
            { isInteger: true, max: 100, min: 1 },
          )}
        </PlatformSettingsGroup>

        <PlatformSettingsGroup title={translate('moderation.heading')}>
          <Field
            label={translate('moderation.providerLabel')}
            htmlFor="platform-moderation-provider"
            helpText={translate('moderation.providerHelp')}
          >
            <Select
              value={settings.moderationProvider}
              onValueChange={(next) => {
                const provider = MODERATION_PROVIDER_NAMES.find(
                  (candidate) => candidate === next,
                );
                if (provider) {
                  update('moderationProvider', provider);
                }
              }}
              disabled={isDisabled}
            >
              <SelectTrigger id="platform-moderation-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODERATION_PROVIDER_NAMES.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {translate(`moderation.providers.${provider}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <PlatformModeSettingField
            id="platform-moderation-mode"
            label={translate('moderation.modeLabel')}
            helpText={translate('moderation.modeHelp')}
            modes={TYPED_DECISION_MODES}
            value={settings.moderationMode}
            isDisabled={isDisabled}
            onChange={(mode) => update('moderationMode', mode)}
          />
        </PlatformSettingsGroup>

        <PlatformSettingsGroup
          title={translate('moderation.thresholdsLabel')}
          description={translate('moderation.thresholdsHelp')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {MODERATION_CATEGORIES.map((category) => (
              <PlatformNumberSettingField
                key={category}
                id={`platform-moderation-threshold-${category}`}
                label={translate(`moderation.categories.${category}`)}
                isOptional
                min={confidence.min}
                max={confidence.max}
                placeholder={String(DEFAULT_MODERATION_THRESHOLDS[category])}
                value={settings.moderationThresholds[category] ?? null}
                isDisabled={isDisabled}
                onValidityChange={onValidityChange}
                onCommit={(value) => updateThreshold(category, value)}
              />
            ))}
          </div>
        </PlatformSettingsGroup>
      </>
    );
  }

  function renderProviders(): ReactNode {
    return (
      <>
        <PlatformSettingsGroup title={translate('providers.modelsHeading')}>
          {requiredTextField('klingModel', translate('runtime.klingModel'))}
          {nullableTextField(
            'elevenlabsModel',
            translate('runtime.elevenlabsModel'),
          )}
          {requiredTextField('murekaModel', translate('runtime.murekaModel'))}
        </PlatformSettingsGroup>

        <PlatformSettingsGroup title={translate('providers.trainingHeading')}>
          {requiredTextField(
            'replicateTrainerModel',
            translate('runtime.replicateTrainerModel'),
          )}
          {requiredTextField(
            'replicateModelHardware',
            translate('runtime.replicateModelHardware'),
          )}
          <Field
            label={translate('runtime.replicateModelVisibility')}
            htmlFor="platform-replicateModelVisibility"
          >
            <Select
              value={settings.replicateModelVisibility}
              onValueChange={(value) =>
                update(
                  'replicateModelVisibility',
                  value === 'public' ? 'public' : 'private',
                )
              }
              disabled={isDisabled}
            >
              <SelectTrigger id="platform-replicateModelVisibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  {translate('runtime.private')}
                </SelectItem>
                <SelectItem value="public">
                  {translate('runtime.public')}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </PlatformSettingsGroup>

        <PlatformSettingsGroup title={translate('providers.videoHeading')}>
          {numberField(
            'replicateTargetFps',
            translate('runtime.replicateTargetFps'),
            { isInteger: true, max: 120, min: 1 },
          )}
          {requiredTextField(
            'replicateTargetResolution',
            translate('runtime.replicateTargetResolution'),
          )}
        </PlatformSettingsGroup>

        <PlatformSettingsGroup title={translate('providers.sourcesHeading')}>
          <Field
            label={translate('runtime.linkedinTrendSourceUrls')}
            htmlFor="platform-linkedinTrendSourceUrls"
          >
            <Input
              id="platform-linkedinTrendSourceUrls"
              value={settings.linkedinTrendSourceUrls ?? ''}
              disabled={isDisabled}
              onChange={(event) =>
                update(
                  'linkedinTrendSourceUrls',
                  event.target.value.trim() || null,
                )
              }
            />
          </Field>
        </PlatformSettingsGroup>
      </>
    );
  }

  function renderAccounts(): ReactNode {
    return (
      <>
        <PlatformSettingsGroup title={translate('platform.heading')}>
          <Switch
            aria-label={translate('platform.emailVerificationLabel')}
            label={translate('platform.emailVerificationLabel')}
            description={translate(
              isEmailDeliveryConfigured
                ? 'platform.emailVerificationHelp'
                : 'platform.emailVerificationUnavailable',
            )}
            // Without a mailer the stored value is not enforced, so the switch
            // shows off; saving never rewrites the stored value.
            isChecked={
              isEmailDeliveryConfigured && settings.isEmailVerificationRequired
            }
            isDisabled={isDisabled || !isEmailDeliveryConfigured}
            onCheckedChange={(isChecked) =>
              update('isEmailVerificationRequired', isChecked)
            }
          />
          <Switch
            aria-label={translate('platform.systemEventsLabel')}
            label={translate('platform.systemEventsLabel')}
            description={
              settings.systemEventsEnabledAt
                ? translate('platform.systemEventsSince', {
                    date: format.dateTime(
                      new Date(settings.systemEventsEnabledAt),
                      {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      },
                    ),
                  })
                : translate('platform.systemEventsHelp')
            }
            isChecked={settings.systemEventsEnabledAt !== null}
            isDisabled={isDisabled}
            onCheckedChange={(isChecked) =>
              // Turning recording on starts the window now, so historical
              // signups are never replayed; an existing window is kept.
              update(
                'systemEventsEnabledAt',
                isChecked
                  ? (settings.systemEventsEnabledAt ?? new Date().toISOString())
                  : null,
              )
            }
          />
        </PlatformSettingsGroup>
        <PlatformSettingsGroup title={translate('platform.emailHeading')}>
          {nullableTextField(
            'emailFromAddress',
            translate('runtime.emailFromAddress'),
          )}
          {nullableTextField(
            'emailReplyToAddress',
            translate('runtime.emailReplyToAddress'),
          )}
        </PlatformSettingsGroup>
      </>
    );
  }

  function renderNotifications(): ReactNode {
    return (
      <>
        <PlatformSettingsGroup
          title={translate('discord.channelsHeading')}
          description={translate('discord.channelsHelp')}
        >
          {nullableTextField(
            'discordChannelIdDeployments',
            translate('runtime.discordChannelIdDeployments'),
          )}
          {nullableTextField(
            'discordChannelIdPosts',
            translate('runtime.discordChannelIdPosts'),
          )}
          {nullableTextField(
            'discordChannelIdStudio',
            translate('runtime.discordChannelIdStudio'),
          )}
          {nullableTextField(
            'discordChannelIdUsers',
            translate('runtime.discordChannelIdUsers'),
          )}
          {nullableTextField(
            'discordChannelIdModels',
            translate('runtime.discordChannelIdModels'),
          )}
        </PlatformSettingsGroup>
        <PlatformSettingsGroup title={translate('discord.webhooksHeading')}>
          {nullableTextField(
            'discordBotAvatarUrl',
            translate('runtime.discordBotAvatarUrl'),
          )}
          {nullableTextField(
            'discordWebhookNamePrefix',
            translate('runtime.discordWebhookNamePrefix'),
          )}
          {nullableTextField(
            'discordWebhookReason',
            translate('runtime.discordWebhookReason'),
          )}
        </PlatformSettingsGroup>
      </>
    );
  }

  const SECTION_RENDERERS: Record<PlatformSettingsTab, () => ReactNode> = {
    accounts: renderAccounts,
    agent: renderAgent,
    billing: renderBilling,
    decisions: renderDecisions,
    media: renderMedia,
    notifications: renderNotifications,
    providers: renderProviders,
  };

  return SECTION_RENDERERS[section]();
}
