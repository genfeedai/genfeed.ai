/**
 * Social Publish Node Types
 *
 * This node enables direct publishing to social media platforms.
 * Requires OAuth integrations with each platform.
 */

export type SocialPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'linkedin'
  | 'facebook'
  | 'threads';

export type SocialVisibility = 'public' | 'private' | 'unlisted';

export interface SocialPublishNodeData {
  label: string;
  status: 'idle' | 'pending' | 'processing' | 'complete' | 'error';
  error?: string;

  // Input from connections
  inputVideo: string | null;

  // Publish config
  platform: SocialPlatform;
  title: string;
  description: string;
  tags: string[];
  visibility: SocialVisibility;
  scheduledTime: string | null;

  // Output
  publishedUrl: string | null;

  // Job state
  jobId: string | null;
}

export const defaultSocialPublishData: Partial<SocialPublishNodeData> = {
  description: '',
  inputVideo: null,
  jobId: null,
  label: 'Social Publish',
  platform: 'youtube',
  publishedUrl: null,
  scheduledTime: null,
  status: 'idle',
  tags: [],
  title: '',
  visibility: 'public',
};

export const socialPublishNodeDefinition = {
  category: 'output',
  defaultData: defaultSocialPublishData,
  description:
    'Publish video to YouTube, TikTok, Instagram, LinkedIn, Facebook, or Threads',
  icon: 'Share2',
  inputs: [{ id: 'video', label: 'Video', required: true, type: 'video' }],
  label: 'Social Publish',
  outputs: [],
  type: 'socialPublish',
};
