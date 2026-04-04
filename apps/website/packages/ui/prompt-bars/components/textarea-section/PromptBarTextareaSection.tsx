'use client';

import type { PromptBarTextareaSectionProps } from '@props/prompt-bars/prompt-bar-layout.props';
import FormTextarea from '@ui/forms/inputs/textarea/form-textarea/FormTextarea';
import { memo } from 'react';

const PromptBarTextareaSection = memo(function PromptBarTextareaSection({
  textareaRegister,
  textareaRef,
  placeholder,
  isDisabled,
  onChange,
  selectedModels,
}: PromptBarTextareaSectionProps) {
  const triggerModels = selectedModels.filter((model) => model.trigger);

  return (
    <div className="flex flex-col gap-2 w-full">
      <FormTextarea
        name="text"
        register={textareaRegister}
        textareaRef={textareaRef}
        placeholder={placeholder}
        isDisabled={isDisabled}
        onChange={onChange}
        className="bg-white/5 border border-white/15 focus:border-primary resize-none text-sm min-h-24 w-full"
      />

      {triggerModels.length > 0 && (
        <p className="text-xs text-foreground/60">
          Tip: Include trigger words:{' '}
          {triggerModels.map((model) => `"${model.trigger}"`).join(', ')}
        </p>
      )}
    </div>
  );
});

export default PromptBarTextareaSection;
