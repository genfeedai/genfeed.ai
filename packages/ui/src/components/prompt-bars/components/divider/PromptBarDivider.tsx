import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';

interface PromptBarDividerProps {
  className?: string;
}

export default function PromptBarDivider({ className }: PromptBarDividerProps) {
  return (
    <div
      className={cn('h-6 w-px bg-muted flex-shrink-0', className)}
      aria-hidden="true"
    />
  );
}
