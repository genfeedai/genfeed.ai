import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TranscriptStatus } from '@genfeedai/enums';
import { type Transcript } from '@genfeedai/prisma';

export class TranscriptEntity extends BaseEntity implements Transcript {
  user!: string;
  organization!: string;
  article?: string;
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
