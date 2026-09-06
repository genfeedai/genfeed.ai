import { ComponentSize, PageScope } from '@genfeedai/contracts';
import type { ISound } from '@genfeedai/contracts/interfaces';
import type {
  SoundCellProps,
  SoundCheckboxCellProps,
} from '@props/admin/sounds.props';
import Badge from '@ui/display/badge/Badge';
import { Checkbox } from '@ui/primitives/checkbox';

export function SoundCategoryCell({ sound }: SoundCellProps) {
  return (
    <Badge variant="outline" size={ComponentSize.SM} className="uppercase">
      {(sound as ISound).category ?? 'Undefined'}
    </Badge>
  );
}

export function SoundActiveCell({
  sound,
  updatingIds,
  scope,
  onChange,
}: SoundCheckboxCellProps) {
  return (
    <Checkbox
      name={`isActive-${sound.id}`}
      isChecked={sound.isActive}
      isDisabled={updatingIds.has(sound.id) || scope !== PageScope.SUPERADMIN}
      onChange={() => onChange(sound)}
    />
  );
}

export function SoundDefaultCell({
  sound,
  updatingIds,
  scope,
  onChange,
}: SoundCheckboxCellProps) {
  return (
    <Checkbox
      name={`isDefault-${sound.id}`}
      isChecked={sound.isDefault}
      isDisabled={
        !sound.isActive ||
        updatingIds.has(sound.id) ||
        scope !== PageScope.SUPERADMIN
      }
      onChange={() => onChange(sound)}
    />
  );
}
