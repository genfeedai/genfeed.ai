export enum ClipResultStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  CAPTIONING = 'captioning',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ClipType {
  HOOK = 'hook',
  STORY = 'story',
  TUTORIAL = 'tutorial',
  REACTION = 'reaction',
  QUOTE = 'quote',
  CONTROVERSIAL = 'controversial',
  EDUCATIONAL = 'educational',
}

export interface IClipResult {
  _id: string;
  user: string;
  organization: string;
  project: string;
  index: number;
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralityScore: number;
  tags: string[];
  clipType: ClipType;
  videoUrl?: string;
  videoS3Key?: string;
  captionedVideoUrl?: string;
  captionedVideoS3Key?: string;
  thumbnailUrl?: string;
  captionSrt?: string;
  status: ClipResultStatus;
  isSelected: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
