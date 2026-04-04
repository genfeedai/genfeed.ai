export interface GridOption {
  rows: number;
  cols: number;
  label: string;
  frameCount: number;
}

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

export interface SelectedImage {
  id: string;
  url: string;
  label?: string;
}

export interface ContactSheetState {
  selectedImage: SelectedImage | null;
  gridOption: GridOption;
  borderInset: number;
  isSplitting: boolean;
  results: SplitFrameResult[] | null;
  error: string | null;
}

export const GRID_OPTIONS: GridOption[] = [
  { cols: 2, frameCount: 4, label: '2×2', rows: 2 },
  { cols: 3, frameCount: 6, label: '2×3', rows: 2 },
  { cols: 3, frameCount: 9, label: '3×3', rows: 3 },
];

export const DEFAULT_BORDER_INSET = 10;
