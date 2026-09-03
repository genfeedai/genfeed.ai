import { Ingredient } from '@genfeedai/client/models';
import type { ISound } from '@genfeedai/contracts/interfaces';

export class Sound extends Ingredient implements ISound {
  declare public duration?: number;
  declare public isPlaying?: boolean;

  constructor(data: Partial<ISound> = {}) {
    super(data);
  }
}
