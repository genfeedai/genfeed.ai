import { Ingredient } from '@genfeedai/client/models';
import type { IAvatar, IVoice } from '@genfeedai/contracts/interfaces';

export class Avatar extends Ingredient implements IAvatar {
  declare public voice?: IVoice;
  declare public duration?: number;

  constructor(data: Partial<IAvatar> = {}) {
    super(data);
  }
}
