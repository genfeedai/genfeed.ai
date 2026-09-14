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
  children,
  isDisabled = false,
  isLoading = false,
  variant = 'select',
  saveLabel: controlledSaveLabel,
  onSaveLabelChange,
  saveOptions,
  expandError,
  isExpanding = false,
  isSaving = false,
  onSaveCurrent,
  onSelectSet,
  saveError,
  selectedSetId,
  sets,
}: PostingSetPickerProps): ReactElement {
  const [localSaveLabel, setLocalSaveLabel] = useState('');
  const saveLabel = controlledSaveLabel ?? localSaveLabel;
  const setSaveLabel = onSaveLabelChange ?? setLocalSaveLabel;
  const handleSave = () => {
    onSaveCurrent(saveLabel.trim());
    if (controlledSaveLabel === undefined) setLocalSaveLabel('');
  };

  if (variant === 'cards') {
    return (
      <div className="flex flex-col gap-3">
        <p className="gen-label">Posting set</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading posting sets…</p>
        ) : sets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No posting sets yet. Save the current selection to reuse it.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sets.map((postingSet) => (
              <div
                key={postingSet.id}
                className="gen-glass flex items-center justify-between gap-3 rounded-lg p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">
                    {postingSet.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {postingSet.targets.length} target
                    {postingSet.targets.length === 1 ? '' : 's'}
                  </span>
                </div>
                <Button
                  isDisabled={isDisabled || isExpanding}
                  isLoading={isExpanding && selectedSetId === postingSet.id}
                  label={
                    selectedSetId === postingSet.id ? 'Selected' : 'Use set'
                  }
                  size={ButtonSize.SM}
                  variant={
                    selectedSetId === postingSet.id
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  onClick={() => onSelectSet(postingSet.id)}
                />
              </div>
            ))}
          </div>
        )}
        {expandError ? (
          <p className="text-xs text-destructive">{expandError}</p>
        ) : null}
        {children}
        <div className="flex flex-col gap-2">
          <p className="gen-label-sm text-muted-foreground">
            Save current selection as set
          </p>
          <Input
            aria-label="Posting set label"
            isDisabled={isDisabled || isSaving}
            placeholder="Set label"
            value={saveLabel}
            onChange={(event) => setSaveLabel(event.target.value)}
          />
          {saveOptions}
          <Button
            isDisabled={
              isDisabled ||
              isSaving ||
              saveLabel.trim().length === 0 ||
              !canSave
            }
            isLoading={isSaving}
            label="Save current selection as set"
            variant={ButtonVariant.SECONDARY}
            onClick={handleSave}
          />
        </div>
        {saveError ? (
          <p className="text-xs text-destructive">{saveError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <PostingSetSelectPicker
      canSave={canSave}
      expandError={expandError}
      isExpanding={isExpanding}
      isSaving={isSaving}
      onSaveCurrent={handleSave}
      onSelectSet={onSelectSet}
      saveError={saveError}
      saveLabel={saveLabel}
      onSaveLabelChange={setSaveLabel}
      selectedSetId={selectedSetId}
      sets={sets}
    />
  );
}

function PostingSetSelectPicker({
  canSave,
  expandError,
  isExpanding,
  isSaving,
  onSaveCurrent,
  onSelectSet,
  saveError,
  saveLabel = '',
  onSaveLabelChange,
  selectedSetId,
  sets,
}: PostingSetPickerProps): ReactElement {
  const translate = useTranslations('agent.postingSets');
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
          onChange={(event) => onSaveLabelChange?.(event.target.value)}
          placeholder={translate('savePlaceholder')}
          value={saveLabel}
        />
        <Button
          isDisabled={!canSave || saveLabel.trim().length === 0 || isSaving}
          isLoading={isSaving}
          label={isSaving ? translate('saving') : translate('save')}
          onClick={() => onSaveCurrent(saveLabel.trim())}
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
