import type {
  ActionOrigin,
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
import type {
  IActivityPostGroup,
  IActivityPostPreview,
} from '@genfeedai/contracts/interfaces';
import type { Activity } from '@genfeedai/prisma';

export type { Activity } from '@genfeedai/prisma';

export interface ActivityDocument extends Activity {
  isRead?: boolean;
  key?: ActivityKey | string | null;
  source?: ActivitySource | string | null;
  origin?: ActionOrigin;
  actorUserId?: string | null;
  apiKeyId?: string | null;
  value?: string | null;
  /** The post behind a post row, attached to the listed page only. */
  preview?: IActivityPostPreview;
  /** Set on the one row that stands for a whole post. */
  postGroup?: IActivityPostGroup;
  entityId: string | null;
  entityModel: ActivityEntityModel | string | null;
  [key: string]: unknown;
}
