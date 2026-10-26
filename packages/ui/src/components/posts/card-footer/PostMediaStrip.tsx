'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers';
import IngredientThumbnail from '@ui/ingredients/ingredient-thumbnail/IngredientThumbnail';
import { Button } from '@ui/primitives/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PostMediaStripProps {
  media: IIngredient[];
  onChange: (media: IIngredient[]) => void;
  isDisabled?: boolean;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.min(to, next.length), 0, moved);
  return next;
}

/**
 * The attached media of a post in the order it publishes: drag a tile to
 * reorder it, or use the arrows and remove button on it.
 */
export default function PostMediaStrip({
  media,
  onChange,
  isDisabled = false,
}: PostMediaStripProps) {
  const translate = useTranslations('ui.postCardFooter');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const endDrag = () => {
    setDraggedIndex(null);
    setOverIndex(null);
  };

  return (
    <ul
      aria-label={translate('mediaStrip')}
      className="flex flex-wrap gap-2 px-3 pt-3"
    >
      {media.map((item, index) => (
        <li
          key={item.id}
          className={cn(
            'group relative size-16 overflow-hidden rounded-md border border-border bg-background-tertiary',
            !isDisabled && 'cursor-grab',
            draggedIndex === index && 'opacity-50',
            overIndex === index &&
              draggedIndex !== index &&
              'ring-2 ring-primary',
          )}
          draggable={!isDisabled}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            setDraggedIndex(index);
          }}
          onDragOver={(event) => {
            if (draggedIndex === null) return;
            event.preventDefault();
            setOverIndex(index);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedIndex !== null) {
              onChange(moveItem(media, draggedIndex, index));
            }
            endDrag();
          }}
          onDragEnd={endDrag}
        >
          <IngredientThumbnail
            alt={translate('mediaItem', { position: index + 1 })}
            className="object-cover"
            ingredient={item}
            sizes="64px"
          />

          <span className="absolute bottom-0.5 left-0.5 rounded-sm bg-black/60 px-1 text-2xs leading-4 text-white">
            {index + 1}
          </span>

          {!isDisabled && (
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <div className="flex">
                <Button
                  ariaLabel={translate('moveEarlier', { position: index + 1 })}
                  className="size-5 bg-black/60 text-white hover:bg-black/80"
                  icon={<ChevronLeft className="size-3" />}
                  isDisabled={index === 0}
                  onClick={() => onChange(moveItem(media, index, index - 1))}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                />
                <Button
                  ariaLabel={translate('moveLater', { position: index + 1 })}
                  className="size-5 bg-black/60 text-white hover:bg-black/80"
                  icon={<ChevronRight className="size-3" />}
                  isDisabled={index === media.length - 1}
                  onClick={() => onChange(moveItem(media, index, index + 1))}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                />
              </div>
              <Button
                ariaLabel={translate('removeMedia', { position: index + 1 })}
                className="size-5 bg-black/60 text-white hover:bg-black/80"
                icon={<X className="size-3" />}
                onClick={() =>
                  onChange(media.filter((entry) => entry.id !== item.id))
                }
                size={ButtonSize.ICON}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
