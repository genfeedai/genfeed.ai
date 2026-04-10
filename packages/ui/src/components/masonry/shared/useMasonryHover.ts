import { downloadIngredient } from '@genfeedai/helpers/media/download/download.helper';
import type { IIngredient } from '@genfeedai/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import type { MouseEvent } from 'react';
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface UseMasonryHoverOptions {
  isContainerHovered?: boolean;
  onHoverChange?: (isHovered: boolean) => void;
  /** Optional callback when hover state changes - for video playback control */
  onHoverStateChange?: (isHovering: boolean) => void;
}

export interface UseMasonryHoverReturn {
  isHovered: boolean;
  showActions: boolean;
  setShowActions: (show: boolean) => void;
  handleMouseEnter: () => void;
  handleMouseLeave: (e: MouseEvent) => void;
  handleQuickActionsMouseEnter: () => void;
  handleQuickActionsMouseLeave: (e: MouseEvent) => void;
}

/**
 * Check if mouse is moving to a dropdown element
 */
function isMovingToDropdown(relatedTarget: EventTarget | null): boolean {
  if (!relatedTarget || !(relatedTarget instanceof Element)) {
    return false;
  }

  return !!(
    relatedTarget.closest('[data-dropdown]') ||
    relatedTarget.closest('[data-quick-actions-dropdown]') ||
    relatedTarget.closest('[role="menu"]') ||
    relatedTarget.closest('[role="listbox"]')
  );
}

/**
 * Check if mouse is moving to quick actions within the same masonry item
 */
function isMovingToQuickActions(
  relatedTarget: EventTarget | null,
  currentTarget: HTMLElement,
): boolean {
  if (!relatedTarget || !(relatedTarget instanceof Element)) {
    return false;
  }

  const quickActionsWrapper = relatedTarget.closest(
    '.quick-actions-wrapper',
  ) as HTMLElement | null;

  return !!(quickActionsWrapper && currentTarget.contains(quickActionsWrapper));
}

/**
 * Check if mouse is moving back to the same masonry item
 */
function isMovingToSameMasonryItem(
  relatedTarget: EventTarget | null,
  currentTarget: EventTarget | null,
): boolean {
  if (!relatedTarget || !currentTarget || !(relatedTarget instanceof Element)) {
    return false;
  }

  const masonryItem = relatedTarget.closest('[data-masonry-item]');
  const currentMasonryItem = (currentTarget as Element).closest(
    '[data-masonry-item]',
  );

  return !!(masonryItem && masonryItem === currentMasonryItem);
}

/**
 * Shared hook for masonry item hover behavior
 * Handles hover state, actions visibility, and dropdown/quick-actions edge cases
 */
export function useMasonryHover({
  isContainerHovered = true,
  onHoverChange,
  onHoverStateChange,
}: UseMasonryHoverOptions = {}): UseMasonryHoverReturn {
  const [isHovered, setIsHovered] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // Store callback refs to avoid dependency issues
  const onHoverChangeRef = useRef(onHoverChange);
  const onHoverStateChangeRef = useRef(onHoverStateChange);
  const prevContainerHoveredRef = useRef(isContainerHovered);

  useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange]);

  useEffect(() => {
    onHoverStateChangeRef.current = onHoverStateChange;
  }, [onHoverStateChange]);

  // Handle container hover changes
  useEffect(() => {
    if (prevContainerHoveredRef.current !== isContainerHovered) {
      prevContainerHoveredRef.current = isContainerHovered;
      if (!isContainerHovered) {
        startTransition(() => {
          setShowActions(false);
          setIsHovered(false);
          onHoverChangeRef.current?.(false);
          onHoverStateChangeRef.current?.(false);
        });
      }
    }
  }, [isContainerHovered]);

  const updateHoverState = useCallback((hovering: boolean) => {
    setShowActions(hovering);
    setIsHovered(hovering);
    onHoverChangeRef.current?.(hovering);
    onHoverStateChangeRef.current?.(hovering);
  }, []);

  const handleMouseEnter = useCallback(() => {
    updateHoverState(true);
  }, [updateHoverState]);

  const handleMouseLeave = useCallback(
    (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget;
      const currentTarget = e.currentTarget as HTMLElement;

      // If relatedTarget is null, mouse is leaving to outside
      if (!relatedTarget) {
        return updateHoverState(false);
      }

      // Don't hide if moving to dropdown
      if (isMovingToDropdown(relatedTarget)) {
        return;
      }

      // Don't hide if moving to quick actions within same item
      if (isMovingToQuickActions(relatedTarget, currentTarget)) {
        return;
      }

      updateHoverState(false);
    },
    [updateHoverState],
  );

  const handleQuickActionsMouseEnter = useCallback(() => {
    updateHoverState(true);
  }, [updateHoverState]);

  const handleQuickActionsMouseLeave = useCallback(
    (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget;

      // Don't hide if moving to dropdown
      if (isMovingToDropdown(relatedTarget)) {
        return;
      }

      // Don't hide if moving back to the same masonry item
      if (isMovingToSameMasonryItem(relatedTarget, e.currentTarget)) {
        return;
      }

      updateHoverState(false);
    },
    [updateHoverState],
  );

  return {
    handleMouseEnter,
    handleMouseLeave,
    handleQuickActionsMouseEnter,
    handleQuickActionsMouseLeave,
    isHovered,
    setShowActions,
    showActions,
  };
}

/**
 * Helper to create download handler for ingredients
 * Uses fetch + blob to properly handle cross-origin URLs
 */
export function createDownloadHandler() {
  return async (ingredient: IIngredient): Promise<undefined> => {
    try {
      await downloadIngredient(ingredient);
    } catch (error) {
      logger.error('Download failed', error);
      NotificationsService.getInstance().error('Failed to download file');
    }
    return undefined;
  };
}
