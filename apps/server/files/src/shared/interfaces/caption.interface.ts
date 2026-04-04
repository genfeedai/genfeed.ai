export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface SlideText {
  voiceText: string;
  duration: number;
  overlayText?: string;
}
