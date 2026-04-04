import type { ITag } from '@genfeedai/interfaces';
import type { ComponentSize } from '@genfeedai/enums';

export interface TagBadgeProps {
  tag: ITag;
  onRemove?: (tagId: string) => void;
  className?: string;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  isRemovable?: boolean;
}
