'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import type { QuickActionsMenuProps } from '@props/content/quick-actions.props';
import Button from '@ui/buttons/base/Button';
import Spinner from '@ui/feedback/spinner/Spinner';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

import { createPortal } from 'react-dom';
import { HiEllipsisVertical } from 'react-icons/hi2';

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
          'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
          'h-8 px-3 text-xs',
          'text-white/65 hover:bg-white/8 hover:text-white',
          'rounded-full transition-all duration-300',
        )}
        ariaLabel="More"
      >
        <HiEllipsisVertical className="w-4 h-4" />
      </Button>

      {isMenuOpen &&
        portalContainer &&
        createPortal(
          <div
            ref={menuRef}
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
            className={cn(
              BG_BLUR,
              BORDER_WHITE_30,
              'min-w-52 rounded-2xl border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.38)]',
            )}
          >
            <div className="p-1">
              {actions.map((action, index) => (
                <div key={action.id}>
                  {(action.dividerBefore || action.sectionLabel) && (
                    <div className="my-1">
                      {action.dividerBefore && index > 0 && (
                        <div className="mb-1.5 border-t border-white/12" />
                      )}
                      {action.sectionLabel && (
                        <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
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
                      'flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300',
                      action.isDisabled || action.isLoading
                        ? 'opacity-50 cursor-not-allowed text-white/50'
                        : action.variant === 'error'
                          ? 'text-error hover:bg-error/90 hover:text-white focus:bg-error/90 focus:text-white'
                          : 'text-white/85 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white',
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
                        className={`flex-shrink-0 ${action.variant === 'error' ? 'text-error/70' : 'text-white/70'}`}
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
