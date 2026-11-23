import type { FormDropdownOption } from '@genfeedai/contracts/interfaces';
import { Avatar } from '@ui/primitives/avatar';
import type { OptionSelectOption } from '@ui/primitives/option-select';

/**
 * The prompt bar's pickers hand over `FormDropdownOption` rows (key, label,
 * thumbnail). `OptionSelect` takes the same rows with the picture drawn as an
 * icon, so a person is told apart by face and by name.
 */
export function toOptionSelectOptions(
  options: readonly FormDropdownOption[],
  getDefaultLabel: (label: string) => string,
): OptionSelectOption[] {
  return options.map((option) => ({
    icon:
      option.icon ??
      (option.thumbnailUrl ? (
        <Avatar name={option.label} size="xs" src={option.thumbnailUrl} />
      ) : undefined),
    isLiteral: true,
    label: option.isPlatformDefault
      ? getDefaultLabel(option.label)
      : option.label,
    value: String(option.key),
  }));
}
