'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientVersionRelation,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Film, History, ImageOff, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  IngredientVersionHistoryProps,
  IngredientVersionRowProps,
} from '@/props/content/ingredient.props';
import { useIngredientVersions } from './use-ingredient-versions';

const RELATION_LABEL_KEYS = {
  [IngredientVersionRelation.ORIGINAL]: 'relations.original',
  [IngredientVersionRelation.TRANSFORMATION]: 'relations.transformation',
  [IngredientVersionRelation.UNAVAILABLE]: 'relations.unavailable',
  [IngredientVersionRelation.VERSION]: 'relations.version',
} as const;

function VersionThumbnail({
  ingredient,
  label,
}: {
  ingredient: IngredientVersionRowProps['ingredient'];
  label: string;
}) {
  const grant = useAuthorizedMediaPreview(ingredient);
  const previewUrl = grant
    ? isRasterPreviewUrl(grant.url)
      ? grant.url
      : undefined
    : getIngredientPreviewUrl(ingredient);
  const isVideo = isVideoIngredient(ingredient);

  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-foreground/5">
      {previewUrl ? (
        <Image
          alt={label}
          className="object-cover outline-media"
          fill
          sizes="48px"
          src={previewUrl}
          unoptimized={!canOptimizeImageSource(previewUrl)}
        />
      ) : isVideo ? (
        <Film aria-hidden="true" className="size-4 text-muted-foreground" />
      ) : (
        <ImageOff aria-hidden="true" className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

function VersionRow({
  ingredient,
  isActive,
  isBusy,
  number,
  onActivate,
  relation,
}: IngredientVersionRowProps) {
  const translate = useTranslations('pages.library.inspector.versions');
  const label = translate('number', { number });

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-2',
        isActive ? 'border-primary' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <VersionThumbnail ingredient={ingredient} label={label} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          {isActive ? (
            <Badge variant="success">{translate('active')}</Badge>
          ) : null}
          <Badge
            variant={
              relation === IngredientVersionRelation.UNAVAILABLE
                ? 'warning'
                : undefined
            }
          >
            {translate(RELATION_LABEL_KEYS[relation])}
          </Badge>
        </div>
      </div>
      {isActive ? null : (
        <Button
          ariaLabel={translate('activateAria', { number })}
          className="self-end"
          icon={<RotateCcw className="size-4" />}
          isDisabled={isBusy}
          label={translate('activate')}
          onClick={() => onActivate(ingredient.id, number)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      )}
    </li>
  );
}

/**
 * The versions of an asset, newest first, with the active one marked and a way
 * to make an older one active (#7397). The Library and Studio inspectors both
 * render it, so they cannot disagree. An asset with one version and a known
 * lineage shows nothing; an asset linked before relations were recorded shows
 * that its history is unavailable instead of a guessed one.
 */
export default function IngredientVersionHistory({
  className,
  ingredientId,
}: IngredientVersionHistoryProps) {
  const translate = useTranslations('pages.library.inspector.versions');
  const { activate, hasError, history, isBusy, isLoading } =
    useIngredientVersions(ingredientId);
  const [pending, setPending] = useState<{
    id: string;
    number: number;
  } | null>(null);

  if (isLoading) {
    return null;
  }

  if (hasError) {
    return (
      <p
        className={cn('text-xs text-muted-foreground', className)}
        role="status"
      >
        {translate('error')}
      </p>
    );
  }

  if (
    !history ||
    (history.versions.length <= 1 && history.isLineageAvailable)
  ) {
    return null;
  }

  // Pair by id: a version whose document is missing renders no row and never
  // shifts the documents of the rows after it.
  const itemsById = new Map(history.items.map((item) => [item.id, item]));
  const entries = history.versions.map((entry) => ({
    entry,
    ingredient: itemsById.get(entry.id),
  }));
  const target = pending
    ? entries.find(({ entry }) => entry.id === pending.id)
    : undefined;

  const confirm = async () => {
    if (pending) {
      await activate(pending.id);
    }
    setPending(null);
  };

  return (
    <section
      aria-label={translate('title')}
      className={cn('flex flex-col gap-2', className)}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <History aria-hidden="true" className="size-4" />
        {translate('title')}
      </h2>
      {history.isLineageAvailable ? null : (
        <Alert>{translate('unavailable')}</Alert>
      )}
      <ol aria-label={translate('listLabel')} className="flex flex-col gap-2">
        {[...entries]
          .reverse()
          .map(({ entry, ingredient }) =>
            ingredient ? (
              <VersionRow
                ingredient={ingredient}
                isActive={entry.isActive}
                isBusy={isBusy}
                key={entry.id}
                number={entry.number}
                onActivate={(id, number) => setPending({ id, number })}
                relation={entry.relation}
              />
            ) : null,
          )}
      </ol>
      <p className="text-xs text-muted-foreground">{translate('keepsNewer')}</p>
      <Dialog
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        open={Boolean(target)}
      >
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {translate('confirmTitle', { number: pending?.number ?? 0 })}
            </DialogTitle>
            <DialogDescription>{translate('confirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {target?.ingredient ? (
              <VersionThumbnail
                ingredient={target.ingredient}
                label={translate('number', { number: target.entry.number })}
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              label={translate('cancel')}
              onClick={() => setPending(null)}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <Button
              isDisabled={isBusy}
              label={translate('activate')}
              onClick={confirm}
              withWrapper={false}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
