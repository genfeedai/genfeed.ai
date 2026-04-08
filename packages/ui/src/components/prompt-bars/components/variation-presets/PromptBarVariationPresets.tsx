'use client';

import { VARIATION_PROMPT_PRESETS } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { PromptBarVariationPresetsProps } from '@props/studio/prompt-bar.props';
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
          className="bg-white/5 hover:bg-white/10"
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
