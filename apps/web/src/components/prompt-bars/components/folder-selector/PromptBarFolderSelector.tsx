'use client';

import type { PromptBarFolderSelectorProps } from '@genfeedai/props/studio/prompt-bar.props';
import FormDropdown from '@ui/primitives/dropdown-field';
import { Folder } from 'lucide-react';
import { type ChangeEvent, memo } from 'react';

const PromptBarFolderSelector = memo(function PromptBarFolderSelector({
  folders,
  form,
  controlClass,
  isDisabled,
  triggerDisplay = 'default',
}: PromptBarFolderSelectorProps) {
  if (!folders?.length) {
    return null;
  }

  return (
    <FormDropdown
      key="folder"
      name="folder"
      icon={<Folder />}
      label="Folder"
      triggerDisplay={triggerDisplay}
      value={form.watch('folder') || ''}
      isSearchEnabled
      isFullWidth={false}
      isNoneEnabled
      dropdownDirection="up"
      className={controlClass}
      options={folders.map((folder) => ({
        description: folder.description,
        key: folder.id || '',
        label: folder.label || '',
      }))}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
        form.setValue('folder', e.target.value || undefined, {
          shouldValidate: true,
        });
      }}
      isDisabled={isDisabled}
    />
  );
});

export default PromptBarFolderSelector;
