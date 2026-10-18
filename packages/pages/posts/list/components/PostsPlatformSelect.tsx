'use client';

import { getPostPlatformTabs } from '@helpers/content/posts.helper';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useMemo } from 'react';

interface PostsPlatformSelectProps {
  /** A platform id, or `all`. */
  value: string;
  onChange: (value: string) => void;
}

/** The platform filter as a dropdown, each option led by its network logo. */
export default function PostsPlatformSelect({
  value,
  onChange,
}: PostsPlatformSelectProps) {
  const options = useMemo(() => getPostPlatformTabs(), []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Platform" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(({ icon: Icon, id, label }) => (
          <SelectItem key={id} value={id}>
            <span className="flex items-center gap-2">
              {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
              {id === 'all' ? 'All platforms' : label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
