'use client';

import { BatchProjectItemStatus, formatEnumLabel } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@services/content/ingredients.service';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { BatchProjectItemCardProps } from './batch-project.types';

export default function BatchProjectItemCard({
  item,
  isDraft,
  disabled,
  onRemove,
  onRetry,
  onCaption,
  onReview,
}: BatchProjectItemCardProps) {
  const t = useTranslations('pages.batchProjects');
  const service = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const [media, setMedia] = useState<IIngredient | null>(null);
  const ingredientId = item.outputIngredientId ?? item.inputIngredientId;
  useEffect(() => {
    const controller = new AbortController();
    setMedia(null);
    if (ingredientId)
      void service()
        .then((api) => api.findOne(ingredientId))
        .then((ingredient) => {
          if (!controller.signal.aborted) setMedia(ingredient);
        })
        .catch(() => undefined);
    return () => controller.abort();
  }, [ingredientId, service]);
  const reviewable =
    Boolean(item.reviewItemId) &&
    !item.scheduledAt &&
    (item.status === BatchProjectItemStatus.READY ||
      item.status === BatchProjectItemStatus.APPROVED);
  return (
    <Card data-testid={`batch-project-item-${item.id}`}>
      {media?.ingredientUrl &&
        (media.category === 'VIDEO' ? (
          <VideoPlayer
            src={media.ingredientUrl}
            thumbnail={media.thumbnailUrl}
            className="aspect-video w-full"
          />
        ) : (
          <Image
            unoptimized
            src={media.ingredientUrl}
            alt={item.idea?.hook || t('output')}
            width={640}
            height={360}
            className="aspect-video w-full object-contain outline-media"
          />
        ))}
      <h3 className="text-sm font-medium">
        {item.idea?.hook || ingredientId || t('output')}
      </h3>
      <p className="text-xs text-muted-foreground">
        {formatEnumLabel(item.status)}
        {item.scheduledAt ? ` · ${t('scheduled')}` : ''}
      </p>
      {item.idea?.visualPrompt && (
        <p className="text-sm text-muted-foreground">
          {item.idea.visualPrompt}
        </p>
      )}
      {item.error && (
        <p role="alert" className="text-sm text-destructive">
          {item.error}
        </p>
      )}
      <Textarea
        aria-label={t('caption')}
        value={item.caption ?? item.idea?.caption ?? ''}
        disabled={Boolean(item.scheduledAt)}
        onChange={(event) => onCaption(event.target.value)}
        maxLength={5000}
      />
      <CollectionItemActions
        primary={
          item.status === BatchProjectItemStatus.FAILED ? (
            <Button isDisabled={disabled} onClick={onRetry}>
              {t('retryItem')}
            </Button>
          ) : reviewable && item.status !== BatchProjectItemStatus.APPROVED ? (
            <Button isDisabled={disabled} onClick={() => onReview('approved')}>
              {t('approve')}
            </Button>
          ) : undefined
        }
        overflow={[
          ...(reviewable
            ? [
                {
                  id: 'reject',
                  label: t('reject'),
                  isDisabled: disabled,
                  onSelect: () => onReview('rejected'),
                },
              ]
            : []),
          ...(isDraft
            ? [
                {
                  id: 'remove',
                  label: t('removeInput'),
                  isDestructive: true,
                  isDisabled: disabled,
                  onSelect: onRemove,
                },
              ]
            : []),
        ]}
      />
      {item.scheduledTargets
        .filter((target) => target.status === 'failed')
        .map((target) => (
          <p key={target.credentialId} className="text-xs text-destructive">
            {t('targetFailed', { id: target.credentialId })}
          </p>
        ))}
    </Card>
  );
}
