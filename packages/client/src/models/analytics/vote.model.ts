import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IUser, IVote } from '@genfeedai/contracts/interfaces';

export class Vote extends BaseEntity implements IVote {
  declare public user: IUser;
  declare public entityModel: 'Ingredient' | 'Prompt';
  declare public entity: string;

  constructor(data: Partial<IVote> = {}) {
    super(data);
  }
}
