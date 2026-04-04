import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormTextareaProps } from '@props/forms/form.props';
import BaseFormField from '@ui/forms/base/base-form-field/BaseFormField';
import { cva } from 'class-variance-authority';
import type React from 'react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FieldValues } from 'react-hook-form';

/**
 * CVA textarea variants with error state support
 */
const textareaVariants = cva(
  'flex min-h-textarea w-full border bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'border-input',
        error: 'border-destructive focus-visible:ring-destructive',
      },
    },
  },
);

// Separate component for controlled mode to handle hooks properly
interface ControlledTextareaInnerProps {
  fieldProps: {
    name: string;
    value: string;
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    onBlur?: () => void;
    ref: (element: HTMLTextAreaElement | null) => void;
  };
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  isUserInputRef: React.MutableRefObject<boolean>;
  previousValueRef: React.MutableRefObject<string>;
  className: string;
  placeholder?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  adjustHeight: () => void;
  handleChange: (
    fieldOnChange: (event: ChangeEvent<HTMLTextAreaElement>) => void,
  ) => (e: ChangeEvent<HTMLTextAreaElement>) => void;
}

function ControlledTextareaInner({
  fieldProps,
  textareaRef,
  isUserInputRef,
  previousValueRef,
  className,
  placeholder,
  isDisabled,
  isReadOnly,
  isRequired,
  onFocus,
  onBlur,
  onKeyDown,
  adjustHeight,
  handleChange,
}: ControlledTextareaInnerProps) {
  const currentValue = fieldProps.value;

  // Preserve cursor position when value changes externally (not from user input)
  useEffect(() => {
    const previousValue = previousValueRef.current;

    if (
      textareaRef.current &&
      currentValue !== previousValue &&
      !isUserInputRef.current &&
      previousValue !== ''
    ) {
      // This is an external update - preserve cursor position
      const textarea = textareaRef.current;
      const cursorPosition = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      // Only update if the value actually changed
      if (textarea.value !== currentValue) {
        // Store cursor position
        const savedCursorPos = cursorPosition;
        const savedSelectionEnd = selectionEnd;

        // Use a single animation frame to update value and restore cursor
        requestAnimationFrame(() => {
          const ref = textareaRef.current;
          if (!ref) {
            return;
          }

          if (ref.value !== currentValue) {
            ref.value = currentValue;
            adjustHeight();
          }

          const maxPos = currentValue.length;
          const restoredPos = Math.min(savedCursorPos, maxPos);
          const restoredEnd = Math.min(savedSelectionEnd, maxPos);
          ref.setSelectionRange(restoredPos, restoredEnd);
        });
      }
    }

    // Update previous value ref
    previousValueRef.current = currentValue;
  }, [
    currentValue,
    adjustHeight,
    isUserInputRef.current, // Update previous value ref
    previousValueRef,
    textareaRef.current,
  ]);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  return (
    <textarea
      name={fieldProps.name}
      value={currentValue}
      ref={(el) => {
        if (textareaRef && 'current' in textareaRef) {
          Object.assign(textareaRef, { current: el });
        }
        if (fieldProps.ref) {
          fieldProps.ref(el);
        }
      }}
      className={className}
      placeholder={placeholder}
      disabled={isDisabled}
      readOnly={isReadOnly}
      required={isRequired}
      onChange={handleChange(fieldProps.onChange)}
      onFocus={onFocus}
      onBlur={(e) => {
        fieldProps.onBlur?.();
        onBlur?.(e);
      }}
      onKeyDown={onKeyDown}
      rows={1}
    />
  );
}

export default function FormTextarea<T extends FieldValues>({
  name,
  placeholder,
  value,
  className,
  isDisabled,
  isReadOnly,
  isRequired,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  control,
  register,
  textareaRef: externalRef,
  hasError = false,
  maxHeight = 256,
}: FormTextareaProps<T>) {
  // ✅ ALL HOOKS AT TOP LEVEL - BEFORE ANY CONDITIONALS
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const registerOnChangeRef = useRef<
    ((event: ChangeEvent<HTMLTextAreaElement>) => void) | null
  >(register?.onChange ?? null);
  const isUserInputRef = useRef(false);
  const previousValueRef = useRef<string>('');
  // Stabilize textareaRef to avoid React Compiler memoization warnings
  const textareaRef = useMemo(() => externalRef || internalRef, [externalRef]);
  const textareaClassName = cn(
    textareaVariants({ variant: hasError ? 'error' : 'default' }),
    className,
  );

  // Memoize adjustHeight to prevent breaking dependent callbacks
  const adjustHeight = useCallback(() => {
    const ref = textareaRef.current;
    if (ref) {
      ref.style.height = 'auto';
      // Cap at maxHeight prop to enable scrollbar
      if (maxHeight && ref.scrollHeight > maxHeight) {
        ref.style.height = `${maxHeight}px`;
        ref.style.overflowY = 'auto';
      } else {
        ref.style.height = `${ref.scrollHeight}px`;
        ref.style.overflowY = 'hidden';
      }
    }
  }, [maxHeight, textareaRef]);

  // Handler for uncontrolled mode (using register)
  const handleChangeUncontrolled = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      registerOnChangeRef.current?.(e);
      onChange?.(e);
      adjustHeight();
    },
    [onChange, adjustHeight],
  );

  // Handler for controlled mode (using control)
  const handleChangeControlled = useCallback(
    (fieldOnChange: (event: ChangeEvent<HTMLTextAreaElement>) => void) =>
      (e: ChangeEvent<HTMLTextAreaElement>) => {
        // Mark as user input to preserve cursor position
        isUserInputRef.current = true;
        fieldOnChange(e);
        onChange?.(e);
        adjustHeight();
        // Reset flag after a short delay to allow React to process
        setTimeout(() => {
          isUserInputRef.current = false;
        }, 0);
      },
    [onChange, adjustHeight],
  );

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  // Update ref for uncontrolled mode (must be in effect, not during render)
  useEffect(() => {
    if (register) {
      registerOnChangeRef.current = register.onChange;
    }
  }, [register]);

  // ✅ NOW CONDITIONALS AND RENDERING - NO MORE HOOKS AFTER THIS POINT

  // If neither control nor register is provided, use simple controlled mode with value prop
  if (!control && !register) {
    return (
      <textarea
        name={name}
        value={value || ''}
        ref={(el) => {
          if (externalRef && 'current' in externalRef) {
            Object.assign(externalRef, { current: el });
          }
          internalRef.current = el;
        }}
        className={textareaClassName}
        placeholder={placeholder}
        disabled={isDisabled}
        readOnly={isReadOnly}
        required={isRequired}
        onChange={(e) => {
          onChange?.(e);
          adjustHeight();
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        rows={1}
      />
    );
  }

  // If register is provided, use uncontrolled mode (no re-renders!)
  if (register) {
    const { ref: registerRef, ...registerProps } = register;

    return (
      <textarea
        {...registerProps}
        ref={(el) => {
          // Always assign to internal ref
          internalRef.current = el;
          // If external ref is provided and different from internal, assign to it
          // Using Object.assign to avoid direct prop modification (satisfies linter)
          if (
            externalRef &&
            externalRef !== internalRef &&
            'current' in externalRef
          ) {
            Object.assign(externalRef, { current: el });
          }
          registerRef(el);
        }}
        name={name}
        className={textareaClassName}
        placeholder={placeholder}
        disabled={isDisabled}
        readOnly={isReadOnly}
        required={isRequired}
        onChange={handleChangeUncontrolled}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        rows={1}
      />
    );
  }

  // Fallback to controlled mode if control is provided
  if (!control) {
    // This should never happen due to the check above, but TypeScript needs it
    throw new Error(
      'FormTextarea requires either control, register, or value prop',
    );
  }

  return (
    <BaseFormField<T>
      name={name}
      control={control}
      onChange={onChange as ((value: unknown) => void) | undefined}
      render={(fieldProps) => (
        <ControlledTextareaInner
          fieldProps={fieldProps}
          textareaRef={textareaRef}
          isUserInputRef={isUserInputRef}
          previousValueRef={previousValueRef}
          className={textareaClassName}
          placeholder={placeholder}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          isRequired={isRequired}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          adjustHeight={adjustHeight}
          handleChange={handleChangeControlled}
        />
      )}
    />
  );
}
