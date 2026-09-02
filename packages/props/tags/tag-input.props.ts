import type { ITag } from '@genfeedai/contracts/interfaces';

export interface TagInputProps {
  tags: ITag[];
  onAddTag: (label: string) => Promise<void>;
  onRemoveTag: (tagId: string) => void;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
}
