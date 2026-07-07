'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { TagBadgeProps } from '@genfeedai/props/tags/tag-badge.props';
import { Button } from '@ui/primitives/button';
import type { MouseEvent } from 'react';
import { HiXMark } from 'react-icons/hi2';

const SIZE_CLASSES = {
  [ComponentSize.LG]: 'px-4 py-1.5 text-base',
  [ComponentSize.MD]: 'px-3 py-1 text-sm',
  [ComponentSize.SM]: 'px-2 py-0.5 text-xs',
};

export default function TagBadge({
  tag,
  onRemove,
  className,
  size = ComponentSize.SM,
  isRemovable = false,
}: TagBadgeProps) {
  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    if (onRemove && tag.id) {
      onRemove(tag.id);
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-medium transition-all cursor-pointer',
        SIZE_CLASSES[size],
        isRemovable && 'pr-1',
        className,
      )}
      style={{
        backgroundColor: tag.backgroundColor || '#6b7280',
        color: tag.textColor || '#ffffff',
      }}
      title={tag.description || tag.label}
    >
      <span className="truncate max-w-56">{tag.label}</span>
      {isRemovable && (
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={handleRemove}
          className="flex-shrink-0 hover:bg-black/10 rounded-full p-0.5 transition-colors"
          ariaLabel={`Remove ${tag.label}`}
        >
          <HiXMark
            className={
              size === ComponentSize.SM
                ? 'size-3'
                : size === ComponentSize.MD
                  ? 'size-3.5'
                  : 'size-4'
            }
          />
        </Button>
      )}
    </span>
  );
}
