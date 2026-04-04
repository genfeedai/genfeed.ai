export interface IResizeBodyParams {
  width: number;
  height: number;
}

export interface ITextOverlayBodyParams {
  text: string;
  position?: 'top' | 'center' | 'bottom';
}

export interface ITrimVideoBodyParams {
  startTime: number;
  endTime: number;
}

export interface IChangePriceBodyParams {
  newPriceId: string;
}
