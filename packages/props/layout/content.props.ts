import type { PageScope } from '@genfeedai/enums';

export interface ContentProps {
  scope:
    | PageScope.SUPERADMIN
    | PageScope.ORGANIZATION
    | PageScope.BRAND
    | PageScope.ANALYTICS
    | PageScope.USER
    | PageScope.PUBLISHER;
}
