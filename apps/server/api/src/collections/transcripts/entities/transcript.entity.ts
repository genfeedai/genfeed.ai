import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { TranscriptStatus } from '@genfeedai/enums';
import { type Transcript } from '@genfeedai/prisma';

export class TranscriptEntity extends BaseEntity implements Transcript {
  organizationId!: string;
  userId!: string;
  articleId!: string | null;
  content!: string | null;
  user!: string;
  organization!: string;
  article?: string;
  youtubeUrl!: string;
  youtubeId!: string;
  videoTitle?: string;
  videoDuration?: number;
  transcriptText!: string;
  language!: string | null;
  status!: TranscriptStatus;
  error?: string;
  audioFileUrl?: string;
}
