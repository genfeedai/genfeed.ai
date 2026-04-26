import { Textarea as ShipTextarea } from '@shipshitdev/ui/primitives';
import {
  type ChangeEvent,
  type FocusEvent,
  forwardRef,
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
import type {
  Control,
  FieldValues,
  Path,
  UseFormRegisterReturn,
} from 'react-hook-form';
import { useController } from 'react-hook-form';
import { cn } from '../lib/utils';

export interface TextareaProps<T extends FieldValues = FieldValues>
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    | 'disabled'
    | 'name'
    | 'onBlur'
    | 'onChange'
    | 'readOnly'
    | 'required'
    | 'rows'
  > {
  control?: Control<T>;
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
  required?: boolean;
  register?: UseFormRegisterReturn<Path<T>>;
  rows?: number;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

interface TextareaBaseProps<T extends FieldValues = FieldValues>
  extends Omit<TextareaProps<T>, 'control' | 'register' | 'textareaRef'> {
  externalRef?: Ref<HTMLTextAreaElement>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

interface ControlledTextareaInnerProps<T extends FieldValues = FieldValues>
  extends Omit<TextareaBaseProps<T>, 'name' | 'value'> {
  fieldName: string;
  fieldOnBlur?: () => void;
  fieldOnChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  fieldRef: (element: HTMLTextAreaElement | null) => void;
  value?: string;
}

interface RegisteredTextareaInnerProps<T extends FieldValues = FieldValues>
  extends Omit<TextareaProps<T>, 'control' | 'register' | 'textareaRef'> {
  externalRef?: Ref<HTMLTextAreaElement>;
  register: UseFormRegisterReturn<Path<T>>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

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

    ref.style.height = 'auto';

    if (maxHeight > 0 && ref.scrollHeight > maxHeight) {
      ref.style.height = `${maxHeight}px`;
      ref.style.overflowY = 'auto';
      return;
    }

    ref.style.height = `${ref.scrollHeight}px`;
    ref.style.overflowY = 'hidden';
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

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  return (
    <ShipTextarea
      {...props}
      className={cn(
        'ship-ui min-h-textarea h-auto resize-y font-[inherit]',
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

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  return (
    <textarea
      {...props}
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border border-border bg-background-secondary px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground/18 disabled:cursor-not-allowed disabled:opacity-50 font-[inherit]',
        'min-h-textarea h-auto resize-y',
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

function RegisteredTextareaInner<T extends FieldValues = FieldValues>({
  className,
  disabled,
  externalRef,
  hasError = false,
  isDisabled,
  isReadOnly,
  isRequired,
  maxHeight = 256,
  onBlur,
  onChange,
  onFocus,
  onKeyDown,
  register,
  required,
  rows = 1,
  textareaRef,
  ...props
}: RegisteredTextareaInnerProps<T>) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const stableTextareaRef = useMemo(
    () => textareaRef || internalRef,
    [textareaRef],
  );
  const adjustHeight = useTextareaSizing(stableTextareaRef, maxHeight);
  const registerOnChangeRef = useRef(register.onChange);

  useEffect(() => {
    registerOnChangeRef.current = register.onChange;
  }, [register]);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  const { ref: registerRef, ...registerProps } = register;

  return (
    <textarea
      {...registerProps}
      {...props}
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border border-border bg-background-secondary px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground/18 disabled:cursor-not-allowed disabled:opacity-50 font-[inherit]',
        'min-h-textarea h-auto resize-y',
        hasError && 'border-destructive focus-visible:border-destructive',
        className,
      )}
      disabled={isDisabled ?? disabled}
      name={props.name}
      onChange={(event) => {
        registerOnChangeRef.current?.(event);
        onChange?.(event);
        adjustHeight();
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      readOnly={isReadOnly}
      ref={(element) => {
        assignRef(externalRef, element);
        assignRef(stableTextareaRef, element);
        registerRef(element);
      }}
      required={isRequired ?? required}
      rows={rows}
    />
  );
}

function HookedControlledTextareaInner<T extends FieldValues = FieldValues>({
  control,
  externalRef,
  textareaRef,
  ...props
}: Omit<TextareaProps<T>, 'register'> & {
  control: Control<T>;
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

function TextareaInner<T extends FieldValues = FieldValues>(
  { control, register, textareaRef, ...props }: TextareaProps<T>,
  ref: Ref<HTMLTextAreaElement>,
): ReactElement {
  if (register) {
    return (
      <RegisteredTextareaInner
        {...props}
        externalRef={ref}
        register={register}
        textareaRef={textareaRef}
      />
    );
  }

  if (control && props.name) {
    return (
      <HookedControlledTextareaInner
        {...props}
        control={control}
        externalRef={ref}
        textareaRef={textareaRef}
      />
    );
  }

  return (
    <PlainTextareaInner
      {...props}
      externalRef={ref}
      textareaRef={textareaRef}
      value={props.value as string | undefined}
    />
  );
}

const Textarea = forwardRef(TextareaInner) as (<
  T extends FieldValues = FieldValues,
>(
  props: TextareaProps<T> & { ref?: Ref<HTMLTextAreaElement> },
) => ReactElement) & {
  displayName?: string;
};

Textarea.displayName = 'Textarea';

export { Textarea };
