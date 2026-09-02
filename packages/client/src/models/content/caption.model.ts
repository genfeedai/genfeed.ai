import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { CaptionFormat } from '@genfeedai/contracts';
import type {
  ICaption,
  IIngredient,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Caption extends BaseEntity implements ICaption {
  public declare ingredient: IIngredient | string;
  public declare user: IUser | string;
  public declare language: string;
  public declare content?: string;
  public declare format: CaptionFormat;

  constructor(data: Partial<ICaption> = {}) {
    super(data);
  }
}
