import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { CircleUser, Film } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  ClipperModeSelectorProps,
  ClipperResultMode,
} from '@/props/studio/clipper.props';

const MODE_OPTIONS: Array<{
  description: string;
  icon: typeof Film;
  label: string;
  value: ClipperResultMode;
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

export default function ClipperModeSelector({
  mode,
  onModeChange,
}: ClipperModeSelectorProps) {
  const selectionLabels = useTranslations('ui.selectionGroups');
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">
        Generation mode
      </legend>
      <OptionTileGroup
        ariaLabel={selectionLabels('generationMode')}
        className="sm:grid-cols-2"
        columns={1}
        onValueChange={onModeChange}
        value={mode}
      >
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;

          return (
            <OptionTile
              description={option.description}
              icon={<Icon aria-hidden="true" className="size-4" />}
              key={option.value}
              size="lg"
              title={option.label}
              value={option.value}
            />
          );
        })}
      </OptionTileGroup>
    </fieldset>
  );
}
