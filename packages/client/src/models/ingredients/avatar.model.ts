import { Ingredient } from '@genfeedai/client/models';
import type { IAvatar, IVoice } from '@genfeedai/interfaces';

export class Avatar extends Ingredient implements IAvatar {
  public declare voice?: IVoice;
  public declare duration?: number;

  constructor(data: Partial<IAvatar> = {}) {
    super(data);
  }
}
