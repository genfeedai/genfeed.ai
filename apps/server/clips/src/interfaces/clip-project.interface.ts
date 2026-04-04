export enum ClipProjectStatus {
  PENDING = 'pending',
  TRANSCRIBING = 'transcribing',
  ANALYZING = 'analyzing',
  CLIPPING = 'clipping',
  CAPTIONING = 'captioning',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface IVideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
}

export interface ITranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface IClipProjectSettings {
  minDuration: number;
  maxDuration: number;
  maxClips: number;
  aspectRatio: string;
  captionStyle: string;
  addCaptions: boolean;
}

export interface IClipProject {
  _id: string;
  user: string;
  organization: string;
  name: string;
  sourceVideoUrl: string;
  sourceVideoS3Key?: string;
  videoMetadata?: IVideoMetadata;
  transcriptText?: string;
  transcriptSrt?: string;
  transcriptSegments?: ITranscriptSegment[];
  language: string;
  status: ClipProjectStatus;
  progress: number;
  settings: IClipProjectSettings;
  error?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
