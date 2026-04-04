import type { IIngredient } from '@genfeedai/interfaces';

export interface MediaLightboxProps {
  items: IIngredient[];
  startIndex: number;
  open: boolean;
  onClose: () => void;
}
