import { IngredientFormat, Status } from '@genfeedai/enums';
import {
  MdOutlineCropLandscape,
  MdOutlineCropPortrait,
  MdOutlineCropSquare,
} from 'react-icons/md';

export const status = Object.values(Status).map((s) => s.toLowerCase());

export const formatVideos = [
  {
    height: 1080,
    icon: <MdOutlineCropLandscape size={16} />,
    id: IngredientFormat.LANDSCAPE,
    isDisabled: false,
    label: '16:9',
    width: 1920,
  },
  {
    height: 1920,
    icon: <MdOutlineCropPortrait size={16} />,
    id: IngredientFormat.PORTRAIT,
    isDisabled: false,
    label: '9:16',
    width: 1080,
  },
  {
    height: 1080,
    icon: <MdOutlineCropSquare size={16} />,
    id: IngredientFormat.SQUARE,
    isDisabled: false,
    label: '1:1',
    width: 1080,
  },
];
