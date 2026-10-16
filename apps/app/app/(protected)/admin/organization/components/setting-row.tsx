import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { SettingRowProps } from '@props/admin/organization-settings.props';
import { Button } from '@ui/primitives/button';
import { TableCell, TableRow } from '@ui/primitives/table';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { Pencil } from 'lucide-react';

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
    <TableRow className="group border-b border-border">
      <TableCell className="px-4 py-3">{label}</TableCell>
      <TableCell className="px-4 py-3">
        <span className="font-mono text-sm">{formatValue(value, type)}</span>
      </TableCell>
      <TableCell className="px-4 py-3 text-right">
        {/* Row action: icon-only, shown on row hover or keyboard focus. */}
        <div
          className={cn('flex justify-end', hoverRevealClassName({ at: 'lg' }))}
        >
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={onEdit}
            ariaLabel={`Edit ${label}`}
            icon={<Pencil className="size-3.5" />}
            tooltip="Edit"
            tooltipPosition="left"
            withWrapper={false}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
