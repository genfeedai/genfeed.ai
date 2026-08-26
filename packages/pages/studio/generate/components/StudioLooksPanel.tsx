'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  StudioGenerateSettings,
  StudioLookAssetType,
} from '@genfeedai/interfaces';
import {
  studioLookToSettingsPatch,
  useStudioLooks,
} from '@pages/studio/generate/hooks/useStudioLooks';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Trash2 } from 'lucide-react';
import { type ReactElement, useState } from 'react';

interface StudioLooksPanelProps {
  onApply: (patch: Partial<StudioGenerateSettings>) => void;
  settings: StudioGenerateSettings;
  type: StudioLookAssetType;
}

export default function StudioLooksPanel({
  onApply,
  settings,
  type,
}: StudioLooksPanelProps): ReactElement {
  const [label, setLabel] = useState('');
  const {
    deleteLook,
    deletingId,
    error,
    isLoading,
    isSaving,
    looks,
    saveLook,
  } = useStudioLooks(type);

  const handleSave = async () => {
    const didSave = await saveLook(label, settings);
    if (didSave) {
      setLabel('');
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div>
        <p className="text-xs font-medium text-foreground">Saved Looks</p>
        <p className="text-xs text-muted-foreground">
          Shared with everyone working in this brand.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          aria-label="Look name"
          className={SHELL_CONTROL_HEIGHT_CLASS}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Name this Look"
          value={label}
        />
        <Button
          isDisabled={!label.trim() || isSaving}
          isLoading={isSaving}
          label="Save Look"
          onClick={() => {
            void handleSave();
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground" role="status">
          Loading saved Looks…
        </p>
      ) : looks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No saved Looks yet.</p>
      ) : (
        <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
          {looks.map((look) => (
            <div className="flex items-center gap-1" key={look.id}>
              <Button
                ariaLabel={`Apply ${look.label}`}
                className="h-8 min-w-0 flex-1 justify-start truncate rounded-md px-2 text-left text-xs hover:bg-accent"
                label={look.label}
                onClick={() => onApply(studioLookToSettingsPatch(look))}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              />
              <Button
                ariaLabel={`Delete ${look.label}`}
                className="size-8 min-h-0 min-w-0 p-0 text-muted-foreground hover:text-destructive"
                icon={<Trash2 className="size-3.5" />}
                isDisabled={deletingId === look.id}
                isLoading={deletingId === look.id}
                onClick={() => {
                  void deleteLook(look.id);
                }}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </div>
          ))}
        </div>
      )}

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
