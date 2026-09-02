import type {
  ActionOrigin,
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
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
  entityId: string | null;
  entityModel: ActivityEntityModel | string | null;
  [key: string]: unknown;
}
