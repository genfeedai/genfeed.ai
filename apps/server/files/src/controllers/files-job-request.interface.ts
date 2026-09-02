import type {
  FileProcessingParams,
  ImageProcessingParams,
  VideoProcessingParams,
  YoutubeCredential,
} from '@files/shared/interfaces/job.interface';
import type {
  FileJobPriority as JobPriority,
  FileJobType as JobType,
} from '@genfeedai/queue-contracts';

export interface ProcessVideoRequestBody {
  id?: string;
  ingredientId: string;
  organizationId: string;
  params: VideoProcessingParams;
  priority?: JobPriority;
  room?: string;
  s3Bucket?: string;
  type: JobType;
  userId: string;
  websocketUrl?: string;
}

export interface ProcessImageRequestBody {
  id?: string;
  ingredientId: string;
  organizationId: string;
  params: ImageProcessingParams;
  priority?: JobPriority;
  room?: string;
  s3Bucket?: string;
  type: JobType;
  userId: string;
  websocketUrl?: string;
}

export interface ProcessFileRequestBody {
  delay?: number;
  filePath?: string;
  id?: string;
  ingredientId: string;
  organizationId: string;
  params: FileProcessingParams;
  priority?: JobPriority;
  room?: string;
  s3Bucket?: string;
  type: JobType;
  url?: string;
  userId: string;
  websocketUrl?: string;
}

export interface ProcessYoutubeRequestBody {
  brandId?: string;
  credential: YoutubeCredential;
  description: string;
  id?: string;
  ingredientId: string;
  organizationId: string;
  postId: string;
  priority?: JobPriority;
  room?: string;
  scheduledDate?: string;
  status?: 'public' | 'private' | 'scheduled' | 'unlisted';
  tags?: string[];
  title: string;
  userId: string;
  websocketUrl?: string;
}
