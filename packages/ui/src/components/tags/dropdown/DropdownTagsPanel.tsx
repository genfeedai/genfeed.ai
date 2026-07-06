'use client';

import { ButtonVariant, type DropdownDirection } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ITag } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import TagBadge from '@ui/tags/badge/TagBadge';
import type { RefObject } from 'react';
import { HiCheck, HiPlus } from 'react-icons/hi2';

type DropdownPosition = {
  left: number;
  right: number;
  top: number;
  useRight: boolean;
};

type DropdownTagsPanelProps = {
  dropdownRef: RefObject<HTMLDivElement | null>;
  direction: DropdownDirection;
  dropdownPosition: DropdownPosition;
  triggerOffsetHeight: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showCreateOption: boolean;
  onCreateTag: () => void;
  isCreating: boolean;
  selectedTagObjects: ITag[];
  onRemoveTag: (tagId: string) => void;
  isLoading: boolean;
  isLoadingTags: boolean;
  filteredTags: ITag[];
  isTagSelected: (tagId: string) => boolean;
  onToggleTag: (tagId: string) => void;
  selectedTagCount: number;
  onClose: () => void;
};

export default function DropdownTagsPanel({
  dropdownRef,
  direction,
  dropdownPosition,
  triggerOffsetHeight,
  searchInputRef,
  searchQuery,
  onSearchChange,
  showCreateOption,
  onCreateTag,
  isCreating,
  selectedTagObjects,
  onRemoveTag,
  isLoading,
  isLoadingTags,
  filteredTags,
  isTagSelected,
  onToggleTag,
  selectedTagCount,
  onClose,
}: DropdownTagsPanelProps) {
  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top:
          direction === 'up'
            ? `${dropdownPosition.top - 8}px`
            : `${dropdownPosition.top + triggerOffsetHeight + 8}px`,
        ...(dropdownPosition.useRight
          ? { right: `${dropdownPosition.right}px` }
          : { left: `${dropdownPosition.left}px` }),
        transform: direction === 'up' ? 'translateY(-100%)' : 'none',
        zIndex: 50,
      }}
      className={cn('w-80 rounded-md bg-card shadow-dropdown')}
    >
      {/* Search Input */}
      <div className="p-3 border-b border-white/[0.08]">
        <Input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search or create tags…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && showCreateOption) {
              onCreateTag();
            }
          }}
        />
      </div>

      {/* Selected Tags */}
      {selectedTagObjects.length > 0 && (
        <div className="p-3 border-b border-white/[0.08]">
          <div className="text-xs uppercase text-foreground/60 mb-2">
            Selected ({selectedTagObjects.length})
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedTagObjects.map((tag) => (
              <TagBadge
                key={tag.id}
                tag={tag}
                isRemovable
                onRemove={onRemoveTag}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tag List */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading || isLoadingTags ? (
          <div className="p-4 text-center text-sm text-foreground/60">
            Loading tags…
          </div>
        ) : filteredTags.length === 0 && !showCreateOption ? (
          <div className="p-4 text-center text-sm text-foreground/60">
            No tags found
          </div>
        ) : (
          <>
            {/* Create New Tag Option */}
            {showCreateOption && (
              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                onClick={onCreateTag}
                isDisabled={isCreating}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background transition-colors"
              >
                <HiPlus className="size-4 text-primary" />
                <span className="flex-1 text-left">
                  Create <strong>&quot;{searchQuery}&quot;</strong>
                </span>
              </Button>
            )}

            {/* Existing Tags */}
            {filteredTags.map((tag) => {
              const selected = tag.id ? isTagSelected(tag.id) : false;

              return (
                <Button
                  key={tag.id}
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => tag.id && onToggleTag(tag.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background transition-colors',
                    selected && 'bg-primary/10',
                  )}
                >
                  <div
                    className={cn(
                      'flex-shrink-0 size-4 border-2 flex items-center justify-center',
                      selected
                        ? 'bg-primary border-primary'
                        : 'border-white/[0.08]',
                    )}
                  >
                    {selected && <HiCheck className="size-3 text-white" />}
                  </div>

                  <span className="flex-1 text-left truncate">{tag.label}</span>

                  {tag.description && (
                    <span className="text-xs text-foreground/60 truncate max-w-56">
                      {tag.description}
                    </span>
                  )}
                </Button>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-white/[0.08] flex items-center justify-between">
        <div className="text-xs text-foreground/60">
          {selectedTagCount} selected
        </div>

        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={onClose}
          className="h-6 px-2 text-xs hover:bg-accent hover:text-accent-foreground"
          aria-label="Apply selected tags"
        >
          Apply tags
        </Button>
      </div>
    </div>
  );
}
