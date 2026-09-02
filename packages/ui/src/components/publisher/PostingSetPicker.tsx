'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { PostingSetPickerProps } from '@genfeedai/props/publisher/posting-set-picker.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  EMPTY_SELECT_ITEM_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

export default function PostingSetPicker({
  canSave,
  expandError,
  isExpanding = false,
  isSaving = false,
  onSaveCurrent,
  onSelectSet,
  saveError,
  selectedSetId,
  sets,
}: PostingSetPickerProps): ReactElement {
  const translate = useTranslations('agent.postingSets');
  const [saveLabel, setSaveLabel] = useState('');

  return (
    <div className="mb-3 space-y-2">
      <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {translate('label')}
      </span>
      <Select
        value={selectedSetId ?? ''}
        onValueChange={(value) => {
          if (value) {
            onSelectSet(value);
          }
        }}
      >
        <SelectTrigger aria-label={translate('selectAria')}>
          <SelectValue placeholder={translate('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_SELECT_ITEM_VALUE}>
            {translate('none')}
          </SelectItem>
          {sets.map((postingSet) => (
            <SelectItem key={postingSet.id} value={postingSet.id}>
              {postingSet.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isExpanding ? (
        <p className="text-xs text-muted-foreground">
          {translate('expanding')}
        </p>
      ) : null}
      {expandError ? (
        <p className="text-xs text-destructive">{expandError}</p>
      ) : null}
      <div className="flex items-end gap-2">
        <Input
          className="flex-1"
          id="posting-set-save-label"
          label={translate('saveLabel')}
          name="posting-set-save-label"
          onChange={(event) => setSaveLabel(event.target.value)}
          placeholder={translate('savePlaceholder')}
          value={saveLabel}
        />
        <Button
          isDisabled={!canSave || saveLabel.trim().length === 0 || isSaving}
          isLoading={isSaving}
          label={isSaving ? translate('saving') : translate('save')}
          onClick={() => {
            onSaveCurrent(saveLabel.trim());
            setSaveLabel('');
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
      {saveError ? (
        <p className="text-xs text-destructive">{saveError}</p>
      ) : null}
    </div>
  );
}
