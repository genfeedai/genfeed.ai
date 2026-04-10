'use client';

import type {
  PostPreviewItemProps,
  ThreadPreviewPanelProps,
} from '@genfeedai/props/components/thread-preview-panel.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';

const TWITTER_CHAR_LIMIT = 280;

/**
 * Extract text content from HTML string for character counting
 */
function getTextContent(html: string): string {
  if (typeof window === 'undefined') {
    // Server-side: simple regex to strip HTML tags
    return html.replace(/<[^>]*>/g, '').trim();
  }
  // Client-side: use DOM to extract text (sanitize first to prevent XSS)
  const div = document.createElement('div');
  div.textContent = html.replace(/<[^>]*>/g, '');
  return div.textContent || '';
}

/**
 * Single post preview in the thread
 */
function PostPreviewItem({ content, index, isLast }: PostPreviewItemProps) {
  const textContent = getTextContent(content || '');
  const charCount = textContent.length;
  const isOverLimit = charCount > TWITTER_CHAR_LIMIT;

  return (
    <div className="flex gap-3">
      {/* Number badge and connector line */}
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
          {index + 1}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-muted mt-2 min-h-8" />}
      </div>

      {/* Post content */}
      <div className="flex-1">
        <Card bodyClassName="p-4">
          {content ? (
            <LazyRichTextEditor
              value={content}
              onChange={() => {}}
              readOnly={true}
              showToolbar={false}
              toolbarMode="hidden"
              minHeight={{ desktop: 50, mobile: 50 }}
              className="pointer-events-none"
            />
          ) : (
            <p className="text-sm text-foreground/40 italic">Empty post</p>
          )}
          <div className="mt-2 flex items-center justify-end gap-2">
            <span
              className={`text-xs ${isOverLimit ? 'text-error font-medium' : 'text-foreground/50'}`}
            >
              {charCount}/{TWITTER_CHAR_LIMIT}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Clean read-only preview panel showing the full thread.
 * No textboxes or buttons - just the content as it will appear.
 */
export default function ThreadPreviewPanel({
  parent,
  replies,
  className = '',
}: ThreadPreviewPanelProps) {
  const allPosts = [parent, ...replies];
  const postCount = allPosts.length;
  const readyCount = allPosts.filter((t) => t.content.trim().length > 0).length;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Thread Preview</h3>
        <Badge variant="ghost">
          {readyCount}/{postCount} ready
        </Badge>
      </div>

      {/* Thread content */}
      <div className="space-y-4">
        {allPosts.map((post, index) => (
          <PostPreviewItem
            key={post.id || `post-${index}`}
            id={post.id || `post-${index}`}
            content={post.content}
            index={index}
            isLast={index === allPosts.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
