'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatEnumLabel,
  IngredientCategory,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { ModalPostMediaProps } from '@genfeedai/props/modals/modal.props';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { ImagePlus, Library, Upload, Video, X } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getPostMediaUrl } from '@/components/modals/content/post/post-media.helper';

function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function getMediaName(item: IIngredient): string {
  return item.metadataLabel || formatEnumLabel(item.category) || 'Media';
}

function getMediaFacts(item: IIngredient): string[] {
  const duration =
    'duration' in item && typeof item.duration === 'number'
      ? item.duration
      : item.metadataDuration;
  const width = item.width ?? item.metadataWidth;
  const height = item.height ?? item.metadataHeight;

  return [
    formatEnumLabel(item.category) ?? 'Media',
    ...(duration ? [formatDuration(duration)] : []),
    ...(width && height ? [`${width}×${height}`] : []),
  ];
}

function MediaPreview({ item }: { item: IIngredient }) {
  const label = getMediaName(item);
  const url = getPostMediaUrl(item);

  return (
    <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-md bg-background/70">
      {item.category === IngredientCategory.VIDEO ? (
        <VideoPlayer
          ariaLabel={label}
          className="size-full"
          config={{
            autoPlay: false,
            controls: true,
            loop: false,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          }}
          src={url}
          thumbnail={item.thumbnailUrl}
        />
      ) : (
        <Image
          alt={label}
          className="object-cover outline-media"
          fill
          sizes="112px"
          src={url}
          unoptimized
        />
      )}
    </div>
  );
}

/**
 * Media step of the post composer: attach Library videos or images, or upload
 * new ones, then see exactly what will be posted and in which order.
 */
export default function ModalPostMedia({
  items,
  isDisabled,
  requirementHint,
  onPickFromLibrary,
  onUpload,
  onRemove,
}: ModalPostMediaProps) {
  const translate = useTranslations('ui.postComposer');

  return (
    <FormControl label={translate('media')} helpText={requirementHint ?? ''}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Library className="size-4" />}
            isDisabled={isDisabled}
            label={translate('libraryVideo')}
            onClick={() => onPickFromLibrary('video')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            icon={<ImagePlus className="size-4" />}
            isDisabled={isDisabled}
            label={translate('libraryImage')}
            onClick={() => onPickFromLibrary('image')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            icon={<Video className="size-4" />}
            isDisabled={isDisabled}
            label={translate('uploadVideo')}
            onClick={() => onUpload('video')}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
          <Button
            icon={<Upload className="size-4" />}
            isDisabled={isDisabled}
            label={translate('uploadImage')}
            onClick={() => onUpload('image')}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-foreground/60">{translate('noMedia')}</p>
        ) : (
          <ol aria-label={translate('media')} className="space-y-2">
            {items.map((item, index) => (
              <li
                className="flex items-start gap-3 rounded-md border border-border p-2"
                key={item.id}
              >
                <MediaPreview item={item} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="truncate text-sm font-medium">
                    {index + 1}. {getMediaName(item)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {getMediaFacts(item).map((fact) => (
                      <Badge key={fact}>{fact}</Badge>
                    ))}
                  </div>
                </div>
                <Button
                  ariaLabel={translate('removeMedia', {
                    name: getMediaName(item),
                  })}
                  icon={<X className="size-4" />}
                  isDisabled={isDisabled}
                  onClick={() => onRemove(item.id)}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.GHOST}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </FormControl>
  );
}
