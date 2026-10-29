'use client';

import TagsPage from '@app/(protected)/admin/configuration/tags/[filter]/tags-page';
import { PageScope } from '@genfeedai/contracts';

/** The bare tags route is the All view; the other views are `/tags/:filter`. */
export default function FilteredListRoute() {
  return <TagsPage filter="all" scope={PageScope.SUPERADMIN} />;
}
