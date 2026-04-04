import type { IBaseEntity, IUser } from '../index';

export interface IVote extends IBaseEntity {
  user: IUser;

  entityModel: 'Ingredient' | 'Prompt';
  entity: string;
}
