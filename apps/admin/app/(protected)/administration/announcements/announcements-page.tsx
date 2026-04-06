'use client';

import Button from '@components/buttons/base/Button';
import { ButtonVariant } from '@genfeedai/enums';
import type { IAnnouncement } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  AnnouncementComposeFormState,
  AnnouncementsPageProps,
} from '@props/admin/announcements.props';
import { AdminAnnouncementsService } from '@services/admin/announcements.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useState } from 'react';
import {
  HiCalendar,
  HiOutlineGlobeAlt,
  HiOutlineMegaphone,
} from 'react-icons/hi2';

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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

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
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {/* Body */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="announcement-body"
              className="text-sm font-medium text-foreground"
            >
              Body <span className="text-rose-400">*</span>
            </label>
            <Textarea
              id="announcement-body"
              className="w-full min-h-[160px] bg-background border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 resize-y focus:outline-none focus:border-white/25 transition-colors"
              placeholder="Write your announcement here — supports Markdown for Discord…"
              value={form.body}
              onChange={(e) => handleFieldChange('body', e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Tweet text */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="announcement-tweet"
              className="text-sm font-medium text-foreground"
            >
              Tweet text{' '}
              <span className="text-foreground/50">(optional, max 280)</span>
            </label>
            <div className="relative">
              <Textarea
                id="announcement-tweet"
                className="w-full min-h-[100px] bg-background border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 resize-y focus:outline-none focus:border-white/25 transition-colors"
                placeholder="Short version for Twitter/X…"
                value={form.tweetText}
                onChange={(e) => handleFieldChange('tweetText', e.target.value)}
                disabled={isSubmitting}
              />
              <span
                className={`absolute bottom-2 right-3 text-xs tabular-nums ${
                  tweetOverLimit ? 'text-rose-400' : 'text-foreground/40'
                }`}
              >
                {tweetCharCount}/{TWEET_MAX_CHARS}
              </span>
            </div>
          </div>

          {/* Channels */}
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-foreground">
              Channels <span className="text-rose-400">*</span>
            </span>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <Checkbox
                checked={form.discordEnabled}
                onCheckedChange={(checked) =>
                  handleFieldChange('discordEnabled', checked === true)
                }
                disabled={isSubmitting}
                aria-label="Publish announcement to Discord"
              />
              <span className="text-sm text-foreground">Discord</span>
            </label>

            {form.discordEnabled && (
              <div className="ml-7 flex flex-col gap-2">
                <label
                  htmlFor="discord-channel-id"
                  className="text-xs text-foreground/60"
                >
                  Discord channel ID <span className="text-rose-400">*</span>
                </label>
                <Input
                  id="discord-channel-id"
                  type="text"
                  className="w-full max-w-xs bg-background border border-white/10 px-3 py-1.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-white/25 transition-colors"
                  placeholder="e.g. 1234567890"
                  value={form.discordChannelId}
                  onChange={(e) =>
                    handleFieldChange('discordChannelId', e.target.value)
                  }
                  disabled={isSubmitting}
                  required={form.discordEnabled}
                />
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <Checkbox
                checked={form.twitterEnabled}
                onCheckedChange={(checked) =>
                  handleFieldChange('twitterEnabled', checked === true)
                }
                disabled={isSubmitting}
                aria-label="Publish announcement to Twitter/X"
              />
              <span className="text-sm text-foreground">Twitter/X</span>
            </label>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            isDisabled={isSubmitting || tweetOverLimit}
            className="flex items-center gap-2"
          >
            <HiOutlineGlobeAlt className="w-4 h-4" />
            {isSubmitting ? 'Publishing…' : 'Publish'}
          </Button>
        </form>
      )}

      {activeTab === 'history' && (
        <div className="space-y-3">
          {isLoadingHistory ? (
            Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} showImage={false} />
            ))
          ) : announcements.length === 0 ? (
            <CardEmpty label="No announcements yet" />
          ) : (
            announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="border border-white/5 bg-card p-4 space-y-3"
              >
                {/* Body preview */}
                <p className="text-sm text-foreground leading-relaxed">
                  {truncate(announcement.body, 100)}
                </p>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2">
                  {announcement.channels.discord && (
                    <Badge variant="blue">Discord</Badge>
                  )}
                  {announcement.channels.twitter && (
                    <Badge variant="outline">Twitter/X</Badge>
                  )}

                  <span className="flex items-center gap-1 text-xs text-foreground/50 ml-auto">
                    <HiCalendar className="w-3.5 h-3.5" />
                    {formatDate(
                      announcement.publishedAt ?? announcement.createdAt,
                    )}
                  </span>
                </div>

                {/* Links row */}
                {(announcement.discordMessageUrl || announcement.tweetUrl) && (
                  <div className="flex items-center gap-3 pt-1 border-t border-white/5">
                    {announcement.discordMessageUrl && (
                      <AppLink
                        url={announcement.discordMessageUrl}
                        label="View on Discord"
                        variant={ButtonVariant.GHOST}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    )}
                    {announcement.tweetUrl && (
                      <AppLink
                        url={announcement.tweetUrl}
                        label="View Tweet"
                        variant={ButtonVariant.GHOST}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Container>
  );
}
