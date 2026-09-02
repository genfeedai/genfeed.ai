import { IngredientFormat, Status } from '@genfeedai/contracts';
import { RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';

export const status = Object.values(Status).map((s) => s.toLowerCase());

export const formatVideos = [
  {
    height: 1080,
    icon: <RectangleHorizontal size={16} />,
    id: IngredientFormat.LANDSCAPE,
    isDisabled: false,
    label: '16:9',
    width: 1920,
  },
  {
    height: 1920,
    icon: <RectangleVertical size={16} />,
    id: IngredientFormat.PORTRAIT,
    isDisabled: false,
    label: '9:16',
    width: 1080,
  },
  {
    height: 1080,
    icon: <Square size={16} />,
    id: IngredientFormat.SQUARE,
    isDisabled: false,
    label: '1:1',
    width: 1080,
  },
];
