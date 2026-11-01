import { PageScope } from '@genfeedai/contracts';
import type { ISound } from '@genfeedai/contracts/interfaces';
import { Badge } from '@ui/primitives/badge';
import { Checkbox } from '@ui/primitives/checkbox';
import type {
  SoundCellProps,
  SoundCheckboxCellProps,
} from '@/features/admin/props/sounds.props';

export function SoundCategoryCell({ sound }: SoundCellProps) {
  return (
    <Badge variant="outline">{(sound as ISound).category ?? 'Undefined'}</Badge>
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
