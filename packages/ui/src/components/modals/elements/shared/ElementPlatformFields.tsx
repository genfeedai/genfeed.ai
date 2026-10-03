import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';

interface ElementPlatformFieldsProps {
  isActive: boolean;
  isDisabled?: boolean;
  onIsActiveChange: (isActive: boolean) => void;
  onSortOrderChange: (sortOrder: number) => void;
  sortOrder: number;
}

/** Active toggle and curated order shared by every element modal (#6038). */
export default function ElementPlatformFields({
  isActive,
  isDisabled = false,
  onIsActiveChange,
  onSortOrderChange,
  sortOrder,
}: ElementPlatformFieldsProps) {
  const translate = useTranslations('ui.elementPlatformFields');

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Checkbox
          name="isActive"
          label={translate('activeLabel')}
          isChecked={isActive}
          onChange={(event) => onIsActiveChange(event.target.checked)}
          isDisabled={isDisabled}
        />
        <p className="text-xs text-foreground/70">{translate('activeHelp')}</p>
      </div>

      <FormControl label={translate('sortOrderLabel')}>
        <Input
          type="number"
          name="sortOrder"
          min={0}
          value={sortOrder}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            onSortOrderChange(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
          }}
          isDisabled={isDisabled}
        />
        <p className="text-xs text-foreground/70 mt-1">
          {translate('sortOrderHelp')}
        </p>
      </FormControl>
    </>
  );
}
