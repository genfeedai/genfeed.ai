'use client';

import Badge from '@ui/display/badge/Badge';

type StatusVariant = 'success' | 'error' | 'warning' | 'info';

type Props = {
  status: string;
  statusVariants: Record<string, StatusVariant>;
};

export default function ActivityStatusCell({ status, statusVariants }: Props) {
  return <Badge variant={statusVariants[status] || 'ghost'}>{status}</Badge>;
}
