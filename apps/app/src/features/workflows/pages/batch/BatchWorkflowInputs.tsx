'use client';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import type { BatchWorkflowInputsProps } from './batch-project.types';
export default function BatchWorkflowInputs({
  disabled,
  onUpload,
}: BatchWorkflowInputsProps) {
  const t = useTranslations('pages.batchProjects');
  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label={t('upload')}
        type="file"
        accept="image/*,video/*"
        multiple
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) onUpload(files);
        }}
      />
      <p className="text-xs text-muted-foreground">{t('uploadHint')}</p>
    </div>
  );
}
