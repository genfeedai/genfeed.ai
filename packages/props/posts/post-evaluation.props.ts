import type { IPost } from '@genfeedai/contracts/interfaces';

export interface PostEvaluationProps {
  post: IPost;
  onEvaluated: (postId: string, score: number) => void;
  presentation?: 'table' | 'grid';
}
