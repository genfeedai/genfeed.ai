import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface PostPreviewItemProps {
  id: string;
  content: string;
  media?: IIngredient[];
  /** Where this post is in publishing, when the panel is showing a live thread. */
  status?: ReactNode;
  index: number;
  isLast: boolean;
}

export interface ThreadPreviewPanelProps {
  /**
   * Parent (first) post in the thread
   */
  parent: {
    id: string;
    content: string;
    media?: IIngredient[];
    status?: ReactNode;
  };
  /**
   * Child posts (in order)
   */
  replies: Array<{
    id: string;
    content: string;
    media?: IIngredient[];
    status?: ReactNode;
  }>;
  className?: string;
}
