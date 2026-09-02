import type { IngredientFormat } from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';

export interface FrameSequenceSelectorProps {
  frames: IImage[];
  format: IngredientFormat;
  onFramesChange: (frames: IImage[]) => void;
  onFrameReorder?: (fromIndex: number, toIndex: number) => void;
}
