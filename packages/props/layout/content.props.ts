import type { PageScope } from '@ui-constants/misc.constant';

export interface ContentProps {
  scope:
    | PageScope.SUPERADMIN
    | PageScope.ORGANIZATION
    | PageScope.BRAND
    | PageScope.ANALYTICS
    | PageScope.USER
    | PageScope.PUBLISHER;
}
