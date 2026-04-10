import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HtmlContentProps } from '@genfeedai/props/ui/display/html-content.props';
import parse from 'html-react-parser';

/**
 * HtmlContent - Display HTML content safely using html-react-parser
 *
 * @example
 * ```tsx
 * <HtmlContent content="<p>Hello <strong>world</strong>!</p>" />
 * <HtmlContent content={post.description} className="line-clamp-1" />
 * <HtmlContent content={post.description} className="line-clamp-3 text-sm" />
 * ```
 */
export default function HtmlContent({ content, className }: HtmlContentProps) {
  if (!content) {
    return null;
  }

  return (
    <div className={cn('prose prose-sm max-w-none', className)}>
      {parse(content)}
    </div>
  );
}
