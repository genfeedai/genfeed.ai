import { Ingredient } from '@genfeedai/client/models';
import type { IVideo } from '@genfeedai/contracts/interfaces';

export class Video extends Ingredient implements IVideo {
  declare public duration?: number;
  declare public language?: string;
  declare public resolution?: string;
  declare public hasAudio?: boolean;

  constructor(data: Partial<IVideo> = {}) {
    super(data);
  }
}
