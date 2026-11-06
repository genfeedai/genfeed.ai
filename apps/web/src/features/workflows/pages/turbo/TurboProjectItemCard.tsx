'use client';

import {
  ButtonVariant,
  formatEnumLabel,
  TurboProjectItemStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@services/content/ingredients.service';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TurboProjectItemCardProps } from './turbo-project.types';

function ingredientByIdQueryKey(ingredientId: string) {
  return ['ingredient-by-id', ingredientId] as const;
}

export default function TurboProjectItemCard({
  item,
  isDraft,
  disabled,
  onRemove,
  onRetry,
  onCaption,
  onReview,
}: TurboProjectItemCardProps) {
  const t = useTranslations('pages.turboProjects');
  const ingredientId = item.outputIngredientId ?? item.inputIngredientId;
  // The item's media reads through React Query, so reopening a project paints
  // each card's preview at once. A missing preview is optional: a failed read
  // leaves the card without one. Ingredients of any category are read by id
  // through the batch route; `/ingredients/:id` does not exist.
  const mediaQuery = useAuthedQuery<IngredientsService, IIngredient | null>({
    enabled: Boolean(ingredientId),
    queryFn: async (api) =>
      (await api.findByIds([ingredientId ?? '']))[0] ?? null,
    queryKey: ingredientByIdQueryKey(ingredientId ?? ''),
    service: (token: string) => IngredientsService.getInstance(token),
  });
  const media = ingredientId ? (mediaQuery.data ?? null) : null;
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const confirmReject = () => {
    onReview('rejected', rejectReason.trim() || undefined);
    setIsRejecting(false);
    setRejectReason('');
  };
  const reviewable =
    Boolean(item.reviewItemId) &&
    !item.scheduledAt &&
    (item.status === TurboProjectItemStatus.READY ||
      item.status === TurboProjectItemStatus.APPROVED);
  return (
    <Card data-testid={`turbo-project-item-${item.id}`}>
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
          item.status === TurboProjectItemStatus.FAILED ? (
            <Button isDisabled={disabled} onClick={onRetry}>
              {t('retryItem')}
            </Button>
          ) : reviewable && item.status !== TurboProjectItemStatus.APPROVED ? (
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
                  onSelect: () => setIsRejecting(true),
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
      {isRejecting && (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={t('rejectReasonLabel')}
            placeholder={t('rejectReasonHint')}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button isDisabled={disabled} onClick={confirmReject}>
              {t('confirmReject')}
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              onClick={() => setIsRejecting(false)}
            >
              {t('cancelReject')}
            </Button>
          </div>
        </div>
      )}
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
