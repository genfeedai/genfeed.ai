'use client';

import { ButtonVariant, DropdownDirection } from '@genfeedai/enums';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import type { PromptDropdownProps } from '@props/prompts/prompt-dropdown.props';
import { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiArrowPath,
  HiClipboardDocument,
  HiDocumentDuplicate,
} from 'react-icons/hi2';

export default function DropdownPrompt({
  promptText,
  onCopy,
  onReprompt,
  direction = DropdownDirection.UP,
  className,
  isDisabled = false,
}: PromptDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    buttonHeight: 0,
    left: 0,
    right: 0,
    top: 0,
    useRight: false,
  });

  const clipboardService = ClipboardService.getInstance();

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      // Dropdown width is 320px (w-80 = 20rem)
      const dropdownWidth = 320;
      const viewportWidth = window.innerWidth;

      // Check if dropdown would go off-screen to the right
      const wouldOverflowRight = rect.left + dropdownWidth > viewportWidth;

      // Calculate right position (distance from right edge of viewport)
      const rightPosition = viewportWidth - (rect.right + scrollX);

      setDropdownPosition({
        buttonHeight: rect.height,
        left: rect.left + scrollX,
        right: rightPosition,
        top: rect.top + scrollY,
        useRight: wouldOverflowRight,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle copy prompt
  const handleCopyPrompt = (e?: ReactMouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (!promptText) {
      return;
    }

    clipboardService.copyToClipboard(promptText);
    onCopy?.(promptText);
    setIsOpen(false);
  };

  // Handle prompt text click
  const handlePromptTextClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    handleCopyPrompt();
  };

  // Don't render if no prompt text
  if (!promptText) {
    return null;
  }

  // Render dropdown menu via portal
  const renderDropdown = () => {
    if (!isOpen || typeof window === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        ref={dropdownRef}
        data-dropdown="true"
        style={{
          position: 'absolute',
          top:
            direction === 'up'
              ? `${dropdownPosition.top - 8}px`
              : `${dropdownPosition.top + dropdownPosition.buttonHeight + 8}px`,
          ...(dropdownPosition.useRight
            ? { right: `${dropdownPosition.right}px` }
            : { left: `${dropdownPosition.left}px` }),
          transform: direction === 'up' ? 'translateY(-100%)' : 'none',
          zIndex: 9999,
        }}
        className={cn(BG_BLUR, BORDER_WHITE_30, 'w-80')}
      >
        {/* Header with Copy and Reprompt Buttons */}
        <div className="p-3 border-b border-white/[0.08] flex items-center justify-between">
          <div className="text-xs uppercase text-foreground/60">Prompt</div>
          <div className="flex items-center gap-2">
            {onReprompt && (
              <Button
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                className="h-6 px-2 text-xs hover:bg-accent hover:text-accent-foreground"
                title="Regenerate with same settings"
                ariaLabel="Regenerate"
                tooltip="Regenerate with same settings"
                tooltipPosition="top"
                onClick={(e) => {
                  e.stopPropagation();
                  onReprompt();
                  setIsOpen(false);
                }}
              >
                <HiArrowPath className="w-4 h-4" />
              </Button>
            )}

            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              onClick={handleCopyPrompt}
              className="h-6 px-2 text-xs hover:bg-accent hover:text-accent-foreground"
              title="Copy prompt"
              ariaLabel="Copy prompt"
              tooltip="Copy prompt"
              tooltipPosition="top"
            >
              <HiDocumentDuplicate className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Prompt Text */}
        <div className="p-4">
          <div
            onClick={handlePromptTextClick}
            className="text-sm text-foreground cursor-pointer hover:bg-background p-3 transition-colors select-all"
            title="Click to copy"
          >
            {promptText}
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <Button
        ref={buttonRef}
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        onClick={() => !isDisabled && setIsOpen(!isOpen)}
        isDisabled={isDisabled}
        className={cn(className, isDisabled && 'opacity-50 cursor-not-allowed')}
        tooltip="Prompt"
        tooltipPosition="top"
        ariaLabel="View prompt"
      >
        <HiClipboardDocument className="w-4 h-4" />
      </Button>

      {/* Dropdown Menu rendered via portal */}
      {renderDropdown()}
    </div>
  );
}
