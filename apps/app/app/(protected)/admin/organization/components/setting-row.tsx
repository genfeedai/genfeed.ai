'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { TableCell, TableRow } from '@ui/primitives/table';
import { Pencil } from 'lucide-react';

interface SettingRowProps {
  label: string;
  value: unknown;
  type: 'boolean' | 'number' | 'string' | 'array';
  onEdit: () => void;
}

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) {
    return 'Not set';
  }

  switch (type) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'array': {
      const arr = value as unknown[];
      if (arr.length === 0) {
        return 'None';
      }
      return `${arr.length} item${arr.length > 1 ? 's' : ''}`;
    }
    default:
      return String(value);
  }
}

export function SettingRow({ label, value, type, onEdit }: SettingRowProps) {
  return (
    <TableRow className="border-b border-border">
      <TableCell className="px-4 py-3">{label}</TableCell>
      <TableCell className="px-4 py-3">
        <span className="font-mono text-sm">{formatValue(value, type)}</span>
      </TableCell>
      <TableCell className="px-4 py-3 text-right">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          title="Edit"
        >
          <Pencil className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
