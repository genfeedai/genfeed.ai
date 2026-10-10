'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { CharacterAvailabilityDialogProps } from '@props/characters/characters-page.props';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';

import CharacterAvailabilityFields from './character-availability-fields';
import CharacterGrantsFields from './character-grants-fields';
import CharacterOwnershipFields from './character-ownership-fields';

export default function CharacterAvailabilityDialog({
  brands,
  controls,
}: CharacterAvailabilityDialogProps) {
  const translate = useTranslations('common.settings.characters');
  const { character } = controls;

  return (
    <Dialog
      open={character !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          controls.close();
        }
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('availability.title')}</DialogTitle>
          <DialogDescription>
            {translate('availability.description', {
              name: character?.label ?? '',
            })}
          </DialogDescription>
        </DialogHeader>

        {character ? (
          <CharacterAvailabilityFields
            brands={brands}
            draft={controls.draft}
            isDisabled={controls.isSaving}
            onChange={controls.setDraft}
            owningBrandId={character.owningBrandId ?? ''}
          />
        ) : null}

        {character && !character.isGranted ? (
          <CharacterGrantsFields character={character} />
        ) : null}

        {character?.isShared ? (
          <CharacterOwnershipFields
            brands={brands}
            character={character}
            isMoving={controls.isMoving}
            onMove={controls.moveOwnership}
          />
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            data-testid="cancel-availability"
            isDisabled={controls.isSaving}
            label={translate('availability.cancel')}
            onClick={controls.close}
            variant={ButtonVariant.GHOST}
          />
          <Button
            data-testid="save-availability"
            isDisabled={controls.isSaving}
            isLoading={controls.isSaving}
            label={translate('availability.save')}
            onClick={() => {
              void controls.save();
            }}
            variant={ButtonVariant.DEFAULT}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
