'use client';

import type { PromptBarFolderSelectorProps } from '@genfeedai/props/studio/prompt-bar.props';
import { OptionSelect } from '@ui/primitives/option-select';
import { Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

const PromptBarFolderSelector = memo(function PromptBarFolderSelector({
  folders,
  form,
  controlClass,
  isDisabled,
  triggerDisplay = 'default',
}: PromptBarFolderSelectorProps) {
  const translate = useTranslations('ui.promptBarControls');

  if (!folders?.length) {
    return null;
  }

  return (
    <OptionSelect
      ariaLabel={translate('folder')}
      className={controlClass}
      icon={<Folder className="size-4" />}
      isDisabled={isDisabled}
      isIconOnly={triggerDisplay === 'icon-only'}
      isSearchable
      onValueChange={(value) => {
        form.setValue('folder', value || undefined, {
          shouldValidate: true,
        });
      }}
      options={[
        { isLiteral: true, label: translate('noFolder'), value: '' },
        ...folders.map((folder) => ({
          isLiteral: true,
          label: folder.label || '',
          value: folder.id || '',
        })),
      ]}
      placeholder={translate('folder')}
      value={form.watch('folder') || ''}
    />
  );
});

export default PromptBarFolderSelector;
