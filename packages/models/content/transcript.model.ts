import type { TranscriptStatus } from '@genfeedai/enums';

export interface TranscriptVideoMetadata {
  duration?: number;
  viewCount?: number;
  likeCount?: number;
  description?: string;
  publishedAt?: Date;
  categoryId?: string;
  tags?: string[];
}

export class Transcript {
  id!: string;
  user!: string;
  organization!: string;
  article?: string;
  youtubeUrl!: string;
  youtubeId!: string;
  videoTitle?: string;
  videoDuration?: number;
  videoMetadata?: TranscriptVideoMetadata;
  transcriptText!: string;
  language?: string;
  status!: TranscriptStatus;
  error?: string;
  audioFileUrl?: string;
  isDeleted!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<Transcript>) {
    Object.assign(this, partial);

    this.createdAt = this.toDate(partial.createdAt) ?? this.createdAt;
    this.updatedAt = this.toDate(partial.updatedAt) ?? this.updatedAt;

    if (partial.videoMetadata?.publishedAt) {
      this.videoMetadata = {
        ...this.videoMetadata,
        publishedAt: this.toDate(partial.videoMetadata.publishedAt),
      };
    }
  }

  private toDate(value: Date | string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }
    return value instanceof Date ? value : new Date(value);
  }
}
