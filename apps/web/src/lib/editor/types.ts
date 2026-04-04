export interface EditorLaunchContext {
  assetPaths: string[];
  mediaType?: 'image' | 'video' | 'audio';
  workflowId?: string;
}

export interface EditorTimelineItem {
  durationInFrames: number;
  id: string;
  mediaType: 'image' | 'video';
  path: string;
  trimEnd?: number;
  trimStart?: number;
}

export interface EditorOverlay {
  id: string;
  text: string;
}

export interface EditorComposition {
  fps: number;
  height: number;
  id: string;
  items: EditorTimelineItem[];
  overlay?: EditorOverlay;
  width: number;
}
