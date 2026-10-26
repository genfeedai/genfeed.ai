'use client';

import type { GenerationSetupBrandSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';

/**
 * Brand tab: this generation's brand voice, on or off (rendered for output
 * types whose capabilities carry `hasBrandEnrichment`). It is a plain switch
 * like every other on/off field; leaving the agent's pick shows the row's
 * reset, which hands the choice back.
 *
 * The Prompt enhance switch that used to live here was removed in #4676: it
 * never enhanced anything, and toggling it off silently suppressed branding
 * via `studio-generation-setup-bridge`. The composer's Enhance prompt action
 * (an explicit, one-shot rewrite) replaces it.
 */
export default function GenerationSetupBrandSection({
  capabilities,
  onResetField,
  onSetField,
  reasons,
  setup,
}: GenerationSetupBrandSectionProps) {
  const translate = useTranslations('agent.generationSetup');

  if (!capabilities.hasBrandEnrichment) return null;

  return (
    <GenerationSetupFieldRow
      fieldKey="brandingMode"
      label={translate('brandVoice')}
      onReset={onResetField}
      reason={reasons.brandingMode}
      source={setup.sources.brandingMode ?? 'agent'}
    >
      <div className="flex w-full justify-end">
        <Switch
          aria-label={translate('brandVoice')}
          isChecked={setup.values.brandingMode === 'brand'}
          onCheckedChange={(isChecked) =>
            onSetField('brandingMode', isChecked ? 'brand' : 'off')
          }
        />
      </div>
    </GenerationSetupFieldRow>
  );
}
