'use client';

import type { GenerationSetupBrandSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationHarnessSettingsSection from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsSection';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';

/**
 * Brand tab: everything brand-aware about a prompt in one place. Brand voice
 * is this generation's on/off (rendered for output types whose capabilities
 * carry `hasBrandEnrichment`); Prompt enhancement is the saved organization
 * and brand default (rendered when the surface offers it).
 *
 * The Prompt enhance switch that used to live here was removed in #4676: it
 * never enhanced anything, and toggling it off silently suppressed branding
 * via `studio-generation-setup-bridge`. Studio's Enhance prompt action (an
 * explicit, one-shot rewrite) replaces it.
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
              onCheckedChange={(checked) =>
                onSetField('brandingMode', checked ? 'brand' : 'off')
              }
            />
          </div>
        </GenerationSetupFieldRow>
      ) : null}
      {showEnhancementSettings ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-medium text-muted-foreground">
            {translate('enhancement')}
          </h3>
          <GenerationHarnessSettingsSection />
        </section>
      ) : null}
    </div>
  );
}
