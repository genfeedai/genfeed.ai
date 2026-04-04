export interface HtmlContentProps {
  /**
   * HTML content string to parse and display
   */
  content: string;

  /**
   * Additional CSS classes to apply (use line-clamp-N for truncation)
   */
  className?: string;
}
