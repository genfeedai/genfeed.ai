import { Ingredient } from '@genfeedai/client/models';
import type { IVideo } from '@genfeedai/interfaces';

export class Video extends Ingredient implements IVideo {
  public declare duration?: number;
  public declare language?: string;
  public declare resolution?: string;
  public declare hasAudio?: boolean;

  constructor(data: Partial<IVideo> = {}) {
    super(data);
  }
}
