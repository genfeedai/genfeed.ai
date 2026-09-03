import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { CaptionFormat } from '@genfeedai/contracts';
import type {
  ICaption,
  IIngredient,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Caption extends BaseEntity implements ICaption {
  declare public ingredient: IIngredient | string;
  declare public user: IUser | string;
  declare public language: string;
  declare public content?: string;
  declare public format: CaptionFormat;

  constructor(data: Partial<ICaption> = {}) {
    super(data);
  }
}
