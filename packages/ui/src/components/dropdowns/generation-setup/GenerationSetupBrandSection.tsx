'use client';

import type { GenerationSetupBrandSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import { Switch } from '@ui/primitives/switch';

/**
 * Brand tab: brand-voice enrichment on/off. Only rendered for output types
 * whose capabilities carry `hasBrandEnrichment` — see
 * `GenerationSetupCustomizePanel`. The Prompt enhance switch that used to
 * live here was removed in #4676: it never enhanced anything, and toggling
 * it off silently suppressed branding via `studio-generation-setup-bridge`.
 * Studio's Enhance prompt action (an explicit, one-shot rewrite) replaces it.
 */
export default function GenerationSetupBrandSection({
  onResetField,
  onSetField,
  reasons,
  setup,
}: GenerationSetupBrandSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <GenerationSetupFieldRow
        fieldKey="brandingMode"
        label="Brand voice"
        onReset={onResetField}
        reason={reasons.brandingMode}
        source={setup.sources.brandingMode ?? 'agent'}
      >
        <div className="flex w-full justify-end">
          <Switch
            isChecked={setup.values.brandingMode === 'brand'}
            onCheckedChange={(checked) =>
              onSetField('brandingMode', checked ? 'brand' : 'off')
            }
          />
        </div>
      </GenerationSetupFieldRow>
    </div>
  );
}
