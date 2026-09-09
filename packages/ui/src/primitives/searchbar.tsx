'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { Search, X } from 'lucide-react';
import type {
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  RefObject,
} from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button';

export const SEARCHBAR_DEBOUNCE_MS = 300;

const SIZE_CLASSES: Record<ComponentSize, string> = {
  [ComponentSize.LG]: 'h-12 text-base',
  [ComponentSize.MD]: 'h-10 text-sm',
  [ComponentSize.SM]: 'h-8 text-sm',
  [ComponentSize.XS]: 'h-6 text-xs',
  [ComponentSize.XL]: 'h-14 text-lg',
};

const ICON_SIZES: Record<ComponentSize, string> = {
  [ComponentSize.LG]: 'size-6',
  [ComponentSize.MD]: 'size-4',
  [ComponentSize.SM]: 'size-4',
  [ComponentSize.XS]: 'size-3',
  [ComponentSize.XL]: 'size-7',
};

export interface SearchbarProps {
  /** Committed search value. With `onSearch`, the input keeps its own draft
   * and only re-syncs when this changes from outside (back navigation, reset). */
  value?: string;
  /** Fires on every keystroke. Use for purely local, in-memory filtering. */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Fires with the trimmed-for-emptiness draft after `debounceMs` of
   * inactivity, and immediately on Enter or clear. Use for anything that hits
   * the router, a query param, or the network. */
  onSearch?: (value: string) => void;
  /** Delay before `onSearch` fires. Defaults to `SEARCHBAR_DEBOUNCE_MS`. */
  debounceMs?: number;
  placeholder?: string;
  ariaLabel?: string;
  name?: string;
  className?: string;
  inputClassName?: string;
  onClear?: () => void;
  showIcon?: boolean;
  showClearButton?: boolean;
  isDisabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onClick?: (event: MouseEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  size?:
    | ComponentSize.XS
    | ComponentSize.SM
    | ComponentSize.MD
    | ComponentSize.LG;
}

export default function Searchbar({
  value,
  onChange,
  onSearch,
  debounceMs = SEARCHBAR_DEBOUNCE_MS,
  placeholder = 'Search…',
  ariaLabel = 'Search',
  name = 'search',
  className = '',
  inputClassName = '',
  onClear,
  showIcon = true,
  showClearButton = true,
  isDisabled = false,
  inputRef,
  onClick,
  onKeyDown,
  size = ComponentSize.SM,
}: SearchbarProps): ReactElement {
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = inputRef ?? internalRef;
  const isDebounced = Boolean(onSearch);

  const committedValue = value ?? '';
  const [draft, setDraft] = useState(committedValue);
  const lastCommittedRef = useRef(committedValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  const cancelPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const commit = useCallback(
    (nextValue: string) => {
      cancelPending();
      if (nextValue === lastCommittedRef.current) {
        return;
      }
      lastCommittedRef.current = nextValue;
      onSearchRef.current?.(nextValue);
    },
    [cancelPending],
  );

  // Re-sync the draft only when the committed value changes from outside
  // (URL navigation, programmatic reset), never because our own commit landed.
  useEffect(() => {
    if (committedValue !== lastCommittedRef.current) {
      lastCommittedRef.current = committedValue;
      cancelPending();
      setDraft(committedValue);
    }
  }, [committedValue, cancelPending]);

  useEffect(() => cancelPending, [cancelPending]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    if (!isDebounced) {
      return;
    }
    const nextValue = event.target.value;
    setDraft(nextValue);
    cancelPending();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = undefined;
      commit(nextValue);
    }, debounceMs);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (isDebounced && event.key === 'Enter' && !event.defaultPrevented) {
      commit(event.currentTarget.value);
    }
  };

  const handleClear = () => {
    if (isDebounced) {
      cancelPending();
      setDraft('');
      lastCommittedRef.current = '';
      if (onClear) {
        onClear();
      } else {
        onSearchRef.current?.('');
      }
    } else if (onClear) {
      onClear();
    } else if (onChange) {
      const input = resolvedRef.current;
      if (input) {
        // Use the native setter so React detects the change and creates the
        // complete event contract (currentTarget, nativeEvent and methods).
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setValue?.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    resolvedRef.current?.focus();
  };

  const displayedValue = isDebounced ? draft : value;
  const sizeClass = SIZE_CLASSES[size];
  const iconSize = ICON_SIZES[size];

  return (
    <div className={cn('relative', className)}>
      {showIcon && (
        <Search
          className={cn(
            'absolute left-3 top-1/2 z-10 -translate-y-1/2 transform pointer-events-none text-foreground/60',
            iconSize,
          )}
        />
      )}

      <input
        aria-label={ariaLabel}
        name={name}
        ref={resolvedRef}
        type="text"
        value={displayedValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          sizeClass,
          'w-full rounded-md border border-border bg-card px-3 text-foreground placeholder:text-foreground/40',
          'focus-visible:border-border-strong focus-visible:outline-none focus-visible:ring-0',
          showIcon && 'pl-10',
          showClearButton && displayedValue && 'pr-8',
          inputClassName,
        )}
        disabled={isDisabled}
        onClick={onClick}
        onKeyDown={handleKeyDown}
      />

      {showClearButton && displayedValue && (
        <Button
          ariaLabel="Clear search"
          withWrapper={false}
          isDisabled={isDisabled}
          onClick={handleClear}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.MICRO}
          className="absolute right-1 top-1/2 -translate-y-1/2 transform p-1"
          icon={<X className={iconSize} />}
        />
      )}
    </div>
  );
}
