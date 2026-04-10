'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  SwitcherDropdownItem,
  SwitcherDropdownProps,
} from '@genfeedai/props/ui/menus/switcher-dropdown.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import Image from 'next/image';
import type React from 'react';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { HiCheck, HiMagnifyingGlass, HiPlus } from 'react-icons/hi2';

export default function SwitcherDropdown({
  items,
  renderTrigger,
  onSelect,
  onOpenChange,
  isDisabled = false,
  footerAction,
  footerActions,
  minWidth = 220,
  className,
  hasSearch = false,
  searchPlaceholder = 'Search...',
}: SwitcherDropdownProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resolvedFooterActions =
    footerActions && footerActions.length > 0
      ? footerActions
      : footerAction
        ? [footerAction]
        : [];

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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (isOpen && hasSearch) {
      const timeoutId = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, hasSearch]);

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
        {/* Search */}
        {hasSearch && (
          <div className="px-2 pt-1.5 pb-1">
            <div className="relative">
              <HiMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <Input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="py-1.5 pl-8 pr-3"
              />
            </div>
          </div>
        )}

        {/* Items */}
        <div className="max-h-64 overflow-y-auto py-0.5">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <SwitcherItem key={item.id} item={item} onSelect={handleSelect} />
            ))
          ) : (
            <div className="px-3 py-3 text-xs text-white/40 text-center">
              {items.length === 0 ? 'Loading…' : 'No results'}
            </div>
          )}
        </div>

        {/* Footer */}
        {resolvedFooterActions.length > 0 && (
          <div className="border-t border-white/[0.08] mt-1 pt-1">
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
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
                >
                  {ActionIcon ? (
                    <ActionIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <HiPlus className="w-3.5 h-3.5 flex-shrink-0" />
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
  onSelect,
}: {
  item: SwitcherDropdownItem;
  onSelect: (id: string) => void;
}) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={() => !item.isActive && onSelect(item.id)}
      isDisabled={item.isActive}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150',
        item.isActive
          ? 'text-white cursor-default'
          : 'text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer',
      )}
    >
      {/* Avatar */}
      {item.imageUrl ? (
        <div className="w-5 h-5 rounded-full overflow-hidden bg-background flex items-center justify-center flex-shrink-0">
          <Image
            src={item.imageUrl}
            alt={item.label}
            width={20}
            height={20}
            className="object-cover object-center"
            sizes="20px"
            style={{ height: 'auto', width: 'auto' }}
          />
        </div>
      ) : (
        <div
          className={cn(
            'w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0',
            item.isActive
              ? 'bg-primary/30 text-primary'
              : 'bg-white/10 text-white/60',
          )}
        >
          {item.label.charAt(0).toUpperCase()}
        </div>
      )}

      <span className="flex-1 truncate text-left">{item.label}</span>

      {item.isActive && (
        <HiCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
      )}
    </Button>
  );
}
