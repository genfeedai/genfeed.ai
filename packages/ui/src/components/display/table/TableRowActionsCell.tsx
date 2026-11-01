'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import type {
  TableAction,
  TableActionTone,
} from '@genfeedai/props/ui/display/table.props';
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

const ACTION_TONE_CLASS_NAMES: Record<TableActionTone, string> = {
  default: '',
  destructive:
    'text-destructive hover:bg-destructive/10 hover:text-destructive',
  success: 'text-success hover:bg-success/10 hover:text-success',
};

/**
 * The row's actions, laid over the row instead of living in a column of their
 * own, so they never need a horizontal scroll to reach.
 *
 * On a hover-capable pointer the cell has no width: a sticky zero-width cell
 * pins to the right edge of the scrollport and a row of ghost icons floats
 * over the row's right end, revealed on row hover or keyboard focus inside the
 * row. A gradient in the row's own colour fades out the cell content it
 * covers, so text never shows through the icons. Where the pointer cannot
 * hover the icons stay visible in that same sticky cell, as a narrow column,
 * so touch keeps 44px targets.
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
          '[@media(hover:hover)]:absolute [@media(hover:hover)]:inset-y-0 [@media(hover:hover)]:right-0 [@media(hover:hover)]:isolate [@media(hover:hover)]:pl-12',
          // Fade: the card at rest, plus the row's hover tint while hovered,
          // so the cluster blends into the row it sits on.
          '[@media(hover:hover)]:bg-[linear-gradient(to_right,transparent,hsl(var(--card))_2.5rem)]',
          "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:content-[''] group-hover:before:bg-[linear-gradient(to_right,transparent,hsl(var(--accent)/0.6)_2.5rem)]",
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
            ACTION_TONE_CLASS_NAMES[action.tone ?? 'default'],
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
