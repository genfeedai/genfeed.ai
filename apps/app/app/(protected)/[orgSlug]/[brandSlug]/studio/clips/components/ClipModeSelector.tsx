'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  ClipModeSelectorProps,
  ClipResultMode,
} from '@props/studio/clips.props';
import { Button } from '@ui/primitives/button';
import { HiOutlineFilm, HiOutlineUserCircle } from 'react-icons/hi2';

const MODE_OPTIONS: Array<{
  description: string;
  icon: typeof HiOutlineFilm;
  label: string;
  value: ClipResultMode;
}> = [
  {
    description:
      'Cut the original footage and burn captions. No avatar or voice required.',
    icon: HiOutlineFilm,
    label: 'Raw cut',
    value: 'raw-cut',
  },
  {
    description:
      'Regenerate each highlight with your saved HeyGen avatar and voice.',
    icon: HiOutlineUserCircle,
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
      <legend className="mb-2 text-sm font-medium text-zinc-300">
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
                  : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600'
              }`}
            >
              <span className="flex items-start gap-3">
                <Icon
                  aria-hidden="true"
                  className={`mt-0.5 size-5 shrink-0 ${isSelected ? 'text-primary' : 'text-zinc-500'}`}
                />
                <span>
                  <span className="block text-sm font-medium text-zinc-200">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
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
