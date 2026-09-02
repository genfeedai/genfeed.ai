import type { ComponentSize } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';

export interface TagBadgeProps {
  tag: ITag;
  onRemove?: (tagId: string) => void;
  className?: string;
  size?: ComponentSize.SM | ComponentSize.MD | ComponentSize.LG;
  isRemovable?: boolean;
}
