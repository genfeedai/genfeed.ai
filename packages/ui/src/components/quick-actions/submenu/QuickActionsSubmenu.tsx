'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { IQuickAction } from '@genfeedai/interfaces/ui/quick-actions.interface';
import type { QuickActionsSubmenuProps } from '@genfeedai/interfaces/ui/quick-actions-submenu.interface';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function QuickActionsSubmenu({
  label,
  icon,
  actions,
  size = ComponentSize.SM,
  onActionClick,
  className = '',
}: QuickActionsSubmenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    buttonHeight: 0,
    left: 0,
    shouldShowBelow: false,
    top: 0,
  });

  // Update menu position when it opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 300; // Approximate max height
      const viewportHeight = window.innerHeight;

      // Check if there's enough space above the button
      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;
      const shouldShowBelow =
        spaceAbove < dropdownHeight && spaceBelow > spaceAbove;

      setMenuPosition({
        buttonHeight: buttonRef.current.offsetHeight,
        left: rect.left + window.scrollX,
        shouldShowBelow,
        top: rect.top + window.scrollY,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Use a small delay to ensure click events are processed before closing
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const sizeClasses = {
    [ComponentSize.LG]: ButtonSize.LG,
    [ComponentSize.MD]: ButtonSize.DEFAULT,
    [ComponentSize.SM]: ButtonSize.SM,
  } as const;

  if (actions.length === 0) {
    return null;
  }

  const handleClick = (action: IQuickAction) => {
    onActionClick(action);
    setIsOpen(false);
  };

  const renderSubmenu = () => {
    if (!isOpen || typeof window === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        ref={menuRef}
        data-dropdown="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          left: `${menuPosition.left}px`,
          position: 'absolute',
          top: menuPosition.shouldShowBelow
            ? `${menuPosition.top + menuPosition.buttonHeight + 8}px`
            : `${menuPosition.top - 8}px`,
          transform: menuPosition.shouldShowBelow
            ? 'none'
            : 'translateY(-100%)',
          zIndex: 9999,
        }}
        className={cn(BG_BLUR, BORDER_WHITE_30, ' shadow-2xl', 'min-w-40')}
      >
        <div className="p-1">
          {actions.map((action, index) => (
            <div key={action.id}>
              {action.dividerBefore && index > 0 && (
                <div className="my-1 border-t border-white/20" />
              )}

              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                onClick={() => handleClick(action)}
                isDisabled={action.isDisabled || action.isLoading}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-300 text-left text-sm font-medium cursor-pointer ${
                  action.isDisabled || action.isLoading
                    ? 'opacity-50 cursor-not-allowed text-white/50'
                    : action.variant === 'error'
                      ? 'text-error hover:bg-error hover:text-white focus:bg-error focus:text-white'
                      : 'text-white/90 hover:bg-white/20 hover:text-white focus:bg-white/20 focus:text-white'
                }`}
              >
                {action.icon && (
                  <span className="flex-shrink-0">{action.icon}</span>
                )}
                <span className="flex-1">{action.label}</span>
                {action.isLoading && (
                  <Spinner size={ComponentSize.XS} className="flex-shrink-0" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="relative">
      <SimpleTooltip label={label} position="top">
        <div>
          <Button
            ref={buttonRef}
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => setIsOpen(!isOpen)}
            size={sizeClasses[size]}
            className={cn(
              'rounded-full transition-all duration-300',
              BG_BLUR,
              BORDER_WHITE_30,
              'text-white hover:border-white/20',
              className,
            )}
            ariaLabel={label}
          >
            {icon}
          </Button>
        </div>
      </SimpleTooltip>

      {/* Dropdown submenu rendered via portal */}
      {renderSubmenu()}
    </div>
  );
}
