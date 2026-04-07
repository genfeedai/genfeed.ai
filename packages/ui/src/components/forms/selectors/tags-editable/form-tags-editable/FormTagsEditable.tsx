import { ButtonVariant } from '@genfeedai/enums';
import type { FormTagsEditableProps } from '@props/forms/form.props';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { HiCheck, HiPencil, HiPlus, HiXMark } from 'react-icons/hi2';

export default function FormTagsEditable({
  label,
  value = [],
  placeholder = 'Add a tag...',
  onSave,
  isDisabled = false,
  maxTags = 10,
}: FormTagsEditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(value);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isEditing]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (onSave && JSON.stringify(tags) !== JSON.stringify(value)) {
      onSave(tags);
    }
    setIsEditing(false);
    setInputValue('');
  };

  const handleCancel = () => {
    setTags(value);
    setIsEditing(false);
    setInputValue('');
  };

  const handleAddTag = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && !tags.includes(trimmedValue) && tags.length < maxTags) {
      setTags([...tags, trimmedValue]);
      setInputValue('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {!isEditing && !isDisabled && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={handleEdit}
            className="h-6 px-2 inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground"
            ariaLabel="Edit tags"
          >
            <HiPencil className="w-3 h-3" />
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="primary" className="gap-2">
                {tag}
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-error"
                  ariaLabel={`Remove ${tag}`}
                >
                  <HiXMark className="w-3 h-3" />
                </Button>
              </Badge>
            ))}
          </div>

          {tags.length < maxTags && (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="h-8 text-sm border border-input px-3 flex-1"
                disabled={isDisabled}
              />

              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                onClick={handleAddTag}
                className="h-8 px-3 inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground"
                isDisabled={!inputValue.trim() || isDisabled}
                ariaLabel="Add tag"
              >
                <HiPlus />
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={handleCancel}
              className="h-8 px-3 inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80"
              isDisabled={isDisabled}
            >
              Cancel
            </Button>

            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={handleSave}
              className="h-8 px-3 inline-flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90"
              isDisabled={isDisabled}
              ariaLabel="Save tags"
            >
              <HiCheck className="w-3 h-3" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <Badge key={tag} variant="ghost">
                {tag}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-foreground/50">No tags</span>
          )}
        </div>
      )}
    </div>
  );
}
