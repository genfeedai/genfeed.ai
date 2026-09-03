import { Ingredient } from '@genfeedai/client/models';
import type { IMusic } from '@genfeedai/contracts/interfaces';

export class Music extends Ingredient implements IMusic {
  declare public duration: number;
  declare public isPlaying: boolean;

  constructor(data: Partial<IMusic> = {}) {
    super(data);
  }
}
