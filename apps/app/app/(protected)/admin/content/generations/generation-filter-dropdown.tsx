'use client';

import type { GenerationFilterDropdownProps } from '@props/admin/generations.props';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

/** A compact subbar dropdown whose first option, with an empty value, is "all". */
export default function GenerationFilterDropdown({
  label,
  onChange,
  options,
  value,
}: GenerationFilterDropdownProps) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger
        aria-label={label}
        className="h-8 w-auto min-w-28 max-w-48 gap-2 px-2.5 text-xs"
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
