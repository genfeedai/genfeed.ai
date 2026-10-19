export interface IResizeBodyParams {
  width: number;
  height: number;
}

export interface ITextOverlayBodyParams {
  text: string;
  position?: 'top' | 'center' | 'bottom';
  /** Font key (`poppins-bold`) or `FontFamily` label. Defaults to the video's prompt font. */
  fontFamily?: string;
}

export interface ITrimVideoBodyParams {
  startTime: number;
  endTime: number;
}

export interface IChangePriceBodyParams {
  newPriceId: string;
}
