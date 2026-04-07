'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

interface ComingSoonBadgeProps {
  className?: string;
}

export default function ComingSoonBadge({ className }: ComingSoonBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        'bg-primary/10 text-primary',
        className,
      )}
    >
      Soon
    </span>
  );
}
