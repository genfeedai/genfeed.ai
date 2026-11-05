/** Whether a horizontal strip has more content past either edge. */
export interface ScrollEdges {
  canScrollEnd: boolean;
  canScrollStart: boolean;
}

/** Where a mouse drag on a strip began, so the strip pans with the pointer. */
export interface DragPanStart {
  pointerId: number;
  scrollLeft: number;
  x: number;
}
