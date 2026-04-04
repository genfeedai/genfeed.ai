import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IUser, IVote } from '@genfeedai/interfaces';

export class Vote extends BaseEntity implements IVote {
  public declare user: IUser;
  public declare entityModel: 'Ingredient' | 'Prompt';
  public declare entity: string;

  constructor(data: Partial<IVote> = {}) {
    super(data);
  }
}
