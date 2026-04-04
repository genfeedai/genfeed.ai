import type { PostStatus } from '@genfeedai/enums';

export interface PostsFilterProps {
  value: PostStatus | '';
  onChange: (value: PostStatus | '') => void;
}
