'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardVariant,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  isNewsletterAccessLevel,
  NEWSLETTER_ACCESS_LEVELS,
  type NewsletterAccessLevel,
  type NewsletterSendAction,
} from '@genfeedai/contracts/constants';
import type {
  INewsletterEmailPreview,
  INewsletterSend,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { NewslettersService } from '@services/content/newsletters.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Eye, Mail, Pause, Play, Send, X } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import {
  NEWSLETTER_QUERY_KEY,
  useNewsletterService,
  useNewsletterSubscriberStats,
} from '@/features/newsletter/hooks/use-newsletter-module';
import type { NewsletterSendCardProps } from '@/features/newsletter/props/newsletter.props';

const SENDABLE_STATUSES = new Set(['approved', 'published']);
const LIVE_SEND_STATUSES = new Set(['scheduled', 'sending', 'paused']);
const SEND_POLL_MS = 5_000;

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
});

/**
 * Email an approved issue to the brand's own subscribers (#9726): preview,
 * test send to yourself, send now or schedule, then follow and control the
 * send. Each issue is sent once.
 */
export default function NewsletterSendCard({
  isDirty,
  newsletter,
}: NewsletterSendCardProps) {
  const translate = useTranslations('pages.publishing.newsletter.send');
  const translateStatus = useTranslations('pages.publishing.newsletter');
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const queryClient = useQueryClient();
  const getService = useNewsletterService();
  const getNewslettersService = useAuthedService(
    useCallback((token: string) => NewslettersService.getInstance(token), []),
  );
  const stats = useNewsletterSubscriberStats(brandId || undefined);
  const [sendAt, setSendAt] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [preview, setPreview] = useState<INewsletterEmailPreview | null>(null);
  const [accessLevel, setAccessLevel] = useState<NewsletterAccessLevel>(
    isNewsletterAccessLevel(newsletter.accessLevel)
      ? newsletter.accessLevel
      : 'public',
  );

  const sendQuery = useQuery<INewsletterSend | null>({
    enabled: Boolean(brandId),
    queryFn: async ({ signal }) => {
      const service = await getService();
      if (!service || !brandId) return null;
      const page = await service.listSends(
        brandId,
        { limit: 1, newsletterId: newsletter.id },
        signal,
      );
      return page.items[0] ?? null;
    },
    queryKey: [NEWSLETTER_QUERY_KEY, 'issue-send', brandId, newsletter.id],
    refetchInterval: (query) =>
      query.state.data && LIVE_SEND_STATUSES.has(query.state.data.status)
        ? SEND_POLL_MS
        : false,
  });
  const send = sendQuery.data ?? null;
  const activeCount = stats.data?.active ?? 0;
  const blockedReason = isDirty
    ? translate('saveFirst')
    : !newsletter.content?.trim()
      ? translate('addContentFirst')
      : !SENDABLE_STATUSES.has(newsletter.status)
        ? translate('approveFirst')
        : activeCount === 0
          ? translate('noSubscribers')
          : null;

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: [NEWSLETTER_QUERY_KEY] });
  }

  async function run(
    task: () => Promise<void>,
    failure: string,
  ): Promise<void> {
    setIsBusy(true);
    try {
      await task();
    } catch (error) {
      logger.error(failure, error);
      NotificationsService.getInstance().error(translate('failed'));
    } finally {
      setIsBusy(false);
    }
  }

  function handleAccessLevel(value: string): void {
    if (!isNewsletterAccessLevel(value)) return;
    const previous = accessLevel;
    setAccessLevel(value);
    void run(async () => {
      try {
        const service = await getNewslettersService();
        await service.patch(newsletter.id, { accessLevel: value });
      } catch (error) {
        setAccessLevel(previous);
        throw error;
      }
    }, 'Newsletter access level update failed');
  }

  function handlePreview(isGated: boolean): void {
    void run(async () => {
      const service = await getService();
      if (service)
        setPreview(await service.getEmailPreview(newsletter.id, isGated));
    }, 'Newsletter preview failed');
  }

  function handleTest(): void {
    void run(async () => {
      const service = await getService();
      const result = await service?.sendTest(newsletter.id);
      if (result) {
        NotificationsService.getInstance().success(
          translate('testSent', { email: result.to }),
        );
      }
    }, 'Newsletter test send failed');
  }

  function handleSend(isScheduled: boolean): void {
    const scheduledFor = isScheduled && sendAt ? new Date(sendAt) : null;
    if (
      isScheduled &&
      (!scheduledFor ||
        Number.isNaN(scheduledFor.getTime()) ||
        scheduledFor <= new Date())
    ) {
      NotificationsService.getInstance().error(translate('scheduleRequired'));
      return;
    }
    void run(async () => {
      const service = await getService();
      await service?.sendIssue(
        newsletter.id,
        scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {},
      );
      NotificationsService.getInstance().success(
        scheduledFor ? translate('scheduled') : translate('sending'),
      );
      await refresh();
    }, 'Newsletter send failed');
  }

  function handleControl(action: NewsletterSendAction): void {
    if (!send) return;
    void run(async () => {
      const service = await getService();
      await service?.controlSend(send.id, action);
      await refresh();
    }, 'Newsletter send control failed');
  }

  return (
    <Card
      gap={CardGap.LG}
      label={translate('title')}
      variant={CardVariant.INSET}
    >
      <p className="text-sm text-muted-foreground">
        {translate('audience', { count: activeCount })}{' '}
        <NextLink
          className="underline"
          href={href(APP_ROUTES.PUBLISHING.NEWSLETTER)}
        >
          {translate('manageSubscribers')}
        </NextLink>
      </p>

      <Field htmlFor="newsletter-access-level" label={translate('access')}>
        <Select value={accessLevel} onValueChange={handleAccessLevel}>
          <SelectTrigger id="newsletter-access-level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NEWSLETTER_ACCESS_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {translate(`accessLevel.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Eye className="size-4" />}
          isDisabled={isBusy || !newsletter.content?.trim()}
          label={translate('preview')}
          onClick={() => handlePreview(false)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        {accessLevel === 'paid' ? (
          <Button
            icon={<Eye className="size-4" />}
            isDisabled={isBusy || !newsletter.content?.trim()}
            label={translate('previewGated')}
            onClick={() => handlePreview(true)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
        <Button
          icon={<Mail className="size-4" />}
          isDisabled={isBusy || isDirty || !newsletter.content?.trim()}
          label={translate('test')}
          onClick={handleTest}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
      </div>

      {send ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge status={send.status}>
              {translateStatus(`sendStatus.${send.status}`)}
            </Badge>
            <span className="text-muted-foreground">
              {send.status === 'scheduled'
                ? translate('scheduledFor', {
                    date: DATE_FORMAT.format(new Date(send.scheduledFor)),
                  })
                : translate('progress', {
                    sent: send.sentCount,
                    total: send.recipientCount,
                  })}
            </span>
          </div>
          {LIVE_SEND_STATUSES.has(send.status) ? (
            <div className="flex flex-wrap gap-2">
              {send.status === 'paused' ? (
                <Button
                  icon={<Play className="size-4" />}
                  isDisabled={isBusy}
                  label={translate('resume')}
                  onClick={() => handleControl('resume')}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              ) : (
                <Button
                  icon={<Pause className="size-4" />}
                  isDisabled={isBusy}
                  label={translate('pause')}
                  onClick={() => handleControl('pause')}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              )}
              <Button
                icon={<X className="size-4" />}
                isDisabled={isBusy}
                label={translate('cancel')}
                onClick={() => handleControl('cancel')}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field htmlFor="newsletter-send-at" label={translate('sendAt')}>
            <Input
              id="newsletter-send-at"
              type="datetime-local"
              value={sendAt}
              onChange={(event) => setSendAt(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Send className="size-4" />}
              isDisabled={Boolean(blockedReason) || isBusy}
              isLoading={isBusy}
              label={
                sendAt
                  ? translate('schedule')
                  : translate('sendNow', { count: activeCount })
              }
              onClick={() => handleSend(Boolean(sendAt))}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          </div>
          {blockedReason ? (
            <p className="text-xs text-muted-foreground">{blockedReason}</p>
          ) : null}
        </div>
      )}

      {preview ? (
        <Dialog open onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{preview.subject}</DialogTitle>
            </DialogHeader>
            <iframe
              className={
                'h-[70dvh] w-full rounded-md border border-border bg-white' /* design-system-allow-content-color -- emails render on a white page */
              }
              sandbox=""
              srcDoc={preview.html}
              title={translate('previewTitle')}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}
