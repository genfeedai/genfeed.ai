import type { IIngredient } from '@genfeedai/contracts/interfaces';

export interface PostCardFooterProps {
  /** Receives the media as it should be attached after a reorder or removal. */
  onChangeMedia?: (media: IIngredient[]) => void;
  onSelectMedia?: () => void;
  onGenerateIllustration?: () => void;
  selectedMedia?: IIngredient[];
  isSavingMedia?: boolean;
  onSave?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  onDelete?: () => void;
  showDelete?: boolean;
  className?: string;
}
