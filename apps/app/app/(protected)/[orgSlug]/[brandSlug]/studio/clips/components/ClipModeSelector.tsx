'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type {
  ClipModeSelectorProps,
  ClipResultMode,
} from '@props/studio/clips.props';
import { Button } from '@ui/primitives/button';
import { CircleUser, Film } from 'lucide-react';

const MODE_OPTIONS: Array<{
  description: string;
  icon: typeof Film;
  label: string;
  value: ClipResultMode;
}> = [
  {
    description:
      'Cut the original footage and burn captions. No avatar or voice required.',
    icon: Film,
    label: 'Raw cut',
    value: 'raw-cut',
  },
  {
    description:
      'Regenerate each highlight with your saved HeyGen avatar and voice.',
    icon: CircleUser,
    label: 'AI avatar',
    value: 'avatar',
  },
];

export default function ClipModeSelector({
  mode,
  onModeChange,
}: ClipModeSelectorProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">
        Generation mode
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = mode === option.value;

          return (
            <Button
              key={option.value}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              aria-pressed={isSelected}
              onClick={() => onModeChange(option.value)}
              className={`min-h-24 rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-secondary hover:border-primary/60'
              }`}
            >
              <span className="flex items-start gap-3">
                <Icon
                  aria-hidden="true"
                  className={`mt-0.5 size-5 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
