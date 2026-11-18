import { SelectField } from '@ui/primitives/select';
import type { ChangeEvent } from 'react';
import type {
  ClipperAvatarQualityChoice,
  ClipperAvatarQualitySelectProps,
} from '@/props/studio/clipper.props';

const QUALITY_OPTIONS: Array<{
  label: string;
  value: ClipperAvatarQualityChoice;
}> = [
  { label: 'Auto (Avatar 6 Turbo where the look supports it)', value: 'auto' },
  { label: 'Draft (Avatar IV)', value: 'draft' },
  { label: 'Low (Avatar 6 Turbo, 1080p)', value: 'low' },
  { label: 'Medium (Avatar 6, 1080p)', value: 'medium' },
  { label: 'High (Avatar 6, 2K)', value: 'high' },
];

export default function ClipperAvatarQualitySelect({
  onQualityChange,
  quality,
}: ClipperAvatarQualitySelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <SelectField
        isTextCaseKept={true}
        label="Avatar quality"
        name="avatar-quality-review"
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onQualityChange(event.target.value as ClipperAvatarQualityChoice)
        }
        value={quality}
      >
        {QUALITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <p className="text-xs text-muted-foreground">
        Higher quality costs more credits per second. Low, Medium and High need
        an avatar look that supports Avatar 6; Draft works on every look.
      </p>
    </div>
  );
}
