'use client';

import { ButtonVariant, PersonaAvailabilityMode } from '@genfeedai/contracts';
import type { CharacterOwnershipFieldsProps } from '@props/characters/characters-page.props';
import { Button } from '@ui/primitives/button';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Moves a shared character's owning brand to another brand it is available
 * to, so the previous owner can be deleted (#6040).
 */
export default function CharacterOwnershipFields({
  brands,
  character,
  isMoving,
  onMove,
}: CharacterOwnershipFieldsProps) {
  const translate = useTranslations('common.settings.characters');
  const [targetBrandId, setTargetBrandId] = useState('');

  const availableBrandIds = new Set(character.availableBrandIds ?? []);
  const candidates = brands.filter(
    (brand) =>
      brand.id !== character.owningBrandId &&
      (character.availabilityMode === PersonaAvailabilityMode.ALL_BRANDS ||
        availableBrandIds.has(brand.id)),
  );

  if (candidates.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="character-ownership">
      <div>
        <p className="text-sm font-medium">{translate('ownership.title')}</p>
        <p className="text-xs text-muted-foreground">
          {translate('ownership.description', {
            brand: character.owningBrandName ?? '',
          })}
        </p>
      </div>
      <RadioGroup
        aria-label={translate('ownership.title')}
        disabled={isMoving}
        onValueChange={setTargetBrandId}
        value={targetBrandId}
      >
        {candidates.map((brand) => (
          <div className="flex items-center gap-2 text-sm" key={brand.id}>
            <RadioGroupItem
              id={`character-ownership-${brand.id}`}
              value={brand.id}
            />
            <span>{brand.label}</span>
          </div>
        ))}
      </RadioGroup>
      <div className="flex justify-end">
        <Button
          data-testid="move-ownership"
          isDisabled={isMoving || targetBrandId === ''}
          isLoading={isMoving}
          label={translate('ownership.move')}
          onClick={() => {
            void onMove(targetBrandId);
          }}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </div>
  );
}
