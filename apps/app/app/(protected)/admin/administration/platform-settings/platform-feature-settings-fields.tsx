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
import PlatformModeSettingField from './platform-mode-setting-field';
import PlatformNumberSettingField from './platform-number-setting-field';

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
  isEmailDeliveryConfigured,
  onChange,
  onValidityChange,
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
        onValidityChange={onValidityChange}
        onCommit={updateNumber(key)}
      />
    );
  }

  return (
    <>
      <Text as="p" color="muted" size="sm">
        {translate('intro')}
      </Text>

      <Heading size="md">{translate('runtime.heading')}</Heading>
      <PlatformNumberSettingField
        id="platform-imageCompressionQuality"
        label={translate('runtime.imageCompressionQuality')}
        min={1}
        max={100}
        value={settings.imageCompressionQuality}
        isInteger
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('imageCompressionQuality')}
      />
      <PlatformNumberSettingField
        id="platform-paygFallbackCredits"
        label={translate('runtime.paygFallbackCredits')}
        min={1}
        max={1000000}
        value={settings.paygFallbackCredits}
        isInteger
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('paygFallbackCredits')}
      />
      <Field
        label={translate('runtime.linkedinTrendSourceUrls')}
        htmlFor="platform-linkedinTrendSourceUrls"
      >
        <Input
          id="platform-linkedinTrendSourceUrls"
          value={settings.linkedinTrendSourceUrls ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            onChange({
              ...settings,
              linkedinTrendSourceUrls: event.target.value.trim() || null,
            })
          }
        />
      </Field>

      <Field
        label={translate('runtime.agentContextCompressionModel')}
        htmlFor="platform-agentContextCompressionModel"
      >
        <Input
          id="platform-agentContextCompressionModel"
          value={settings.agentContextCompressionModel ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('agentContextCompressionModel', event.target.value || null)
          }
        />
      </Field>
      <PlatformNumberSettingField
        id="platform-agentContextWindowSize"
        label={translate('runtime.agentContextWindowSize')}
        min={1}
        max={200}
        value={settings.agentContextWindowSize}
        isInteger={true}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('agentContextWindowSize')}
      />
      <PlatformNumberSettingField
        id="platform-generationMaxTokens"
        label={translate('runtime.generationMaxTokens')}
        min={1}
        max={128000}
        value={settings.generationMaxTokens}
        isInteger={true}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('generationMaxTokens')}
      />
      <PlatformNumberSettingField
        id="platform-typedDecisionTimeoutMs"
        label={translate('runtime.typedDecisionTimeoutMs')}
        min={1}
        max={60000}
        value={settings.typedDecisionTimeoutMs}
        isInteger={true}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('typedDecisionTimeoutMs')}
      />
      <PlatformNumberSettingField
        id="platform-trainingCreditsCost"
        label={translate('runtime.trainingCreditsCost')}
        min={0}
        max={1000000}
        value={settings.trainingCreditsCost}
        isInteger={false}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('trainingCreditsCost')}
      />
      <PlatformNumberSettingField
        id="platform-customModelCreditsCost"
        label={translate('runtime.customModelCreditsCost')}
        min={0}
        max={1000000}
        value={settings.customModelCreditsCost}
        isInteger={false}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('customModelCreditsCost')}
      />
      <Field
        label={translate('runtime.replicateModelHardware')}
        htmlFor="platform-replicateModelHardware"
      >
        <Input
          id="platform-replicateModelHardware"
          value={settings.replicateModelHardware ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('replicateModelHardware', event.target.value)
          }
        />
      </Field>
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
      <Field
        label={translate('runtime.replicateTrainerModel')}
        htmlFor="platform-replicateTrainerModel"
      >
        <Input
          id="platform-replicateTrainerModel"
          value={settings.replicateTrainerModel ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('replicateTrainerModel', event.target.value)
          }
        />
      </Field>
      <PlatformNumberSettingField
        id="platform-replicateTargetFps"
        label={translate('runtime.replicateTargetFps')}
        min={1}
        max={120}
        value={settings.replicateTargetFps}
        isInteger={true}
        isDisabled={isDisabled}
        onValidityChange={onValidityChange}
        onCommit={updateNumber('replicateTargetFps')}
      />
      <Field
        label={translate('runtime.replicateTargetResolution')}
        htmlFor="platform-replicateTargetResolution"
      >
        <Input
          id="platform-replicateTargetResolution"
          value={settings.replicateTargetResolution ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('replicateTargetResolution', event.target.value)
          }
        />
      </Field>
      <Field
        label={translate('runtime.klingModel')}
        htmlFor="platform-klingModel"
      >
        <Input
          id="platform-klingModel"
          value={settings.klingModel ?? ''}
          disabled={isDisabled}
          onChange={(event) => update('klingModel', event.target.value)}
        />
      </Field>
      <Field
        label={translate('runtime.elevenlabsModel')}
        htmlFor="platform-elevenlabsModel"
      >
        <Input
          id="platform-elevenlabsModel"
          value={settings.elevenlabsModel ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('elevenlabsModel', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.murekaModel')}
        htmlFor="platform-murekaModel"
      >
        <Input
          id="platform-murekaModel"
          value={settings.murekaModel ?? ''}
          disabled={isDisabled}
          onChange={(event) => update('murekaModel', event.target.value)}
        />
      </Field>
      <Field
        label={translate('runtime.discordChannelIdDeployments')}
        htmlFor="platform-discordChannelIdDeployments"
      >
        <Input
          id="platform-discordChannelIdDeployments"
          value={settings.discordChannelIdDeployments ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordChannelIdDeployments', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.discordChannelIdPosts')}
        htmlFor="platform-discordChannelIdPosts"
      >
        <Input
          id="platform-discordChannelIdPosts"
          value={settings.discordChannelIdPosts ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordChannelIdPosts', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.discordChannelIdStudio')}
        htmlFor="platform-discordChannelIdStudio"
      >
        <Input
          id="platform-discordChannelIdStudio"
          value={settings.discordChannelIdStudio ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordChannelIdStudio', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.discordChannelIdUsers')}
        htmlFor="platform-discordChannelIdUsers"
      >
        <Input
          id="platform-discordChannelIdUsers"
          value={settings.discordChannelIdUsers ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordChannelIdUsers', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.discordChannelIdModels')}
        htmlFor="platform-discordChannelIdModels"
      >
        <Input
          id="platform-discordChannelIdModels"
          value={settings.discordChannelIdModels ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordChannelIdModels', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.discordBotAvatarUrl')}
        htmlFor="platform-discordBotAvatarUrl"
      >
        <Input
          id="platform-discordBotAvatarUrl"
          value={settings.discordBotAvatarUrl ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordBotAvatarUrl', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.discordWebhookNamePrefix')}
        htmlFor="platform-discordWebhookNamePrefix"
      >
        <Input
          id="platform-discordWebhookNamePrefix"
          value={settings.discordWebhookNamePrefix ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordWebhookNamePrefix', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.discordWebhookReason')}
        htmlFor="platform-discordWebhookReason"
      >
        <Input
          id="platform-discordWebhookReason"
          value={settings.discordWebhookReason ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('discordWebhookReason', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.emailFromAddress')}
        htmlFor="platform-emailFromAddress"
      >
        <Input
          id="platform-emailFromAddress"
          value={settings.emailFromAddress ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('emailFromAddress', event.target.value || null)
          }
        />
      </Field>
      <Field
        label={translate('runtime.emailReplyToAddress')}
        htmlFor="platform-emailReplyToAddress"
      >
        <Input
          id="platform-emailReplyToAddress"
          value={settings.emailReplyToAddress ?? ''}
          disabled={isDisabled}
          onChange={(event) =>
            update('emailReplyToAddress', event.target.value || null)
          }
        />
      </Field>
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
          onValidityChange={onValidityChange}
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
    </>
  );
}
