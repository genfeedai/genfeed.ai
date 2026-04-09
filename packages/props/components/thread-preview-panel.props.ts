export interface PostPreviewItemProps {
  id: string;
  content: string;
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
  };
  /**
   * Child posts (in order)
   */
  replies: Array<{
    id: string;
    content: string;
  }>;
  /**
   * Additional CSS classes
   */
  className?: string;
}
