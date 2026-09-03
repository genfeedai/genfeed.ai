import { Ingredient } from '@genfeedai/client/models';
import type { IImage } from '@genfeedai/contracts/interfaces';

export class Image extends Ingredient implements IImage {
  declare public colorSpace?: string;
  declare public hasAlpha?: boolean;

  constructor(data: Partial<IImage> = {}) {
    super(data);
  }
}
