'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SearchFieldProps } from '@genfeedai/props/ui/forms/search-field.props';
import FormSearchbar from '@ui/primitives/searchbar';
import { useLayoutEffect, useRef } from 'react';

// The 5rem fallback in the classes below holds until the control is measured.
const TRAILING_WIDTH_VAR = '--search-trailing-width';

/**
 * The one search of a list page, for the subbar's left slot. It is a persistent
 * field with the page's Filters menu attached inside its trailing edge, so
 * finding and narrowing are one control and no filter trigger or applied-filter
 * chip sits outside it. The clear button sits just left of the Filters menu.
 */
export default function SearchField({
  ariaLabel,
  children,
  className,
  onChange,
  onSearch,
  placeholder,
  value,
}: SearchFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const hasTrailingControl = Boolean(children);

  // The Filters label and its count badge change width with the locale and the
  // applied filters, so the text and clear button reserve what is rendered.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const trailing = trailingRef.current;
    if (!field || !trailing || !hasTrailingControl) {
      return;
    }

    const reserveTrailingWidth = (): void => {
      field.style.setProperty(
        TRAILING_WIDTH_VAR,
        `${trailing.getBoundingClientRect().width}px`,
      );
    };
    reserveTrailingWidth();
    const observer = new ResizeObserver(reserveTrailingWidth);
    observer.observe(trailing);

    return () => {
      observer.disconnect();
      field.style.removeProperty(TRAILING_WIDTH_VAR);
    };
  }, [hasTrailingControl]);

  return (
    <div
      className={cn('relative w-80 max-w-full min-w-0', className)}
      ref={fieldRef}
    >
      <FormSearchbar
        ariaLabel={ariaLabel}
        className="w-full"
        clearButtonClassName={
          children
            ? 'right-[calc(var(--search-trailing-width,5rem)+0.5rem)]'
            : undefined
        }
        inputClassName={
          children
            ? 'pr-[calc(var(--search-trailing-width,5rem)+3rem)]'
            : undefined
        }
        onChange={onChange}
        onSearch={onSearch}
        placeholder={placeholder}
        showClearButton
        size={ComponentSize.SM}
        value={value}
      />
      {children ? (
        <div
          className="absolute right-1 top-1/2 z-20 -translate-y-1/2"
          ref={trailingRef}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
