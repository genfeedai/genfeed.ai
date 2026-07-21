import { ButtonVariant } from '@genfeedai/enums';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { HiCheck, HiPencil, HiPlus, HiXMark } from 'react-icons/hi2';
import { Badge } from './badge';
import { Button } from './button';
import { Input } from './input';

const EMPTY_ARRAY: never[] = [];

interface TagsDraft {
  sourceValue: string[];
  tags: string[];
}

function areTagsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((tag, index) => tag === right[index])
  );
}

export interface TagsEditableProps {
  label: string;
  value?: string[];
  placeholder?: string;
  onSave?: (tags: string[]) => void;
  isDisabled?: boolean;
  maxTags?: number;
  className?: string;
}

export default function TagsEditable({
  label,
  value = EMPTY_ARRAY,
  placeholder = 'Add a tag…',
  onSave,
  isDisabled = false,
  maxTags = 10,
  className = '',
}: TagsEditableProps) {
  const [draft, setDraft] = useState<TagsDraft | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeDraft =
    draft && areTagsEqual(draft.sourceValue, value) ? draft : null;
  const isEditing = activeDraft !== null;
  const tags = activeDraft?.tags ?? value;

  useEffect(() => {
    if (isEditing) {
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isEditing]);

  const handleSave = () => {
    if (onSave && !areTagsEqual(tags, value)) {
      onSave(tags);
    }
    setDraft(null);
    setInputValue('');
  };

  const handleCancel = () => {
    setDraft(null);
    setInputValue('');
  };

  const handleAddTag = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && !tags.includes(trimmedValue) && tags.length < maxTags) {
      setDraft((previousDraft) =>
        previousDraft
          ? {
              ...previousDraft,
              tags: [...previousDraft.tags, trimmedValue],
            }
          : previousDraft,
      );
      setInputValue('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setDraft((previousDraft) =>
      previousDraft
        ? {
            ...previousDraft,
            tags: previousDraft.tags.filter((tag) => tag !== tagToRemove),
          }
        : previousDraft,
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddTag();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {!isEditing && !isDisabled && (
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => setDraft({ sourceValue: value, tags: value })}
            className="h-6 px-2 inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground"
            ariaLabel="Edit tags"
          >
            <HiPencil className="size-3" />
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="default" className="gap-2">
                {tag}
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-error"
                  ariaLabel={`Remove ${tag}`}
                >
                  <HiXMark className="size-3" />
                </Button>
              </Badge>
            ))}
          </div>

          {tags.length < maxTags && (
            <div className="flex gap-2">
              <Input
                aria-label="Add tag"
                inputRef={inputRef}
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="h-8 text-sm border border-input px-3 flex-1"
                isDisabled={isDisabled}
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
              <HiCheck className="size-3" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.length > 0 ? (
            tags.map((tag) => (
              <Badge key={tag} variant="outline">
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
