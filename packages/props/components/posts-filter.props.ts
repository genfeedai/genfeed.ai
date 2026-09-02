import type { PostStatus } from '@genfeedai/contracts';

export interface PostsFilterProps {
  value: PostStatus | '';
  onChange: (value: PostStatus | '') => void;
}
