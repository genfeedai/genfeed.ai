import type { Profile as PrismaProfile } from '@genfeedai/prisma';

export interface IImageProfile extends Record<string, unknown> {}

export interface IVideoProfile extends Record<string, unknown> {}

export interface IVoiceProfile extends Record<string, unknown> {}

export interface IArticleProfile extends Record<string, unknown> {}

export interface ProfileMetadata {
  brandGuidelines?: string;
  targetAudience?: string;
  exampleContent?: string[];
  [key: string]: unknown;
}

export interface ProfileDocument extends PrismaProfile {
  _id: string;
  label?: string;
  description?: string;
  tags?: string[];
  isDefault?: boolean;
  usageCount?: number;
  metadata?: ProfileMetadata;
  image?: IImageProfile;
  video?: IVideoProfile;
  voice?: IVoiceProfile;
  article?: IArticleProfile;
  [key: string]: unknown;
}

export type Profile = ProfileDocument;
