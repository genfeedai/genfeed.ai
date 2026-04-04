export interface VideoThumbnail {
  time: number;
  dataUrl: string;
}

export interface VideoTrimTimelineProps {
  videoDuration: number;
  startTime: number;
  endTime: number;
  thumbnails: VideoThumbnail[];
  isGeneratingThumbnails: boolean;
  onRangeChange: (values: [number, number]) => void;
}
