'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { MAX_CHARACTER_REFERENCES } from '@genfeedai/contracts/constants';
import type { CharacterReferencesDialogProps } from '@props/characters/characters-page.props';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import CharacterImage from './character-image';
import { useCharacterIngredients } from './use-character-ingredients';
import { useCharacterReferences } from './use-character-references';

export default function CharacterReferencesDialog({
  character,
  onChanged,
  onClose,
}: CharacterReferencesDialogProps) {
  const translate = useTranslations('common.settings.characters');
  const { add, isBusy, isFull, move, referenceIds, remove } =
    useCharacterReferences({ character, onChanged });
  const ingredients = useCharacterIngredients(referenceIds);

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('references.title', { name: character.label })}
          </DialogTitle>
          <DialogDescription>
            {translate('references.description')}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2">
          {referenceIds.map((ingredientId, index) => {
            const position = index + 1;
            return (
              <li
                className="flex items-center gap-3 rounded border border-border p-2"
                key={ingredientId}
              >
                <CharacterImage
                  alt={translate('references.imageAlt', {
                    name: character.label,
                    position,
                  })}
                  className="size-12 rounded object-cover outline-media"
                  ingredient={ingredients.get(ingredientId)}
                  size={48}
                />
                <span className="text-sm text-muted-foreground">
                  {position}
                </span>
                {index === 0 ? (
                  <Badge>{translate('references.primary')}</Badge>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    ariaLabel={translate('references.moveUp', { position })}
                    icon={<ArrowUp className="size-4" />}
                    isDisabled={isBusy || index === 0}
                    onClick={() => void move(index, -1)}
                    size={ButtonSize.ICON}
                    tooltip={translate('references.moveUp', { position })}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                  <Button
                    ariaLabel={translate('references.moveDown', { position })}
                    icon={<ArrowDown className="size-4" />}
                    isDisabled={isBusy || index === referenceIds.length - 1}
                    onClick={() => void move(index, 1)}
                    size={ButtonSize.ICON}
                    tooltip={translate('references.moveDown', { position })}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                  <Button
                    ariaLabel={translate('references.remove', { position })}
                    icon={<Trash2 className="size-4" />}
                    isDisabled={isBusy || referenceIds.length <= 1}
                    onClick={() => void remove(ingredientId)}
                    size={ButtonSize.ICON}
                    tooltip={
                      referenceIds.length <= 1
                        ? translate('references.removeLast')
                        : translate('references.remove', { position })
                    }
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <p
          className="text-xs text-muted-foreground"
          role={isFull ? 'alert' : undefined}
        >
          {isFull
            ? translate('references.limit', { max: MAX_CHARACTER_REFERENCES })
            : translate('references.count', {
                count: referenceIds.length,
                max: MAX_CHARACTER_REFERENCES,
              })}
        </p>

        <DialogFooter>
          <Button
            isDisabled={isBusy || isFull}
            onClick={add}
            variant={ButtonVariant.SECONDARY}
          >
            <ImagePlus /> {translate('references.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
