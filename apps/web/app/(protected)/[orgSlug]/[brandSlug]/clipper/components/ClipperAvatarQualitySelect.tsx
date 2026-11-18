import { SelectField } from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';
import type {
  ClipperAvatarQualityChoice,
  ClipperAvatarQualitySelectProps,
} from '@/props/studio/clipper.props';

const QUALITY_OPTIONS = [
  { labelKey: 'avatarQualityAuto', value: 'auto' },
  { labelKey: 'avatarQualityDraft', value: 'draft' },
  { labelKey: 'avatarQualityLow', value: 'low' },
  { labelKey: 'avatarQualityMedium', value: 'medium' },
  { labelKey: 'avatarQualityHigh', value: 'high' },
] as const;

export default function ClipperAvatarQualitySelect({
  onQualityChange,
  quality,
}: ClipperAvatarQualitySelectProps) {
  const t = useTranslations('pages.studioClipper');

  return (
    <div className="flex flex-col gap-1.5">
      <SelectField
        isTextCaseKept={true}
        label={t('avatarQualityLabel')}
        name="avatar-quality-review"
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onQualityChange(event.target.value as ClipperAvatarQualityChoice)
        }
        value={quality}
      >
        {QUALITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </SelectField>
      <p className="text-xs text-muted-foreground">{t('avatarQualityHint')}</p>
    </div>
  );
}
