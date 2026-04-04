import { Ingredient } from '@genfeedai/client/models';
import type { IMusic } from '@genfeedai/interfaces';

export class Music extends Ingredient implements IMusic {
  public declare duration: number;
  public declare isPlaying: boolean;

  constructor(data: Partial<IMusic> = {}) {
    super(data);
  }
}
