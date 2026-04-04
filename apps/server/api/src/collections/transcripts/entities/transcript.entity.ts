import { Transcript } from '@api/collections/transcripts/schemas/transcript.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TranscriptStatus } from '@genfeedai/enums';
import { Types } from 'mongoose';

export class TranscriptEntity extends BaseEntity implements Transcript {
  user!: Types.ObjectId;
  organization!: Types.ObjectId;
  article?: Types.ObjectId;
  youtubeUrl!: string;
  youtubeId!: string;
  videoTitle?: string;
  videoDuration?: number;
  transcriptText!: string;
  language?: string;
  status!: TranscriptStatus;
  error?: string;
  audioFileUrl?: string;
}
