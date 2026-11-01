'use client';

import { Badge } from '@ui/primitives/badge';

/** Activity statuses that have no canonical badge token of their own. */
const STATUS_ALIASES: Record<string, string> = {
  processing: 'running',
};

type Props = {
  status: string;
};

/** Same uppercase status pill as the tasks list: tone, icon, and label. */
export default function ActivityStatusCell({ status }: Props) {
  return <Badge status={STATUS_ALIASES[status] ?? status} />;
}
