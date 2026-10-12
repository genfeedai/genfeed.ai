'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import type { PostCardFooterProps } from '@ui/posts/card-footer/PostCardFooter.props';
import { Button } from '@ui/primitives/button';
import { ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

const EMPTY_ARRAY: never[] = [];

/**
 * Bottom row of a post card: media, illustration, delete, and save state.
 * AI writing lives in the page-level composer prompt bar, not per card.
 */
export default function PostCardFooter({
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
  const firstMedia = selectedMedia[0];

  if (!onSelectMedia && !onGenerateIllustration && !onSave && !showDelete) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2',
        className,
      )}
    >
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
            icon={
              hasMedia && firstMedia ? (
                <div className="relative size-5 shrink-0 overflow-hidden rounded-sm">
                  <Image
                    src={
                      firstMedia.category === IngredientCategory.VIDEO
                        ? firstMedia.thumbnailUrl ||
                          `${EnvironmentService.ingredientsEndpoint}/videos/${firstMedia.id}`
                        : `${EnvironmentService.ingredientsEndpoint}/images/${firstMedia.id}`
                    }
                    alt=""
                    className="size-full object-cover outline-media"
                    width={20}
                    height={20}
                    sizes="20px"
                  />
                </div>
              ) : (
                <ImageIcon className="size-4" />
              )
            }
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
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                isSaving
                  ? 'animate-pulse bg-muted-foreground'
                  : isDirty
                    ? 'bg-warning'
                    : 'bg-success',
              )}
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
  );
}
