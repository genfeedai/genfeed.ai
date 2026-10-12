import type { IIngredient } from '@genfeedai/contracts/interfaces';

export interface PostCardFooterProps {
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
