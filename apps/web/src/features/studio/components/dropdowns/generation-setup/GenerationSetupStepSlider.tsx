'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Slider } from '@ui/primitives/slider';
import { Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import GenerationSetupFieldIcon from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupFieldIcon';
import type { GenerationSetupStepSliderProps } from '@/features/studio/props/generation-setup.props';

/** Arrow keys and Home/End move the slider, not the menu around it. */
function keepKeysOnSlider(event: KeyboardEvent<HTMLDivElement>): void {
  if (
    event.key.startsWith('Arrow') ||
    event.key === 'Home' ||
    event.key === 'End'
  )
    event.stopPropagation();
}

/**
 * A field with a few fixed values (outputs, duration) as a slider that snaps
 * to each one, with every value labelled under its stop and the current one
 * read out beside the field's name. It sits directly in its chip's menu, so
 * changing it takes one drag instead of opening a nested list.
 */
export default function GenerationSetupStepSlider({
  fieldKey,
  label,
  onReset,
  onValueChange,
  source,
  steps,
  value,
}: GenerationSetupStepSliderProps) {
  const translate = useTranslations('agent.generationSetup');
  const exactIndex = steps.findIndex((step) => step.value === value);
  const currentIndex =
    exactIndex >= 0
      ? exactIndex
      : steps.reduce(
          (nearest, step, index) =>
            Math.abs(step.value - value) <
            Math.abs((steps[nearest]?.value ?? 0) - value)
              ? index
              : nearest,
          0,
        );
  const canReset = source !== 'agent' && Boolean(onReset);

  return (
    <div
      className="flex flex-col gap-3 px-3 py-2.5"
      onKeyDown={keepKeysOnSlider}
      role="group"
      aria-label={label}
    >
      <div className="flex items-center gap-1.5">
        <GenerationSetupFieldIcon fieldKey={fieldKey} source={source} />
        <span className="text-xs text-muted-foreground">{label}</span>
        {canReset ? (
          <Button
            ariaLabel={translate('resetToAgent', { field: label })}
            className="size-5 p-0 [&_svg]:size-3"
            icon={<Undo2 />}
            onClick={() => onReset?.(fieldKey)}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
          />
        ) : null}
        <span className="ml-auto text-sm font-medium tabular-nums">
          {steps[currentIndex]?.label}
        </span>
      </div>
      {steps.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Slider
            aria-label={label}
            max={steps.length - 1}
            min={0}
            onValueChange={([index]) => {
              const next = steps[index ?? currentIndex];
              if (next && next.value !== value) onValueChange(next.value);
            }}
            step={1}
            value={[currentIndex]}
          />
          <div aria-hidden="true" className="flex justify-between">
            {steps.map((step, index) => (
              <span
                key={step.value}
                data-step=""
                className={cn(
                  'w-6 text-center text-2xs tabular-nums text-muted-foreground',
                  index === currentIndex && 'font-medium text-foreground',
                  // Edge labels sit under the track's ends, not past them.
                  index === 0 && 'text-left',
                  index === steps.length - 1 && 'text-right',
                )}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
