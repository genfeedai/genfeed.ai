'use client';

import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import GenerationHarnessSettingsSection from '@/features/studio/components/dropdowns/generation-setup/GenerationHarnessSettingsSection';
import GenerationSetupFieldRow from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupFieldRow';
import type { GenerationSetupBrandSectionProps } from '@/features/studio/props/generation-setup.props';

/**
 * Brand tab: everything brand-aware about a prompt in one place. Brand voice
 * is this generation's on or off (rendered for output types whose
 * capabilities carry `hasBrandEnrichment`): a plain switch like every other
 * on/off field, whose reset hands the choice back to the agent. The saved
 * organization and brand enhancement defaults follow it, without a heading,
 * when the surface offers them.
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
  showEnhancementSettings = false,
}: GenerationSetupBrandSectionProps) {
  const translate = useTranslations('agent.generationSetup');

  if (!capabilities.hasBrandEnrichment && !showEnhancementSettings) return null;

  return (
    <div className="flex flex-col gap-3">
      {capabilities.hasBrandEnrichment ? (
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
      ) : null}
      {showEnhancementSettings ? <GenerationHarnessSettingsSection /> : null}
    </div>
  );
}
