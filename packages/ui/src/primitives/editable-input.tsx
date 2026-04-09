import {
  createEditableInputSchema,
  type EditableInputSchema,
} from '@genfeedai/client/schemas';
import { ButtonVariant } from '@genfeedai/enums';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { HiCheck, HiPencil, HiXMark } from 'react-icons/hi2';
import { Button } from './button';
import { Input } from './input';

export interface EditableInputProps {
  value?: string;
  onSave: (value: string) => Promise<void> | void;
  label?: string;
  className?: string;
  isDisabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  displayClassName?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  type?: 'text' | 'email' | 'url';
  validateFn?: (value: string) => string | null;
}

export default function EditableInput({
  value = '',
  placeholder = 'Enter value',
  label,
  onSave,
  className = '',
  inputClassName = '',
  displayClassName = '',
  isDisabled = false,
  required = false,
  maxLength,
  minLength,
  type = 'text',
  validateFn,
}: EditableInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>();

  const inputRef = useRef<HTMLInputElement | null>(null);

  const schema = useMemo(
    () =>
      createEditableInputSchema({
        customValidation: validateFn,
        maxLength,
        minLength,
        required,
        type,
      }),
    [required, minLength, maxLength, type, validateFn],
  );

  const form = useForm<EditableInputSchema>({
    defaultValues: {
      editValue: value,
    },
    resolver: standardSchemaResolver(schema),
  });

  useEffect(() => {
    form.setValue('editValue', value);
  }, [value, form]);

  const handleEdit = () => {
    if (isDisabled) {
      return;
    }

    setIsEditing(true);
    form.setValue('editValue', value);
    setError(null);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleCancel = () => {
    setIsEditing(false);
    form.setValue('editValue', value);
    setError(null);
  };

  const handleSave = async () => {
    const isValid = await form.trigger('editValue');

    if (!isValid) {
      const errors = form.formState.errors;
      setError((errors.editValue?.message as string) || 'Invalid value');
      return;
    }

    const currentValue = form.getValues('editValue') as string;
    const trimmedValue = currentValue.trim();

    if (trimmedValue === value.trim()) {
      handleCancel();
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(trimmedValue);
      setIsEditing(false);
      setIsSaving(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'An error occurred while saving',
      );
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  };

  const displayValue = value || 'No value set';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-semibold mb-1 block">{label}</label>
      )}

      {isEditing ? (
        <div className="space-y-2">
          <div className="flex w-full">
            <Input<EditableInputSchema>
              name="editValue"
              type={type}
              placeholder={placeholder}
              className={` first: last: border-l-0 first:border-l !w-auto flex-1 ${error ? 'border-error' : ''} ${inputClassName}`}
              isDisabled={isSaving}
              control={form.control}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
            />

            <Button
              label={<HiCheck />}
              onClick={() => void handleSave()}
              variant={ButtonVariant.DEFAULT}
              className=" first: last: border-l-0 first:border-l bg-green-500 hover:bg-green-600 text-white"
              isLoading={isSaving}
              isDisabled={isSaving}
            />

            <Button
              label={<HiXMark />}
              onClick={handleCancel}
              variant={ButtonVariant.DESTRUCTIVE}
              className=" first: last: border-l-0 first:border-l"
              isDisabled={isSaving}
            />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          className={`p-3 bg-background cursor-pointer hover:bg-muted transition-colors flex justify-between items-center group ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${displayClassName}`}
          onClick={handleEdit}
          disabled={isDisabled}
        >
          <span className={value ? '' : 'text-foreground/60'}>
            {displayValue}
          </span>

          {!isDisabled && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <HiPencil className="w-4 h-4 text-foreground/60" />
            </div>
          )}
        </button>
      )}
    </div>
  );
}
