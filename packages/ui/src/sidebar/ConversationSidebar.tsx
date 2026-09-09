import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn';
import type { ChangeEvent, ReactNode } from 'react';

import Searchbar from '../primitives/searchbar';

export interface ConversationSidebarFilter<TValue extends string> {
  count?: number;
  label: string;
  value: TValue;
}

interface ConversationSidebarSearchProps {
  action?: ReactNode;
  ariaLabel: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

export function ConversationSidebarSearch({
  action,
  ariaLabel,
  onChange,
  placeholder,
  value,
}: ConversationSidebarSearchProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden px-3 pb-2">
      <Searchbar
        ariaLabel={ariaLabel}
        className="min-w-0 flex-1"
        inputClassName="rounded-md border-border bg-background-secondary text-xs placeholder:text-foreground/28"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        size={ComponentSize.SM}
        value={value}
      />
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface ConversationSidebarSectionProps {
  actions?: ReactNode;
  children: ReactNode;
  count?: number;
  label: string;
}

export function ConversationSidebarSection({
  actions,
  children,
  count,
  label,
}: ConversationSidebarSectionProps) {
  return (
    <section aria-label={label}>
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-3 text-2xs font-bold uppercase tracking-[0.15em] text-foreground/30">
        <span>{label}</span>
        {typeof count === 'number' ? (
          <span className="font-mono font-medium tracking-normal text-foreground/22">
            {count}
          </span>
        ) : null}
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </div>
      <div className="flex flex-col gap-px px-2">{children}</div>
    </section>
  );
}

export function conversationSidebarRowClassName(options: {
  isMuted?: boolean;
  isSelected?: boolean;
}) {
  return cn(
    'group relative w-full rounded-md border border-transparent text-left transition-colors',
    options.isSelected
      ? 'border-border bg-foreground/[0.07]'
      : 'hover:bg-foreground/[0.045]',
    options.isMuted && 'opacity-55',
  );
}
