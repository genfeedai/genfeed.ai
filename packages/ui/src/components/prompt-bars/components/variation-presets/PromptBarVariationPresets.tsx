'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { VARIATION_PROMPT_PRESETS } from '@genfeedai/contracts/constants';
import type { PromptBarVariationPresetsProps } from '@genfeedai/props/studio/prompt-bar.props';
import { Button } from '@ui/primitives/button';
import { memo } from 'react';

const PromptBarVariationPresets = memo(function PromptBarVariationPresets({
  shouldRender,
  form,
  setTextValue,
}: PromptBarVariationPresetsProps) {
  if (!shouldRender) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-foreground/60">Quick prompts:</span>
      {VARIATION_PROMPT_PRESETS.map((preset) => (
        <Button
          key={preset.key}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="bg-tertiary hover:bg-hover"
          onClick={() => {
            form.setValue('text', preset.prompt, { shouldValidate: true });
            setTextValue(preset.prompt.trim());
          }}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
});

export default PromptBarVariationPresets;
