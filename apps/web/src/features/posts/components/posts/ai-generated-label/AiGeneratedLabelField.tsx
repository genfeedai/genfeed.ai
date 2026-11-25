'use client';

import { Checkbox } from '@ui/primitives/checkbox';
import { useTranslations } from 'next-intl';

interface AiGeneratedLabelFieldProps {
  isChecked: boolean;
  isDisabled?: boolean;
  onChange: (isChecked: boolean) => void;
}

/**
 * The AI-generated disclosure for a TikTok or YouTube post. It is on by
 * default because what Genfeed publishes is generated in Genfeed.
 */
export default function AiGeneratedLabelField({
  isChecked,
  isDisabled = false,
  onChange,
}: AiGeneratedLabelFieldProps) {
  const translate = useTranslations('ui.aiGeneratedLabel');

  return (
    <div className="space-y-1">
      <Checkbox
        label={translate('label')}
        isChecked={isChecked}
        isDisabled={isDisabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <p className="text-xs text-muted-foreground">{translate('hint')}</p>
    </div>
  );
}
