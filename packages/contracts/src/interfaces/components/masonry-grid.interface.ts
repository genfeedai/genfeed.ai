export interface IMasonryGridOptions {
  columns?: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  gap?: number;
  /** Size columns from the available panel width rather than the viewport. */
  minColumnWidth?: number;
}

export interface IItemPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}
