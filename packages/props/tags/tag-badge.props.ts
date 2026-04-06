import type { ComponentSize } from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';

export interface TagBadgeProps {
  tag: ITag;
  onRemove?: (tagId: string) => void;
  className?: string;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  isRemovable?: boolean;
}
