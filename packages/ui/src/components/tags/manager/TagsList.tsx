'use client';

import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { HiXMark } from 'react-icons/hi2';

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
        <Badge
          key={tagDisplay.id}
          backgroundColor={tagDisplay.backgroundColor}
          textColor={tagDisplay.textColor}
        >
          <span>{tagDisplay.label}</span>

          {!isReadOnly && (
            <Button
              label={''}
              icon={<HiXMark className="size-3" />}
              onClick={() => onRemoveTag(tagDisplay.id)}
              isDisabled={isSaving}
              className="hover:opacity-70 transition-opacity"
            />
          )}
        </Badge>
      ))}
    </div>
  );
}
