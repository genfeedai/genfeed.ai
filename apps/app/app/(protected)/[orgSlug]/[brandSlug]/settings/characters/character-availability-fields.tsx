'use client';

import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type { CharacterAvailabilityFieldsProps } from '@props/characters/characters-page.props';
import { Checkbox } from '@ui/primitives/checkbox';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useTranslations } from 'next-intl';

const MODES = [
  PersonaAvailabilityMode.OWNING_BRAND,
  PersonaAvailabilityMode.ALL_BRANDS,
  PersonaAvailabilityMode.SELECTED_BRANDS,
] as const;

const MODE_KEYS: Record<PersonaAvailabilityMode, string> = {
  [PersonaAvailabilityMode.ALL_BRANDS]: 'allBrands',
  [PersonaAvailabilityMode.OWNING_BRAND]: 'owningBrand',
  [PersonaAvailabilityMode.SELECTED_BRANDS]: 'selectedBrands',
};

export default function CharacterAvailabilityFields({
  brands,
  draft,
  isDisabled = false,
  onChange,
  owningBrandId,
}: CharacterAvailabilityFieldsProps) {
  const translate = useTranslations('common.settings.characters');

  const toggleBrand = (brandId: string, isChecked: boolean) => {
    const next = new Set(draft.brandIds);
    if (isChecked) {
      next.add(brandId);
    } else {
      next.delete(brandId);
    }
    onChange({ ...draft, brandIds: [...next] });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="character-availability">
      <p className="text-sm font-medium">{translate('availability.label')}</p>
      <RadioGroup
        aria-label={translate('availability.label')}
        disabled={isDisabled}
        onValueChange={(value) =>
          onChange({ ...draft, mode: value as PersonaAvailabilityMode })
        }
        value={draft.mode}
      >
        {MODES.map((mode) => (
          <label
            className="flex items-start gap-2 text-sm"
            key={mode}
            htmlFor={`character-availability-${mode}`}
          >
            <RadioGroupItem
              className="mt-0.5"
              id={`character-availability-${mode}`}
              value={mode}
            />
            <span>
              {translate(`availability.modes.${MODE_KEYS[mode]}.label`)}
              <span className="block text-xs text-muted-foreground">
                {translate(`availability.modes.${MODE_KEYS[mode]}.description`)}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {draft.mode === PersonaAvailabilityMode.SELECTED_BRANDS ? (
        <fieldset className="flex flex-col gap-2 rounded border border-border p-3">
          <legend className="sr-only">
            {translate('availability.brandsLabel')}
          </legend>
          {brands.map((brand) => {
            const isOwner = brand.id === owningBrandId;
            return (
              <Checkbox
                isChecked={isOwner || draft.brandIds.includes(brand.id)}
                isDisabled={isDisabled || isOwner}
                key={brand.id}
                label={
                  isOwner
                    ? translate('availability.owner', { brand: brand.label })
                    : brand.label
                }
                name={`character-availability-brand-${brand.id}`}
                onCheckedChange={(checked) =>
                  toggleBrand(brand.id, checked === true)
                }
              />
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
