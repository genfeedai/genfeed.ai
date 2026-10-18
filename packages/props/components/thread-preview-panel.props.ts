import type { IIngredient } from '@genfeedai/contracts/interfaces';

export interface PostPreviewItemProps {
  id: string;
  content: string;
  media?: IIngredient[];
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
  };
  /**
   * Child posts (in order)
   */
  replies: Array<{
    id: string;
    content: string;
    media?: IIngredient[];
  }>;
  className?: string;
}
