'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { QuickActionsMenuProps } from '@genfeedai/props/content/quick-actions.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { QUICK_ACTION_TRIGGER_CLASS } from '@ui/quick-actions/quick-actions.constants';
import { EllipsisVertical } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

import { createPortal } from 'react-dom';

interface MenuPosition {
  top: number;
  right: number;
}

const SIZE_CLASSES = {
  [ComponentSize.LG]: ButtonSize.LG,
  [ComponentSize.MD]: ButtonSize.DEFAULT,
  [ComponentSize.SM]: ButtonSize.SM,
} as const;

function findAncestorBySelector(
  element: HTMLElement | null,
  predicate: (el: HTMLElement) => boolean,
): HTMLElement | null {
  let current = element;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function findModalDialog(element: HTMLElement | null): HTMLElement | null {
  return findAncestorBySelector(
    element,
    (el) => el.tagName === 'DIALOG' && el.classList.contains('modal'),
  );
}

function findMasonryContainer(element: HTMLElement | null): HTMLElement | null {
  return findAncestorBySelector(
    element,
    (el) =>
      el.classList.contains('masonry-container') ||
      el.classList.contains('masonry-item'),
  );
}

function calculateModalPosition(
  buttonRect: DOMRect,
  modalRect: DOMRect,
  menuRect?: DOMRect,
): MenuPosition {
  const relativeTop = buttonRect.top - modalRect.top;
  let relativeRight = modalRect.right - buttonRect.right;

  if (menuRect) {
    const menuLeftEdge = modalRect.right - relativeRight - menuRect.width;
    if (menuLeftEdge < modalRect.left) {
      const newMenuRightEdge = modalRect.left + menuRect.width;
      relativeRight = modalRect.right - newMenuRightEdge;
    }
    relativeRight = Math.max(relativeRight, 8);
  }

  return { right: relativeRight, top: relativeTop };
}

function calculateViewportPosition(
  buttonRect: DOMRect,
  gridContainer: HTMLElement | null,
  menuRect?: DOMRect,
): MenuPosition {
  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;
  const viewportWidth = window.innerWidth;
  const buttonRightEdge = buttonRect.right + scrollX;

  let adjustedRight = viewportWidth - buttonRightEdge;

  if (menuRect) {
    const gridLeft = gridContainer
      ? gridContainer.getBoundingClientRect().left + scrollX
      : 0;
    const menuLeftEdge = buttonRightEdge - menuRect.width;

    if (menuLeftEdge < gridLeft) {
      const newMenuRightEdge = gridLeft + menuRect.width;
      adjustedRight = viewportWidth - newMenuRightEdge;
    }
    adjustedRight = Math.max(adjustedRight, 8);
  }

  return { right: adjustedRight, top: buttonRect.top + scrollY };
}

function useClickOutside(
  menuRef: React.RefObject<HTMLDivElement | null>,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  // Ref for callback to prevent re-renders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Node;
      const isOutsideMenu =
        menuRef.current && !menuRef.current.contains(target);
      const isOutsideButton =
        buttonRef.current && !buttonRef.current.contains(target);

      if (isOutsideMenu && isOutsideButton) {
        onCloseRef.current();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, menuRef, buttonRef]);
}

export default function QuickActionsMenu({
  actions,
  isMenuOpen,
  setIsMenuOpen,
  size = ComponentSize.SM,
  onActionClick,
}: QuickActionsMenuProps): React.ReactNode {
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    right: 0,
    top: 0,
  });

  useClickOutside(menuRef, buttonRef, isMenuOpen, () => setIsMenuOpen(false));

  useIsomorphicLayoutEffect(() => {
    if (!isMenuOpen || !buttonRef.current) {
      return;
    }

    const modalDialog = findModalDialog(buttonRef.current);
    const container = modalDialog || document.body;
    setPortalContainer(container);

    const buttonRect = buttonRef.current.getBoundingClientRect();

    if (modalDialog) {
      const modalRect = modalDialog.getBoundingClientRect();
      setMenuPosition(calculateModalPosition(buttonRect, modalRect));
    } else {
      setMenuPosition(calculateViewportPosition(buttonRect, null));
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen || !buttonRef.current || !portalContainer) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      if (!menuRef.current || !buttonRef.current || !portalContainer) {
        return;
      }

      const buttonRect = buttonRef.current.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();

      if (portalContainer.tagName === 'DIALOG') {
        const modalRect = portalContainer.getBoundingClientRect();
        const newPosition = calculateModalPosition(
          buttonRect,
          modalRect,
          menuRect,
        );
        const currentRight = modalRect.right - menuRect.right;

        if (Math.abs(currentRight - newPosition.right) > 1) {
          setMenuPosition(newPosition);
        }
      } else {
        const gridContainer = findMasonryContainer(
          buttonRef.current.parentElement,
        );
        const newPosition = calculateViewportPosition(
          buttonRect,
          gridContainer,
          menuRect,
        );
        const scrollX = window.scrollX || window.pageXOffset;
        const currentRight = window.innerWidth - (menuRect.right + scrollX);

        if (Math.abs(currentRight - newPosition.right) > 1) {
          setMenuPosition(newPosition);
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [isMenuOpen, portalContainer]);

  if (actions.length === 0) {
    return null;
  }

  const isInModal = portalContainer?.tagName === 'DIALOG';

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        tooltip="More"
        tooltipPosition="top"
        size={SIZE_CLASSES[size]}
        className={cn(
          QUICK_ACTION_TRIGGER_CLASS,
          'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        ariaLabel="More"
      >
        <EllipsisVertical className="size-4" />
      </Button>

      {isMenuOpen &&
        portalContainer &&
        createPortal(
          <div
            ref={menuRef}
            role="presentation"
            data-dropdown="true"
            data-quick-actions-dropdown="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              right: `${menuPosition.right}px`,
              top: `${menuPosition.top - 8}px`,
              transform: 'translateY(-100%)',
              zIndex: isInModal ? 10000 : 9999,
            }}
            className="min-w-40 rounded-lg bg-secondary shadow-dropdown"
            data-testid="quick-actions-menu"
          >
            <div className="p-0.5">
              {actions.map((action, index) => (
                <div key={action.id}>
                  {(action.dividerBefore || action.sectionLabel) && (
                    <div className="my-0.5">
                      {action.dividerBefore && index > 0 && (
                        <div className="mb-0.5 border-t border-border" />
                      )}
                      {action.sectionLabel && (
                        <div className="px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {action.sectionLabel}
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    onClick={() => onActionClick(action)}
                    isDisabled={action.isDisabled || action.isLoading}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
                      action.isDisabled || action.isLoading
                        ? 'cursor-not-allowed text-muted-foreground opacity-50'
                        : action.variant === 'error'
                          ? 'text-error hover:bg-error hover:text-destructive-foreground focus:bg-error focus:text-destructive-foreground'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                    )}
                  >
                    {action.isLoading && (
                      <Spinner
                        size={ComponentSize.XS}
                        className="flex-shrink-0"
                      />
                    )}
                    {action.icon && (
                      <span
                        className={`flex-shrink-0 ${action.variant === 'error' ? 'text-error/70' : 'text-muted-foreground'}`}
                      >
                        {action.icon}
                      </span>
                    )}
                    <span className="flex-1 text-left">{action.label}</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>,
          portalContainer,
        )}
    </div>
  );
}
