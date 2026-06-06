'use client';

import { PostStatus } from '@genfeedai/enums';
import type { IIngredient, IPost } from '@genfeedai/interfaces';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import Card from '@ui/card/Card';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { createMarkup } from '@utils/sanitize-html';
import type { MutableRefObject } from 'react';
import { HiChatBubbleLeftRight, HiEye, HiHeart } from 'react-icons/hi2';

export interface PostDetailCardBodyProps {
  post: IPost;
  index: number;
  focusedPostId: string | null;
  isEditable: boolean;
  isParent: boolean;
  isTwitter: boolean;
  placeholder: string;
  descriptionValue: string;
  onDescriptionChange: (value: string) => void;
  currentDescriptionsRef: MutableRefObject<Map<string, string>>;
  labelValue?: string;
  onLabelChange?: (value: string) => void;
  currentLabelsRef: MutableRefObject<Map<string, string>>;
  localIngredients: IIngredient[];
  carouselValidation?: {
    valid: boolean;
    errors: string[];
  };
  publishedDisplay?: string;
  hasAnalytics: boolean;
  showAnalytics?: boolean;
}

export default function PostDetailCardBody({
  post,
  index,
  focusedPostId,
  isEditable,
  isParent,
  isTwitter,
  placeholder,
  descriptionValue,
  onDescriptionChange,
  currentDescriptionsRef,
  labelValue,
  onLabelChange,
  currentLabelsRef,
  localIngredients,
  carouselValidation,
  publishedDisplay,
  hasAnalytics,
  showAnalytics,
}: PostDetailCardBodyProps) {
  return (
    <Card className="overflow-hidden space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center">
          <div
            className={`w-8 h-8 flex items-center justify-center text-sm font-medium transition-colors duration-200 ${
              focusedPostId === post.id
                ? 'bg-foreground text-background'
                : 'bg-muted text-foreground'
            }`}
          >
            {index + 1}
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            {publishedDisplay && (
              <span className="text-xs text-success">
                Published {publishedDisplay}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* Title field for non-Twitter platforms (only in edit mode) */}
            {isEditable && isParent && !isTwitter && onLabelChange && (
              <FormControl label="Title">
                <Input
                  name="postTitle"
                  value={labelValue || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    onLabelChange(value);
                    if (post?.id) {
                      currentLabelsRef.current.set(post.id, value);
                    }
                  }}
                  placeholder="Enter post title"
                />
              </FormControl>
            )}

            {/* Read-only title display for non-publisher scopes */}
            {!isEditable && isParent && !isTwitter && post.label && (
              <h3 className="font-semibold text-lg">{post.label}</h3>
            )}

            {/* Editor for publisher scope */}
            {isEditable && (
              <LazyRichTextEditor
                placeholder={placeholder}
                toolbarMode="hidden"
                value={descriptionValue}
                minHeight={{ desktop: 150, mobile: 100 }}
                onChange={(value) => {
                  onDescriptionChange(value);
                  if (post?.id) {
                    currentDescriptionsRef.current.set(post.id, value);
                  }
                }}
              />
            )}

            {/* Read-only content display for non-publisher scopes */}
            {!isEditable && post.description && (
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={createMarkup(post.description)}
              />
            )}

            {/* Carousel validation errors (edit mode only) */}
            {isEditable &&
              !isParent &&
              carouselValidation &&
              !carouselValidation.valid &&
              localIngredients.length > 0 && (
                <div className=" bg-error/10 p-2">
                  <p className="text-xs text-error font-medium">
                    {carouselValidation.errors.join('. ')}
                  </p>
                </div>
              )}

            {/* Per-tweet KPIs - shown for all scopes when analytics exist */}
            {hasAnalytics && (
              <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.08] pt-3">
                <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                  <HiEye className="size-3.5" />
                  <span>{formatCompactNumber(post.totalViews ?? 0)}</span>
                </div>
                {post.totalLikes !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                    <HiHeart className="size-3.5 text-rose-500" />
                    <span>{formatCompactNumber(post.totalLikes)}</span>
                  </div>
                )}
                {post.totalComments !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                    <HiChatBubbleLeftRight className="size-3.5 text-secondary" />
                    <span>{formatCompactNumber(post.totalComments)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Fallback analytics display (edit mode only). */}
            {isEditable &&
              showAnalytics &&
              post.status === PostStatus.PUBLIC &&
              post.totalViews !== undefined &&
              !hasAnalytics && (
                <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-3">
                  <div className="text-xs text-foreground/60">
                    {post.totalViews?.toLocaleString() || 0} views
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </Card>
  );
}
