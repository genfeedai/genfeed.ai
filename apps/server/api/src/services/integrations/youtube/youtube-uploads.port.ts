import type { PostVisibility } from '@genfeedai/contracts';
import type { ChannelTargetSettings } from '@genfeedai/contracts/api-types/contracts';

/** API-owned post fields required to publish a YouTube video. */
export interface YoutubeUploadPostInput {
  description: string;
  label: string;
  scheduledDate: Date;
  tags?: string[];
  visibility?: PostVisibility | null;
}

/** Upload adapter implemented by the API while file queues remain API-owned. */
export interface ServerYoutubeUploader {
  uploadVideo(
    organizationId: string,
    brandId: string,
    videoId: string,
    post: YoutubeUploadPostInput,
    settings?: ChannelTargetSettings,
    credentialId?: string,
  ): Promise<string>;
}
