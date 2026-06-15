'use client';

import type { IAnnouncement } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  AnnouncementComposeFormState,
  AnnouncementsPageProps,
} from '@props/admin/announcements.props';
import { AdminAnnouncementsService } from '@services/admin/announcements.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { useCallback, useEffect, useReducer } from 'react';
import { HiOutlineMegaphone } from 'react-icons/hi2';
import AnnouncementComposeForm from './announcement-compose-form';
import AnnouncementHistoryList from './announcement-history-list';

const TABS = [
  { id: 'compose', label: 'Compose' },
  { id: 'history', label: 'History' },
];

const INITIAL_FORM: AnnouncementComposeFormState = {
  body: '',
  discordChannelId: '',
  discordEnabled: true,
  tweetText: '',
  twitterEnabled: false,
};

const TWEET_MAX_CHARS = 280;

type PageState = {
  activeTab: string;
  form: AnnouncementComposeFormState;
  isSubmitting: boolean;
  announcements: IAnnouncement[];
  isLoadingHistory: boolean;
};

type PageAction =
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

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'SET_TAB':
      return {
        ...state,
        activeTab: action.tab,
        isLoadingHistory:
          action.tab === 'history' ? true : state.isLoadingHistory,
      };
    case 'SET_FIELD':
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
      };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };
    case 'SET_ANNOUNCEMENTS':
      return { ...state, announcements: action.announcements };
    case 'SET_LOADING_HISTORY':
      return { ...state, isLoadingHistory: action.isLoadingHistory };
    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        form: INITIAL_FORM,
        isLoadingHistory: true,
        activeTab: 'history',
      };
    default:
      return state;
  }
}

export default function AnnouncementsPage({
  defaultTab = 'compose',
}: AnnouncementsPageProps) {
  const [state, dispatch] = useReducer(pageReducer, {
    activeTab: defaultTab,
    form: INITIAL_FORM,
    isSubmitting: false,
    announcements: [],
    isLoadingHistory: defaultTab === 'history',
  });

  const { activeTab, form, isSubmitting, announcements, isLoadingHistory } =
    state;

  const notificationsService = NotificationsService.getInstance();

  const getAnnouncementsService = useAuthedService((token: string) =>
    AdminAnnouncementsService.getInstance(token),
  );

  const loadHistory = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getAnnouncementsService();
        const data = await service.getAnnouncements();

        if (!signal.aborted) {
          dispatch({ type: 'SET_ANNOUNCEMENTS', announcements: data });
          logger.info('Announcements loaded', { count: data.length });
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        logger.error('Failed to load announcements', error);
        notificationsService.error('Failed to load announcements');
      } finally {
        if (!signal.aborted) {
          dispatch({ type: 'SET_LOADING_HISTORY', isLoadingHistory: false });
        }
      }
    },
    [getAnnouncementsService, notificationsService],
  );

  useEffect(() => {
    if (activeTab !== 'history') {
      return;
    }

    const controller = new AbortController();
    loadHistory(controller.signal);

    return () => controller.abort();
  }, [activeTab, loadHistory]);

  const handleTabChange = useCallback((tab: string) => {
    dispatch({ type: 'SET_TAB', tab });
  }, []);

  function handleFieldChange(
    field: keyof AnnouncementComposeFormState,
    value: string | boolean,
  ): void {
    dispatch({ type: 'SET_FIELD', field, value });
  }

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();

    if (!form.body.trim()) {
      notificationsService.warning('Body is required');
      return;
    }

    if (!form.discordEnabled && !form.twitterEnabled) {
      notificationsService.warning('Select at least one channel');
      return;
    }

    if (form.discordEnabled && !form.discordChannelId.trim()) {
      notificationsService.warning(
        'Discord channel ID is required when Discord is selected',
      );
      return;
    }

    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });

    try {
      const service = await getAnnouncementsService();

      await service.broadcast({
        body: form.body.trim(),
        channels: {
          discord: form.discordEnabled,
          twitter: form.twitterEnabled,
        },
        discordChannelId: form.discordEnabled
          ? form.discordChannelId.trim()
          : undefined,
        tweetText: form.tweetText.trim() || undefined,
      });

      notificationsService.success('Announcement published');
      dispatch({ type: 'SUBMIT_SUCCESS' });

      logger.info('Announcement broadcast successful');
    } catch (error) {
      logger.error('Failed to broadcast announcement', error);
      notificationsService.error('Failed to publish announcement');
    } finally {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  }

  const tweetCharCount = form.tweetText.length;
  const tweetOverLimit = tweetCharCount > TWEET_MAX_CHARS;

  return (
    <Container
      label="Announcements"
      description="Broadcast changelogs, updates, and news to Discord and Twitter/X"
      icon={HiOutlineMegaphone}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {activeTab === 'compose' && (
        <AnnouncementComposeForm
          form={form}
          isSubmitting={isSubmitting}
          tweetCharCount={tweetCharCount}
          tweetOverLimit={tweetOverLimit}
          onFieldChange={handleFieldChange}
          onSubmit={handleSubmit}
        />
      )}

      {activeTab === 'history' && (
        <AnnouncementHistoryList
          isLoadingHistory={isLoadingHistory}
          announcements={announcements}
        />
      )}
    </Container>
  );
}
