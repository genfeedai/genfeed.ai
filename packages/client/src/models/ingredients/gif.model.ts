import { Ingredient } from '@genfeedai/client/models';
import type { IGIF } from '@genfeedai/contracts/interfaces';

export class GIF extends Ingredient implements IGIF {
  declare public duration?: number;
  declare public isLooping?: boolean;

  constructor(data: Partial<IGIF> = {}) {
    super(data);
  }
}
