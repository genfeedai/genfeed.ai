import { ActivityStatus } from '@genfeedai/enums';
import type { IBaseEntity, IIngredient, IPost, IUser } from '../index';

export interface IActivity extends IBaseEntity {
  user: IUser;
  key: string;

  value: string;
  status?: ActivityStatus;
  source: string;
  isRead: boolean;

  label?: string;
}

export interface IActivityPopulated extends IActivity {
  post?: IPost;
  ingredient?: IIngredient;
}
