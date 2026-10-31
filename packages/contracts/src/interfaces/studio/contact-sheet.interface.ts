export interface SplitFrameResult {
  id: string;
  url: string;
  index: number;
}

export interface SplitResponse {
  data: {
    frames: SplitFrameResult[];
  };
}
