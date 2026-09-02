import type { PageScope } from '@genfeedai/contracts';

export interface ContentProps {
  scope:
    | PageScope.SUPERADMIN
    | PageScope.ORGANIZATION
    | PageScope.BRAND
    | PageScope.ANALYTICS
    | PageScope.USER
    | PageScope.PUBLISHING;
}
