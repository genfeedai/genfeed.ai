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
  PlatformNumericFeatureSettingKey,
} from '@props/admin/platform-settings.props';
import PlatformModeSettingField from '@protected/administration/platform-settings/platform-mode-setting-field';
import PlatformNumberSettingField from '@protected/administration/platform-settings/platform-number-setting-field';
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
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useFormatter, useTranslations } from 'next-intl';

const { confidence, mediaPerceptionFrameCount, mediaPerceptionLookbackHours } =
  PLATFORM_FEATURE_SETTING_BOUNDS;

const MODERATION_CATEGORIES = Object.values(ModerationCategory);

/**
 * Product feature switches (#5407): every operator decision that used to be
 * an env var. The page owns the state and saves it with the rest of the
 * platform settings.
 */
export default function PlatformFeatureSettingsFields({
  isDisabled,
  onChange,
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

  function confidenceField(
    id: string,
    label: string,
    key: PlatformNumericFeatureSettingKey,
  ) {
    return (
      <PlatformNumberSettingField
        id={id}
        label={label}
        helpText={translate('confidenceHelp')}
        min={confidence.min}
        max={confidence.max}
        value={settings[key]}
        isDisabled={isDisabled}
        onCommit={updateNumber(key)}
      />
    );
  }

  return (
    <>
      <Text as="p" color="muted" size="sm">
        {translate('intro')}
      </Text>

      <Heading size="md">{translate('media.heading')}</Heading>
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
      {confidenceField(
        'platform-media-text-gate-min-confidence',
        translate('media.textGateConfidenceLabel'),
        'mediaTextGateMinConfidence',
      )}

      <Heading size="md">{translate('moderation.heading')}</Heading>
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
      <Heading size="sm">{translate('moderation.thresholdsLabel')}</Heading>
      <Text as="p" color="muted" size="sm">
        {translate('moderation.thresholdsHelp')}
      </Text>
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
          onCommit={(value) => updateThreshold(category, value)}
        />
      ))}

      <Heading size="md">{translate('decisions.heading')}</Heading>
      <PlatformModeSettingField
        id="platform-agent-auto-routing-mode"
        label={translate('decisions.agentAutoRoutingLabel')}
        helpText={translate('decisions.agentAutoRoutingHelp')}
        modes={TYPED_DECISION_MODES}
        value={settings.agentAutoRoutingDecisionMode}
        isDisabled={isDisabled}
        onChange={(mode) => update('agentAutoRoutingDecisionMode', mode)}
      />
      <PlatformModeSettingField
        id="platform-model-discovery-mode"
        label={translate('decisions.modelDiscoveryLabel')}
        modes={TYPED_DECISION_MODES}
        value={settings.modelDiscoveryDecisionMode}
        isDisabled={isDisabled}
        onChange={(mode) => update('modelDiscoveryDecisionMode', mode)}
      />
      {confidenceField(
        'platform-model-discovery-min-confidence',
        translate('decisions.modelDiscoveryConfidenceLabel'),
        'modelDiscoveryMinConfidence',
      )}
      <PlatformModeSettingField
        id="platform-reply-bot-intent-mode"
        label={translate('decisions.replyBotIntentLabel')}
        modes={TYPED_DECISION_MODES}
        value={settings.replyBotIntentDecisionMode}
        isDisabled={isDisabled}
        onChange={(mode) => update('replyBotIntentDecisionMode', mode)}
      />
      {confidenceField(
        'platform-reply-bot-intent-min-confidence',
        translate('decisions.replyBotIntentConfidenceLabel'),
        'replyBotIntentMinConfidence',
      )}
      <PlatformModeSettingField
        id="platform-pattern-analyzer-mode"
        label={translate('decisions.patternAnalyzerLabel')}
        helpText={translate('decisions.shadowCappedHelp')}
        modes={SHADOW_CAPPED_DECISION_MODES}
        value={settings.patternAnalyzerDecisionMode}
        isDisabled={isDisabled}
        onChange={(mode) => update('patternAnalyzerDecisionMode', mode)}
      />
      {confidenceField(
        'platform-pattern-analyzer-min-confidence',
        translate('decisions.patternAnalyzerConfidenceLabel'),
        'patternAnalyzerMinConfidence',
      )}
      <PlatformModeSettingField
        id="platform-task-routing-mode"
        label={translate('decisions.taskRoutingLabel')}
        helpText={translate('decisions.shadowCappedHelp')}
        modes={SHADOW_CAPPED_DECISION_MODES}
        value={settings.taskRoutingDecisionMode}
        isDisabled={isDisabled}
        onChange={(mode) => update('taskRoutingDecisionMode', mode)}
      />
      {confidenceField(
        'platform-task-routing-min-confidence',
        translate('decisions.taskRoutingConfidenceLabel'),
        'taskRoutingMinConfidence',
      )}
      <PlatformModeSettingField
        id="platform-untrusted-content-mode"
        label={translate('decisions.untrustedContentLabel')}
        helpText={translate('decisions.shadowCappedHelp')}
        modes={SHADOW_CAPPED_DECISION_MODES}
        value={settings.untrustedContentDecisionMode}
        isDisabled={isDisabled}
        onChange={(mode) => update('untrustedContentDecisionMode', mode)}
      />
      {confidenceField(
        'platform-untrusted-content-min-confidence',
        translate('decisions.untrustedContentConfidenceLabel'),
        'untrustedContentMinConfidence',
      )}

      <Heading size="md">{translate('agent.heading')}</Heading>
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

      <Heading size="md">{translate('platform.heading')}</Heading>
      <Switch
        aria-label={translate('platform.emailVerificationLabel')}
        label={translate('platform.emailVerificationLabel')}
        description={translate('platform.emailVerificationHelp')}
        isChecked={settings.isEmailVerificationRequired}
        isDisabled={isDisabled}
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
    </>
  );
}
