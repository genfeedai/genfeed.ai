import type { IAnnouncement } from '@cloud/interfaces';

export interface AnnouncementComposeFormState {
  body: string;
  tweetText: string;
  discordEnabled: boolean;
  twitterEnabled: boolean;
  discordChannelId: string;
}

export interface AnnouncementHistoryItemProps {
  announcement: IAnnouncement;
}

export interface AnnouncementsPageProps {
  defaultTab?: 'compose' | 'history';
}
