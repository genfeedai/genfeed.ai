'use client';

import { DropdownDirection } from '@genfeedai/enums';
import type { DropdownTagsProps } from '@genfeedai/props/tags/dropdown-tags.props';
import { createPortal } from 'react-dom';
import DropdownTagsPanel from './DropdownTagsPanel';
import DropdownTagsTrigger from './DropdownTagsTrigger';
import { useDropdownTags } from './useDropdownTags';

export default function DropdownTags({
  selectedTags,
  onChange,
  scope,
  className,
  placeholder = 'Tags',
  direction = DropdownDirection.DOWN,
  isDisabled = false,
  showLabel = true,
  externalTags,
  isLoadingTags = false,
}: DropdownTagsProps) {
  const {
    isOpen,
    setIsOpen,
    searchQuery,
    setSearchQuery,
    isLoading,
    isCreating,
    buttonRef,
    dropdownRef,
    searchInputRef,
    dropdownPosition,
    filteredTags,
    selectedTagObjects,
    isTagSelected,
    toggleTag,
    handleCreateTag,
    handleRemoveTag,
    showCreateOption,
    hasSelectedTags,
    tagCountLabel,
    handleClose,
  } = useDropdownTags({
    selectedTags,
    onChange,
    scope,
    placeholder,
    externalTags,
    isLoadingTags,
  });

  // Render dropdown menu via portal
  const dropdownPortal =
    isOpen && typeof window !== 'undefined'
      ? createPortal(
          <DropdownTagsPanel
            dropdownRef={dropdownRef}
            direction={direction}
            dropdownPosition={dropdownPosition}
            triggerOffsetHeight={buttonRef.current?.offsetHeight ?? 0}
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showCreateOption={showCreateOption}
            onCreateTag={handleCreateTag}
            isCreating={isCreating}
            selectedTagObjects={selectedTagObjects}
            onRemoveTag={handleRemoveTag}
            isLoading={isLoading}
            isLoadingTags={isLoadingTags}
            filteredTags={filteredTags}
            isTagSelected={isTagSelected}
            onToggleTag={toggleTag}
            selectedTagCount={selectedTags.length}
            onClose={handleClose}
          />,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <DropdownTagsTrigger
        buttonRef={buttonRef}
        isDisabled={isDisabled}
        hasSelectedTags={hasSelectedTags}
        showLabel={showLabel}
        tagCountLabel={tagCountLabel}
        selectedTagCount={selectedTags.length}
        className={className}
        onToggle={() => !isDisabled && setIsOpen(!isOpen)}
      />

      {/* Dropdown Menu rendered via portal */}
      {dropdownPortal}
    </div>
  );
}
