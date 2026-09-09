import type { ActionOrigin, ActivityStatus } from '../..';
import type { IBaseEntity, IIngredient, IPost, IUser } from '../index';

export interface IActivity extends IBaseEntity {
  user: IUser;
  userId?: string | null;
  organizationId?: string | null;
  brandId?: string | null;
  entityId?: string | null;
  entityModel?: string | null;
  key: string;

  value: string;
  status?: ActivityStatus;
  source: string;
  origin: ActionOrigin;
  actorUserId?: string | null;
  apiKeyId?: string | null;
  isRead: boolean;

  label?: string;
}

export interface IActivityPopulated extends IActivity {
  post?: IPost;
  ingredient?: IIngredient;
}
