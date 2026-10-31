'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import type { TableAction } from '@genfeedai/props/ui/display/table.props';
import { Button } from '@ui/primitives/button';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface TableRowActionsCellProps<T> {
  actions: TableAction<T>[];
  item: T;
  /** Row-specific controls (overflow menus, stateful buttons) shown after the icon actions. */
  renderRowActions?: (item: T) => ReactNode;
  onActionClick: (action: TableAction<T>, item: T) => void;
}

/**
 * The row's actions, laid over the row instead of living in a column of their
 * own, so they never need a horizontal scroll to reach.
 *
 * On a hover-capable pointer the cell has no width: a sticky zero-width cell
 * pins to the right edge of the scrollport and the cluster floats over the
 * row's right end, revealed on row hover or keyboard focus inside the row.
 * Where the pointer cannot hover the cluster stays visible in that same sticky
 * cell, as a narrow column, so touch keeps 44px targets.
 *
 * The row (`tr.group`) owns the hover; this cell only reacts to it.
 */
export function TableRowActionsCell<T>({
  actions,
  item,
  renderRowActions,
  onActionClick,
}: TableRowActionsCellProps<T>) {
  return (
    <td className="sticky right-0 z-10 bg-card p-0 align-middle [@media(hover:hover)]:w-0 [@media(hover:hover)]:bg-transparent">
      {/* Instant show/hide: the motion policy forbids animating controls. */}
      <div
        className={cn(
          'flex items-center justify-end gap-1 px-2',
          '[@media(hover:hover)]:absolute [@media(hover:hover)]:right-2 [@media(hover:hover)]:top-1/2 [@media(hover:hover)]:-translate-y-1/2',
          '[@media(hover:hover)]:rounded-md [@media(hover:hover)]:border [@media(hover:hover)]:border-border [@media(hover:hover)]:bg-card [@media(hover:hover)]:p-0.5 [@media(hover:hover)]:shadow-sm',
          hoverRevealClassName(),
        )}
        data-table-row-actions
      >
        {keyListItems(actions, (action) =>
          typeof action.tooltip === 'function'
            ? action.tooltip(item)
            : action.tooltip,
        ).reduce<ReactNode[]>((acc, { item: action, key }) => {
          const isVisible = action.isVisible ? action.isVisible(item) : true;
          if (!isVisible) {
            return acc;
          }
          const actionHref =
            typeof action.href === 'function' ? action.href(item) : action.href;
          // A link action with nowhere to go for this row is omitted rather
          // than rendered dead.
          if (action.href !== undefined && actionHref === undefined) {
            return acc;
          }
          const iconContent =
            typeof action.icon === 'function' ? action.icon(item) : action.icon;
          const tooltipText =
            typeof action.tooltip === 'function'
              ? action.tooltip(item)
              : action.tooltip;
          const actionAriaLabel =
            typeof action.ariaLabel === 'function'
              ? action.ariaLabel(item)
              : (action.ariaLabel ?? tooltipText);
          const isActionDisabled = action.isDisabled?.(item) ?? false;
          const actionClassName = cn(
            // 44px touch target where the pointer cannot hover; compact icon
            // control otherwise. Cap glyph size so bare lucide icons don't
            // render at 24px.
            'inline-flex size-8 items-center justify-center p-0 [@media(hover:none)]:size-11 [&_svg]:size-3.5',
            action.className,
            action.getClassName?.(item),
          );

          acc.push(
            actionHref !== undefined && !isActionDisabled ? (
              <Button
                key={key}
                asChild
                ariaLabel={actionAriaLabel}
                tooltip={tooltipText}
                tooltipPosition={action.tooltipPosition || 'top'}
                data-testid="action-button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                className={actionClassName}
              >
                {action.isExternal ? (
                  <a
                    href={actionHref}
                    rel="noopener noreferrer"
                    target="_blank"
                    onClick={() => onActionClick(action, item)}
                  >
                    {iconContent}
                  </a>
                ) : (
                  <Link
                    href={actionHref}
                    onClick={() => onActionClick(action, item)}
                  >
                    {iconContent}
                  </Link>
                )}
              </Button>
            ) : (
              <Button
                key={key}
                icon={iconContent}
                ariaLabel={actionAriaLabel}
                onClick={() => onActionClick(action, item)}
                isDisabled={isActionDisabled}
                tooltip={tooltipText}
                tooltipPosition={action.tooltipPosition || 'top'}
                data-testid="action-button"
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                className={actionClassName}
              />
            ),
          );
          return acc;
        }, [])}
        {renderRowActions?.(item)}
      </div>
    </td>
  );
}
