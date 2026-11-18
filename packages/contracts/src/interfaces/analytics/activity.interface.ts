import type { ActionOrigin, ActivityStatus } from '../..';
import type { IBaseEntity, IIngredient, IPost, IUser } from '../index';

/** The post a breakout activity is about, shaped for a preview card. */
export interface IActivityPostPreview {
  kind: 'post';
  platform: string;
  text: string;
  /** Account handle without the leading "@". */
  authorHandle?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  /** The post on its network, when one is known. */
  url?: string;
  publishedAt?: string;
  /** How many times above the account's usual performance the post ran. */
  ratio?: number;
  metrics?: {
    likes?: number;
    replies?: number;
    reposts?: number;
    views?: number;
  };
  /**
   * Query that opens the remix for this post on the Posts analytics page, for
   * example `remixPostId=…`. Absent when the member has nothing to remix.
   */
  remixQuery?: string;
}

export interface IActivity extends IBaseEntity {
  user: IUser;
  userId?: string | null;
  organizationId?: string | null;
  /** Names for the ids above, resolved by the API so the UI never shows an id. */
  organizationLabel?: string;
  brandLabel?: string;
  userLabel?: string;
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
  /** What the activity is about, when it is a post the member can look at. */
  preview?: IActivityPostPreview;

  label?: string;
}

export interface IActivityPopulated extends IActivity {
  post?: IPost;
  ingredient?: IIngredient;
}
