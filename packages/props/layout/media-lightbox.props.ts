import type { IIngredient } from '@cloud/interfaces';

export interface MediaLightboxProps {
  items: IIngredient[];
  startIndex: number;
  open: boolean;
  onClose: () => void;
}
