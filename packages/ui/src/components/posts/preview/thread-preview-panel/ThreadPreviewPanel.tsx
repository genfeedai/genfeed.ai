'use client';

import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type {
  PostPreviewItemProps,
  ThreadPreviewPanelProps,
} from '@genfeedai/props/components/thread-preview-panel.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';

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

function isVideoIngredient(ingredient: IIngredient): boolean {
  return (
    ingredient.category === IngredientCategory.VIDEO ||
    ingredient.category === IngredientCategory.VIDEO_EDIT
  );
}

function PostPreviewMedia({ ingredient }: { ingredient: IIngredient }) {
  if (isVideoIngredient(ingredient)) {
    return (
      <div className="mt-3 mx-auto max-h-[60vh] w-fit max-w-full overflow-hidden rounded-md">
        <VideoPlayer
          src={
            ingredient.cdnUrl ||
            ingredient.ingredientUrl ||
            `${EnvironmentService.ingredientsEndpoint}/videos/${ingredient.id}`
          }
          thumbnail={ingredient.thumbnailUrl}
          config={{
            controls: true,
            loop: false,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-md bg-background">
      <Image
        src={
          ingredient.cdnUrl ||
          ingredient.ingredientUrl ||
          `${EnvironmentService.ingredientsEndpoint}/images/${ingredient.id}`
        }
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-contain"
      />
    </div>
  );
}

/**
 * Single post preview in the thread
 */
function PostPreviewItem({
  content,
  media = [],
  status,
  index,
  isLast,
}: PostPreviewItemProps) {
  const textContent = getTextContent(content || '');
  const charCount = textContent.length;
  const isOverLimit = charCount > TWITTER_CHAR_LIMIT;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
          {index + 1}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-muted mt-2 min-h-8" />}
      </div>

      <div className="flex-1">
        <Card bodyClassName="p-4">
          {textContent ? (
            <p className="whitespace-pre-wrap text-base text-foreground">
              {textContent}
            </p>
          ) : (
            <p className="text-sm text-foreground/40 italic">Empty post</p>
          )}
          {media.map((ingredient) => (
            <PostPreviewMedia key={ingredient.id} ingredient={ingredient} />
          ))}
          <div className="mt-2 flex items-center justify-end gap-2">
            {status}
            <span
              className={`text-xs tabular-nums ${isOverLimit ? 'text-error font-medium' : 'text-foreground/50'}`}
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
  const readyCount = allPosts.filter(
    (t) => t.content.trim().length > 0 || (t.media?.length ?? 0) > 0,
  ).length;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Thread Preview</h3>
        <Badge variant="ghost" className="tabular-nums">
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
            media={post.media}
            status={post.status}
            index={index}
            isLast={index === allPosts.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
