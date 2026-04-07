'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { TagBadgeProps } from '@props/tags/tag-badge.props';
import Button from '@ui/buttons/base/Button';
import type { MouseEvent } from 'react';
import { HiXMark } from 'react-icons/hi2';

export default function TagBadge({
  tag,
  onRemove,
  className,
  size = ComponentSize.SM,
  isRemovable = false,
}: TagBadgeProps) {
  const sizeClasses = {
    [ComponentSize.LG]: 'px-4 py-1.5 text-base',
    [ComponentSize.MD]: 'px-3 py-1 text-sm',
    [ComponentSize.SM]: 'px-2 py-0.5 text-xs',
  };

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
        sizeClasses[size],
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
                ? 'w-3 h-3'
                : size === ComponentSize.MD
                  ? 'w-3.5 h-3.5'
                  : 'w-4 h-4'
            }
          />
        </Button>
      )}
    </span>
  );
}
