'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SearchFieldProps } from '@genfeedai/props/ui/forms/search-field.props';
import FormSearchbar from '@ui/primitives/searchbar';

/**
 * The one search of a list page, for the subbar's left slot. It is a persistent
 * field with the page's Filters menu attached inside its trailing edge, so
 * finding and narrowing are one control and no filter trigger or applied-filter
 * chip sits outside it.
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
  return (
    <div className={cn('relative w-80 max-w-full min-w-0', className)}>
      <FormSearchbar
        ariaLabel={ariaLabel}
        className="w-full"
        inputClassName={children ? 'pr-24' : undefined}
        onChange={onChange}
        onSearch={onSearch}
        placeholder={placeholder}
        showClearButton={false}
        size={ComponentSize.SM}
        value={value}
      />
      {children ? (
        <div className="absolute right-1 top-1/2 z-20 -translate-y-1/2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
