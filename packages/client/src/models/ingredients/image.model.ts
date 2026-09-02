import { Ingredient } from '@genfeedai/client/models';
import type { IImage } from '@genfeedai/contracts/interfaces';

export class Image extends Ingredient implements IImage {
  public declare colorSpace?: string;
  public declare hasAlpha?: boolean;

  constructor(data: Partial<IImage> = {}) {
    super(data);
  }
}
