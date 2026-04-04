import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

type HoverHandler = (isHovered: boolean) => void;

export interface UseMasonryHoverControllerReturn {
  isGridHovered: boolean;
  registerItem: (ingredientId: string) => (node: HTMLDivElement | null) => void;
  createHoverChangeHandler: (ingredientId: string) => HoverHandler;
  handleGridMouseEnter: () => void;
  handleGridMouseLeave: () => void;
}

export function useMasonryHoverController(
  containerRef: RefObject<HTMLDivElement | null>,
): UseMasonryHoverControllerReturn {
  const [isGridHovered, setIsGridHovered] = useState(false);

  const hoveredIngredientIdRef = useRef<string | null>(null);
  const previousHoveredItemIdRef = useRef<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hoverAnimationFrameRef = useRef<number | null>(null);
  const hoverHandlersRef = useRef<Map<string, HoverHandler>>(new Map());
  const itemRegisterMapRef = useRef<
    Map<string, (node: HTMLDivElement | null) => void>
  >(new Map());

  const applyHoverStateToItems = useCallback((nextHoveredId: string | null) => {
    for (const [ingredientId, itemNode] of itemRefs.current.entries()) {
      const isHovered = nextHoveredId === ingredientId;
      const isDimmed = nextHoveredId !== null && !isHovered;

      itemNode.dataset.hovered = isHovered ? 'true' : 'false';
      itemNode.dataset.dimmed = isDimmed ? 'true' : 'false';
    }

    previousHoveredItemIdRef.current = nextHoveredId;
  }, []);

  const commitHoverState = useCallback(
    (nextHoveredId: string | null) => {
      const container = containerRef.current;
      if (!container) {
        hoveredIngredientIdRef.current = null;
        return applyHoverStateToItems(null);
      }

      hoveredIngredientIdRef.current = nextHoveredId;

      if (nextHoveredId) {
        container.dataset.hoveredId = nextHoveredId;
        container.classList.add('is-hovering');
      } else {
        delete container.dataset.hoveredId;
        container.classList.remove('is-hovering');
      }

      applyHoverStateToItems(nextHoveredId);
    },
    [applyHoverStateToItems, containerRef],
  );

  const scheduleHoverState = useCallback(
    (nextHoveredId: string | null) => {
      if (hoverAnimationFrameRef.current) {
        cancelAnimationFrame(hoverAnimationFrameRef.current);
      }

      hoverAnimationFrameRef.current = requestAnimationFrame(() => {
        commitHoverState(nextHoveredId);
        hoverAnimationFrameRef.current = null;
      });
    },
    [commitHoverState],
  );

  const createHoverChangeHandler = useCallback(
    (ingredientId: string) => {
      if (hoverHandlersRef.current.has(ingredientId)) {
        return hoverHandlersRef.current.get(ingredientId)!;
      }

      const handler: HoverHandler = (isHovered) => {
        const currentHoveredId = hoveredIngredientIdRef.current;

        let nextHoveredId: string | null;
        if (isHovered) {
          nextHoveredId = ingredientId;
        } else if (currentHoveredId === ingredientId) {
          nextHoveredId = null;
        } else {
          nextHoveredId = currentHoveredId;
        }

        if (nextHoveredId === currentHoveredId) {
          return;
        }

        scheduleHoverState(nextHoveredId);
      };

      hoverHandlersRef.current.set(ingredientId, handler);
      return handler;
    },
    [scheduleHoverState],
  );

  const registerItem = useCallback(
    (ingredientId: string) => {
      if (itemRegisterMapRef.current.has(ingredientId)) {
        return itemRegisterMapRef.current.get(ingredientId)!;
      }

      const callback = (node: HTMLDivElement | null) => {
        if (node) {
          itemRefs.current.set(ingredientId, node);
          const isHovered = hoveredIngredientIdRef.current === ingredientId;
          node.dataset.hovered = isHovered ? 'true' : 'false';
          node.dataset.dimmed =
            hoveredIngredientIdRef.current !== null && !isHovered
              ? 'true'
              : 'false';
        } else {
          itemRefs.current.delete(ingredientId);
          if (
            previousHoveredItemIdRef.current === ingredientId ||
            hoveredIngredientIdRef.current === ingredientId
          ) {
            scheduleHoverState(null);
          }
        }
      };

      itemRegisterMapRef.current.set(ingredientId, callback);
      return callback;
    },
    [scheduleHoverState],
  );

  useEffect(() => {
    return () => {
      if (hoverAnimationFrameRef.current) {
        cancelAnimationFrame(hoverAnimationFrameRef.current);
      }
    };
  }, []);

  const handleGridMouseEnter = useCallback(() => {
    setIsGridHovered(true);
  }, []);

  const handleGridMouseLeave = useCallback(() => {
    setIsGridHovered(false);
    scheduleHoverState(null);
  }, [scheduleHoverState]);

  return {
    createHoverChangeHandler,
    handleGridMouseEnter,
    handleGridMouseLeave,
    isGridHovered,
    registerItem,
  };
}
