'use client';

import {
  MARGIN_INPUT_MODE_LABELS,
  MARGIN_INPUT_MODES,
} from '@genfeedai/contracts';
import {
  parseTypedDecisionProvider,
  TYPED_DECISION_PROVIDER_LABELS,
  TYPED_DECISION_PROVIDER_NAMES,
} from '@genfeedai/contracts/constants';
import type { PlatformSettingsTab } from '@props/admin/platform-settings.props';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import PlatformFeatureSettingsFields from './platform-feature-settings-fields';
import PlatformNumberSettingField from './platform-number-setting-field';
import { usePlatformSettings } from './platform-settings.provider';
import PlatformSettingsGroup from './platform-settings-group';
import SystemNotificationsPanel from './system-notifications-panel';

function BillingMargins() {
  const { isSaving, margins } = usePlatformSettings();
  const translate = useTranslations('pages.platformSettings');

  return (
    <PlatformSettingsGroup title={translate('marginsHeading')}>
      <Field
        label={translate('marginInputModeLabel')}
        htmlFor="platform-margin-input-mode"
        helpText={translate('marginInputModeHelp')}
      >
        <Select
          value={margins.marginInputMode}
          onValueChange={margins.onModeChange}
          disabled={isSaving}
        >
          <SelectTrigger id="platform-margin-input-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MARGIN_INPUT_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {MARGIN_INPUT_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label={`Generation ${margins.modeUnit} (%)`}
        htmlFor="platform-margin-multiplier-generation"
        helpText={margins.generationReadout}
      >
        <Input
          id="platform-margin-multiplier-generation"
          type="number"
          step="1"
          value={margins.generationPercentInput}
          onChange={(event) =>
            margins.onGenerationPercentInputChange(event.target.value)
          }
          disabled={isSaving}
        />
      </Field>

      <Field
        label={`Agent chat ${margins.modeUnit} (%)`}
        htmlFor="platform-margin-multiplier-agent-chat"
        helpText={margins.agentChatReadout}
      >
        <Input
          id="platform-margin-multiplier-agent-chat"
          type="number"
          step="1"
          value={margins.agentChatPercentInput}
          onChange={(event) =>
            margins.onAgentChatPercentInputChange(event.target.value)
          }
          disabled={isSaving}
        />
      </Field>
    </PlatformSettingsGroup>
  );
}

function TypedDecisions() {
  const {
    featureSettings,
    isSaving,
    onFeatureFieldValidityChange,
    onFeatureSettingsChange,
    onTypedDecisionProviderChange,
    typedDecisionProvider,
  } = usePlatformSettings();
  const translate = useTranslations('pages.platformSettings');

  return (
    <PlatformSettingsGroup
      title={translate('typedDecisionsHeading')}
      description={translate('typedDecisionsHelp')}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field
          label={translate('typedDecisionLabel')}
          htmlFor="platform-typed-decision-provider"
          helpText={translate('typedDecisionHelp')}
        >
          <Select
            value={typedDecisionProvider}
            onValueChange={(value) =>
              onTypedDecisionProviderChange(parseTypedDecisionProvider(value))
            }
            disabled={isSaving}
          >
            <SelectTrigger id="platform-typed-decision-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPED_DECISION_PROVIDER_NAMES.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {TYPED_DECISION_PROVIDER_LABELS[provider]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <PlatformNumberSettingField
          id="platform-typedDecisionTimeoutMs"
          label={translate('features.runtime.typedDecisionTimeoutMs')}
          min={1}
          max={60000}
          value={featureSettings.typedDecisionTimeoutMs}
          isInteger
          isDisabled={isSaving}
          onValidityChange={onFeatureFieldValidityChange}
          onCommit={(value) => {
            if (value !== null) {
              onFeatureSettingsChange({
                ...featureSettings,
                typedDecisionTimeoutMs: value,
              });
            }
          }}
        />
      </div>
    </PlatformSettingsGroup>
  );
}

/**
 * The fields of one /admin/settings page. Every page edits the layout's single
 * copy of the settings; the Save in the subbar writes all of it.
 */
export default function PlatformSettingsSection({
  tab,
}: {
  tab: PlatformSettingsTab;
}) {
  const settings = usePlatformSettings();
  const translate = useTranslations('pages.platformSettings');

  if (settings.isLoading) {
    return <SkeletonCard showImage={false} />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void settings.save();
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Destinations save on their own, so they sit outside the form. */}
      {tab === 'notifications' ? <SystemNotificationsPanel /> : null}
      <Form
        spacing="section"
        className="max-w-2xl"
        onSubmit={handleSubmit}
        noValidate
      >
        {tab === 'billing' ? <BillingMargins /> : null}
        {tab === 'ai' ? <TypedDecisions /> : null}
        <PlatformFeatureSettingsFields
          brandVisionModels={settings.brandVisionModels}
          isDisabled={settings.isSaving}
          isEmailDeliveryConfigured={settings.isEmailDeliveryConfigured}
          onChange={settings.onFeatureSettingsChange}
          onValidityChange={settings.onFeatureFieldValidityChange}
          section={tab}
          settings={settings.featureSettings}
        />
        <Text as="p" color="muted" size="sm">
          {translate('saveHint')}
        </Text>
      </Form>
    </div>
  );
}
