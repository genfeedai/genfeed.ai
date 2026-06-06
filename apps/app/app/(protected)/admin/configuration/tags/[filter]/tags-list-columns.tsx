'use client';

import { ComponentSize } from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';

type TagCellProps = {
  tag: ITag;
};

export function TagLabelCell({ tag }: TagCellProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="px-2 py-1 text-xs font-medium"
        style={{
          backgroundColor: tag.backgroundColor,
          color: tag.textColor,
        }}
      >
        {tag.label}
      </span>
    </div>
  );
}

export function TagDescriptionCell({ tag }: TagCellProps) {
  return (
    <span className="text-sm text-foreground/70 line-clamp-2">
      {tag.description || '-'}
    </span>
  );
}

export function TagKeyCell({ tag }: TagCellProps) {
  return <span className="font-mono text-sm">{tag.key || '-'}</span>;
}

export function TagCategoryCell({ tag }: TagCellProps) {
  return (
    <Badge variant="outline" size={ComponentSize.SM}>
      {tag.category ?? 'N/A'}
    </Badge>
  );
}

export function TagOrgCell({ tag }: TagCellProps) {
  return (
    <span className="text-sm text-foreground/70">
      {tag.organization?.label || '-'}
    </span>
  );
}

export function TagAccountCell({ tag }: TagCellProps) {
  return (
    <span className="text-sm text-foreground/70">{tag.user?.email || '-'}</span>
  );
}
