import { Ingredient } from '@genfeedai/client/models';
import type { ISound } from '@genfeedai/contracts/interfaces';

export class Sound extends Ingredient implements ISound {
  public declare duration?: number;
  public declare isPlaying?: boolean;

  constructor(data: Partial<ISound> = {}) {
    super(data);
  }
}
