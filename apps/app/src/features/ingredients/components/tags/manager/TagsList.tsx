'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { libraryTagStyle } from '@ui/tags/library-tag-picker/library-tag-colors.util';
import { X } from 'lucide-react';

type TagDisplayItem = {
  id: string;
  label: string;
  backgroundColor: string;
  textColor: string;
};

type TagsListProps = {
  tagDisplayItems: TagDisplayItem[];
  isReadOnly: boolean;
  isSaving: boolean;
  onRemoveTag: (tagId: string) => void;
};

export default function TagsList({
  tagDisplayItems,
  isReadOnly,
  isSaving,
  onRemoveTag,
}: TagsListProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tagDisplayItems.length === 0 && !isReadOnly && (
        <span className="text-sm text-muted-foreground">No tags added</span>
      )}

      {tagDisplayItems.map((tagDisplay) => (
        <Badge key={tagDisplay.id} style={libraryTagStyle(tagDisplay)}>
          <span>{tagDisplay.label}</span>

          {!isReadOnly && (
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={() => onRemoveTag(tagDisplay.id)}
              isDisabled={isSaving}
              className="hover:opacity-70 transition-opacity"
              ariaLabel={`Remove tag ${tagDisplay.label}`}
            >
              <X className="size-3" />
            </Button>
          )}
        </Badge>
      ))}
    </div>
  );
}
