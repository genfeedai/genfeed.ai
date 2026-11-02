import { IngredientFormat } from '@genfeedai/contracts';
import { Monitor, Smartphone, Square } from 'lucide-react';
import type { EditorStarter } from '@/features/studio/props/editor-workspace.props';

/** The canvas sizes an Editor project can be cut for. */
export const EDITOR_FORMAT_OPTIONS = [
  {
    height: 1080,
    label: '16:9',
    value: IngredientFormat.LANDSCAPE,
    width: 1920,
  },
  {
    height: 1920,
    label: '9:16',
    value: IngredientFormat.PORTRAIT,
    width: 1080,
  },
  { height: 1080, label: '1:1', value: IngredientFormat.SQUARE, width: 1080 },
] as const;

/** The starter cards on the New pane: a name and a canvas to begin from. */
export const EDITOR_STARTERS: readonly EditorStarter[] = [
  { format: IngredientFormat.LANDSCAPE, icon: Monitor, id: 'landscape' },
  { format: IngredientFormat.PORTRAIT, icon: Smartphone, id: 'portrait' },
  { format: IngredientFormat.SQUARE, icon: Square, id: 'square' },
];
