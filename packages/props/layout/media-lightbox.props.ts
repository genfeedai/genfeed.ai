import type { IIngredient } from '@genfeedai/contracts/interfaces';

export interface MediaLightboxProps {
  items: IIngredient[];
  startIndex: number;
  open: boolean;
  onClose: () => void;
}
