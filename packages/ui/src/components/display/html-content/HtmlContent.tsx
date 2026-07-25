import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HtmlContentProps } from '@genfeedai/props/ui/display/html-content.props';
import { sanitizeHtml } from '@genfeedai/utils/sanitize-html';
import parse from 'html-react-parser';

/**
 * HtmlContent - Display HTML content safely using html-react-parser
 *
 * `parse()` turns markup into live React elements, so the content is sanitized
 * here rather than at each call site. Every caller passes stored, user- or
 * model-authored content (`post.description`, article drafts), which means an
 * unsanitized parse renders whatever was written into the record.
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
      {parse(sanitizeHtml(content))}
    </div>
  );
}
