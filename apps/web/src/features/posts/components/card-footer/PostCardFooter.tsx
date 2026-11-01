'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { Button } from '@ui/primitives/button';
import { StatusDot } from '@ui/primitives/status-dot';
import { ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PostCardFooterProps } from '@/features/posts/components/card-footer/PostCardFooter.props';
import PostMediaStrip from '@/features/posts/components/card-footer/PostMediaStrip';

const EMPTY_ARRAY: never[] = [];

/**
 * Bottom row of a post card: media, illustration, delete, and save state.
 * AI writing lives in the page-level composer prompt bar, not per card.
 */
export default function PostCardFooter({
  onChangeMedia,
  onSelectMedia,
  onGenerateIllustration,
  selectedMedia = EMPTY_ARRAY,
  isSavingMedia = false,
  onSave,
  isDirty = false,
  isSaving = false,
  onDelete,
  showDelete = false,
  className = '',
}: PostCardFooterProps) {
  const translate = useTranslations('ui.postCardFooter');
  const mediaCount = selectedMedia.length;
  const hasMedia = mediaCount > 0;

  if (!onSelectMedia && !onGenerateIllustration && !onSave && !showDelete) {
    return null;
  }

  return (
    <div className={cn('border-t border-border', className)}>
      {hasMedia && onChangeMedia && (
        <PostMediaStrip
          isDisabled={isSavingMedia}
          media={selectedMedia}
          onChange={onChangeMedia}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {onSelectMedia && (
            <Button
              ariaLabel={
                hasMedia
                  ? translate('changeMedia', { count: mediaCount })
                  : translate('addMedia')
              }
              label={
                hasMedia
                  ? translate('media', { count: mediaCount })
                  : translate('addMedia')
              }
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              textTransform="none"
              onClick={onSelectMedia}
              isDisabled={isSavingMedia}
              icon={<ImageIcon className="size-4" />}
            />
          )}

          {onGenerateIllustration && (
            <Button
              label={translate('generateIllustration')}
              icon={<Sparkles className="size-4" />}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              textTransform="none"
              onClick={onGenerateIllustration}
            />
          )}

          {showDelete && onDelete && (
            <Button
              ariaLabel={translate('deletePost')}
              icon={<Trash2 className="size-4" />}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              tooltip={translate('deletePost')}
              tooltipPosition="top"
              onClick={onDelete}
            />
          )}
        </div>

        {onSave && (
          <div className="flex items-center gap-2">
            <p
              role="status"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <StatusDot
                isPulsing={isSaving}
                size="xs"
                tone={isSaving ? 'muted' : isDirty ? 'warning' : 'success'}
              />
              {isSaving
                ? translate('saving')
                : isDirty
                  ? translate('unsaved')
                  : translate('saved')}
            </p>
            {isDirty && (
              <Button
                label={translate('save')}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                textTransform="none"
                isLoading={isSaving}
                onClick={onSave}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
