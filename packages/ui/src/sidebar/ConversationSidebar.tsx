import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn';
import { Search } from 'lucide-react';
import type { ChangeEvent, ReactNode } from 'react';

import { Button } from '../primitives/button';
import { Input } from '../primitives/input';

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
    <div className="flex items-center gap-1.5 px-3 pb-2">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/36"
        />
        <Input
          aria-label={ariaLabel}
          className="h-8 w-full rounded-md border-border bg-background-secondary pl-8 pr-2.5 text-xs placeholder:text-foreground/28"
          placeholder={placeholder}
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onChange(event.target.value);
          }}
        />
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface ConversationSidebarFiltersProps<TValue extends string> {
  ariaLabel: string;
  filters: readonly ConversationSidebarFilter<TValue>[];
  onChange: (value: TValue) => void;
  value: TValue;
}

export function ConversationSidebarFilters<TValue extends string>({
  ariaLabel,
  filters,
  onChange,
  value,
}: ConversationSidebarFiltersProps<TValue>) {
  return (
    <fieldset className="flex min-w-0 shrink-0 gap-1 overflow-x-auto border-0 px-3 pb-2 scrollbar-none">
      <legend className="sr-only">{ariaLabel}</legend>
      {filters.map((filter) => {
        const isActive = filter.value === value;

        return (
          <Button
            aria-pressed={isActive}
            className={cn(
              'h-7 shrink-0 gap-1.5 rounded-md border px-2.5 text-2xs font-medium transition-colors',
              isActive
                ? 'border-border-strong bg-foreground/[0.08] text-foreground'
                : 'border-border bg-transparent text-foreground/48 hover:bg-foreground/[0.04] hover:text-foreground/78',
            )}
            key={filter.value}
            size={ButtonSize.SM}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => {
              onChange(filter.value);
            }}
          >
            {filter.label}
            {typeof filter.count === 'number' && filter.count > 0 ? (
              <span
                className={cn(
                  'tabular-nums text-2xs',
                  isActive ? 'text-foreground/62' : 'text-foreground/30',
                )}
              >
                {filter.count}
              </span>
            ) : null}
          </Button>
        );
      })}
    </fieldset>
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
      <div className="flex h-7 items-center gap-2 px-3 text-2xs font-bold uppercase tracking-[0.15em] text-foreground/30">
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
