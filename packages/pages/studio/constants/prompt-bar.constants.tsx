import { IngredientFormat } from '@genfeedai/enums';
import {
  MdOutlineCropLandscape,
  MdOutlineCropPortrait,
  MdOutlineCropSquare,
} from 'react-icons/md';

export const FORMAT_ICONS = {
  [IngredientFormat.PORTRAIT]: <MdOutlineCropPortrait />,
  [IngredientFormat.LANDSCAPE]: <MdOutlineCropLandscape />,
  [IngredientFormat.SQUARE]: <MdOutlineCropSquare />,
} as const;

export const CONTROL_CLASS =
  'inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-3 gap-2 text-sm flex-shrink-0 transition-colors';

export const ICON_BUTTON_CLASS =
  'inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 w-10 p-0 transition-colors';
