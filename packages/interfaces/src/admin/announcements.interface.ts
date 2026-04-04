export interface IAnnouncementChannel {
  discord?: boolean;
  twitter?: boolean;
}

export interface IAnnouncementBroadcastRequest {
  body: string;
  tweetText?: string;
  channels: IAnnouncementChannel;
  discordChannelId?: string;
}

export interface IAnnouncement {
  id: string;
  body: string;
  tweetText?: string;
  channels: IAnnouncementChannel;
  discordChannelId?: string;
  discordMessageUrl?: string;
  tweetUrl?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface IBroadcastResult {
  success: boolean;
  discordMessageUrl?: string;
  tweetUrl?: string;
  errors?: string[];
}
