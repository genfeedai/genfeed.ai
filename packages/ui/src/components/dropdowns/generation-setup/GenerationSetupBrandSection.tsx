'use client';

import type { GenerationSetupBrandSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import { Switch } from '@ui/primitives/switch';

/** Brand tab: brand-voice enrichment on/off and prompt-enhance on/off. */
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

      <GenerationSetupFieldRow
        fieldKey="isPromptEnhanceEnabled"
        label="Prompt enhance"
        onReset={onResetField}
        reason={reasons.isPromptEnhanceEnabled}
        source={setup.sources.isPromptEnhanceEnabled ?? 'agent'}
      >
        <div className="flex w-full justify-end">
          <Switch
            isChecked={setup.values.isPromptEnhanceEnabled}
            onCheckedChange={(checked) =>
              onSetField('isPromptEnhanceEnabled', checked)
            }
          />
        </div>
      </GenerationSetupFieldRow>
    </div>
  );
}
