'use client';

import {
  POSTS_SOURCE_EXTENSION,
  type PostsSourceFilter,
  parsePostsSource,
} from '@pages/posts/list/posts-list-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';

const SOURCE_ALL = 'all';

export interface PostsSourceSelectProps {
  onSourceChange: (value: PostsSourceFilter | undefined) => void;
  sourceValue?: PostsSourceFilter;
}

/** `Post.source` provenance filter shared by every Posts list toolbar. */
export default function PostsSourceSelect({
  onSourceChange,
  sourceValue,
}: PostsSourceSelectProps) {
  const translate = useTranslations('pages.posts.list');

  return (
    <Select
      value={sourceValue ?? SOURCE_ALL}
      onValueChange={(value) => onSourceChange(parsePostsSource(value))}
    >
      <SelectTrigger
        aria-label={translate('toolbar.sourceAria')}
        className="w-36"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SOURCE_ALL}>
          {translate('toolbar.sourceAll')}
        </SelectItem>
        <SelectItem value={POSTS_SOURCE_EXTENSION}>
          {translate('toolbar.sourceExtension')}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
