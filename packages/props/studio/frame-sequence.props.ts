import type { IImage } from '@cloud/interfaces';
import type { IngredientFormat } from '@genfeedai/enums';

export interface FrameSequenceSelectorProps {
  frames: IImage[];
  format: IngredientFormat;
  onFramesChange: (frames: IImage[]) => void;
  onFrameReorder?: (fromIndex: number, toIndex: number) => void;
}
