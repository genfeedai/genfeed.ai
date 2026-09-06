import type { IAnnouncement } from '@genfeedai/contracts/interfaces';
import type { FormEvent } from 'react';

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

export interface AnnouncementComposeFormProps {
  form: AnnouncementComposeFormState;
  isSubmitting: boolean;
  tweetCharCount: number;
  tweetOverLimit: boolean;
  onFieldChange: (
    field: keyof AnnouncementComposeFormState,
    value: string | boolean,
  ) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}

export interface AnnouncementHistoryListProps {
  isLoadingHistory: boolean;
  announcements: IAnnouncement[];
}

export interface AnnouncementsPageState {
  activeTab: string;
  form: AnnouncementComposeFormState;
  isSubmitting: boolean;
  announcements: IAnnouncement[];
  isLoadingHistory: boolean;
}

export type AnnouncementsPageAction =
  | { type: 'SET_TAB'; tab: string }
  | {
      type: 'SET_FIELD';
      field: keyof AnnouncementComposeFormState;
      value: string | boolean;
    }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_ANNOUNCEMENTS'; announcements: IAnnouncement[] }
  | { type: 'SET_LOADING_HISTORY'; isLoadingHistory: boolean }
  | { type: 'SUBMIT_SUCCESS' };
