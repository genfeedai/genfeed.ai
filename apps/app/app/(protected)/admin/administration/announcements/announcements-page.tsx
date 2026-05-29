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
import { useCallback, useEffect, useState } from 'react';
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

export default function AnnouncementsPage({
  defaultTab = 'compose',
}: AnnouncementsPageProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [form, setForm] = useState<AnnouncementComposeFormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [announcements, setAnnouncements] = useState<IAnnouncement[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const notificationsService = NotificationsService.getInstance();

  const getAnnouncementsService = useAuthedService((token: string) =>
    AdminAnnouncementsService.getInstance(token),
  );

  const loadHistory = useCallback(
    async (signal: AbortSignal) => {
      setIsLoadingHistory(true);

      try {
        const service = await getAnnouncementsService();
        const data = await service.getAnnouncements();

        if (!signal.aborted) {
          setAnnouncements(data);
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
          setIsLoadingHistory(false);
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

  function handleFieldChange(
    field: keyof AnnouncementComposeFormState,
    value: string | boolean,
  ): void {
    setForm((prev) => ({ ...prev, [field]: value }));
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

    setIsSubmitting(true);

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
      setForm(INITIAL_FORM);
      setActiveTab('history');

      logger.info('Announcement broadcast successful');
    } catch (error) {
      logger.error('Failed to broadcast announcement', error);
      notificationsService.error('Failed to publish announcement');
    } finally {
      setIsSubmitting(false);
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
      onTabChange={setActiveTab}
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
