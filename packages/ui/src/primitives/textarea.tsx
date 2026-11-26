import { cn } from '@genfeedai/helpers';
import { Textarea as TextareaControl } from '@ui-sdk/react/textarea';
import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  type Ref,
  type RefObject,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { fieldFocusClassName } from './field-control';

export interface TextareaProps<T extends FieldValues = FieldValues>
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    | 'defaultValue'
    | 'disabled'
    | 'name'
    | 'onBlur'
    | 'onChange'
    | 'onSubmit'
    | 'readOnly'
    | 'required'
    | 'rows'
    | 'value'
  > {
  control?: Control<T>;
  defaultValue?: string | number | readonly string[];
  disabled?: boolean;
  hasError?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  maxHeight?: number;
  name?: Path<T> | string;
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus?: (event: FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  ref?: Ref<HTMLTextAreaElement>;
  required?: boolean;
  rows?: number;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  value?: string | number | readonly string[];
}

interface TextareaBaseProps<T extends FieldValues = FieldValues>
  extends Omit<
    TextareaProps<T>,
    'control' | 'defaultValue' | 'textareaRef' | 'value'
  > {
  defaultValue?: string;
  externalRef?: Ref<HTMLTextAreaElement>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  value?: string;
}

interface ControlledTextareaInnerProps<T extends FieldValues = FieldValues>
  extends Omit<TextareaBaseProps<T>, 'name' | 'value'> {
  fieldName: string;
  fieldOnBlur?: () => void;
  fieldOnChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  fieldRef: (element: HTMLTextAreaElement | null) => void;
  value?: string;
}

/** ui-sdk keeps the text as a string; a number or a list reads as its text. */
function toText(
  value: string | number | readonly string[] | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'object' ? value.join(',') : String(value);
}

const textareaClassName = `flex min-h-[80px] w-full rounded-md border border-border bg-tertiary px-3 py-2 text-sm text-foreground placeholder:text-gray-800 ${fieldFocusClassName} disabled:cursor-not-allowed disabled:opacity-50 font-[inherit] min-h-textarea h-auto resize-y`;

function assignRef(
  ref:
    | Ref<HTMLTextAreaElement>
    | RefObject<HTMLTextAreaElement | null>
    | undefined,
  value: HTMLTextAreaElement | null,
) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref && 'current' in ref) {
    ref.current = value;
  }
}

function useTextareaSizing(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  maxHeight: number,
) {
  return useCallback(() => {
    const ref = textareaRef.current;

    if (!ref) {
      return;
    }

    Object.assign(ref.style, { height: 'auto' });

    if (maxHeight > 0 && ref.scrollHeight > maxHeight) {
      Object.assign(ref.style, {
        height: `${maxHeight}px`,
        overflowY: 'auto',
      });
      return;
    }

    Object.assign(ref.style, {
      height: `${ref.scrollHeight}px`,
      overflowY: 'hidden',
    });
  }, [maxHeight, textareaRef]);
}

function PlainTextareaInner<T extends FieldValues = FieldValues>({
  className,
  externalRef,
  hasError = false,
  isDisabled,
  isReadOnly,
  isRequired,
  maxHeight = 256,
  name,
  onBlur,
  onChange,
  onFocus,
  onKeyDown,
  disabled,
  required,
  rows = 1,
  textareaRef,
  value,
  ...props
}: TextareaBaseProps<T>) {
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null);
  const stableTextareaRef = useMemo(
    () => textareaRef || fallbackRef,
    [textareaRef],
  );
  const adjustHeight = useTextareaSizing(stableTextareaRef, maxHeight);

  // use-effect-audit: ignore drives a DOM element or browser API
  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  return (
    <TextareaControl
      {...props}
      className={cn(
        textareaClassName,
        hasError && 'border-destructive focus-visible:border-destructive',
        className,
      )}
      disabled={isDisabled ?? disabled}
      name={name}
      onBlur={onBlur}
      onChange={(event) => {
        onChange?.(event);
        adjustHeight();
      }}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      readOnly={isReadOnly}
      ref={(element) => {
        assignRef(externalRef, element);
        assignRef(stableTextareaRef, element);
      }}
      required={isRequired ?? required}
      rows={rows}
      value={value ?? ''}
    />
  );
}

function ControlledTextareaInner<T extends FieldValues = FieldValues>({
  className,
  externalRef,
  fieldName,
  fieldOnBlur,
  fieldOnChange,
  fieldRef,
  hasError = false,
  isDisabled,
  isReadOnly,
  isRequired,
  maxHeight = 256,
  onBlur,
  onChange,
  onFocus,
  onKeyDown,
  disabled,
  required,
  rows = 1,
  textareaRef,
  value,
  ...props
}: ControlledTextareaInnerProps<T>) {
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null);
  const stableTextareaRef = useMemo(
    () => textareaRef || fallbackRef,
    [textareaRef],
  );
  const isUserInputRef = useRef(false);
  const previousValueRef = useRef(value ?? '');
  const adjustHeight = useTextareaSizing(stableTextareaRef, maxHeight);
  const currentValue = value ?? '';

  // use-effect-audit: ignore drives a DOM element or browser API
  useEffect(() => {
    const previousValue = previousValueRef.current;
    const textarea = stableTextareaRef.current;

    if (
      !textarea ||
      currentValue === previousValue ||
      isUserInputRef.current ||
      previousValue === ''
    ) {
      previousValueRef.current = currentValue;
      return;
    }

    const cursorPosition = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;

    if (textarea.value !== currentValue) {
      const savedCursorPos = cursorPosition;
      const savedSelectionEnd = selectionEnd;

      requestAnimationFrame(() => {
        const ref = stableTextareaRef.current;

        if (!ref) {
          return;
        }

        if (ref.value !== currentValue) {
          ref.value = currentValue;
          adjustHeight();
        }

        const maxPos = currentValue.length;
        ref.setSelectionRange(
          Math.min(savedCursorPos, maxPos),
          Math.min(savedSelectionEnd, maxPos),
        );
      });
    }

    previousValueRef.current = currentValue;
  }, [adjustHeight, currentValue, stableTextareaRef]);

  return (
    <TextareaControl
      {...props}
      className={cn(
        textareaClassName,
        hasError && 'border-destructive focus-visible:border-destructive',
        className,
      )}
      disabled={isDisabled ?? disabled}
      name={fieldName}
      onBlur={(event) => {
        fieldOnBlur?.();
        onBlur?.(event);
      }}
      onChange={(event) => {
        isUserInputRef.current = true;
        fieldOnChange(event);
        onChange?.(event);
        adjustHeight();
        setTimeout(() => {
          isUserInputRef.current = false;
        }, 0);
      }}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      readOnly={isReadOnly}
      ref={(element) => {
        assignRef(externalRef, element);
        assignRef(stableTextareaRef, element);
        fieldRef(element);
      }}
      required={isRequired ?? required}
      rows={rows}
      value={currentValue}
    />
  );
}

function HookedControlledTextareaInner<T extends FieldValues = FieldValues>({
  control,
  externalRef,
  textareaRef,
  ...props
}: Omit<TextareaProps<T>, 'defaultValue'> & {
  control: Control<T>;
  defaultValue?: string;
  externalRef?: Ref<HTMLTextAreaElement>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const { field } = useController({
    control,
    name: props.name as Path<T>,
  });

  return (
    <ControlledTextareaInner
      {...props}
      externalRef={externalRef}
      fieldName={field.name}
      fieldOnBlur={field.onBlur}
      fieldOnChange={field.onChange}
      fieldRef={field.ref}
      textareaRef={textareaRef}
      value={typeof field.value === 'string' ? field.value : ''}
    />
  );
}

function Textarea<T extends FieldValues = FieldValues>({
  ref,
  control,
  defaultValue,
  textareaRef,
  value,
  ...props
}: TextareaProps<T>): ReactElement {
  const initialText = toText(defaultValue);

  if (control && props.name) {
    return (
      <HookedControlledTextareaInner
        {...props}
        control={control}
        defaultValue={initialText}
        externalRef={ref}
        textareaRef={textareaRef}
      />
    );
  }

  return (
    <PlainTextareaInner
      {...props}
      defaultValue={initialText}
      externalRef={ref}
      textareaRef={textareaRef}
      value={toText(value)}
    />
  );
}

Textarea.displayName = 'Textarea';

export { Textarea };
