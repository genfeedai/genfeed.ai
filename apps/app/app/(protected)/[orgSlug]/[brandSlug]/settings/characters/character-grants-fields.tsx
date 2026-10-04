'use client';

import { ButtonVariant, PersonaAvailabilityMode } from '@genfeedai/contracts';
import type { BrandCharacterListItem } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useCharacterGrants } from './use-character-grants';

/**
 * Lets an owner or admin who also administers another organization grant the
 * character to it for use only, and revoke active grants (#6037).
 */
export default function CharacterGrantsFields({
  character,
}: {
  character: BrandCharacterListItem;
}) {
  const translate = useTranslations('common.settings.characters.grants');
  const { grant, grants, isLoading, isWorking, organizations, revoke } =
    useCharacterGrants(character);
  const [organizationId, setOrganizationId] = useState('');
  const [mode, setMode] = useState<PersonaAvailabilityMode>(
    PersonaAvailabilityMode.ALL_BRANDS,
  );
  const [brandIds, setBrandIds] = useState<string[]>([]);

  const selected = organizations.find((item) => item.id === organizationId);
  const isSelectedMode = mode === PersonaAvailabilityMode.SELECTED_BRANDS;
  const canSubmit =
    Boolean(selected) && (!isSelectedMode || brandIds.length > 0);

  if (!isLoading && organizations.length === 0 && grants.length === 0) {
    return null;
  }

  const toggleBrand = (brandId: string, isChecked: boolean) =>
    setBrandIds((current) =>
      isChecked
        ? [...new Set([...current, brandId])]
        : current.filter((id) => id !== brandId),
    );

  return (
    <div className="flex flex-col gap-3" data-testid="character-grants">
      <div>
        <p className="text-sm font-medium">{translate('title')}</p>
        <p className="text-xs text-muted-foreground">
          {translate('description')}
        </p>
      </div>

      {grants.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium">{translate('grantedTo')}</p>
          <ul className="flex flex-col gap-1 text-sm" data-testid="grants-list">
            {grants.map((item) => (
              <li
                className="flex items-center justify-between gap-2"
                key={item.id}
              >
                <span>{item.recipientOrganizationName}</span>
                <Button
                  aria-label={translate('revokeFor', {
                    name: item.recipientOrganizationName,
                  })}
                  isDisabled={isWorking}
                  label={translate('revoke')}
                  onClick={() => {
                    void revoke(item.id);
                  }}
                  variant={ButtonVariant.GHOST}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {organizations.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium">{translate('organization')}</p>
          <RadioGroup
            aria-label={translate('organization')}
            disabled={isWorking}
            onValueChange={(value) => {
              setOrganizationId(value);
              setBrandIds([]);
            }}
            value={organizationId}
          >
            {organizations.map((item) => (
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor={`character-grant-org-${item.id}`}
                key={item.id}
              >
                <RadioGroupItem
                  id={`character-grant-org-${item.id}`}
                  value={item.id}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </RadioGroup>

          {selected ? (
            <>
              <RadioGroup
                aria-label={translate('brandsLabel')}
                disabled={isWorking}
                onValueChange={(value) =>
                  setMode(value as PersonaAvailabilityMode)
                }
                value={mode}
              >
                {[
                  PersonaAvailabilityMode.ALL_BRANDS,
                  PersonaAvailabilityMode.SELECTED_BRANDS,
                ].map((value) => (
                  <label
                    className="flex items-center gap-2 text-sm"
                    htmlFor={`character-grant-mode-${value}`}
                    key={value}
                  >
                    <RadioGroupItem
                      id={`character-grant-mode-${value}`}
                      value={value}
                    />
                    <span>
                      {translate(
                        value === PersonaAvailabilityMode.ALL_BRANDS
                          ? 'allBrands'
                          : 'selectedBrands',
                      )}
                    </span>
                  </label>
                ))}
              </RadioGroup>
              {isSelectedMode ? (
                <fieldset className="flex flex-col gap-2 rounded border border-border p-3">
                  <legend className="sr-only">
                    {translate('brandsLabel')}
                  </legend>
                  {selected.brands.map((brand) => (
                    <Checkbox
                      isChecked={brandIds.includes(brand.id)}
                      isDisabled={isWorking}
                      key={brand.id}
                      label={brand.label}
                      name={`character-grant-brand-${brand.id}`}
                      onCheckedChange={(checked) =>
                        toggleBrand(brand.id, checked === true)
                      }
                    />
                  ))}
                </fieldset>
              ) : null}
            </>
          ) : null}

          <div className="flex justify-end">
            <Button
              data-testid="grant-character"
              isDisabled={isWorking || !canSubmit}
              isLoading={isWorking}
              label={translate('grant')}
              onClick={() => {
                void grant({
                  brandIds: isSelectedMode ? brandIds : [],
                  mode,
                  recipientOrganizationId: organizationId,
                });
              }}
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
