import { useEffect, useRef, useState } from 'react';

export interface UseRailKeysOptions {
  itemCount: number;
  onOpen?: (index: number) => void;
  onRefresh?: () => void;
}

export interface UseRailKeysResult {
  activeIndex: number;
  registerItem: (index: number) => (element: HTMLElement | null) => void;
  setActiveIndex: (index: number) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * j/ArrowDown → next row, k/ArrowUp → previous row, Enter → open the active
 * row, r → refresh. Inactive while focus sits in a text-entry control.
 */
export function useRailKeys({
  itemCount,
  onOpen,
  onRefresh,
}: UseRailKeysOptions): UseRailKeysResult {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    if (itemCount === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, itemCount - 1));
  }, [itemCount]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, itemCount - 1));
        return;
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        onOpen?.(activeIndex);
        return;
      }

      if (event.key === 'r') {
        onRefresh?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, itemCount, onOpen, onRefresh]);

  useEffect(() => {
    itemRefs.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function registerItem(index: number) {
    return (element: HTMLElement | null) => {
      if (element) {
        itemRefs.current.set(index, element);
      } else {
        itemRefs.current.delete(index);
      }
    };
  }

  return { activeIndex, registerItem, setActiveIndex };
}
