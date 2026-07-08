'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  SwitcherDropdownItem,
  SwitcherDropdownProps,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import Image from 'next/image';
import type React from 'react';
import { cloneElement, isValidElement, useCallback, useState } from 'react';
import { HiCheck, HiPlus } from 'react-icons/hi2';
// Relative import: @ui/lib/* isn't aliased (the @ui test alias maps to
// src/components), and accordion.tsx sources this same hook the same way.
import { useMounted } from '../../../lib/hooks';

export default function SwitcherDropdown({
  items,
  renderTrigger,
  onSelect,
  onOpenChange,
  isDisabled = false,
  footerAction,
  footerActions,
  isLoading = items.length === 0,
  emptyMessage = 'No results',
  minWidth = 220,
  className,
  hasSearch = false,
  searchPlaceholder = 'Search…',
}: SwitcherDropdownProps) {
  // Client-only mount guard: the Popover renders after hydration so the
  // trigger's SSR markup matches. Sourced from the shared hook so the
  // mount-effect state lives in one place instead of flashing inline here.
  const isMounted = useMounted();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const resolvedFooterActions =
    footerActions && footerActions.length > 0
      ? footerActions
      : footerAction
        ? [footerAction]
        : [];

  // cmdk owns keyboard nav, type-ahead highlight, and listbox ARIA, but we
  // keep filtering/ordering explicit (shouldFilter={false}) to preserve the
  // existing substring match + alphabetical label sort rather than cmdk's
  // fuzzy command-score ranking.
  const filteredItems = items
    .filter((item) =>
      item.label.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => a.label.localeCompare(b.label));

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchTerm('');
    onOpenChange?.(false);
  }, [onOpenChange]);

  const handleSelect = useCallback(
    (id: string) => {
      close();
      onSelect(id);
    },
    [close, onSelect],
  );

  const renderedTrigger = renderTrigger({ isDisabled, isOpen });
  const trigger = isValidElement(renderedTrigger) ? (
    cloneElement(
      renderedTrigger as React.ReactElement<Record<string, unknown>>,
      {
        ...((renderedTrigger.props as Record<string, unknown>) ?? {}),
        'aria-disabled': isDisabled,
        className: cn(
          className,
          (renderedTrigger.props as { className?: string }).className,
        ),
        disabled:
          typeof (renderedTrigger.props as { disabled?: boolean }).disabled ===
          'boolean'
            ? (renderedTrigger.props as { disabled?: boolean }).disabled ||
              isDisabled
            : isDisabled,
      },
    )
  ) : (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      className={className}
      isDisabled={isDisabled}
    >
      {renderedTrigger}
    </Button>
  );

  if (!isMounted) {
    return trigger;
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (isDisabled) {
          return;
        }
        setIsOpen(nextOpen);
        if (!nextOpen) {
          setSearchTerm('');
        }
        onOpenChange?.(nextOpen);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverPanelContent
        align="start"
        className="py-1"
        style={{
          width: `max(var(--radix-popover-trigger-width), ${minWidth}px)`,
        }}
      >
        <Command shouldFilter={false} className="bg-transparent">
          {/* Search — Radix focuses the first focusable child on open, so the
              input is focused automatically without a manual timeout. */}
          {hasSearch && (
            <CommandInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder={searchPlaceholder}
            />
          )}

          <CommandList className="max-h-64 py-0.5">
            <CommandEmpty>{isLoading ? 'Loading…' : emptyMessage}</CommandEmpty>

            {filteredItems.map((item) => (
              <SwitcherItem
                key={item.id}
                item={item}
                onSelect={handleSelect}
                onAction={() => {
                  close();
                  item.trailingAction?.onAction();
                }}
              />
            ))}
          </CommandList>
        </Command>

        {/* Footer */}
        {resolvedFooterActions.length > 0 && (
          <div className="border-t border-foreground/[0.08] mt-1 pt-1">
            {resolvedFooterActions.map((action) => {
              const ActionIcon = action.icon;

              return (
                <Button
                  key={action.label}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => {
                    close();
                    action.onAction();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground/60 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-0"
                >
                  {ActionIcon ? (
                    <ActionIcon className="size-3.5 flex-shrink-0" />
                  ) : (
                    <HiPlus className="size-3.5 flex-shrink-0" />
                  )}
                  <span>{action.label}</span>
                </Button>
              );
            })}
          </div>
        )}
      </PopoverPanelContent>
    </Popover>
  );
}

function SwitcherItem({
  item,
  onAction,
  onSelect,
}: {
  item: SwitcherDropdownItem;
  onAction: () => void;
  onSelect: (id: string) => void;
}) {
  const TrailingIcon = item.trailingAction?.icon;

  return (
    <div
      className={cn(
        'group mx-1 flex items-center rounded-sm transition-colors duration-150',
        'hover:bg-foreground/[0.06] focus-within:bg-foreground/[0.06] has-[[data-selected=true]]:bg-foreground/[0.06]',
        item.isActive && 'bg-foreground/[0.06]',
      )}
    >
      {/* cmdk Item = the selectable row. The active row is `disabled` so cmdk
          skips it in keyboard nav and never fires onSelect for it. The gear is
          a sibling (below), not nested here, to avoid interactive-in-interactive. */}
      <CommandItem
        value={item.id}
        disabled={item.isActive}
        onSelect={() => onSelect(item.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-sm bg-transparent py-2 pl-2 text-sm transition-colors duration-150 data-[selected=true]:bg-transparent',
          item.trailingAction ? 'pr-1' : 'pr-3',
          item.isActive
            ? 'cursor-default text-foreground data-[disabled=true]:opacity-100'
            : 'cursor-pointer text-foreground/70 data-[selected=true]:text-foreground group-hover:text-foreground',
        )}
      >
        {/* Avatar */}
        {item.imageUrl ? (
          <div className="flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
            <Image
              src={item.imageUrl}
              alt={item.label}
              width={20}
              height={20}
              className="size-full object-cover object-center"
              sizes="20px"
            />
          </div>
        ) : (
          <div
            className={cn(
              'flex size-5 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
              item.isActive
                ? 'bg-primary/30 text-primary'
                : 'bg-foreground/10 text-foreground/60',
            )}
          >
            {item.label.charAt(0).toUpperCase()}
          </div>
        )}

        <span className="flex-1 truncate text-left">{item.label}</span>

        {item.isActive && (
          <HiCheck className="size-3.5 text-primary flex-shrink-0" />
        )}
      </CommandItem>

      {item.trailingAction && TrailingIcon ? (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          ariaLabel={item.trailingAction.ariaLabel}
          onClick={onAction}
          className={cn(
            'mr-1 flex size-7 flex-shrink-0 items-center justify-center rounded text-foreground/38 transition-colors duration-150',
            'group-hover:text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-0',
          )}
        >
          <TrailingIcon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
