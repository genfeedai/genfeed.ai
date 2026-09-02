import { cn } from '@genfeedai/helpers';
import { Pencil } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

export interface EditableTextProps {
  value?: string;
  onSave: (value: string) => Promise<void> | void;
  ariaLabel: string;
  isMultiline?: boolean;
  placeholder?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  maxLength?: number;
  className?: string;
  displayClassName?: string;
}

function EditableText({
  ariaLabel,
  className,
  displayClassName,
  isDisabled = false,
  isMultiline = false,
  isRequired = false,
  maxLength,
  onSave,
  placeholder = '',
  value = '',
}: EditableTextProps) {
  const [draftValue, setDraftValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const isCancellingRef = useRef(false);
  const isSavingRef = useRef(false);
  const originalValueRef = useRef('');

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    editorRef.current?.focus();
    editorRef.current?.select();
  }, [isEditing]);

  const exitEditMode = () => {
    isCancellingRef.current = true;
    setDraftValue(originalValueRef.current);
    setIsEditing(false);
  };

  const handleEdit = () => {
    if (isDisabled) {
      return;
    }

    isCancellingRef.current = false;
    originalValueRef.current = value;
    setDraftValue(value);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (isSavingRef.current) {
      return;
    }

    const trimmedValue = draftValue.trim();
    const originalValue = originalValueRef.current;

    if (
      trimmedValue === originalValue.trim() ||
      (isRequired && trimmedValue.length === 0)
    ) {
      exitEditMode();
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      await onSave(trimmedValue);
      setIsEditing(false);
    } catch {
      setDraftValue(originalValue);
      setIsEditing(false);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      exitEditMode();
      return;
    }

    const isSaveShortcut =
      event.key === 'Enter' && (!isMultiline || event.metaKey || event.ctrlKey);

    if (isSaveShortcut) {
      event.preventDefault();
      void handleSave();
    }
  };

  const handleBlur = () => {
    if (isCancellingRef.current) {
      isCancellingRef.current = false;
      return;
    }

    void handleSave();
  };

  const editorClassName = cn(
    'block w-full min-w-0 rounded-sm border-0 bg-transparent px-1 py-0.5 font-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60',
    isMultiline && 'field-sizing-content max-h-48 resize-none overflow-y-auto',
    displayClassName,
  );

  return (
    <span className={cn('block min-w-0', className)}>
      {isEditing ? (
        isMultiline ? (
          <textarea
            aria-label={ariaLabel}
            className={editorClassName}
            disabled={isDisabled || isSaving}
            maxLength={maxLength}
            onBlur={handleBlur}
            onChange={(event) => setDraftValue(event.target.value)}
            onKeyDown={handleKeyDown}
            ref={(element) => {
              editorRef.current = element;
            }}
            rows={1}
            value={draftValue}
          />
        ) : (
          <input
            aria-label={ariaLabel}
            className={editorClassName}
            disabled={isDisabled || isSaving}
            maxLength={maxLength}
            onBlur={handleBlur}
            onChange={(event) => setDraftValue(event.target.value)}
            onKeyDown={handleKeyDown}
            ref={(element) => {
              editorRef.current = element;
            }}
            type="text"
            value={draftValue}
          />
        )
      ) : (
        <button
          aria-label={ariaLabel}
          className={cn(
            'group flex max-w-full cursor-text items-center gap-1 rounded-sm bg-transparent px-1 py-0.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          )}
          disabled={isDisabled}
          onClick={handleEdit}
          type="button"
        >
          <span
            className={cn(
              'min-w-0 whitespace-pre-wrap',
              !value && 'text-muted-foreground',
              displayClassName,
            )}
          >
            {value || placeholder}
          </span>
          {!isDisabled ? (
            <Pencil
              aria-hidden="true"
              className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          ) : null}
        </button>
      )}
    </span>
  );
}

export { EditableText };
