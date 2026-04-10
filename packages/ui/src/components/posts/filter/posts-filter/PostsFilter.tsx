'use client';

import { PostStatus } from '@genfeedai/enums';
import type { PostsFilterProps } from '@genfeedai/props/components/posts-filter.props';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Draft', value: PostStatus.DRAFT },
  { label: 'Scheduled', value: PostStatus.SCHEDULED },
  { label: 'Published', value: PostStatus.PUBLIC },
  { label: 'Private', value: PostStatus.PRIVATE },
  { label: 'Unlisted', value: PostStatus.UNLISTED },
  { label: 'Processing', value: PostStatus.PROCESSING },
  { label: 'Failed', value: PostStatus.FAILED },
];

export default function PostsFilter({ value, onChange }: PostsFilterProps) {
  const handleChange = (_name: string, selectedValue: string) => {
    onChange(selectedValue as PostStatus | '');
  };

  return (
    <ButtonDropdown
      name="status"
      value={value || ''}
      options={STATUS_OPTIONS}
      onChange={handleChange}
      placeholder="All Statuses"
    />
  );
}
