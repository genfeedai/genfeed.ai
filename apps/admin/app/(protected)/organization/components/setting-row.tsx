'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiPencil } from 'react-icons/hi2';

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
    <tr className="border-b border-white/[0.08]">
      <td className="px-4 py-3">{label}</td>
      <td className="px-4 py-3">
        <span className="font-mono text-sm">{formatValue(value, type)}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          title="Edit"
        >
          <HiPencil className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
