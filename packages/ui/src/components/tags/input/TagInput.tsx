'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { TagInputProps } from '@props/tags/tag-input.props';
import { Input } from '@ui/primitives/input';
import TagBadge from '@ui/tags/badge/TagBadge';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';
import { HiPlus } from 'react-icons/hi2';

export default function TagInput({
  tags,
  onAddTag,
  onRemoveTag,
  placeholder = 'Add tags...',
  className,
  isDisabled = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      setIsAdding(true);
      try {
        await onAddTag(inputValue.trim());
        setInputValue('');
      } finally {
        setIsAdding(false);
      }
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Tag Display */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              isRemovable={!isDisabled}
              onRemove={onRemoveTag}
            />
          ))}
        </div>
      )}

      {/* Input Field */}
      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled || isAdding}
          className="pl-9"
        />

        <HiPlus
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/60"
        />
      </div>

      <p className="text-xs text-foreground/60">Press Enter to add a tag</p>
    </div>
  );
}
