'use client';

import {
  cloneElement,
  isValidElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useHoverAnimatedIcon } from './use-hover-animated-icon';

const INTERACTIVE_HOST = 'button, a, [role="button"]';

/**
 * The hover animation for a component that must stay server-renderable, such
 * as `Button`: the host never calls a hook, it just renders this slot as its
 * icon. The slot finds the control it sits in and listens to it directly.
 *
 * Rendered from a Server Component the icon arrives already rendered, has no
 * twin to look up, and simply stays static.
 */
export function HoverAnimatedIconSlot({
  defaultSizeClassName,
  icon,
}: {
  defaultSizeClassName?: string;
  icon: ReactNode;
}): ReactNode {
  const {
    icon: node,
    isAnimatable,
    start,
    stop,
  } = useHoverAnimatedIcon(icon, {
    defaultSizeClassName,
  });
  const [anchor, setAnchor] = useState<Element | null>(null);
  // Keep the first node: once the twin takes over the static icon unmounts,
  // but the listeners belong to the host and must stay.
  const captureAnchor = useCallback((element: Element | null) => {
    if (element) setAnchor(element);
  }, []);

  useEffect(() => {
    const host = anchor?.closest(INTERACTIVE_HOST);
    if (!host || !isAnimatable) {
      return;
    }
    const handleFocus = () => {
      if (host.matches(':focus-visible')) start();
    };
    host.addEventListener('mouseenter', start);
    host.addEventListener('mouseleave', stop);
    host.addEventListener('focus', handleFocus);
    host.addEventListener('blur', stop);
    return () => {
      host.removeEventListener('mouseenter', start);
      host.removeEventListener('mouseleave', stop);
      host.removeEventListener('focus', handleFocus);
      host.removeEventListener('blur', stop);
    };
  }, [anchor, isAnimatable, start, stop]);

  if (!isAnimatable || !isValidElement<{ ref?: Ref<Element> }>(icon)) {
    return icon;
  }
  return node === icon ? cloneElement(icon, { ref: captureAnchor }) : node;
}
