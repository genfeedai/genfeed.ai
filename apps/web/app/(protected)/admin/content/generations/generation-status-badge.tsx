'use client';

import { formatEnumLabel } from '@genfeedai/contracts';
import Badge from '@ui/display/badge/Badge';

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'warning'> = {
  FAILED: 'destructive',
  GENERATED: 'success',
  PROCESSING: 'warning',
};

export default function GenerationStatusBadge({ status }: { status: string }) {
  if (!status) return null;
  return (
    <Badge variant={STATUS_VARIANTS[status.toUpperCase()] ?? 'outline'}>
      {formatEnumLabel(status) ?? status}
    </Badge>
  );
}
