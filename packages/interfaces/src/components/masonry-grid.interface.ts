export interface IMasonryGridOptions {
  columns?: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  gap?: number;
}

export interface IItemPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}
