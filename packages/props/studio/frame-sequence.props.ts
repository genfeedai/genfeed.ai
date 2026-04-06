import type { IngredientFormat } from '@genfeedai/enums';
import type { IImage } from '@genfeedai/interfaces';

export interface FrameSequenceSelectorProps {
  frames: IImage[];
  format: IngredientFormat;
  onFramesChange: (frames: IImage[]) => void;
  onFrameReorder?: (fromIndex: number, toIndex: number) => void;
}
