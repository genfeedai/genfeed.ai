// Extension message types for Remix / Reply / Idea flows

export type ExtensionMessageType = 'REMIX' | 'REPLY' | 'IDEA';

export interface ExtensionMessage {
  type: ExtensionMessageType;
  content: string;
  url: string;
  platform?: string;
}

export type SocialPlatform =
  | 'twitter'
  | 'tiktok'
  | 'linkedin'
  | 'instagram'
  | 'youtube';

export type ReplyTone =
  | 'agree'
  | 'challenge'
  | 'add-value'
  | 'funny'
  | 'professional';
