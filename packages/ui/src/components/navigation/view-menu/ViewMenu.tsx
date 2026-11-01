'use client';

import { ButtonSize, ButtonVariant, type ViewType } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ViewMenuProps } from '@genfeedai/props/ui/navigation/view-menu.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * How a page lays out its results (grid, list, table, canvas, kanban). A view
 * is secondary chrome, so it is one ghost button showing the active layout's
 * icon; the other layouts sit in its menu. Lives in the subbar after Filters
 * and before the primary action. Views are never tabs.
 *
 * `trigger="label"` names the active option instead (Day, Week, Month), for
 * views that share one icon family and are only told apart by name.
 */
export default function ViewMenu<TView extends string = ViewType>({
  options,
  activeView,
  onChange,
  trigger = 'icon',
  className,
}: ViewMenuProps<TView>) {
  const translate = useTranslations('ui.viewMenu');
  const active = options.find((option) => option.type === activeView);

  if (options.length < 2 || !active) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={`${translate('label')}: ${active.label}`}
          className={cn(
            'h-8 shrink-0 gap-1 px-2 text-xs [&_svg]:size-3.5',
            className,
          )}
          icon={trigger === 'icon' ? active.icon : undefined}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {trigger === 'label' ? <span>{active.label}</span> : null}
          <ChevronDown aria-hidden="true" className="!size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{translate('label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onChange(value as TView)}
          value={activeView}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              aria-label={option.ariaLabel || option.label}
              key={option.type}
              value={option.type}
            >
              <span className="inline-flex [&_svg]:size-4">{option.icon}</span>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
