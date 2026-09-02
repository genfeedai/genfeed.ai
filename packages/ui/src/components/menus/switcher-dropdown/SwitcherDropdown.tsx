'use client';

import { ButtonVariant } from '@genfeedai/contracts';
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
import { Check, Plus } from 'lucide-react';
import Image from 'next/image';
import type React from 'react';
import { cloneElement, isValidElement, useCallback, useState } from 'react';

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
  // cmdk's keyboard cursor. Pin to the active item on open so we never light
  // up a non-selected row just because the active one was previously disabled
  // and cmdk auto-jumped to the next option.
  const [highlightedValue, setHighlightedValue] = useState('');

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

  const activeItemId =
    filteredItems.find((item) => item.isActive)?.id ??
    filteredItems[0]?.id ??
    '';

  const close = useCallback(() => {
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedValue('');
    onOpenChange?.(false);
  }, [onOpenChange]);

  const handleSelect = useCallback(
    (id: string) => {
      // Selecting the already-active item just closes — don't re-fire switch.
      const isAlreadyActive = items.some(
        (item) => item.id === id && item.isActive,
      );
      close();
      if (!isAlreadyActive) {
        onSelect(id);
      }
    },
    [close, items, onSelect],
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
        if (nextOpen) {
          // Pin keyboard cursor on the active brand/org so a non-selected row
          // is never auto-highlighted just because it is first in the list.
          setHighlightedValue(
            items.find((item) => item.isActive)?.id ?? items[0]?.id ?? '',
          );
        } else {
          setSearchTerm('');
          setHighlightedValue('');
        }
        onOpenChange?.(nextOpen);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverPanelContent
        align="start"
        className="p-0"
        style={{
          width: `max(var(--radix-popover-trigger-width), ${minWidth}px)`,
        }}
      >
        <Command
          shouldFilter={false}
          className="bg-transparent"
          value={highlightedValue || activeItemId}
          onValueChange={setHighlightedValue}
        >
          {/* Search — Radix focuses the first focusable child on open, so the
              input is focused automatically without a manual timeout. */}
          {hasSearch && (
            <CommandInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder={searchPlaceholder}
            />
          )}

          <CommandList className="max-h-64 p-0">
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
          <div className="border-t border-foreground/[0.08]">
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
                    <Plus className="size-3.5 flex-shrink-0" />
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
        'group flex min-h-9 w-full items-center transition-colors duration-150',
        // Active = wash + check only. No ring/border. Keyboard cursor on an
        // inactive row is a quieter wash, never a second selected treatment.
        item.isActive
          ? 'bg-foreground/[0.08]'
          : 'hover:bg-foreground/[0.04] has-[[data-selected=true]]:bg-foreground/[0.05]',
      )}
    >
      {/* Active stays selectable so cmdk can keep the keyboard cursor on it
          (disabled items are skipped → previous bug lit the next brand).
          Gear is a sibling, not nested, to avoid interactive-in-interactive. */}
      <CommandItem
        value={item.id}
        onSelect={() => onSelect(item.id)}
        aria-current={item.isActive ? 'true' : undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-none bg-transparent py-2 pl-3 text-sm transition-colors duration-150 data-[selected=true]:bg-transparent data-[disabled=true]:opacity-100',
          item.trailingAction ? 'pr-1' : 'pr-3',
          item.isActive
            ? 'cursor-default font-medium text-foreground'
            : 'cursor-pointer font-normal text-foreground/55 data-[selected=true]:text-foreground/80 group-hover:text-foreground',
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
              'flex size-5 flex-shrink-0 items-center justify-center rounded-md text-2xs font-bold',
              item.isActive
                ? 'bg-primary/30 text-primary'
                : 'bg-foreground/10 text-foreground/50',
            )}
          >
            {item.label.charAt(0).toUpperCase()}
          </div>
        )}

        <span className="flex-1 truncate text-left">{item.label}</span>

        {/* Reserve check width so inactive rows don't jump when active has ✓ */}
        <span className="flex size-3.5 flex-shrink-0 items-center justify-center">
          {item.isActive ? (
            <Check
              className="size-3.5 text-primary"
              aria-hidden
              data-testid="switcher-item-active-check"
            />
          ) : null}
        </span>
      </CommandItem>

      {item.trailingAction && TrailingIcon ? (
        item.trailingAction.href ? (
          <a
            href={item.trailingAction.href}
            target={item.trailingAction.target}
            rel={
              item.trailingAction.target === '_blank' ? 'noreferrer' : undefined
            }
            aria-label={item.trailingAction.ariaLabel}
            onClick={() => onAction()}
            className={cn(
              'mr-1.5 flex size-7 flex-shrink-0 items-center justify-center rounded text-foreground/38 transition-colors duration-150',
              'group-hover:text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-0',
            )}
          >
            <TrailingIcon className="size-3.5" />
          </a>
        ) : (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            ariaLabel={item.trailingAction.ariaLabel}
            onClick={onAction}
            className={cn(
              'mr-1.5 flex size-7 flex-shrink-0 items-center justify-center rounded text-foreground/38 transition-colors duration-150',
              'group-hover:text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-0',
            )}
          >
            <TrailingIcon className="size-3.5" />
          </Button>
        )
      ) : null}
    </div>
  );
}
