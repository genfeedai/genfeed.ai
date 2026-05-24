import type {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/enums';
import type { Activity } from '@genfeedai/prisma';

export type { Activity } from '@genfeedai/prisma';

export interface ActivityDocument extends Activity {
  _id: string;
  brand?: string | null;
  isRead?: boolean;
  key?: ActivityKey | string | null;
  organization?: string | null;
  source?: ActivitySource | string | null;
  user?: string | null;
  value?: string | null;
  entityId: string | null;
  entityModel: ActivityEntityModel | string | null;
  [key: string]: unknown;
}
