import { Ingredient } from '@genfeedai/client/models';
import type { IGIF } from '@genfeedai/interfaces';

export class GIF extends Ingredient implements IGIF {
  public declare duration?: number;
  public declare isLooping?: boolean;

  constructor(data: Partial<IGIF> = {}) {
    super(data);
  }
}
