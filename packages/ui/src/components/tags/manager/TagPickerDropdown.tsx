'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { THEME_COLORS } from '@ui-constants/theme.constant';

type TagPickerDropdownProps = {
  availableTags: ITag[];
  currentTags: Array<ITag | string>;
  showNewTagInput: boolean;
  newTagLabel: string;
  isSaving: boolean;
  onAddTag: (tag: ITag) => void;
  onCreateNewTag: () => void;
  onNewTagLabelChange: (value: string) => void;
  onShowNewTagInput: (show: boolean) => void;
  onClose: () => void;
};

export default function TagPickerDropdown({
  availableTags,
  currentTags,
  showNewTagInput,
  newTagLabel,
  isSaving,
  onAddTag,
  onCreateNewTag,
  onNewTagLabelChange,
  onShowNewTagInput,
  onClose,
}: TagPickerDropdownProps) {
  return (
    <div className="absolute z-10 mt-1 w-64 bg-card shadow-lg border border-white/[0.08] p-2">
      <div className="text-sm font-semibold mb-2 px-2">Available Tags</div>

      {!showNewTagInput ? (
        <>
          <div className="max-h-48 overflow-y-auto">
            {(() => {
              const unselectedTags = availableTags.filter((tag) => {
                return !currentTags.some((t) =>
                  typeof t === 'string' ? t === tag.id : t.id === tag.id,
                );
              });

              if (unselectedTags.length === 0) {
                return (
                  <div className="text-sm text-muted-foreground px-2 py-1">
                    No available tags
                  </div>
                );
              }

              return unselectedTags.map((tag) => (
                <Button
                  key={tag.id}
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => onAddTag(tag)}
                  className="w-full text-left px-2 py-1.5 hover:bg-background transition-colors flex items-center gap-2"
                >
                  <Badge
                    size={ComponentSize.SM}
                    backgroundColor={
                      tag.backgroundColor || THEME_COLORS.PRIMARY
                    }
                    textColor={tag.textColor || THEME_COLORS.SECONDARY}
                  >
                    {tag.label}
                  </Badge>
                </Button>
              ));
            })()}
          </div>

          <div className="mt-2 pt-2 border-t border-white/[0.08]">
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={() => onShowNewTagInput(true)}
              className="w-full text-sm px-2 py-1 hover:bg-background text-primary"
            >
              + Create New Tag
            </Button>
          </div>
        </>
      ) : (
        <div className="p-2">
          <Input
            name="newTag"
            type="text"
            value={newTagLabel}
            onChange={(e) => onNewTagLabelChange(e.target.value)}
            placeholder="Enter tag label…"
            className="input-sm mb-2"
          />

          <div className="flex gap-2">
            <Button
              label="Create"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className="flex-1"
              onClick={onCreateNewTag}
              isDisabled={!newTagLabel.trim() || isSaving}
              isLoading={isSaving}
            />

            <Button
              label="Cancel"
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              className="flex-1"
              onClick={() => {
                onShowNewTagInput(false);
                onNewTagLabelChange('');
              }}
            />
          </div>
        </div>
      )}

      {!showNewTagInput && (
        <div className="mt-2 pt-2 border-t border-white/[0.08]">
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={onClose}
            className="w-full text-sm px-2 py-1 hover:bg-background"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
